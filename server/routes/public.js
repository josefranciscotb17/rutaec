const router = require('express').Router();
const { db } = require('../db');
const S = require('../lib/settings');
const core = require('../lib/core');
const { nowLocal, diffMinutes, httpError, hhmm } = require('../lib/util');

router.get('/config', (req, res) => res.json({ ...S.publicConfig(), demo: process.env.DEMO_MODE !== 'false' }));

router.get('/catalog', (req, res) => {
  res.json({
    cities: db.prepare(`SELECT ci.id, ci.name, p.name AS province FROM cities ci JOIN provinces p ON p.id=ci.province_id WHERE EXISTS (SELECT 1 FROM terminals t WHERE t.city_id=ci.id) ORDER BY ci.name`).all(),
    coops: db.prepare('SELECT id,name,short_name,color FROM cooperatives WHERE active=1 ORDER BY name').all(),
    chassis: db.prepare("SELECT DISTINCT chassis_brand v FROM buses WHERE chassis_brand IS NOT NULL ORDER BY 1").all().map(r => r.v),
    bodies: db.prepare("SELECT DISTINCT body_brand v FROM buses WHERE body_brand IS NOT NULL ORDER BY 1").all().map(r => r.v),
    seat_types: db.prepare('SELECT DISTINCT name FROM seat_types ORDER BY name').all().map(r => r.name),
  });
});

/** Búsqueda de viajes: origen/destino por ciudad (incluye paradas intermedias) */
router.get('/search', (req, res) => {
  core.expireOrders();
  const { origin, dest, date, coop, seat_type, chassis, body, kind, from_time, to_time, sort, pax } = req.query;
  if (!origin || !dest || !date) throw httpError(400, 'Indica origen, destino y fecha');
  if (origin === dest) throw httpError(400, 'El origen y el destino deben ser distintos');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'Fecha inválida');
  const cfg = S.all(), now = nowLocal(), need = Math.max(1, +pax || 1);
  const conds = ['t.date=?', "t.status IN ('PROGRAMADO','ABORDANDO')", 'f.active=1'], params = [date];
  if (coop) { conds.push('f.coop_id=?'); params.push(+coop); }
  if (chassis) { conds.push('b.chassis_brand=?'); params.push(chassis); }
  if (body) { conds.push('b.body_brand=?'); params.push(body); }
  if (kind === 'DIRECTA' || kind === 'CON_PARADAS') { conds.push('f.kind=?'); params.push(kind); }
  const trips = db.prepare(`SELECT t.id FROM trips t JOIN frequencies f ON f.id=t.frequency_id JOIN buses b ON b.id=t.bus_id WHERE ${conds.join(' AND ')}`).all(...params);
  const out = [];
  for (const { id } of trips) {
    const t = core.getTrip(id);
    const a = t.stops.find(s => String(s.city_id) === String(origin)), b = t.stops.find(s => String(s.city_id) === String(dest));
    if (!a || !b || b.ord <= a.ord) continue;
    const dep = core.departAtStop(t, a.ord), arr = core.departAtStop(t, b.ord);
    if (diffMinutes(dep, now) < cfg.online_cutoff_minutes) continue;
    const h = hhmm(dep);
    if (from_time && h < from_time) continue;
    if (to_time && h > to_time) continue;
    const base = core.fareFor(t.frequency_id, a.ord, b.ord); if (base == null) continue;
    const sm = core.seatMap(id, a.ord, b.ord);
    const free = sm.seats.filter(s => s.status === 'libre');
    const types = {};
    for (const s of sm.seats.filter(s => s.sellable)) { const k = s.type; types[k] ||= { name: k, price_cents: s.price_cents, free: 0, total: 0 }; types[k].total++; if (s.status === 'libre') types[k].free++; }
    if (seat_type && !(types[seat_type] && types[seat_type].free >= need)) continue;
    out.push({ soldout: free.length < need, ...card(t, a, b, dep, arr, base, sm, free, Object.values(types)) });
  }
  const key = sort === 'price' ? (x) => x.price_from_cents : sort === 'duration' ? (x) => x.duration_min : (x) => x.depart_at;
  out.sort((x, y) => key(x) > key(y) ? 1 : key(x) < key(y) ? -1 : 0);
  res.json(out);
});
function card(t, a, b, dep, arr, base, sm, free, types = []) {
  const prices = sm.seats.filter(s => s.sellable && s.price_cents != null).map(s => s.price_cents);
  const rating = db.prepare('SELECT ROUND(AVG(r.stars),1) avg, COUNT(*) n FROM ratings r JOIN trips tt ON tt.id=r.trip_id JOIN frequencies ff ON ff.id=tt.frequency_id WHERE ff.coop_id=?').get(t.coop_id);
  return {
    trip_id: t.id, coop_id: t.coop_id, coop_name: t.coop_name, coop_color: t.coop_color, bus_number: t.bus_number, plate: t.plate, kind: t.kind, from_ord: a.ord, to_ord: b.ord,
    origin: a.city, origin_terminal: a.terminal, dest: b.city, dest_terminal: b.terminal, depart_at: dep, arrive_at: arr, duration_min: diffMinutes(arr, dep),
    price_from_cents: prices.length ? Math.min(...prices) : base, free_seats: free.length, capacity: t.capacity, seat_types: types, chassis_brand: t.chassis_brand, body_brand: t.body_brand,
    amenities: JSON.parse(t.amenities || '[]'), photo: t.photo, rating: rating && rating.n ? rating : null, platform: t.platform,
  };
}

module.exports = router;
