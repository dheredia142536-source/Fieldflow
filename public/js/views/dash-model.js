// Cálculos del dashboard: funciones puras (sin DOM) para que sean rápidas y se puedan probar con Node.
// Dashboard maths: pure functions (no DOM) so they are fast and testable with Node.

export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const DAY = 86400000;

const ymdMs = (ymd) => Date.parse(`${ymd}T12:00:00Z`);
export const addDays = (ymd, n) => new Date(ymdMs(ymd) + n * DAY).toISOString().slice(0, 10);
export const dowOf = (ymd) => (new Date(ymdMs(ymd)).getUTCDay() + 6) % 7;
export const daysBetween = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
// Instante absoluto de una cita (hora de Bogotá = UTC-5).
export const startMs = (r) => Date.parse(`${r.ymd}T00:00:00Z`) + (r.s + 300) * 60000;
export const endMs = (r) => startMs(r) + r.d * 60000;

const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
export const delta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? null : 0);

function rangeDays(start, n) { return Array.from({ length: n }, (_, i) => addDays(start, i)); }

export function parse(data) {
  return data.citas.map((a) => ({ ymd: a[0], s: a[1], d: a[2], svc: a[3], rec: a[4], est: a[5], org: a[6], cli: a[7], cre: a[8], id: a[9] }));
}

// ¿Cuántos minutos ofrece un recurso ese día?
const capDay = (data, ri, ymd) => (data.recursos[ri]?.activo ? data.capacidad[ri][dowOf(ymd)] : 0);

