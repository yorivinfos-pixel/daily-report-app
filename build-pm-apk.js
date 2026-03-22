// ============================================
// Build PM APK with unique ID
// Ce script modifie les fichiers de configuration,
// build l'APK PM, puis restaure les fichiers originaux
// ============================================

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Fichiers à modifier
const files = {
    capacitorConfig: path.join(__dirname, 'capacitor.config.json'),
    buildGradle: path.join(__dirname, 'android', 'app', 'build.gradle'),
    stringsXml: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')
};

// Dossiers des icônes Android
const iconDirs = {
    mdpi: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi'),
    hdpi: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi'),
    xhdpi: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi'),
    xxhdpi: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi'),
    xxxhdpi: path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi')
};

// Correspondance tailles PM icons -> dossiers Android
const iconMapping = {
    hdpi: 'pm-icon-72.png',      // 72x72
    xhdpi: 'pm-icon-96.png',     // 96x96
    xxhdpi: 'pm-icon-144.png',   // 144x144
    xxxhdpi: 'pm-icon-192.png'   // 192x192
};

// Sauvegardes des icônes
const iconBackups = {};
const backups = {};

// Configuration PM
const PM_CONFIG = {
    appId: 'com.yoriv.pm',
    appName: 'YoRiv - Dashboard PM'
};

function backup(filePath) {
    backups[filePath] = fs.readFileSync(filePath, 'utf8');
    console.log(`✅ Backup: ${path.basename(filePath)}`);
}

function restore(filePath) {
    if (backups[filePath]) {
        fs.writeFileSync(filePath, backups[filePath], 'utf8');
        console.log(`🔄 Restored: ${path.basename(filePath)}`);
    }
}

function restoreAll() {
    console.log('\n🔄 Restauration des fichiers originaux...');
    Object.keys(backups).forEach(restore);
    restoreIcons();
    console.log('✅ Fichiers restaurés!\n');
}

function backupAndReplaceIcons() {
    console.log('\n🎨 Remplacement des icônes par les icônes PM...');
    const pmIconsDir = path.join(__dirname, 'public', 'icons');
    
    for (const [density, pmIconFile] of Object.entries(iconMapping)) {
        const pmIconPath = path.join(pmIconsDir, pmIconFile);
        const targetDir = iconDirs[density];
        
        if (!fs.existsSync(pmIconPath)) {
            console.log(`⚠️ Icône PM non trouvée: ${pmIconFile}`);
            continue;
        }
        
        // Sauvegarder les icônes originales
        const iconFiles = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];
        for (const iconFile of iconFiles) {
            const targetPath = path.join(targetDir, iconFile);
            if (fs.existsSync(targetPath)) {
                if (!iconBackups[targetPath]) {
                    iconBackups[targetPath] = fs.readFileSync(targetPath);
                }
                // Copier l'icône PM
                fs.copyFileSync(pmIconPath, targetPath);
            }
        }
        console.log(`✅ Icônes ${density} remplacées par ${pmIconFile}`);
    }
}

function restoreIcons() {
    console.log('🔄 Restauration des icônes originales...');
    for (const [targetPath, data] of Object.entries(iconBackups)) {
        fs.writeFileSync(targetPath, data);
    }
    console.log('✅ Icônes restaurées!');
}

