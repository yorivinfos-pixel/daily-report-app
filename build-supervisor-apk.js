const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      🏗️  Build Supervisor APK - YoRiv Daily Reports        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
        console.log('🔄 Synchronisation Capacitor (mise à jour des liens Render)...');
        execSync('npx cap sync android', { stdio: 'inherit' });

        console.log("\n🔨 Build de l'APK Supervisor...");
        process.chdir(path.join(__dirname, 'android'));
        
        const androidStudioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
        if (fs.existsSync(androidStudioJava)) {
            process.env.JAVA_HOME = androidStudioJava;
            console.log('☕ Utilisation de Java 21 (Android Studio)');
        }
        
        if (process.platform === 'win32') {
            execSync('.\\gradlew.bat assembleDebug', { stdio: 'inherit' });
        } else {
            execSync('./gradlew assembleDebug', { stdio: 'inherit' });
        }

        const apkSource = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        const apkDest = path.join(__dirname, 'yoriv-supervisor.apk');
        
        if (fs.existsSync(apkSource)) {
            fs.copyFileSync(apkSource, apkDest);
            console.log(`\n✅ APK Superviseur créé: ${apkDest}`);
        }

        process.chdir(path.join(__dirname, '..'));

    } catch (error) {
        console.error('\n❌ Erreur:', error.message);
    }
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ Build terminé!                       ║');
    console.log('║                                                            ║');
    console.log("║  L'APK Supervisor est disponible: yoriv-supervisor.apk   ║");
    console.log('╚════════════════════════════════════════════════════════════╝');
}

main();
