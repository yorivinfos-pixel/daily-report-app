#!/usr/bin/env node
// ============================================================
// rebrand.js — Script de rebranding automatisé YST1
// Usage: node rebrand.js --client="PEERS" --domain="peers-sitetrack.onrender.com"
// ============================================================

const fs = require('fs');
const path = require('path');

// ======================== CONFIGURATION ========================

const ARGS = parseArgs(process.argv.slice(2));

// Paramètres obligatoires
const CLIENT_NAME      = ARGS.client       || exitError('--client requis (ex: --client="PEERS")');
const CLIENT_DOMAIN    = ARGS.domain       || exitError('--domain requis (ex: --domain="peers-sitetrack.onrender.com")');

// Paramètres optionnels
const CLIENT_APPID     = ARGS.appid        || `com.${CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, '')}.sitetrack`;
const CLIENT_CONTACT   = ARGS.contact      || '';
const CLIENT_PHONE     = ARGS.phone        || '';
const CLIENT_COMPANY   = ARGS.company      || CLIENT_NAME;
const CLIENT_PASSWORD  = ARGS.password     || `${CLIENT_NAME}@2026`;
const CLIENT_SHORT     = ARGS.short        || CLIENT_NAME;
const DRY_RUN          = ARGS['dry-run']   === 'true' || ARGS['dry-run'] === '';

// ======================== REMPLACEMENT MAP ========================

function buildReplacements() {
    const clientLower = CLIENT_NAME.toLowerCase();
    const clientAppIdPm = `com.${clientLower.replace(/[^a-z0-9]/g, '')}.pm`;
    const clientAppIdDashboard = `com.${clientLower.replace(/[^a-z0-9]/g, '')}.pm-dashboard`;

    // Ordre IMPORTANT : les chaînes les plus longues/spécifiques en premier
    // pour éviter les remplacements partiels
    return [
        // === URLs de production ===
        ['https://daily-report-app-fanv.onrender.com', `https://${CLIENT_DOMAIN}`],

        // === Nom complet du produit ===
        ['YoRivSiteTrack-YST1 | PM',   `${CLIENT_NAME} SiteTrack | PM`],
        ['YoRivSiteTrack-YST1 PM',     `${CLIENT_NAME} SiteTrack PM`],
        ['YoRivSiteTrack-YST1',        `${CLIENT_NAME} SiteTrack`],

        // === Package IDs Android/Electron ===
        ['com.yoriv.dailyreport',       CLIENT_APPID],
        ['com.yoriv.pm-dashboard',      clientAppIdDashboard],
        ['com.yoriv.pm',                clientAppIdPm],

        // === Noms de produit Electron ===
        ['YoRiv-Dashboard-PM.exe',      `${CLIENT_NAME}-Dashboard-PM.exe`],
        ['YoRiv Dashboard PM',          `${CLIENT_NAME} Dashboard PM`],
        ['yoriv-pm-dashboard',          `${clientLower}-pm-dashboard`],
        ['yoriv-supervisor.apk',        `${clientLower}-supervisor.apk`],

        // === Nom court / références marque ===
        ['YoRiv PM',                    `${CLIENT_SHORT} PM`],
        ['YST1 SiteTrack',             `${CLIENT_SHORT} SiteTrack`],
        ['YST1-Site-Tracking',          `${CLIENT_SHORT}-Site-Tracking`],
        ['YST1-rapports',              `${CLIENT_SHORT}-rapports`],
        ['YST1 DASHBOARD PM',          `${CLIENT_SHORT} DASHBOARD PM`],

        // === Noms de fichiers CSV serveur ===
        ['yoriv-rapports',              `${clientLower}-rapports`],

        // === Entité juridique ===
        ['YORIV HOLDING',              CLIENT_COMPANY],

        // === Mots de passe par défaut ===
        ['PASSWORD_REDACTED',                 `${CLIENT_PASSWORD}!`],
        ['PASSWORD_REDACTED',                 CLIENT_PASSWORD],

        // === Company dans le code serveur ===
        ["company: 'YoRiv'",           `company: '${CLIENT_NAME}'`],

        // === Référence marque dans package.json ===
        ['"author": "YoRiv"',          `"author": "${CLIENT_NAME}"`],

        // === Crédits / contact (seulement si nouveau contact fourni) ===
        ...(CLIENT_CONTACT ? [
            ['Jean-Baptiste MBUYI',     CLIENT_CONTACT],
        ] : []),
        ...(CLIENT_PHONE ? [
            ['0850145419',              CLIENT_PHONE],
        ] : []),

        // === Nom court résiduel "YST1" dans short_name manifest ===
        ['"short_name": "YST1"',       `"short_name": "${CLIENT_SHORT}"`],
    ];
}

