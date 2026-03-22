const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'capacitor.config.json',
  'build-pm-apk.js',
  'public-pm/manifest.json',
  'public-pm/index.html',
  'public-pm/js/pm-dashboard.js',
  'server.js',
  'public/pm-manifest.json',
  'public/manifest.json',
  'public/index.html',
  'public/js/pm-dashboard.js',
  'public/pm.html'
];

filesToUpdate.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Exact App Names Replacements
        content = content.replace(/Eastcastle PM Dashboard/g, 'YoRiv - Dashboard PM');
        content = content.replace(/Eastcastle PM/g, 'YoRiv PM');
        content = content.replace(/Eastcastle - Dashboard PM/g, 'YoRiv - Dashboard PM');
        content = content.replace(/Eastcastle - Daily Report/g, 'YoRiv Daily Reports');
        content = content.replace(/Eastcastle - Rapport Journalier/g, 'YoRiv Daily Reports');
        content = content.replace(/Eastcastle Daily Report/g, 'YoRiv Daily Reports');
        
        // Fallback replacements
        content = content.replace(/Eastcastle/g, 'YoRiv');
        content = content.replace(/EASTCASTLE/g, 'YORIV');
        content = content.replace(/eastcastle/g, 'yoriv');
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('✅ Updated ' + file);
    }
});
