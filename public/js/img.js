// Reduce fotos en el navegador antes de enviarlas (ahorra datos del celular y espacio en la base).
async function load(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* usa <img> */ } }
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); ok(im); };
    im.onerror = () => { URL.revokeObjectURL(url); fail(new Error('image')); };
    im.src = url;
  });
}
function draw(src, max, q) {
  const w0 = src.width || src.naturalWidth; const h0 = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
// Devuelve { grande, mini }: 1280 px y 480 px, JPEG.
export async function resizeImage(file, { big = 1280, small = 480 } = {}) {
  if (!file || !/^image\//.test(file.type || 'image/jpeg')) throw new Error('image');
  const src = await load(file);
  let q = 0.74; let grande = draw(src, big, q);
  while (grande.length > 900_000 && q > 0.4) { q -= 0.1; grande = draw(src, big, q); }
  return { grande, mini: draw(src, small, 0.7) };
}
// Una sola foto pequeña (para la ficha de un animal).
export async function resizeOne(file, max = 640) {
  const src = await load(file);
  let q = 0.74; let d = draw(src, max, q);
  while (d.length > 200_000 && q > 0.4) { q -= 0.1; d = draw(src, max, q); }
  return d;
}
