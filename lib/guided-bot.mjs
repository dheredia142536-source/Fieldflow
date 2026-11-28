// Asistente guiado SIN IA: flujo guiado con botones. Se usa cuando no hay LLM_API_KEY.
// Guided assistant WITHOUT AI: button flow. Used when LLM_API_KEY is not set.
import { daysWithSlots, slotsFor, uniqueByTime } from './availability.mjs';
import { cancelarCita, crearCita, getCita, listCitas, reprogramarCita } from './citas.mjs';
import { setHandling, setState } from './convos.mjs';
import { activeServices, chipsDays, chipsServices, chipsSlots, citaUi, citasListUi, confirmUi } from './botui.mjs';
import { S, svcName } from './strings.mjs';
import { HttpError } from './util.mjs';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const split = (p) => { const i = String(p).indexOf(':'); return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)]; };
const parseState = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };

function guess(texto, st, services) {
  const t = norm(texto);
  if (/(humano|asesor|persona|agente|human|person|agent|advisor|someone)/.test(t)) return 'human';
  if (/(mis citas|mi cita|my appointment|my booking|reprogram|resched|cancel)/.test(t)) return 'mine';
  if (st.step === 'confirm') {
    if (/(^|\b)(si|yes|confirm|dale|ok|listo|claro|de acuerdo|yep)/.test(t)) return 'confirm';
    if (/(^|\b)(no|cambiar|change|otro|another)/.test(t)) return 'change';
  }
  for (const sv of services) {
    const names = [norm(sv.nombre_es), norm(sv.nombre_en)];
    const words = names.flatMap((n) => n.split(/\s+/)).filter((w) => w.length >= 5);
    if (names.some((n) => t.includes(n)) || words.some((w) => t.includes(w))) return `svc:${sv.id}`;
  }
  if (/(hola|buenas|buenos|hi\b|hello|hey|agendar|cita|reservar|book|schedule|appointment|quiero|necesito|need|want)/.test(t)) return 'start';
  return null;
}

export async function runGuided({ cliente, conv, lang, texto, payload }) {
  const s = S[lang];
  let st = parseState(conv.estado);
  const services = await activeServices();
  const p = payload || guess(texto, st, services);
  const [kind, rest] = split(p || '');
  const out = (contenido, ui = null, state = st) => ({ contenido, meta: ui ? { ui } : {}, state });

  const offerDays = async (svcId, intro = s.pickDay) => {
    const days = await daysWithSlots({ servicioId: svcId });
    if (!days.length) { await setHandling(conv.id, 'humano', true); return out(s.noDays, null, {}); }
    return out(intro, chipsDays(svcId, days, lang), { ...st, step: 'day', svc: svcId });
  };

  let res;
  try {
    switch (kind) {
      case 'start': {
        res = services.length ? out(s.pickService, chipsServices(services, lang), {}) : out(s.noServices, null, {});
        break;
      }
      case 'svc': {
        res = services.some((x) => x.id === rest) ? await offerDays(rest) : out(s.pickService, chipsServices(services, lang), {});
        break;
      }
      case 'day': {
        const [svcId, ymd] = rest.split('|');
        const slots = uniqueByTime(await slotsFor({ servicioId: svcId, ymd, excludeCitaId: st.resched || null })).slice(0, 12);
        res = slots.length ? out(s.pickSlot, chipsSlots(svcId, slots, lang), { ...st, step: 'slot', svc: svcId }) : await offerDays(svcId, s.noSlots);
        break;
      }
      case 'slot': {
        const [svcId, inicio, recId] = rest.split('|');
        const ui = await confirmUi({ servicioId: svcId, inicio, recursoId: recId, lang });
        res = out(s.confirmNote, ui, { ...st, step: 'confirm', svc: svcId, inicio, res: recId });
        break;
      }
      case 'confirm': {
        if (st.step !== 'confirm') { res = out(s.nothingToConfirm, chipsServices(services, lang), {}); break; }
        if (st.cancel) {
          const c = await cancelarCita({ citaId: st.cancel, clienteId: cliente.id });
          res = out(s.cancelled, citaUi(c, lang, s.cancelled), {});
        } else if (st.resched) {
          const c = await reprogramarCita({ citaId: st.resched, nuevoInicio: st.inicio, recursoId: st.res, clienteId: cliente.id });
          res = out(s.rescheduled, citaUi(c, lang, s.rescheduled), {});
        } else {
          const c = await crearCita({ clienteId: cliente.id, servicioId: st.svc, inicio: st.inicio, recursoId: st.res, origen: 'bot' });
          res = out(s.confirmed, citaUi(c, lang, s.confirmed), {});
        }
        break;
      }
      case 'change':
      case 'keep': {
        if (kind === 'keep') { res = out(s.mineTitle, null, {}); break; }
        res = st.svc ? await offerDays(st.svc) : out(s.pickService, chipsServices(services, lang), {});
        break;
      }
      case 'mine': {
        const now = new Date();
        const citas = await listCitas({ desde: now.toISOString(), hasta: new Date(now.getTime() + 90 * 86400000).toISOString(), clienteId: cliente.id });
        res = citas.length ? out(s.mineTitle, citasListUi(citas, lang), {}) : out(s.mineNone, chipsServices(services, lang), {});
        break;
      }
      case 'cancel': {
        const c = await getCita(rest);
        if (!c || c.cliente_id !== cliente.id) { res = out(s.mineNone, null, {}); break; }
        res = out(s.confirmCancelTitle, await confirmUi({ kind: 'cancel', cita: c, lang }), { step: 'confirm', cancel: c.id });
        break;
      }
      case 'resched': {
        const c = await getCita(rest);
        if (!c || c.cliente_id !== cliente.id) { res = out(s.mineNone, null, {}); break; }
        st = { resched: c.id };
        res = await offerDays(c.servicio_id);
        break;
      }
      case 'human': {
        await setHandling(conv.id, 'humano', true);
        res = out(s.handoff, null, {});
        break;
      }
      default:
        res = out(s.unknown, services.length ? chipsServices(services, lang) : null, {});
    }
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {
      res = st.svc ? await offerDays(st.svc, s.taken) : out(s.taken, chipsServices(services, lang), {});
    } else throw e;
  }
  await setState(conv.id, res.state && Object.keys(res.state).length ? res.state : null);
  return { contenido: res.contenido, meta: res.meta };
}

export async function greeting({ lang, cfg }) {
  const services = await activeServices();
  const text = (lang === 'en' ? cfg.bienvenida_en : cfg.bienvenida_es).replace('{negocio}', cfg.negocio_nombre);
  return { contenido: text, meta: services.length ? { ui: chipsServices(services, lang) } : {} };
}

export { svcName };
