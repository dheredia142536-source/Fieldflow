// Íconos de línea (24×24, trazo 1.7). Contenido estático propio; no hay datos de usuarios aquí.
const P = {
  trendUp: '<path d="M3.5 16.5 9.5 10.5l4 4 7-7"/><path d="M15 7.5h5.5V13"/>',
  trendDown: '<path d="M3.5 7.5 9.5 13.5l4-4 7 7"/><path d="M15 16.5h5.5V11"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bell: '<path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15z"/><path d="M10 21h4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  sparkles: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9z"/><path d="M19 3v3M17.5 4.5h3"/>',
  list: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.7" cy="6.5" r="1"/><circle cx="4.7" cy="12" r="1"/><circle cx="4.7" cy="17.5" r="1"/>',
  gantt: '<path d="M4 6.5h8M8 12h10M6 17.5h7"/>',
  command: '<path d="M9 9h6v6H9zM9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5zM9 15H6.5A2.5 2.5 0 1 0 9 17.5zM15 15v2.5a2.5 2.5 0 1 0 2.5-2.5z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 6 7.5-6"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5.5h16v11H10l-5 4v-4H4z"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 20c.4-3.6 3-5.5 6.2-5.5s5.8 1.9 6.2 5.5"/><path d="M16 5.4a3.3 3.3 0 0 1 0 6M18 14.8c2 .6 3.1 2.2 3.4 5.2"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.5-4 3.5-6 7.5-6s7 2 7.5 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.6 7.4l2 1.2M17.4 15.4l2 1.2M4.6 16.6l2-1.2M17.4 8.6l2-1.2"/><circle cx="12" cy="12" r="7.4"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  send: '<path d="M4 12 20 4l-5 16-3.4-6.6z"/><path d="M11.6 13.4 20 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  collapse: '<path d="m11 7-5 5 5 5M18 7l-5 5 5 5"/>',
  expand: '<path d="m13 7 5 5-5 5M6 7l5 5-5 5"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  hand: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.6 7-6.5 7-2.6 0-4.3-1.3-5.6-3.6L3.4 13.6a1.4 1.4 0 0 1 2.3-1.6L8 14.5V8.5a1.5 1.5 0 0 1 3 0"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  speakerOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  truck: '<path d="M2.5 6.5h11v9h-11zM13.5 10h4l3 3v2.5h-7z"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  alert: '<path d="M12 3.5 22 20H2z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  doc: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9.5 12h5M9.5 15.5h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6M12 17v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
  bot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.5M9 13v1.5M15 13v1.5M2.5 12.5v2M21.5 12.5v2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1-1"/>',
  logout: '<path d="M9.5 4.5h-4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  tractor: '<circle cx="7" cy="16.5" r="3.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M3.5 13V6.5h6.2l1.8 6.5h6V9h3"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 14-14 14z"/><path d="M5 19c3-5 6-8 10-10"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
  pin: '<path d="M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name, size = 20, cls = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = P[name] || '';
  return s;
}

export function logo(size = 32) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 64 64');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect width="64" height="64" rx="16" fill="#0118df"/><path d="M17 43C21 27 31 19 48 19C47 36 38 46 24 46" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 49C23 39 29 33 37 29" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}

// Ilustración de estados vacíos: sol y surcos. / Empty-state art: sun and furrows.
export function emptyArt() {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 200 120');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<circle cx="146" cy="38" r="16" fill="#ffb703" opacity=".9"/>'
    + '<g fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2" stroke-linecap="round">'
    + '<path d="M6 70C50 56 110 84 194 62"/><path d="M6 86C50 72 110 100 194 78"/><path d="M6 102C50 88 110 116 194 94"/></g>'
    + '<path d="M62 62c0-12 6-20 16-22 0 12-5 19-16 22z" fill="#375033" opacity=".85"/>';
  return s;
}

// Logotipo "G" de Google (colores oficiales) para el botón de ingreso.
export function googleG(size = 22) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 48 48');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.innerHTML = '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>';
  return s;
}