// ======================== FICHIERS À TRAITER ========================

const TARGET_FILES = [
    // --- Fichiers de configuration ---
    'capacitor.config.json',
    'package.json',

    // --- Serveur ---
    'server.js',

    // --- Frontend Supervisor (public/) ---
    'public/index.html',
    'public/manifest.json',
    'public/sw.js',
    'public/js/supervisor.js',

    // --- Frontend PM (public/) ---
    'public/pm.html',
    'public/pm-manifest.json',
    'public/js/pm-dashboard.js',

    // --- Frontend Admin ---
    'public/admin.html',

    // --- CSS ---
    'public/css/styles.css',
    'public/css/pm-dashboard.css',

    // --- Copie miroir public-pm/ ---
    'public-pm/index.html',
    'public-pm/pm.html',
    'public-pm/manifest.json',
    'public-pm/sw.js',
    'public-pm/js/supervisor.js',
    'public-pm/js/pm-dashboard.js',
    'public-pm/css/styles.css',
    'public-pm/css/pm-dashboard.css',

    // --- Build scripts ---
    'build-supervisor-apk.js',
    'build-pm-apk.js',
    'generate-icons.js',
    'generate-supervisor-icons.js',
    'generate-pm-icons.js',

    // --- Electron ---
    'electron-pm/main.js',
    'electron-pm/package.json',

    // --- Android ---
    'android/app/build.gradle',

    // --- Documentation (si présente) ---
    'GUIDE_UTILISATEUR.md',
    'GUIDE_UTILISATEUR.txt',
    'FICHE_TECHNIQUE_CTO.md',
    'FICHE_TECHNIQUE_CTO.txt',
    'FICHE_COMMERCIALE_ONE_PAGE.md',
    'FICHE_COMMERCIALE_ONE_PAGE.txt',
    'ANNEXE_EXPLOITATION_MSA_SLA.md',
    'ANNEXE_EXPLOITATION_MSA_SLA.txt',
    'PROTOCOLE_DE_REMISE_CLIENT.md',
    'PROTOCOLE_DE_REMISE_CLIENT.txt',
    'OFFRE_COMMERCIALE_PACKS.md',
    'OFFRE_COMMERCIALE_PACKS.txt',
    'OFFRE_COMMERCIALE_PME_AGRESSIVE.md',
    'OFFRE_COMMERCIALE_PME_AGRESSIVE.txt',
    'OFFRE_COMMERCIALE_PREMIUM_ENTREPRISE.md',
    'OFFRE_COMMERCIALE_PREMIUM_ENTREPRISE.txt',
    'OFFRE_FINALE_CLIENT_BRANDEE.md',
    'OFFRE_FINALE_CLIENT_BRANDEE.txt',
    'OFFRE_FINALE_COMPARATIVE.md',
    'OFFRE_FINALE_COMPARATIVE.txt',
    'Guide_Deploiement_Gratuit_Render.txt',
    'Guide_Installation_DashboardPM.md',
    'Guide_Installation_DashboardPM.txt',
    'README.md',
];

// ======================== LOGIQUE PRINCIPALE ========================

