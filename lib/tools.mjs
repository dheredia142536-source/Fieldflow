// Herramientas del asistente. El cliente (cliente_id) siempre viene del contexto, nunca del modelo.
// Assistant tools. The customer id always comes from context, never from the model.
import { query } from './db.mjs';
import { slotsFor, uniqueByTime } from './availability.mjs';
import { cancelarCita, crearCita, getCita, listCitas, reprogramarCita } from './citas.mjs';
import { setHandling } from './convos.mjs';
import { activeServices, chipsServices, chipsSlots, citasListUi, citaUi, confirmUi } from './botui.mjs';
import { S, svcName } from './strings.mjs';
import { fmtTime, isYmd, toLocal } from './time.mjs';
import { HttpError } from './util.mjs';

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const TOOL_DEFS = [
  fn('listar_servicios', 'List the services the business can schedule (id, name, duration).'),
  fn('consultar_disponibilidad', 'Get free time slots for a service on a date (Bogotá time). Never invent availability.', {
    servicio_id: { type: 'string' },
    fecha: { type: 'string', description: 'YYYY-MM-DD' },
  }, ['servicio_id', 'fecha']),
  fn('solicitar_confirmacion', 'Show the customer a confirmation card BEFORE creating, rescheduling or cancelling an appointment.', {
    accion: { type: 'string', enum: ['crear', 'reprogramar', 'cancelar'] },
    servicio_id: { type: 'string' },
    inicio: { type: 'string', description: 'Exact ISO start from consultar_disponibilidad' },
    recurso_id: { type: 'string' },
    cita_id: { type: 'string' },
  }, ['accion']),
  fn('crear_cita', 'Create an appointment. Only after the customer explicitly confirmed; set confirmado=true.', {
    servicio_id: { type: 'string' },
    inicio: { type: 'string', description: 'Exact ISO start from consultar_disponibilidad' },
    recurso_id: { type: 'string' },
    confirmado: { type: 'boolean' },
  }, ['servicio_id', 'inicio', 'confirmado']),
  fn('mis_citas', "List the customer's upcoming appointments."),
  fn('reprogramar_cita', 'Move an existing appointment of this customer. Only after explicit confirmation (confirmado=true).', {
    cita_id: { type: 'string' },
    nuevo_inicio: { type: 'string' },
    recurso_id: { type: 'string' },
    confirmado: { type: 'boolean' },
  }, ['cita_id', 'nuevo_inicio', 'confirmado']),
  fn('cancelar_cita', 'Cancel an appointment of this customer. Only after explicit confirmation (confirmado=true).', {
    cita_id: { type: 'string' },
    confirmado: { type: 'boolean' },
  }, ['cita_id', 'confirmado']),
  fn('pasar_a_humano', 'Hand the conversation to a human advisor (customer asks for a person, is upset, or you cannot help).', {
    motivo: { type: 'string' },
  }),
];

const str = (v) => (typeof v === 'string' ? v : '');

export async function runTool(name, args, ctx) {
  const { cliente, conv, lang } = ctx;
  const s = S[lang];
  try {
    switch (name) {
      case 'listar_servicios': {
        const sv = await activeServices();
        return {
          result: { servicios: sv.map((x) => ({ id: x.id, nombre: svcName(x, lang), duracion_min: x.duracion_min })) },
          ui: sv.length ? chipsServices(sv, lang) : null,
        };
      }
      case 'consultar_disponibilidad': {
        if (!isYmd(args.fecha)) return { result: { error: 'fecha debe ser YYYY-MM-DD' } };
        const slots = uniqueByTime(await slotsFor({ servicioId: str(args.servicio_id), ymd: args.fecha })).slice(0, 12);
        return {
          result: { fecha: args.fecha, horarios: slots.map((x) => ({ inicio: x.inicio, hora: fmtTime(x.hm, lang), recurso_id: x.recurso_id, recurso: x.recurso_nombre })) },
          ui: slots.length ? chipsSlots(str(args.servicio_id), slots, lang) : null,
        };
      }
      case 'solicitar_confirmacion': {
        if (args.accion === 'cancelar') {
          const c = await getCita(str(args.cita_id));
          if (!c || c.cliente_id !== cliente.id) return { result: { error: 'cita no encontrada' } };
          return { result: { ok: true, mostrado: true }, ui: await confirmUi({ kind: 'cancel', cita: c, lang }) };
        }
        if (args.accion === 'reprogramar') {
          const c = await getCita(str(args.cita_id));
          if (!c || c.cliente_id !== cliente.id) return { result: { error: 'cita no encontrada' } };
          return { result: { ok: true, mostrado: true }, ui: await confirmUi({ servicioId: c.servicio_id, inicio: str(args.inicio), recursoId: args.recurso_id, lang }) };
        }
        return { result: { ok: true, mostrado: true }, ui: await confirmUi({ servicioId: str(args.servicio_id), inicio: str(args.inicio), recursoId: args.recurso_id, lang }) };
      }
      case 'crear_cita': {
        if (args.confirmado !== true) return { result: { error: 'Falta confirmación explícita del cliente' } };
        const c = await crearCita({ clienteId: cliente.id, servicioId: str(args.servicio_id), inicio: str(args.inicio), recursoId: args.recurso_id || null, origen: 'bot' });
        return { result: { ok: true, cita: { id: c.id, inicio: c.inicio, servicio: svcName(c, lang), recurso: c.recurso_nombre } }, ui: citaUi(c, lang, s.confirmed) };
      }
      case 'mis_citas': {
        const now = new Date();
        const citas = await listCitas({ desde: now.toISOString(), hasta: new Date(now.getTime() + 90 * 86400000).toISOString(), clienteId: cliente.id });
        return { result: { citas: citas.map((c) => ({ id: c.id, inicio: c.inicio, servicio: svcName(c, lang), recurso: c.recurso_nombre })) }, ui: citas.length ? citasListUi(citas, lang) : null };
      }
      case 'reprogramar_cita': {
        if (args.confirmado !== true) return { result: { error: 'Falta confirmación explícita del cliente' } };
        const c = await reprogramarCita({ citaId: str(args.cita_id), nuevoInicio: str(args.nuevo_inicio), recursoId: args.recurso_id || null, clienteId: cliente.id });
        return { result: { ok: true, cita: { id: c.id, inicio: c.inicio } }, ui: citaUi(c, lang, s.rescheduled) };
      }
      case 'cancelar_cita': {
        if (args.confirmado !== true) return { result: { error: 'Falta confirmación explícita del cliente' } };
        const c = await cancelarCita({ citaId: str(args.cita_id), clienteId: cliente.id });
        return { result: { ok: true }, ui: citaUi(c, lang, s.cancelled) };
      }
      case 'pasar_a_humano': {
        await setHandling(conv.id, 'humano', true);
        return { result: { ok: true }, handoff: true };
      }
      default:
        return { result: { error: `herramienta desconocida: ${name}` } };
    }
  } catch (e) {
    if (e instanceof HttpError) return { result: { error: e.code, detalle: e.message } };
    throw e;
  }
}

export { toLocal };
