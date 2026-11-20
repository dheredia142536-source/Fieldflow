// Aplica tema e idioma antes del primer pintado (evita parpadeo). Archivo aparte por la CSP.
try {
  var t = localStorage.getItem('ff_theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  var l = localStorage.getItem('ff_lang') || (navigator.language || 'es').slice(0, 2);
  document.documentElement.lang = l === 'en' ? 'en' : 'es';
} catch (e) { /* sin almacenamiento */ }
