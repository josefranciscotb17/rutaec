const router = require('express').Router();
const { db } = require('../db');
const core = require('../lib/core');
const { requireAuth, requireRole } = require('../lib/auth');
const { nowLocal, addDays, httpError } = require('../lib/util');

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

module.exports = router;
