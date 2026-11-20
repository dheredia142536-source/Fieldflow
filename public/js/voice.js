// Voz: Web Speech API (reconocimiento + síntesis) con degradación elegante.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceInSupported = !!SR;
export const voiceOutSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const bcp = (lang) => (lang === 'en' ? 'en-US' : 'es-CO');

export function listen({ lang, onInterim, onFinal, onEnd, onError }) {
  if (!SR) { onError?.('unsupported'); return { stop() {} }; }
  const rec = new SR();
  rec.lang = bcp(lang);
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    if (interim) onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => onError?.(e.error || 'error');
  rec.onend = () => { if (finalText.trim()) onFinal?.(finalText.trim()); onEnd?.(); };
  try { rec.start(); } catch { onError?.('start-failed'); }
  return { stop: () => { try { rec.stop(); } catch { /* ya detenido */ } } };
}

export function speak(text, lang) {
  if (!voiceOutSupported) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp(lang);
  const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang === 'en' ? 'en' : 'es'));
  if (v) u.voice = v;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (voiceOutSupported) window.speechSynthesis.cancel();
}