export function buildModel(data, opts = {}) {
  const dias = opts.dias || 30;
  const svcF = opts.svc && opts.svc.size ? opts.svc : null;
  const recF = opts.rec && opts.rec.size ? opts.rec : null;
  const now = opts.now ?? Date.parse(data.ahora);
  const hoy = data.hoy;
  const all = opts.rows || parse(data);
  const pass = (r) => (!svcF || svcF.has(r.svc)) && (!recF || recF.has(r.rec));

  const end = hoy;
  const start = addDays(hoy, -(dias - 1));
  const pStart = addDays(start, -dias);
  const pEnd = addDays(start, -1);
  const inR = (r, a, b) => r.ymd >= a && r.ymd <= b;

  const cur = all.filter((r) => inR(r, start, end) && pass(r));
  const prev = all.filter((r) => inR(r, pStart, pEnd) && pass(r));
  const valid = (r) => r.est !== 2;
  const curV = cur.filter(valid); const prevV = prev.filter(valid);

  // Serie diaria
  const days = rangeDays(start, dias);
  const pDays = rangeDays(pStart, dias);
  const byDay = new Map(); const byDayP = new Map();
  for (const r of curV) byDay.set(r.ymd, (byDay.get(r.ymd) || 0) + 1);
  for (const r of prevV) byDayP.set(r.ymd, (byDayP.get(r.ymd) || 0) + 1);
  const series = days.map((d) => byDay.get(d) || 0);
  const seriesPrev = pDays.map((d) => byDayP.get(d) || 0);

  // Ocupación
  const recIdx = data.recursos.map((_, i) => i).filter((i) => !recF || recF.has(i));
  const availOf = (ds) => ds.reduce((acc, d) => acc + recIdx.reduce((a, ri) => a + capDay(data, ri, d), 0), 0);
  const pastDays = days.filter((d) => d <= hoy);
  const resMin = curV.filter((r) => r.ymd <= hoy).reduce((a, r) => a + r.d, 0);
  const resMinP = prevV.reduce((a, r) => a + r.d, 0);
  const avail = availOf(pastDays); const availP = availOf(pDays);
  const ocup = Math.min(100, pct(resMin, avail)); const ocupP = Math.min(100, pct(resMinP, availP));
  const ocupSeries = days.map((d) => (d > hoy ? null : Math.min(100, pct(curV.filter((r) => r.ymd === d).reduce((a, r) => a + r.d, 0), availOf([d])))));

  // Estados, origen
  const estados = [0, 0, 0]; const origen = [0, 0, 0];
  for (const r of cur) { estados[r.est]++; if (valid(r)) origen[r.org]++; }
  const estadosP = [0, 0, 0];
  for (const r of prev) estadosP[r.est]++;
  const cancelPct = pct(estados[2], cur.length); const cancelPctP = pct(estadosP[2], prev.length);
  const autoN = origen[0] + origen[1];
  const autoPct = pct(autoN, curV.length);
  const autoPctP = pct(prevV.filter((r) => r.org < 2).length, prevV.length);

  // Clientes
  const cl = data.clientes;
  const nuevos = cl.filter((c) => c[2] >= start && c[2] <= end);
  const nuevosP = cl.filter((c) => c[2] >= pStart && c[2] <= pEnd);
  const nuevosSeries = days.map((d) => cl.filter((c) => c[2] === d).length);
  const perClient = new Map();
  for (const r of curV) if (r.cli >= 0) perClient.set(r.cli, (perClient.get(r.cli) || 0) + 1);
  const topClientes = [...perClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i, n]) => ({ i, nombre: cl[i][0] || `+${cl[i][1]}`, tel: cl[i][1], n }));
  const recurrentes = [...perClient.values()].filter((n) => n >= 2).length;
  const everCita = new Set(all.filter(valid).map((r) => r.cli));
  const chatCli = new Set(data.chats.map((c) => c.c));
  const funnel = { clientes: cl.length, chat: cl.filter((_, i) => chatCli.has(i)).length, cita: [...everCita].filter((i) => i >= 0).length, recurrentes: (() => { const m = new Map(); for (const r of all.filter(valid)) if (r.cli >= 0) m.set(r.cli, (m.get(r.cli) || 0) + 1); return [...m.values()].filter((n) => n >= 2).length; })() };

  // Servicios y recursos
  const svcN = data.servicios.map(() => 0); const svcMin = data.servicios.map(() => 0);
  for (const r of curV) { svcN[r.svc]++; svcMin[r.svc] += r.d; }
  const servicios = data.servicios.map((s, i) => ({ i, n: svcN[i], min: svcMin[i], pct: pct(svcN[i], curV.length) })).filter((s) => s.n || !svcF || svcF.has(s.i)).sort((a, b) => b.n - a.n);
  const recursos = data.recursos.map((r, i) => {
    const mine = curV.filter((x) => x.rec === i && x.ymd <= hoy);
    const res = mine.reduce((a, x) => a + x.d, 0);
    const cap = pastDays.reduce((a, d) => a + capDay(data, i, d), 0);
    return { i, nombre: r.nombre, tipo: r.tipo, activo: r.activo, n: curV.filter((x) => x.rec === i).length, res, cap, pct: Math.min(100, pct(res, cap)) };
  }).filter((r) => (!recF || recF.has(r.i)) && r.activo).sort((a, b) => b.pct - a.pct);

  // Mapa de calor
  const matrix = Array.from({ length: 7 }, () => HOURS.map(() => 0));
  let peak = { r: 0, c: 0, n: 0 };
  for (const r of curV) {
    const c = Math.floor(r.s / 60) - HOURS[0];
    if (c < 0 || c >= HOURS.length) continue;
    const row = dowOf(r.ymd);
    matrix[row][c]++;
    if (matrix[row][c] > peak.n) peak = { r: row, c, n: matrix[row][c] };
  }
  const dowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  // Próximos 14 días: carga vs capacidad
  const futuro = Array.from({ length: 14 }, (_, k) => {
    const d = addDays(hoy, k);
    const rows = all.filter((r) => r.ymd === d && valid(r) && pass(r));
    const cap = availOf([d]);
    const min = rows.reduce((a, r) => a + r.d, 0);
    return { ymd: d, n: rows.length, min, cap, pct: Math.min(100, pct(min, cap)) };
  });
  const libreSemana = futuro.slice(0, 7).reduce((a, d) => a + Math.max(0, d.cap - d.min), 0);
  const mejorDia = [...futuro].filter((d) => d.cap > 0).sort((a, b) => a.pct - b.pct)[0] || null;

  // Operativo (sin filtros)
  const hoyAll = all.filter((r) => r.ymd === hoy).sort((a, b) => a.s - b.s);
  const manana = addDays(hoy, 1);
  const mananaN = all.filter((r) => r.ymd === manana && valid(r)).length;
  const proximas = all.filter((r) => valid(r) && endMs(r) > now).sort((a, b) => startMs(a) - startMs(b)).slice(0, 6);
  const recientes = all.filter((r) => r.cre <= hoy).sort((a, b) => (a.cre === b.cre ? startMs(b) - startMs(a) : a.cre < b.cre ? 1 : -1)).slice(0, 6);
  const sem7 = all.filter((r) => valid(r) && r.ymd >= hoy && r.ymd <= addDays(hoy, 6)).length;

  // Chats
  const chats = { total: data.chats.length, bot: data.chats.filter((c) => c.por === 'bot').length, humano: data.chats.filter((c) => c.por !== 'bot').length, att: data.chats.filter((c) => c.att).length, lista: data.chats.filter((c) => c.att).slice(0, 5) };

  // Meta mensual (todas las citas del mes calendario, sin filtros)
  const mes = hoy.slice(0, 7);
  const mesN = all.filter((r) => valid(r) && r.ymd.startsWith(mes) && r.ymd <= hoy).length;
  const dMes = Number(hoy.slice(8)); const dTot = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7), 0)).getUTCDate();
  const goal = { n: mesN, dia: dMes, dias: dTot, proy: Math.round((mesN / Math.max(1, dMes)) * dTot) };

  const M = {
    hoy, dias, start, end, rows: cur, vigentes: curV.length, prevVigentes: prevV.length,
    days, series, seriesPrev, cur, prev,
    kpi: {
      citas: { v: curV.length, p: prevV.length, d: delta(curV.length, prevV.length), spark: series },
      ocup: { v: ocup, p: ocupP, d: ocup - ocupP, spark: ocupSeries.map((x) => x ?? 0), horas: resMin / 60, horasP: resMinP / 60 },
      nuevos: { v: nuevos.length, p: nuevosP.length, d: delta(nuevos.length, nuevosP.length), spark: nuevosSeries },
      cancel: { v: cancelPct, p: cancelPctP, d: cancelPct - cancelPctP, n: estados[2] },
      auto: { v: autoPct, p: autoPctP, d: autoPct - autoPctP, n: autoN },
      horas: { v: resMin / 60, p: resMinP / 60, d: delta(resMin, resMinP), spark: series.map((_, i) => curV.filter((r) => r.ymd === days[i]).reduce((a, r) => a + r.d, 0) / 60) },
    },
    servicios, recursos, matrix, peak, dowTotals, origen, estados, funnel, topClientes, recurrentes,
    futuro, libreSemana, mejorDia, hoyAll, mananaN, proximas, recientes, sem7, chats, goal,
  };
  M.insights = insights(M, data);
  return M;
}

