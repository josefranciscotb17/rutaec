const router = require('express').Router();
const { db, tx } = require('../db');
const core = require('../lib/core');
const { requireAuth, requireRole } = require('../lib/auth');
const { audit } = require('../lib/notify');
const { nowLocal, addDays, httpError, diffMinutes } = require('../lib/util');

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

module.exports = router;