function main() {
    const rootDir = process.cwd();
    const replacements = buildReplacements();

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          🔧  REBRANDING YST1 — Script automatisé           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Client       : ${CLIENT_NAME}`);
    console.log(`  Domaine      : ${CLIENT_DOMAIN}`);
    console.log(`  App ID       : ${CLIENT_APPID}`);
    console.log(`  Company      : ${CLIENT_COMPANY}`);
    console.log(`  Contact      : ${CLIENT_CONTACT || '(non modifié)'}`);
    console.log(`  Téléphone    : ${CLIENT_PHONE || '(non modifié)'}`);
    console.log(`  Mot de passe : ${CLIENT_PASSWORD}`);
    console.log(`  Mode         : ${DRY_RUN ? '🔍 DRY-RUN (aucune modification)' : '✏️  ÉCRITURE'}`);
    console.log('');
    console.log(`  Remplacements: ${replacements.length} règles`);
    console.log(`  Fichiers     : ${TARGET_FILES.length} cibles`);
    console.log('');

    let totalFiles = 0;
    let totalReplacements = 0;
    let skippedFiles = 0;
    const report = [];

    for (const relPath of TARGET_FILES) {
        const fullPath = path.join(rootDir, relPath);

        if (!fs.existsSync(fullPath)) {
            skippedFiles++;
            continue;
        }

        let content;
        try {
            content = fs.readFileSync(fullPath, 'utf-8');
        } catch (err) {
            console.log(`  ⚠️  Impossible de lire : ${relPath} (${err.message})`);
            skippedFiles++;
            continue;
        }

        let modified = content;
        let fileReplacementCount = 0;

        for (const [search, replace] of replacements) {
            if (!modified.includes(search)) continue;

            const count = countOccurrences(modified, search);
            modified = modified.split(search).join(replace);
            fileReplacementCount += count;
        }

        if (fileReplacementCount > 0) {
            if (!DRY_RUN) {
                fs.writeFileSync(fullPath, modified, 'utf-8');
            }
            totalFiles++;
            totalReplacements += fileReplacementCount;
            report.push({ file: relPath, count: fileReplacementCount });
            console.log(`  ✅  ${relPath} — ${fileReplacementCount} remplacement(s)`);
        }
    }

    // === Rapport final ===
    console.log('');
    console.log('────────────────────────────────────────────────────────────────');
    console.log(`  📊  RÉSULTAT :`);
    console.log(`       Fichiers modifiés  : ${totalFiles}`);
    console.log(`       Remplacements      : ${totalReplacements}`);
    console.log(`       Fichiers ignorés   : ${skippedFiles} (non trouvés)`);
    if (DRY_RUN) {
        console.log('');
        console.log('  ⚠️  MODE DRY-RUN — Aucun fichier n\'a été modifié.');
        console.log('       Relancez SANS --dry-run pour appliquer.');
    }
    console.log('────────────────────────────────────────────────────────────────');
    console.log('');

    // === Écrire le rapport dans un fichier ===
    const reportPath = path.join(rootDir, `rebrand-report-${CLIENT_NAME.toLowerCase()}.txt`);
    const reportContent = [
        `Rebrand Report — ${CLIENT_NAME}`,
        `Date: ${new Date().toISOString()}`,
        `Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLIED'}`,
        `Domain: ${CLIENT_DOMAIN}`,
        `App ID: ${CLIENT_APPID}`,
        '',
        `Total files modified: ${totalFiles}`,
        `Total replacements: ${totalReplacements}`,
        `Files skipped: ${skippedFiles}`,
        '',
        'Détail par fichier:',
        '-------------------',
        ...report.map(r => `  ${r.file} — ${r.count} remplacement(s)`),
        '',
        'Règles de remplacement appliquées:',
        '----------------------------------',
        ...replacements.map(([s, r]) => `  "${s}" → "${r}"`),
        '',
        '⚠️  ACTIONS MANUELLES RESTANTES:',
        '  1. Vérifier les seeds utilisateurs dans server.js (noms, zones)',
        '  2. Remplacer les icônes/logos par ceux du client',
        '  3. Adapter PROVINCE_TO_ZONE si régions différentes',
        '  4. Modifier les couleurs CSS si charte graphique client',
        '  5. Configurer les variables d\'environnement sur Render',
        '  6. Tester tous les logins après déploiement',
    ].join('\n');

    if (!DRY_RUN) {
        fs.writeFileSync(reportPath, reportContent, 'utf-8');
        console.log(`  📄  Rapport écrit : ${reportPath}`);
        console.log('');
    }

    // === Rappel des actions manuelles ===
    console.log('  ⚠️  ACTIONS MANUELLES RESTANTES :');
    console.log('');
    console.log('  1. Modifier les seeds utilisateurs dans server.js');
    console.log('     (noms des superviseurs, PMs, zones de PEERS)');
    console.log('');
    console.log('  2. Remplacer les icônes et logos :');
    console.log('     node generate-icons.js');
    console.log('     node generate-supervisor-icons.js');
    console.log('     node generate-pm-icons.js');
    console.log('     + electron-pm/build/icon.png & icon.ico');
    console.log('');
    console.log('  3. Adapter PROVINCE_TO_ZONE dans :');
    console.log('     - server.js');
    console.log('     - public/js/pm-dashboard.js');
    console.log('     - public-pm/js/pm-dashboard.js');
    console.log('');
    console.log('  4. Couleurs CSS (si charte graphique client) :');
    console.log('     - public/css/styles.css   → --primary, --primary-dark, --primary-light');
    console.log('     - public/css/pm-dashboard.css');
    console.log('');
    console.log('  5. Variables d\'environnement Render :');
    console.log(`     MONGODB_URI=<cluster dédié ${CLIENT_NAME}>`);
    console.log(`     JWT_SECRET=<secret unique 64 chars>`);
    console.log(`     CLOUDINARY_CLOUD_NAME=<compte ${CLIENT_NAME.toLowerCase()}>`);
    console.log('     CLOUDINARY_API_KEY=<...>');
    console.log('     CLOUDINARY_API_SECRET=<...>');
    console.log(`     SEED_DEFAULT_PASSWORD=${CLIENT_PASSWORD}`);
    console.log('');
}

