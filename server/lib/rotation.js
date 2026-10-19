/**
 * Rotación de la hoja de ruta (caso del Excel de clase).
 * N buses y F frecuencias: posiciones P = max(N, F); las posiciones >= F son "parada".
 * Bus asignado a la posición p en el día d: buses[(p - d) mod P].
 */
const { addDays, dow } = require('./util');
function generateRotation({ buses, frequencies, start, end, drivers = [], assistants = [] }) {
  const warnings = [];
  const N = buses.length, F = frequencies.length;
  if (!N) throw new Error('El grupo no tiene buses activos');
  if (!F) throw new Error('No hay frecuencias activas');
  const P = Math.max(N, F);
  if (F > N) warnings.push(`Hay ${F} frecuencias y solo ${N} buses: ${F - N} frecuencia(s) quedarán sin bus en cada día (rotando). Agrega buses o desactiva frecuencias.`);
  const slots = [];
  for (let p = 0; p < P; p++) slots.push(p < F ? frequencies[p] : null);
  const entries = [];
  let d = 0;
  for (let date = start; date <= end; date = addDays(date, 1), d++) {
    for (let p = 0; p < P; p++) {
      const idx = (((p - d) % P) + P) % P;
      if (idx >= N) continue;
      const bus = buses[idx], fr = slots[p];
      const e = { date, slot: p, frequency_id: fr ? fr.id : null, bus_id: bus.id, driver_id: drivers.length ? drivers[idx % drivers.length].id : null, assistant_id: assistants.length ? assistants[idx % assistants.length].id : null };
      if (fr && fr.days && fr.days[dow(date)] === '0') e.frequency_id = null;
      entries.push(e);
    }
  }
  return { entries, warnings, positions: P, parada_count: Math.max(0, N - F) };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
/** Detecta solapes de un mismo bus el mismo día. freqInfo: id -> {depart_time, duration_min} */
function findConflicts(entries, freqInfo, restMin = 60) {
  const out = [], by = {};
  for (const e of entries) {
    if (!e.frequency_id) continue;
    const f = freqInfo[e.frequency_id]; if (!f) continue;
    const s = toMin(f.depart_time), en = s + f.duration_min;
    (by[e.date + '|' + e.bus_id] ||= []).push({ s, en, e });
  }
  for (const k of Object.keys(by)) {
    const arr = by[k].sort((a, b) => a.s - b.s);
    for (let i = 1; i < arr.length; i++) if (arr[i].s < arr[i - 1].en + restMin) out.push(`Bus ${arr[i].e.bus_id} el ${arr[i].e.date}: dos servicios se solapan o no hay descanso mínimo`);
  }
  return out;
}
module.exports = { generateRotation, findConflicts, toMin };
