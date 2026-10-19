const { db } = require('../db');
const S = require('./settings');
const { nowLocal, addMinutes } = require('./util');
const { notify } = require('./notify');

const ACTIVE = "('RESERVADO','VALIDO','ABORDADO')";
const CATEGORIES = ['ADULTO', 'MENOR', 'TERCERA_EDAD', 'DISCAPACIDAD'];

/** Expira reservas vencidas y libera sus asientos */
function expireOrders() {
  const now = nowLocal();
  const rows = db.prepare("SELECT id, buyer_id, code FROM orders WHERE status='RESERVADO' AND expires_at IS NOT NULL AND expires_at < ?").all(now);
  for (const o of rows) {
    db.prepare("UPDATE orders SET status='EXPIRADO' WHERE id=?").run(o.id);
    db.prepare("UPDATE tickets SET status='EXPIRADO' WHERE order_id=? AND status='RESERVADO'").run(o.id);
    db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason='Reserva expirada' WHERE order_id=? AND status IN ('PENDIENTE')").run(o.id);
    if (o.buyer_id) notify(o.buyer_id, 'Reserva expirada', `Tu reserva ${o.code} expiró y los asientos fueron liberados. Puedes intentar nuevamente.`, '#/orders');
  }
  return rows.length;
}

function getTrip(id) {
  const t = db.prepare(`SELECT t.*, f.coop_id, f.depart_time, f.duration_min, f.kind, f.origin_terminal_id, f.dest_terminal_id, f.id AS freq_id,
      b.number AS bus_number, b.plate, b.floors, b.chassis_brand, b.body_brand, b.model, b.color AS bus_color, b.amenities, b.photo, b.capacity,
      c.name AS coop_name, c.short_name AS coop_short, c.color AS coop_color
    FROM trips t JOIN frequencies f ON f.id=t.frequency_id JOIN buses b ON b.id=t.bus_id JOIN cooperatives c ON c.id=f.coop_id WHERE t.id=?`).get(id);
  if (!t) return null;
  t.stops = db.prepare(`SELECT s.ord, s.minutes, s.km, s.terminal_id, tm.name AS terminal, ci.name AS city, ci.id AS city_id FROM frequency_stops s JOIN terminals tm ON tm.id=s.terminal_id JOIN cities ci ON ci.id=tm.city_id WHERE s.frequency_id=? ORDER BY s.ord`).all(t.frequency_id);
  return t;
}
const stopAt = (trip, ord) => trip.stops.find(s => s.ord === ord);
const departAtStop = (trip, ord) => addMinutes(trip.depart_at, stopAt(trip, ord).minutes);
function fareFor(freqId, a, b) { const r = db.prepare('SELECT price_cents FROM fares WHERE frequency_id=? AND from_ord=? AND to_ord=?').get(freqId, a, b); return r ? r.price_cents : null; }
function seasonPct(coopId, date) { return db.prepare('SELECT COALESCE(SUM(pct),0) p FROM season_rules WHERE active=1 AND (coop_id IS NULL OR coop_id=?) AND ? BETWEEN start_date AND end_date').get(coopId, date).p; }

/** Precio de un boleto en centavos. Descuento sobre la tarifa (no sobre tasas). */
function priceTicket({ base, factorPct, seasonPct: sp = 0, category = 'ADULTO', feeCents }) {
  const cfg = S.all();
  const full = Math.round(base * factorPct / 100 * (100 + sp) / 100);
  const pct = category === 'MENOR' ? cfg.discount_minor_pct : category === 'TERCERA_EDAD' ? cfg.discount_senior_pct : category === 'DISCAPACIDAD' ? cfg.discount_disability_pct : 0;
  const discount = Math.round(full * pct / 100);
  const fee = feeCents == null ? cfg.terminal_fee_cents : feeCents;
  return { base: full, discount, fee, total: full - discount + fee };
}

/** Estado de cada asiento del bus para el tramo [a,b) */

module.exports = { expireOrders, getTrip, stopAt, departAtStop, fareFor, seasonPct, priceTicket, CATEGORIES, ACTIVE };
