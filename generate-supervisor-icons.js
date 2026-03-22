const sharp = require('sharp');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');
const logoPath = path.join(iconsDir, 'logo.png');

async function generateSupervisorIcons() {
    for (const size of sizes) {
        const outputPath = path.join(iconsDir, `icon-${size}.png`);
        
        await sharp(logoPath)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(outputPath);
        
        console.log(`✓ Créé: icon-${size}.png`);
    }
    
    console.log('\n✅ Toutes les icônes Supervisor ont été générées !');
}

generateSupervisorIcons().catch(console.error);
