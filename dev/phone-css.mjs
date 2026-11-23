// Compila dev/phone.src.css → public/css/phone.css: las medidas en "u" (1u = 1/350 del ancho de la pantalla
// del teléfono) pasan a cqw, y los reinicios de botón/svg/párrafo quedan con especificidad cero (:where).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./phone.src.css', import.meta.url), 'utf8')
  .replace('.phone__screen * { box-sizing', ':where(.phone__screen) * { box-sizing')
  .replace('.phone__screen p { margin', ':where(.phone__screen) :where(p) { margin')
  .replace('.phone__screen button { appearance', ':where(.phone__screen) :where(button) { appearance')
  .replace('.phone__screen svg { flex', ':where(.phone__screen) :where(svg) { flex');
const out = src.replace(/(?<![\w.#-])(-?\d*\.?\d+)u\b/g, (_, n) => `${+(Number(n) * 100 / 350).toFixed(3)}cqw`);
writeFileSync(new URL('../public/css/phone.css', import.meta.url), out);
console.log('phone.css compilado');