function modifyCapacitorConfig() {
    const config = JSON.parse(fs.readFileSync(files.capacitorConfig, 'utf8'));
    config.appId = PM_CONFIG.appId;
    config.appName = PM_CONFIG.appName;
    fs.writeFileSync(files.capacitorConfig, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ Modified: capacitor.config.json → appId: ${PM_CONFIG.appId}`);
}

function modifyBuildGradle() {
    let content = fs.readFileSync(files.buildGradle, 'utf8');
    content = content.replace(
        /namespace = "com\.yoriv\.dailyreport"/,
        `namespace = "${PM_CONFIG.appId}"`
    );
    content = content.replace(
        /applicationId "com\.yoriv\.dailyreport"/,
        `applicationId "${PM_CONFIG.appId}"`
    );
    fs.writeFileSync(files.buildGradle, content, 'utf8');
    console.log(`✅ Modified: build.gradle → applicationId: ${PM_CONFIG.appId}`);
}

function modifyStringsXml() {
    let content = fs.readFileSync(files.stringsXml, 'utf8');
    content = content.replace(
        /<string name="app_name">.*<\/string>/,
        `<string name="app_name">${PM_CONFIG.appName}</string>`
    );
    content = content.replace(
        /<string name="title_activity_main">.*<\/string>/,
        `<string name="title_activity_main">${PM_CONFIG.appName}</string>`
    );
    content = content.replace(
        /<string name="package_name">.*<\/string>/,
        `<string name="package_name">${PM_CONFIG.appId}</string>`
    );
    content = content.replace(
        /<string name="custom_url_scheme">.*<\/string>/,
        `<string name="custom_url_scheme">${PM_CONFIG.appId}</string>`
    );
    fs.writeFileSync(files.stringsXml, content, 'utf8');
    console.log(`✅ Modified: strings.xml → app_name: ${PM_CONFIG.appName}`);
}

// Mode préparation seulement (sans restauration)
const prepareOnly = process.argv.includes('--prepare');
const restoreOnly = process.argv.includes('--restore');

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║        🏗️  Build PM APK - YoRiv - Dashboard PM          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (restoreOnly) {
        // Restaurer les fichiers originaux
        console.log('🔄 Mode restauration...\n');
        
        // Restaurer depuis les backups temporaires si disponibles
        const tempBackupDir = path.join(__dirname, '.pm-build-backup');
        if (fs.existsSync(tempBackupDir)) {
            const filesToRestore = [
                { src: path.join(tempBackupDir, 'capacitor.config.json'), dest: files.capacitorConfig },
                { src: path.join(tempBackupDir, 'build.gradle'), dest: files.buildGradle },
                { src: path.join(tempBackupDir, 'strings.xml'), dest: files.stringsXml }
            ];
            
            filesToRestore.forEach(f => {
                if (fs.existsSync(f.src)) {
                    fs.copyFileSync(f.src, f.dest);
                    console.log(`✅ Restored: ${path.basename(f.dest)}`);
                }
            });
            
            fs.rmSync(tempBackupDir, { recursive: true });
            console.log('\n✅ Fichiers restaurés pour Daily Report Supervisor!');
        } else {
            console.log('❌ Aucune sauvegarde trouvée. Les fichiers peuvent déjà être en mode original.');
        }
        return;
    }

    try {
        // 1. Backup des fichiers originaux (sauvegarde permanente pour --restore)
        console.log('📦 Sauvegarde des fichiers originaux...');
        const tempBackupDir = path.join(__dirname, '.pm-build-backup');
        if (!fs.existsSync(tempBackupDir)) fs.mkdirSync(tempBackupDir);
        
        fs.copyFileSync(files.capacitorConfig, path.join(tempBackupDir, 'capacitor.config.json'));
        fs.copyFileSync(files.buildGradle, path.join(tempBackupDir, 'build.gradle'));
        fs.copyFileSync(files.stringsXml, path.join(tempBackupDir, 'strings.xml'));
        Object.values(files).forEach(backup);

        // 2. Modifier les fichiers pour PM
        console.log('\n✏️ Modification des fichiers pour PM...');
        modifyCapacitorConfig();
        modifyBuildGradle();
        modifyStringsXml();

        // 3. Synchroniser avec Capacitor
        console.log('\n🔄 Synchronisation Capacitor...');
        execSync('npx cap sync android', { stdio: 'inherit' });

        // 3.5. Remplacer les icônes par les icônes PM
        backupAndReplaceIcons();

        if (prepareOnly) {
            console.log('\n╔════════════════════════════════════════════════════════════╗');
            console.log('║              ✅ Préparation terminée!                       ║');
            console.log('╠════════════════════════════════════════════════════════════╣');
            console.log('║                                                            ║');
            console.log('║  Les fichiers sont configurés pour PM Dashboard.           ║');
            console.log('║                                                            ║');
            console.log('║  Étapes suivantes:                                         ║');
            console.log('║  1. Ouvrir Android Studio                                  ║');
            console.log('║  2. Ouvrir le dossier: android/                            ║');
            console.log('║  3. Build > Build Bundle(s) / APK(s) > Build APK(s)        ║');
            console.log('║  4. L\'APK sera dans: android/app/build/outputs/apk/       ║');
            console.log('║                                                            ║');
            console.log('║  Après le build, exécutez:                                 ║');
            console.log('║  node build-pm-apk.js --restore                            ║');
            console.log('║  pour restaurer la config Daily Report Supervisor          ║');
            console.log('╚════════════════════════════════════════════════════════════╝');
            return;
        }

        // 4. Build l'APK
        console.log('\n🔨 Build de l\'APK PM...');
        process.chdir(path.join(__dirname, 'android'));
        
        // Utiliser Java 21 d'Android Studio si disponible
        const androidStudioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
        if (fs.existsSync(androidStudioJava)) {
            process.env.JAVA_HOME = androidStudioJava;
            console.log('☕ Utilisation de Java 21 (Android Studio)');
        }
        
        // Build debug APK
        if (process.platform === 'win32') {
            execSync('.\\gradlew.bat assembleDebug', { stdio: 'inherit' });
        } else {
            execSync('./gradlew assembleDebug', { stdio: 'inherit' });
        }

        // 5. Copier l'APK avec un nom explicite
        const apkSource = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        const apkDest = path.join(__dirname, 'pm-dashboard.apk');
        
        if (fs.existsSync(apkSource)) {
            fs.copyFileSync(apkSource, apkDest);
            console.log(`\n✅ APK PM créé: ${apkDest}`);
        }

        // Retourner au répertoire racine
        process.chdir(__dirname);

    } catch (error) {
        console.error('\n❌ Erreur:', error.message);
    } finally {
        // Toujours restaurer les fichiers originaux (sauf en mode --prepare)
        if (!prepareOnly) {
            restoreAll();
            // Supprimer le backup temporaire
            const tempBackupDir = path.join(__dirname, '.pm-build-backup');
            if (fs.existsSync(tempBackupDir)) {
                fs.rmSync(tempBackupDir, { recursive: true });
            }
        }
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ Build terminé!                       ║');
    console.log('║                                                            ║');
    console.log('║  L\'APK PM est disponible : pm-dashboard.apk               ║');
    console.log('║  Vous pouvez l\'installer sur votre téléphone              ║');
    console.log('║  en même temps que Daily Report Supervisor                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
}

main();