// Hallazgos automáticos, ordenados por importancia. Cada uno: { k: clave de texto, tone, p: parámetros }.
function insights(M, data) {
  const out = [];
  const { kpi } = M;
  if (M.chats.att > 0) out.push({ w: 100, k: 'attention', tone: 'warn', ico: 'chat', p: { n: M.chats.att } });
  const over = M.futuro.slice(0, 7).find((d) => d.pct >= 90);
  if (over) out.push({ w: 90, k: 'busyDay', tone: 'warn', ico: 'alert', p: { ymd: over.ymd, pct: Math.round(over.pct) } });
  if (kpi.citas.d != null && Math.abs(kpi.citas.d) >= 8 && M.prevVigentes > 0) out.push({ w: 80, k: kpi.citas.d > 0 ? 'up' : 'down', tone: kpi.citas.d > 0 ? 'ok' : 'warn', ico: kpi.citas.d > 0 ? 'trendUp' : 'trendDown', p: { pct: Math.round(Math.abs(kpi.citas.d)) } });
  const hot = M.recursos[0];
  if (hot && hot.pct >= 85 && hot.cap > 0) out.push({ w: 75, k: 'hotRes', tone: 'warn', ico: 'tractor', p: { name: hot.nombre, pct: Math.round(hot.pct) } });
  const cold = [...M.recursos].reverse().find((r) => r.cap > 0 && r.pct < 35);
  if (cold && cold !== hot) out.push({ w: 50, k: 'coldRes', tone: 'info', ico: 'tractor', p: { name: cold.nombre, pct: Math.round(cold.pct) } });
  if (M.peak.n > 0) out.push({ w: 70, k: 'peak', tone: 'info', ico: 'clock', p: { dow: M.peak.r, hour: HOURS[M.peak.c], n: M.peak.n } });
  if (kpi.cancel.v >= 15 && M.cur.length >= 8) out.push({ w: 72, k: 'cancelHigh', tone: 'warn', ico: 'alert', p: { pct: Math.round(kpi.cancel.v) } });
  else if (kpi.cancel.d <= -3 && M.prev.length >= 8) out.push({ w: 55, k: 'cancelLow', tone: 'ok', ico: 'shield', p: { pct: Math.round(Math.abs(kpi.cancel.d)) } });
  if (kpi.auto.v >= 40 && M.vigentes >= 8) out.push({ w: 60, k: 'auto', tone: 'ok', ico: 'bot', p: { pct: Math.round(kpi.auto.v) } });
  const top = M.servicios[0];
  if (top && top.n > 0 && M.vigentes >= 8) out.push({ w: 58, k: 'topSvc', tone: 'info', ico: 'leaf', p: { svc: data.servicios[top.i], pct: Math.round(top.pct) } });
  if (kpi.nuevos.v > 0) out.push({ w: 45, k: 'newClients', tone: 'ok', ico: 'users', p: { n: kpi.nuevos.v } });
  if (M.libreSemana > 0) out.push({ w: 40, k: 'freeWeek', tone: 'info', ico: 'calendar', p: { h: Math.round(M.libreSemana / 60) } });
  if (M.mananaN > 0) out.push({ w: 65, k: 'tomorrow', tone: 'info', ico: 'calendar', p: { n: M.mananaN } });
  return out.sort((a, b) => b.w - a.w).slice(0, 6);
}

