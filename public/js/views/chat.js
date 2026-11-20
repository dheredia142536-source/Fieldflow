// Chat del cliente: asistente con texto, botones y voz.
import { get, post } from '../api.js';
import { h, clear, toast, langSwitch } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';
import { state, pref } from '../state.js';
import { renderMessage, typingBubble } from '../components.js';
import { listen, speak, stopSpeaking, voiceInSupported, voiceOutSupported } from '../voice.js';
import { canPrompt, promptInstall, isIOS, isStandalone, onInstallChange } from '../install.js';

export default async function chatView({ main, rerender, isCurrent }) {
  const data = await get('/api/client/chat');
  if (!isCurrent()) return null;
  clear(main);

  let last = data.mensajes.length ? data.mensajes[data.mensajes.length - 1].creado_en : null;
  const seen = new Set();
  let sending = false;
  let humano = data.atendida_por === 'humano';
  let speakOn = pref('tts') === '1' && voiceOutSupported;
  let rec = null;
  let timer = null;
  let typingEl = null;

  const list = h('div', { class: 'chat__list', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': t('chat.log'), tabindex: '0' });
  const notice = h('div', { class: 'chat__notice' });
  const ta = h('textarea', { rows: '1', 'aria-label': t('chat.placeholder'), placeholder: t('chat.placeholder'), enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences', maxlength: '1000' });
  const send = h('button', { class: 'btn btn--primary btn--icon', type: 'button', 'aria-label': t('chat.send') }, icon('send', 20));
  const mic = h('button', { class: 'btn btn--secondary btn--icon mic', type: 'button', 'aria-pressed': 'false', 'aria-label': t('chat.mic') }, icon('mic', 20));
  const ttsBtn = h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-pressed': String(speakOn), 'aria-label': t('chat.tts') }, icon(speakOn ? 'speaker' : 'speakerOff', 18));
  const status = h('p', null, h('span', { class: 'online' }), h('span', null, t(humano ? 'chat.withTeam' : 'chat.online')));

  const lockOlderChips = () => {
    const msgs = [...list.querySelectorAll('.msg')];
    const lastIdx = msgs.length - 1;
    msgs.forEach((el, i) => { if (i !== lastIdx) el.querySelectorAll('.chip').forEach((b) => { b.disabled = true; }); });
  };
  const toBottom = () => requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });

  function add(m, { announce = true } = {}) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const el = renderMessage(m, { act });
    if (el) list.insertBefore(el, typingEl);
    if (m.creado_en > (last || '')) last = m.creado_en;
    if (announce && speakOn && (m.rol === 'bot' || m.rol === 'humano') && m.contenido) speak(m.contenido, getLang());
  }
  const showTyping = (on) => {
    if (on && !typingEl) { typingEl = typingBubble(); list.append(typingEl); toBottom(); }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  };

  async function submit(text, payload) {
    text = text.trim();
    if (!text || sending) return;
    sending = true; send.disabled = true;
    stopSpeaking();
    const tmp = { id: `tmp-${Date.now()}`, rol: 'cliente', contenido: text, meta: {}, creado_en: new Date().toISOString() };
    const tmpEl = renderMessage(tmp);
    list.insertBefore(tmpEl, typingEl); toBottom();
    lockOlderChips();
    showTyping(true);
    try {
      const r = await post('/api/client/chat', { texto: text, payload: payload || undefined, idioma: getLang() });
      tmpEl.remove();
      r.mensajes.forEach((m) => add(m));
      humano = r.atendida_por === 'humano';
      status.lastChild.textContent = t(humano ? 'chat.withTeam' : 'chat.online');
    } catch (e) {
      tmpEl.remove();
      toast(e.message, true);
      ta.value = text;
    } finally {
      showTyping(false); sending = false; send.disabled = false; lockOlderChips(); toBottom();
    }
  }
  function act(label, payload) {
    list.querySelectorAll('.chip').forEach((b) => { b.disabled = true; });
    submit(label, payload);
  }
  const fromInput = () => { const v = ta.value; ta.value = ''; autosize(); submit(v); };
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; };
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); fromInput(); } });
  send.addEventListener('click', fromInput);

  // Voz de entrada
  const stopRec = () => { rec?.stop(); rec = null; mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', t('chat.mic')); };
  mic.addEventListener('click', () => {
    if (!voiceInSupported) { toast(t('chat.noVoice'), true); return; }
    if (rec) { stopRec(); return; }
    stopSpeaking();
    mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', t('chat.micStop'));
    ta.placeholder = t('chat.listening');
    rec = listen({
      lang: getLang(),
      onInterim: (txt) => { ta.value = txt; autosize(); },
      onFinal: (txt) => { ta.value = txt; autosize(); fromInput(); },
      onEnd: () => { ta.placeholder = t('chat.placeholder'); stopRec(); },
      onError: (code) => { ta.placeholder = t('chat.placeholder'); stopRec(); toast(t(code === 'not-allowed' || code === 'service-not-allowed' ? 'chat.micDenied' : code === 'no-speech' ? 'chat.noSpeech' : 'chat.noVoice'), true); },
    });
  });
  ttsBtn.addEventListener('click', () => {
    if (!voiceOutSupported) { toast(t('chat.noVoice'), true); return; }
    speakOn = !speakOn; pref('tts', speakOn ? '1' : '0'); stopSpeaking();
    ttsBtn.setAttribute('aria-pressed', String(speakOn));
    clear(ttsBtn).append(icon(speakOn ? 'speaker' : 'speakerOff', 18));
    toast(t(speakOn ? 'chat.ttsOn' : 'chat.ttsOff'));
  });

  // Aviso de instalación (solo si aplica)
  const renderNotice = () => {
    clear(notice);
    if (isStandalone() || pref('install-dismissed') === '1') return;
    const dismiss = h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('common.close'), onclick: () => { pref('install-dismissed', '1'); clear(notice); } }, icon('x', 16));
    if (canPrompt()) notice.append(h('div', { class: 'banner' }, icon('download', 20), h('span', null, t('install.prompt')), h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: promptInstall }, t('install.cta')), dismiss));
    else if (isIOS()) notice.append(h('div', { class: 'banner' }, icon('download', 20), h('span', null, t('install.ios')), dismiss));
  };
  renderNotice();
  const offInstall = onInstallChange(renderNotice);

  main.append(h('section', { class: 'chat', 'aria-label': t('nav.assistant') },
    h('header', { class: 'chat__head' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('bot', 22)),
      h('div', { class: 'grow' }, h('h1', null, state.pub.nombre || 'FieldFlow'), status),
      ttsBtn, h('span', { class: 'only-sm' }, langSwitch(getLang(), (c) => { setLang(c); post('/api/client/idioma', { idioma: c }).catch(() => {}); rerender(); }))),
    notice, list,
    h('div', { class: 'composer' }, mic, ta, send)));

  data.mensajes.forEach((m) => add(m, { announce: false }));
  lockOlderChips(); toBottom();
  if (!voiceInSupported) mic.title = t('chat.noVoice');

  // Sondeo: respuestas del equipo y mensajes nuevos.
  const tick = async () => {
    if (document.visibilityState !== 'visible' || sending) return;
    try {
      const r = await get(`/api/client/chat?after=${encodeURIComponent(last || '')}`);
      const fresh = r.mensajes.filter((m) => !seen.has(m.id));
      if (fresh.length) { fresh.forEach((m) => add(m)); lockOlderChips(); toBottom(); }
      if ((r.atendida_por === 'humano') !== humano) { humano = r.atendida_por === 'humano'; status.lastChild.textContent = t(humano ? 'chat.withTeam' : 'chat.online'); }
    } catch { /* reintenta en el siguiente ciclo */ }
  };
  timer = setInterval(tick, 3000);

  try {
    const p = sessionStorage.getItem('ff_pending');
    if (p) { sessionStorage.removeItem('ff_pending'); const o = JSON.parse(p); submit(o.texto, o.payload); }
  } catch { /* sin almacenamiento */ }

  return () => { clearInterval(timer); stopRec(); stopSpeaking(); offInstall(); };
}
