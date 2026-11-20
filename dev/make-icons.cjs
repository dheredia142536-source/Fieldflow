// Genera íconos PWA, favicon y pantallas de inicio de iOS (splash). Requiere `sharp` (sólo para esta herramienta).
// Generates PWA icons, favicon and iOS splash screens. Requires `sharp` (this tool only).
//   NODE_PATH=/ruta/a/node_modules node dev/make-icons.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public');
const BLUE = '#0096f7';
const PARCH = '#fdfdf7';

const leaf = (stroke = '#fff', w = 3.6) => `
  <path d="M17 43C21 27 31 19 48 19C47 36 38 46 24 46" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 49C23 39 29 33 37 29" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const mark = (size, { rounded = true, scale = 1 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="16"' : ''} fill="${BLUE}"/>
  <g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${leaf()}</g>
</svg>`;

async function png(svg, file, size) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, 'icons', file));
}

async function splash(w, h) {
  const s = Math.round(Math.min(w, h) * 0.2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${PARCH}"/>
    <g transform="translate(${(w - s) / 2} ${h / 2 - s * 0.75})">${mark(s).replace('<svg ', '<svg x="0" y="0" ')}</g>
    <text x="${w / 2}" y="${h / 2 + s * 0.55}" text-anchor="middle" font-family="DM Sans" font-weight="300" font-size="${Math.round(s * 0.34)}" letter-spacing="-${Math.round(s * 0.012)}" fill="#000">FieldFlow</text>
  </svg>`;
  await sharp(Buffer.from(svg), { density: 96 }).png({ compressionLevel: 9, palette: true }).toFile(path.join(out, 'splash', `splash-${w}x${h}.png`));
}

(async () => {
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(out, 'splash'), { recursive: true });
  await png(mark(512), 'icon-192.png', 192);
  await png(mark(512), 'icon-512.png', 512);
  await png(mark(512, { rounded: false, scale: 0.62 }), 'icon-maskable-512.png', 512);
  await png(mark(512, { rounded: false, scale: 0.8 }), 'apple-touch-icon.png', 180);
  await png(mark(512), 'favicon-32.png', 32);
  fs.writeFileSync(path.join(out, 'icons', 'favicon.svg'), mark(64));
  const sizes = [[1320, 2868], [1206, 2622], [1290, 2796], [1179, 2556], [1170, 2532], [1125, 2436], [750, 1334], [1668, 2388], [2048, 2732]];
  for (const [w, h] of sizes) await splash(w, h);
  console.log('ok');
})();