// Respuestas a las preguntas rápidas (todo sale de los datos ya cargados).
export function answer(kind, M, data) {
  switch (kind) {
    case 'peak': return M.peak.n ? { k: 'a_peak', p: { dow: M.peak.r, hour: HOURS[M.peak.c], n: M.peak.n } } : { k: 'a_none', p: {} };
    case 'topSvc': { const s = M.servicios[0]; return s && s.n ? { k: 'a_topSvc', p: { svc: data.servicios[s.i], n: s.n, pct: Math.round(s.pct) } } : { k: 'a_none', p: {} }; }
    case 'freeRes': { const r = [...M.recursos].filter((x) => x.cap > 0).sort((a, b) => a.pct - b.pct)[0]; return r ? { k: 'a_freeRes', p: { name: r.nombre, pct: Math.round(r.pct) } } : { k: 'a_none', p: {} }; }
    case 'week': return { k: 'a_week', p: { n: M.sem7, h: Math.round(M.libreSemana / 60) } };
    case 'topClient': { const c = M.topClientes[0]; return c ? { k: 'a_topClient', p: { name: c.nombre, n: c.n } } : { k: 'a_none', p: {} }; }
    case 'freeDay': return M.mejorDia ? { k: 'a_freeDay', p: { ymd: M.mejorDia.ymd, pct: Math.round(M.mejorDia.pct) } } : { k: 'a_none', p: {} };
    default: return { k: 'a_none', p: {} };
  }
}
