const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'rutaec-u-'));
const u = require('../server/lib/util');
const { generateRotation, findConflicts } = require('../server/lib/rotation');
const { priceTicket } = require('../server/lib/core');
const { autoFares } = require('../server/routes/coop');

test('cédula ecuatoriana: válida e inválida', () => {
  assert.equal(u.validCedula(u.makeCedula('171234567')), true);
  assert.equal(u.validCedula('1712345678'), false);
  assert.equal(u.validCedula('9912345678'), false);
  assert.equal(u.validCedula('abc'), false);
});
test('placa y RUC', () => { assert.ok(u.validPlate('PBA-1234')); assert.ok(!u.validPlate('1234')); assert.ok(u.validRuc('1790012345001')); assert.ok(!u.validRuc('1790012345002')); });
test('fechas locales', () => { assert.equal(u.addDays('2026-02-27', 2), '2026-03-01'); assert.equal(u.dow('2026-10-12'), 0); assert.equal(u.addMinutes('2026-10-11 23:30:00', 45), '2026-10-12 00:15:00'); });
test('precio: descuento sobre tarifa y tasa sin descuento', () => {
  const a = priceTicket({ base: 1000, factorPct: 100, category: 'ADULTO', feeCents: 20 }), m = priceTicket({ base: 1000, factorPct: 100, category: 'MENOR', feeCents: 20 });
  assert.equal(a.total, 1020); assert.equal(m.total, 520);
  assert.equal(priceTicket({ base: 1000, factorPct: 130, seasonPct: 10, feeCents: 0 }).total, 1430);
});
test('rotación: caso del Excel (6 buses, 4 frecuencias) cubre todos los buses y no repite posición', () => {
  const buses = [1, 2, 3, 4, 5, 6].map(id => ({ id })), freqs = [1, 2, 3, 4].map(id => ({ id, days: '1111111' }));
  const r = generateRotation({ buses, frequencies: freqs, start: '2026-10-12', end: '2026-10-17' });
  assert.equal(r.positions, 6); assert.equal(r.parada_count, 2);
  for (let d = 0; d < 6; d++) { const day = r.entries.filter(e => e.date === `2026-10-${12 + d}`); assert.equal(new Set(day.map(e => e.bus_id)).size, 6); assert.equal(day.filter(e => e.frequency_id).length, 4); }
  const bus1 = r.entries.filter(e => e.bus_id === 1).map(e => e.slot); assert.equal(new Set(bus1).size, 6, 'cada bus recorre las 6 posiciones');
});
test('rotación: más frecuencias que buses genera advertencia', () => {
  const r = generateRotation({ buses: [{ id: 1 }, { id: 2 }], frequencies: [1, 2, 3].map(id => ({ id, days: '1111111' })), start: '2026-10-12', end: '2026-10-14' });
  assert.ok(r.warnings.length === 1); assert.equal(r.entries.filter(e => e.date === '2026-10-12').length, 2);
});
test('conflictos de descanso', () => {
  const c = findConflicts([{ date: 'd', bus_id: 1, frequency_id: 1 }, { date: 'd', bus_id: 1, frequency_id: 2 }], { 1: { depart_time: '07:00', duration_min: 240 }, 2: { depart_time: '11:30', duration_min: 60 } }, 60);
  assert.equal(c.length, 1);
});
test('tarifas proporcionales a km', () => {
  const f = autoFares([{ km: 0 }, { km: 100 }, { km: 200 }], 1000);
  assert.deepEqual(f.map(x => x.price_cents), [500, 1000, 500]);
});
