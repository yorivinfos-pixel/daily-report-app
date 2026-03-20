const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon-192.svg');

async function generateIcons() {
    // Lire le fichier SVG
    const svgBuffer = fs.readFileSync(svgPath);
    
    for (const size of sizes) {
        const outputPath = path.join(iconsDir, `icon-${size}.png`);
        
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(outputPath);
        
        console.log(`✓ Créé: icon-${size}.png`);
    }
    
    console.log('\n✅ Toutes les icônes ont été générées !');
}

generateIcons().catch(console.error);
