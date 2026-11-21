// Comprobaciones estáticas de la interfaz: claves i18n y contraste AA de los tokens.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dict } from '../public/js/dict.js';

let fail = 0;
const bad = (m) => { fail++; console.log('  ✗', m); };

// 1) i18n
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js') && !p.endsWith('dict.js')) files.push(p); } })(new URL('../public/js/', import.meta.url).pathname);
const used = new Set();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`]((?:common|err|nav|landing|login|chat|install|citas|status|hoy|cal|cita|origin|chats|clients|mas|cfg|sim|reg)\.[A-Za-z0-9_]+)['"`]/g)) used.add(m[1]);
for (const k of used) for (const l of ['es', 'en']) if (!(k in dict[l])) bad(`falta ${l}: ${k}`);
for (const k of Object.keys(dict.es)) if (!(k in dict.en)) bad(`falta en: ${k}`);
for (const k of Object.keys(dict.en)) if (!(k in dict.es)) bad(`falta es: ${k}`);
console.log(`i18n: ${used.size} claves usadas, ${Object.keys(dict.es).length} definidas`);

// 2) contraste
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ['claro · botón primario', '#ffffff', '#006bb8', 4.5], ['claro · texto', '#0b0b09', '#fdfdf7', 4.5], ['claro · texto 2', '#55554f', '#fdfdf7', 4.5],
  ['claro · alerta', '#b83200', '#fdfdf7', 4.5], ['claro · ok', '#2c6b32', '#fdfdf7', 4.5], ['claro · enlace en tarjeta', '#006bb8', '#f5f2de', 4.5],
  ['oscuro · botón primario', '#04121c', '#4cb6ff', 4.5], ['oscuro · texto', '#f4f3ea', '#11130f', 4.5], ['oscuro · texto 2', '#b9b8ab', '#11130f', 4.5],
  ['oscuro · alerta', '#ff9a73', '#11130f', 4.5], ['oscuro · ok', '#8fd18a', '#11130f', 4.5], ['oscuro · texto 2 en tarjeta', '#b9b8ab', '#20241c', 4.5],
  ['toast error', '#ffffff', '#8f2300', 4.5], ['badge claro verde', '#375033', '#e6e8e1', 4.5],
];
const css = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');
const light = css.match(/--p1: (#\w+); --p2: (#\w+); --p3: (#\w+); --p4: (#\w+); --p5: (#\w+); --p6: (#\w+);/);
const dark = css.match(/--p1: (#\w+); --p2: (#\w+); --p3: (#\w+); --p4: (#\w+); --p5: (#\w+); --p6: (#\w+);/g)[1].match(/#\w+/g);
light.slice(1).forEach((c, i) => pairs.push([`parcela p${i + 1} claro`, '#ffffff', c, 4.5]));
dark.forEach((c, i) => pairs.push([`parcela p${i + 1} oscuro`, '#ffffff', c, 4.5]));
for (const [n, fg, bg, min] of pairs) { const r = ratio(fg, bg); if (r < min) bad(`${n}: ${r.toFixed(2)} < ${min} (${fg} sobre ${bg})`); }
console.log(`contraste: ${pairs.length} pares revisados`);
console.log(fail ? `${fail} problemas` : 'todo bien');
process.exit(fail ? 1 : 0);