// ======================== UTILITAIRES ========================

function countOccurrences(str, search) {
    let count = 0;
    let pos = 0;
    while ((pos = str.indexOf(search, pos)) !== -1) {
        count++;
        pos += search.length;
    }
    return count;
}

function parseArgs(argv) {
    const args = {};
    for (const arg of argv) {
        if (arg.startsWith('--')) {
            const eqIndex = arg.indexOf('=');
            if (eqIndex > -1) {
                const key = arg.substring(2, eqIndex);
                const val = arg.substring(eqIndex + 1).replace(/^["']|["']$/g, '');
                args[key] = val;
            } else {
                args[arg.substring(2)] = '';
            }
        }
    }
    return args;
}

function exitError(msg) {
    console.error('');
    console.error(`  ❌  ERREUR: ${msg}`);
    console.error('');
    console.error('  Usage:');
    console.error('    node rebrand.js --client="PEERS" --domain="peers-sitetrack.onrender.com"');
    console.error('');
    console.error('  Options:');
    console.error('    --client="NOM"          Nom du client (obligatoire)');
    console.error('    --domain="URL"          Domaine Render (obligatoire)');
    console.error('    --appid="com.x.y"       App ID Android (défaut: com.<client>.sitetrack)');
    console.error('    --company="RAISON SOC"  Raison sociale (défaut: même que client)');
    console.error('    --contact="NOM"         Nom du contact (remplace Jean-Baptiste MBUYI)');
    console.error('    --phone="TEL"           Téléphone (remplace 0850145419)');
    console.error('    --password="PWD"        Mot de passe par défaut (défaut: <Client>@2026)');
    console.error('    --short="COURT"         Nom court (défaut: même que client)');
    console.error('    --dry-run               Simuler sans modifier les fichiers');
    console.error('');
    process.exit(1);
}

// ======================== EXÉCUTION ========================

main();
