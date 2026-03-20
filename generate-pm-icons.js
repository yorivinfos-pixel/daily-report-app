const sharp = require('sharp');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');
const logoPath = path.join(iconsDir, 'logo-pm.png');

async function generatePMIcons() {
    for (const size of sizes) {
        const outputPath = path.join(iconsDir, `pm-icon-${size}.png`);
        
        await sharp(logoPath)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(outputPath);
        
        console.log(`✓ Créé: pm-icon-${size}.png`);
    }
    
    console.log('\n✅ Toutes les icônes PM ont été générées !');
}

generatePMIcons().catch(console.error);
