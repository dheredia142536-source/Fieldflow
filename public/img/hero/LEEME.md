# Imágenes del hero

Coloca aquí tres archivos WebP (mismo nombre exacto):

| Archivo | Se usa en | Tamaño final recomendado | Proporción |
|---|---|---|---|
| hero-wide.webp | escritorio (≥ 1024 px) | 2400 × 1000 | 12:5 |
| hero-mid.webp  | tablet / iPad (600–1023 px) | 1600 × 1000 | 16:10 |
| hero-tall.webp | celular (< 600 px) | 1080 × 1350 | 4:5 |

- Peso: menos de 350 KB cada una (WebP calidad 75–80, p. ej. squoosh.app).
- Zonas seguras: las esquinas superiores quedan tapadas por las pestañas y la esquina inferior izquierda por la tarjeta "Cita confirmada". Lo importante debe ir en el centro.
- Si cambias el punto de interés, ajusta `--focus-x` / `--focus-y` en `.hframe__img` (css/app.css).
- Sin imágenes, la portada muestra un campo ilustrado con CSS (no se rompe).
