const router = require('express').Router();
const { db, tx } = require('../db');
const core = require('../lib/core');
const { requireAuth, requireRole, hmac } = require('../lib/auth');
const { notifyRole, audit } = require('../lib/notify');
const { nowLocal, addDays, httpError, diffMinutes } = require('../lib/util');
const { maskCedula } = require('../lib/core');

const crew = [requireAuth, requireRole('DRIVER', 'ASSISTANT')];
function myTrip(req, id) {
  const t = core.getTrip(+id);
  if (!t) throw httpError(404, 'Viaje no encontrado');
  if (req.user.role !== 'SUPERADMIN' && t.driver_id !== req.user.id && t.assistant_id !== req.user.id) throw httpError(403, 'Este viaje no está asignado a ti');
  return t;
}
const counts = (tripId) => db.prepare(`SELECT COALESCE(SUM(status IN ('VALIDO','ABORDADO','BAJO')),0) total, COALESCE(SUM(status IN ('ABORDADO','BAJO')),0) boarded FROM tickets WHERE trip_id=?`).get(tripId);

router.get('/driver/trips', ...crew, (req, res) => {
  const d = nowLocal().slice(0, 10), from = addDays(d, -1), to = addDays(d, 14);
  const rows = db.prepare(`SELECT id FROM trips WHERE (driver_id=? OR assistant_id=?) AND date BETWEEN ? AND ? AND status<>'CANCELADO' ORDER BY depart_at`).all(req.user.id, req.user.id, from, to);
  res.json(rows.map(r => { const t = core.getTrip(r.id); const c = counts(t.id); return { id: t.id, date: t.date, depart_at: t.depart_at, status: t.status, bus_number: t.bus_number, plate: t.plate, platform: t.platform, coop_name: t.coop_name, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city, kind: t.kind, stops: t.stops, sold: c.total, boarded: c.boarded, role: t.driver_id === req.user.id ? 'CHOFER' : 'AYUDANTE' }; }));
});
router.get('/driver/history', ...crew, (req, res) => {
  const rows = db.prepare(`SELECT id FROM trips WHERE (driver_id=? OR assistant_id=?) AND status='FINALIZADO' ORDER BY depart_at DESC LIMIT 50`).all(req.user.id, req.user.id);
  res.json(rows.map(r => summary(core.getTrip(r.id))));
});
router.post('/driver/trips/:id/start', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id);
  if (t.driver_id !== req.user.id && req.user.role !== 'SUPERADMIN') throw httpError(403, 'Solo el chofer puede iniciar el viaje');
  if (!['PROGRAMADO', 'ABORDANDO'].includes(t.status)) throw httpError(409, 'El viaje no se puede iniciar (estado ' + t.status + ')');
  if (t.date > nowLocal().slice(0, 10)) throw httpError(409, 'Aún no es la fecha del viaje');
  db.prepare("UPDATE trips SET status='EN_RUTA', started_at=? WHERE id=?").run(nowLocal(), t.id);
  audit(req, 'TRIP_START', 'trip', t.id);
  res.json({ ok: true });
});
router.post('/driver/trips/:id/finish', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id);
  if (t.driver_id !== req.user.id && req.user.role !== 'SUPERADMIN') throw httpError(403, 'Solo el chofer puede finalizar el viaje');
  if (t.status !== 'EN_RUTA') throw httpError(409, 'El viaje no está en ruta');
  tx(() => {
    db.prepare("UPDATE trips SET status='FINALIZADO', finished_at=? WHERE id=?").run(nowLocal(), t.id);
    db.prepare("UPDATE tickets SET status='NO_SHOW' WHERE trip_id=? AND status='VALIDO'").run(t.id);
  })();
  audit(req, 'TRIP_FINISH', 'trip', t.id);
  res.json(summary(core.getTrip(t.id)));
});
function summary(t) {
  const c = db.prepare(`SELECT COALESCE(SUM(status IN ('VALIDO','ABORDADO','BAJO','NO_SHOW')),0) expected, COALESCE(SUM(status IN ('ABORDADO','BAJO')),0) boarded, COALESCE(SUM(status='NO_SHOW'),0) no_show FROM tickets WHERE trip_id=?`).get(t.id);
  const route = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) amt FROM orders WHERE trip_id=? AND channel='RUTA' AND status='PAGADO'`).get(t.id);
  const scans = db.prepare('SELECT result, COUNT(*) n FROM scan_events WHERE trip_id=? GROUP BY result').all(t.id);
  return { id: t.id, date: t.date, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city, scheduled: t.depart_at, started_at: t.started_at, finished_at: t.finished_at, status: t.status,
    duration_min: t.started_at && t.finished_at ? diffMinutes(t.finished_at, t.started_at) : null, delay_min: t.started_at ? diffMinutes(t.started_at, t.depart_at) : null,
    expected: c.expected, boarded: c.boarded, no_show: c.no_show, route_sales: route, scans, bus_number: t.bus_number, plate: t.plate };
}
router.get('/driver/trips/:id/summary', ...crew, (req, res) => res.json(summary(myTrip(req, req.params.id))));

/** Datos del viaje para uso sin conexión */
router.get('/driver/trips/:id/manifest', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id);
  const rows = db.prepare(`SELECT tk.id, tk.public_id, tk.qr_tag, tk.short_code, tk.status, tk.category, tk.from_ord, tk.to_ord, tk.number, s.label seat, st.name seat_type, p.nombres, p.apellidos, p.cedula FROM tickets tk JOIN passengers p ON p.id=tk.passenger_id JOIN bus_seats s ON s.id=tk.seat_id JOIN seat_types st ON st.id=s.seat_type_id WHERE tk.trip_id=? AND tk.status IN ('VALIDO','ABORDADO','BAJO','NO_SHOW','ANULADO')`).all(t.id);
  const city = (o) => t.stops.find(s => s.ord === o).city;
  res.json({ trip: { id: t.id, date: t.date, depart_at: t.depart_at, status: t.status, bus_number: t.bus_number, stops: t.stops, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city },
    downloaded_at: nowLocal(), tickets: rows.map(r => ({ id: r.id, code: r.public_id + r.qr_tag, short_code: r.short_code, status: r.status, seat: r.seat, seat_type: r.seat_type, category: r.category, name: `${r.nombres} ${r.apellidos}`, cedula: maskCedula(r.cedula), from: city(r.from_ord), to: city(r.to_ord) })), counts: counts(t.id) });
});

function parseCode(raw) {
  let c = String(raw || '').trim(); const i = c.lastIndexOf('/v/'); if (i >= 0) c = c.slice(i + 3);
  return c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
/** Procesa un escaneo. El escaneo más antiguo gana (útil para sincronizar offline). */
function processScan(user, { code, tripId, offline, scannedAt, device }) {
  const trip = core.getTrip(+tripId);
  const c = parseCode(code), now = scannedAt || nowLocal();
  let t = null, bad = false;
  if (c.length === 34) { const pub = c.slice(0, 26); if (hmac(pub, 8) !== c.slice(26)) bad = true; else t = db.prepare('SELECT * FROM tickets WHERE public_id=?').get(pub); }
  else if (c.length === 10) t = db.prepare('SELECT * FROM tickets WHERE short_code=?').get(c);
  else bad = true;
  const log = (result, tk) => db.prepare('INSERT INTO scan_events(ticket_id,trip_id,code,result,device,offline,user_id,scanned_at) VALUES(?,?,?,?,?,?,?,?)').run(tk ? tk.id : null, trip ? trip.id : null, c.slice(0, 40), result, device || null, offline ? 1 : 0, user.id, now);
  if (bad || !t) { log('INVALIDO', null); return { result: 'INVALIDO', message: 'Código no reconocido' }; }
  const f = core.ticketFull(t.id);
  const info = { name: `${f.nombres} ${f.apellidos}`, seat: f.seat_label, seat_type: f.seat_type, category: f.category, cedula: maskCedula(f.cedula), from: f.from.city, to: f.to.city, number: f.number, date: f.trip.date };
  if (t.trip_id !== trip.id) { log('OTRO_VIAJE', t); return { result: 'OTRO_VIAJE', message: `Boleto de otro viaje: ${f.from.city} - ${f.to.city} el ${f.depart_at_stop.slice(0, 16)}`, ticket: info }; }
  if (t.status === 'ANULADO') { log('ANULADO', t); return { result: 'ANULADO', message: 'Boleto anulado', ticket: info }; }
  if (['RESERVADO', 'EXPIRADO'].includes(t.status)) { log('NO_PAGADO', t); return { result: 'NO_PAGADO', message: 'Boleto sin pago confirmado', ticket: info }; }
  if (['ABORDADO', 'BAJO'].includes(t.status)) { log('YA_USADO', t); return { result: 'YA_USADO', message: 'Ya fue escaneado a las ' + (t.boarded_at || '').slice(11, 16), boarded_at: t.boarded_at, ticket: info }; }
  db.prepare("UPDATE tickets SET status='ABORDADO', boarded_at=?, boarded_by=? WHERE id=?").run(now, user.id, t.id);
  if (trip.status === 'PROGRAMADO') db.prepare("UPDATE trips SET status='ABORDANDO' WHERE id=?").run(trip.id);
  log('VALIDO', t);
  return { result: 'VALIDO', message: 'Boleto válido', ticket: info, review_doc: t.category !== 'ADULTO', counts: counts(trip.id) };
}
router.post('/driver/scan', ...crew, (req, res) => {
  const t = myTrip(req, req.body.tripId);
  if (['CANCELADO', 'FINALIZADO'].includes(t.status)) throw httpError(409, 'El viaje no admite escaneos');
  res.json(processScan(req.user, req.body));
});
router.post('/driver/scans/batch', ...crew, (req, res) => {
  const scans = (req.body.scans || []).slice().sort((a, b) => String(a.scannedAt).localeCompare(String(b.scannedAt)));
  const results = [];
  for (const s of scans) { try { myTrip(req, s.tripId); results.push({ ...processScan(req.user, { ...s, offline: true }), local_id: s.local_id }); } catch (e) { results.push({ result: 'ERROR', message: e.message, local_id: s.local_id }); } }
  res.json({ results });
});
router.post('/driver/trips/:id/alight', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id);
  const r = db.prepare("UPDATE tickets SET status='BAJO', alighted_at=? WHERE id=? AND trip_id=? AND status='ABORDADO'").run(nowLocal(), +req.body.ticketId, t.id);
  if (!r.changes) throw httpError(409, 'El pasajero no está abordado');
  res.json({ ok: true });
});
router.post('/driver/sale', ...crew, (req, res) => {
  const b = req.body || {}, t = myTrip(req, b.tripId);
  const id = tx(() => {
    const oid = core.createOrder({ tripId: t.id, from: b.from, to: b.to, passengers: b.passengers, channel: 'RUTA', sellerId: req.user.id, expiresMinutes: 5 });
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(oid);
    db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,reviewed_by,reviewed_at,created_at) VALUES(?, 'EFECTIVO', ?, 'APROBADO', ?, ?, ?)").run(oid, o.total_cents, req.user.id, nowLocal(), nowLocal());
    core.issueTickets(oid, req.user.id, 'EFECTIVO');
    db.prepare("UPDATE tickets SET status='ABORDADO', boarded_at=?, boarded_by=? WHERE order_id=?").run(nowLocal(), req.user.id, oid);
    return oid;
  })();
  audit(req, 'ROUTE_SALE', 'order', id);
  res.status(201).json(require('./sales').orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
});
router.get('/driver/trips/:id/free-seats', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id);
  const m = core.seatMap(t.id, +req.query.from, +req.query.to);
  res.json({ seats: m.seats, floors: t.floors });
});
router.post('/driver/trips/:id/incident', ...crew, (req, res) => {
  const t = myTrip(req, req.params.id), { kind, detail } = req.body || {};
  if (!kind) throw httpError(400, 'Indica el tipo de incidencia');
  db.prepare('INSERT INTO incidents(trip_id,user_id,kind,detail,created_at) VALUES(?,?,?,?,?)').run(t.id, req.user.id, kind, detail || null, nowLocal());
  notifyRole(t.coop_id, ['COOP_ADMIN'], `Incidencia: ${kind}`, `Bus ${t.bus_number} · ${t.stops[0].city}-${t.stops[t.stops.length - 1].city}. ${detail || ''}`, '#/coop/trips');
  res.status(201).json({ ok: true });
});
module.exports = router; module.exports.processScan = processScan;
