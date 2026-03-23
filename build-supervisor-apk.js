const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function forceSupervisorConfig() {
    const capacitorConfigPath = path.join(__dirname, 'capacitor.config.json');
    const buildGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
    const stringsXmlPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

    const supervisorAppId = 'com.yoriv.dailyreport';
    const supervisorAppName = 'YoRiv Daily Reports';

    const config = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
    config.appId = supervisorAppId;
    config.appName = supervisorAppName;
    fs.writeFileSync(capacitorConfigPath, JSON.stringify(config, null, 2), 'utf8');

    let gradle = fs.readFileSync(buildGradlePath, 'utf8');
    gradle = gradle.replace(/applicationId\s+"[^"]+"/, `applicationId "${supervisorAppId}"`);
    fs.writeFileSync(buildGradlePath, gradle, 'utf8');

    let strings = fs.readFileSync(stringsXmlPath, 'utf8');
    strings = strings.replace(/<string name="app_name">.*<\/string>/, `<string name="app_name">${supervisorAppName}</string>`);
    strings = strings.replace(/<string name="title_activity_main">.*<\/string>/, `<string name="title_activity_main">${supervisorAppName}</string>`);
    strings = strings.replace(/<string name="package_name">.*<\/string>/, `<string name="package_name">${supervisorAppId}</string>`);
    strings = strings.replace(/<string name="custom_url_scheme">.*<\/string>/, `<string name="custom_url_scheme">${supervisorAppId}</string>`);
    fs.writeFileSync(stringsXmlPath, strings, 'utf8');
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      🏗️  Build Supervisor APK - YoRiv Daily Reports        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
        console.log('🛡️ Forçage configuration Superviseur...');
        forceSupervisorConfig();

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
