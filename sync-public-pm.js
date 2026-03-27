#!/usr/bin/env node
/**
 * sync-public-pm.js
 * Synchronise les fichiers partagés de public/ vers public-pm/
 * Les fichiers propres à PM qui n'existent que dans public-pm/ sont préservés.
 * Usage: node sync-public-pm.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');

// Fichiers partagés à synchroniser (source: public/ → dest: public-pm/)
const SHARED_FILES = [
    'js/pm-dashboard.js',
    'js/supervisor.js',
    'css/pm-dashboard.css',
    'css/styles.css',
    'pm.html',
    'sw.js',
    'icons/generate-icons.html'
];

const srcDir = path.join(__dirname, 'public');
const destDir = path.join(__dirname, 'public-pm');

let synced = 0;
let skipped = 0;
let errors = 0;

for (const relPath of SHARED_FILES) {
    const src = path.join(srcDir, relPath);
    const dest = path.join(destDir, relPath);

    if (!fs.existsSync(src)) {
        console.log(`⚠️  Source manquante: public/${relPath}`);
        skipped++;
        continue;
    }

    const srcContent = fs.readFileSync(src);
    const destExists = fs.existsSync(dest);

    if (destExists) {
        const destContent = fs.readFileSync(dest);
        if (Buffer.compare(srcContent, destContent) === 0) {
            skipped++;
            continue;
        }
    }

    if (dryRun) {
        console.log(`📋 [DRY-RUN] ${destExists ? 'MAJ' : 'COPIE'}: public/${relPath} → public-pm/${relPath}`);
    } else {
        try {
            const destDirPath = path.dirname(dest);
            if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true });
            fs.copyFileSync(src, dest);
            console.log(`✅ ${destExists ? 'MAJ' : 'COPIE'}: public/${relPath} → public-pm/${relPath}`);
        } catch (err) {
            console.error(`❌ Erreur: ${relPath} — ${err.message}`);
            errors++;
            continue;
        }
    }
    synced++;
}

console.log(`\n📊 Résultat: ${synced} synchronisé(s), ${skipped} déjà à jour, ${errors} erreur(s)`);
if (dryRun) console.log('   (Mode dry-run — aucun fichier modifié)');
