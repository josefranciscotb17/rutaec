const { db, tx } = require('../db');
const S = require('./settings');
const { nowLocal, addMinutes, randCode, validCedula, validEmail, httpError, diffMinutes } = require('./util');
const { hmac } = require('./auth');
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
function seatMap(tripId, a, b, mineOrderId) {
  expireOrders();
  const trip = getTrip(tripId); if (!trip) throw httpError(404, 'Viaje no encontrado');
  const base = fareFor(trip.frequency_id, a, b);
  const sp = seasonPct(trip.coop_id, trip.date);
  const fee = S.get('terminal_fee_cents');
  const seats = db.prepare(`SELECT s.*, st.name AS type_name, st.factor_pct FROM bus_seats s JOIN seat_types st ON st.id=s.seat_type_id WHERE s.bus_id=? ORDER BY s.floor, s.row, s.col`).all(trip.bus_id);
  const taken = db.prepare(`SELECT seat_id, status, order_id FROM tickets WHERE trip_id=? AND status IN ${ACTIVE} AND from_ord < ? AND to_ord > ?`).all(tripId, b, a);
  const tm = new Map(taken.map(t => [t.seat_id, t]));
  return {
    trip, seats: seats.map(s => {
      const t = tm.get(s.id);
      const status = !s.sellable ? 'bloqueado' : t ? (t.status === 'RESERVADO' ? (mineOrderId && t.order_id === mineOrderId ? 'mio' : 'reservado') : 'ocupado') : 'libre';
      const price = base == null ? null : priceTicket({ base, factorPct: s.factor_pct, seasonPct: sp }).base + fee;
      return { id: s.id, label: s.label, floor: s.floor, row: s.row, col: s.col, type: s.type_name, factor_pct: s.factor_pct, status, price_cents: price, sellable: s.sellable };
    }),
  };
}

function upsertPassenger(p) {
  const ex = db.prepare('SELECT * FROM passengers WHERE cedula=?').get(p.cedula);
  if (ex) {
    db.prepare("UPDATE passengers SET nombres=?, apellidos=?, email=COALESCE(NULLIF(?,''),email), phone=COALESCE(NULLIF(?,''),phone), category=? WHERE id=?").run(p.nombres, p.apellidos, p.email || '', p.phone || '', p.category, ex.id);
    return ex.id;
  }
  return db.prepare('INSERT INTO passengers(cedula,nombres,apellidos,email,phone,category) VALUES(?,?,?,?,?,?)').run(p.cedula, p.nombres, p.apellidos, p.email || null, p.phone || null, p.category).lastInsertRowid;
}

/**
 * Crea una orden con sus boletos en estado RESERVADO (bloquea asientos).
 * o: {tripId, from, to, passengers:[{seatId,cedula,nombres,apellidos,email,phone,category,price_cents?}], buyerId, channel, officeId, sellerId, expiresMinutes, allowStarted}
 */
const createOrder = tx((o) => {
  expireOrders();
  const cfg = S.all();
  const trip = getTrip(o.tripId);
  if (!trip) throw httpError(404, 'Viaje no encontrado');
  if (['CANCELADO', 'FINALIZADO'].includes(trip.status)) throw httpError(409, 'Este viaje ya no está disponible', 'TRIP_CLOSED');
  const a = +o.from, b = +o.to;
  if (!(a >= 0 && b > a) || !stopAt(trip, a) || !stopAt(trip, b)) throw httpError(400, 'Tramo inválido');
  const dep = departAtStop(trip, a), now = nowLocal();
  if (o.channel === 'WEB' && diffMinutes(dep, now) < cfg.online_cutoff_minutes) throw httpError(409, `La venta en línea cierra ${cfg.online_cutoff_minutes} min antes de la salida`, 'CUTOFF');
  if (o.channel === 'OFICINA' && diffMinutes(dep, now) < -5 && !o.allowStarted) throw httpError(409, 'El bus ya salió de esa parada', 'DEPARTED');
  if (o.channel === 'RUTA' && trip.status !== 'EN_RUTA' && trip.status !== 'ABORDANDO') throw httpError(409, 'El viaje debe estar iniciado para vender en ruta');
  const list = o.passengers || [];
  if (!list.length) throw httpError(400, 'Selecciona al menos un asiento');
  if (list.length > cfg.max_seats) throw httpError(400, `Máximo ${cfg.max_seats} asientos por compra`);
  if (o.channel === 'WEB' && o.buyerId) {
    const open = db.prepare("SELECT COUNT(*) c FROM orders WHERE buyer_id=? AND status='RESERVADO'").get(o.buyerId).c;
    if (open >= 3) throw httpError(429, 'Tienes demasiadas reservas pendientes. Completa o cancela alguna.', 'TOO_MANY_HOLDS');
  }
  const base = fareFor(trip.frequency_id, a, b);
  if (base == null) throw httpError(400, 'No hay tarifa definida para ese tramo');
  const sp = seasonPct(trip.coop_id, trip.date);
  const seen = new Set(), cedulas = new Set(), lines = [];
  for (const p of list) {
    const seat = db.prepare('SELECT s.*, st.factor_pct FROM bus_seats s JOIN seat_types st ON st.id=s.seat_type_id WHERE s.id=? AND s.bus_id=?').get(p.seatId, trip.bus_id);
    if (!seat || !seat.sellable) throw httpError(400, 'Asiento inválido o no vendible');
    if (seen.has(seat.id)) throw httpError(400, 'Asiento repetido');
    seen.add(seat.id);
    const busy = db.prepare(`SELECT 1 FROM tickets WHERE trip_id=? AND seat_id=? AND status IN ${ACTIVE} AND from_ord < ? AND to_ord > ?`).get(trip.id, seat.id, b, a);
    if (busy) throw httpError(409, `El asiento ${seat.label} ya no está disponible`, 'SEAT_TAKEN');
    const cat = CATEGORIES.includes(p.category) ? p.category : 'ADULTO';
    const ced = String(p.cedula || '').trim();
    if (!validCedula(ced)) throw httpError(400, `Cédula inválida: ${ced || '(vacía)'}`, 'BAD_CEDULA');
    if (cedulas.has(ced)) throw httpError(400, 'Hay pasajeros con la misma cédula en esta compra');
    cedulas.add(ced);
    const dupe = db.prepare(`SELECT 1 FROM tickets t JOIN passengers pa ON pa.id=t.passenger_id WHERE t.trip_id=? AND pa.cedula=? AND t.status IN ${ACTIVE} AND t.from_ord < ? AND t.to_ord > ?`).get(trip.id, ced, b, a);
    if (dupe) throw httpError(409, `El pasajero ${ced} ya tiene un boleto en este viaje y tramo`, 'PASSENGER_DUP');
    if (!String(p.nombres || '').trim() || !String(p.apellidos || '').trim()) throw httpError(400, 'Ingresa nombres y apellidos de cada pasajero');
    if (o.channel === 'WEB' && !validEmail(p.email)) throw httpError(400, `Correo inválido para el pasajero ${ced}`);
    if (p.email && !validEmail(p.email)) throw httpError(400, `Correo inválido (${p.email})`);
    let pr = priceTicket({ base, factorPct: seat.factor_pct, seasonPct: sp, category: cat });
    if (o.channel === 'RUTA' && p.price_cents != null) {
      const min = Math.round(pr.base * cfg.driver_price_min_pct / 100), max = Math.round(pr.base * cfg.driver_price_max_pct / 100);
      const v = Math.round(+p.price_cents);
      if (v < min || v > max) throw httpError(400, `El precio debe estar entre ${(min / 100).toFixed(2)} y ${(max / 100).toFixed(2)}`);
      pr = { base: v, discount: 0, fee: 0, total: v };
    }
    lines.push({ seat, cat, p: { ...p, cedula: ced, category: cat }, pr });
  }
  const subtotal = lines.reduce((s, l) => s + l.pr.base, 0), discount = lines.reduce((s, l) => s + l.pr.discount, 0), fee = lines.reduce((s, l) => s + l.pr.fee, 0);
  const exp = o.expiresMinutes === null ? null : addMinutes(now, o.expiresMinutes || cfg.reserve_minutes);
  const code = 'R' + randCode(7);
  const oid = db.prepare(`INSERT INTO orders(code,buyer_id,channel,office_id,seller_id,coop_id,trip_id,status,subtotal_cents,discount_cents,fee_cents,total_cents,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?,'RESERVADO',?,?,?,?,?,?)`).run(code, o.buyerId || null, o.channel, o.officeId || null, o.sellerId || null, trip.coop_id, trip.id, subtotal, discount, fee, subtotal - discount + fee, exp, now).lastInsertRowid;
  for (const l of lines) {
    const pid = upsertPassenger(l.p);
    const pub = randCode(26);
    let short; do { short = randCode(10); } while (db.prepare('SELECT 1 FROM tickets WHERE short_code=?').get(short));
    db.prepare(`INSERT INTO tickets(public_id,qr_tag,short_code,order_id,trip_id,seat_id,passenger_id,from_ord,to_ord,category,base_cents,discount_cents,fee_cents,total_cents,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RESERVADO',?)`).run(pub, hmac(pub, 8), short, oid, trip.id, l.seat.id, pid, a, b, l.cat, l.pr.base, l.pr.discount, l.pr.fee, l.pr.total, now);
  }
  return oid;
});

/** Emite los boletos de una orden pagada */
const issueTickets = tx((orderId, paidBy, method) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!o) throw httpError(404, 'Orden no encontrada');
  if (o.status === 'PAGADO') return o;
  if (o.status === 'EXPIRADO' || o.status === 'CANCELADO') throw httpError(409, 'La orden ya no está vigente (expirada o cancelada)');
  const tickets = db.prepare("SELECT id FROM tickets WHERE order_id=? AND status='RESERVADO'").all(orderId);
  if (!tickets.length) throw httpError(409, 'La orden no tiene boletos reservados');
  for (const t of tickets) {
    db.prepare('UPDATE cooperatives SET ticket_seq = ticket_seq + 1 WHERE id=?').run(o.coop_id);
    const seq = db.prepare('SELECT ticket_seq s FROM cooperatives WHERE id=?').get(o.coop_id).s;
    const number = `${String(o.coop_id).padStart(3, '0')}-${String(o.office_id || 1).padStart(3, '0')}-${String(seq).padStart(9, '0')}`;
    db.prepare("UPDATE tickets SET status='VALIDO', number=? WHERE id=?").run(number, t.id);
  }
  db.prepare("UPDATE orders SET status='PAGADO', paid_at=?, expires_at=NULL, method=COALESCE(?,method) WHERE id=?").run(nowLocal(), method || null, orderId);
  return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
});

/** Vista completa de un boleto (PDF, impresión y APIs) */
function ticketFull(id) {
  const t = db.prepare(`SELECT t.*, o.code AS order_code, o.channel, o.coop_id, o.buyer_id, o.method, o.office_id, o.seller_id, o.status AS order_status, o.paid_at,
      p.cedula, p.nombres, p.apellidos, p.email AS pax_email, s.label AS seat_label, st.name AS seat_type
    FROM tickets t JOIN orders o ON o.id=t.order_id JOIN passengers p ON p.id=t.passenger_id JOIN bus_seats s ON s.id=t.seat_id JOIN seat_types st ON st.id=s.seat_type_id WHERE t.id=?`).get(id);
  if (!t) return null;
  const trip = getTrip(t.trip_id);
  t.trip = trip;
  t.from = stopAt(trip, t.from_ord); t.to = stopAt(trip, t.to_ord);
  t.depart_at_stop = departAtStop(trip, t.from_ord);
  t.arrive_at_stop = addMinutes(trip.depart_at, t.to.minutes);
  t.code = t.public_id + t.qr_tag;
  t.seller = t.seller_id ? (db.prepare('SELECT nombres, apellidos FROM users WHERE id=?').get(t.seller_id) || null) : null;
  t.coop = db.prepare('SELECT name, ruc, color, phone FROM cooperatives WHERE id=?').get(t.coop_id);
  return t;
}
const maskCedula = (c) => c ? c.slice(0, 3) + '****' + c.slice(-3) : '';

function summarizeTrip(id) {
  const t = getTrip(id); if (!t) return null;
  return { id: t.id, date: t.date, depart_at: t.depart_at, status: t.status, coop_name: t.coop_name, bus_number: t.bus_number, plate: t.plate, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city, platform: t.platform };
}
function ordersWithTickets(where, params) {
  const orders = db.prepare(`SELECT o.*, c.name AS coop_name FROM orders o JOIN cooperatives c ON c.id=o.coop_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`).all(...params);
  for (const o of orders) {
    o.trip = summarizeTrip(o.trip_id);
    o.tickets = db.prepare(`SELECT t.id, t.number, t.status, t.total_cents, t.category, t.from_ord, t.to_ord, s.label AS seat_label, p.nombres, p.apellidos, p.cedula FROM tickets t JOIN bus_seats s ON s.id=t.seat_id JOIN passengers p ON p.id=t.passenger_id WHERE t.order_id=?`).all(o.id);
    o.payment = db.prepare('SELECT id,method,status,reference,bank,reject_reason,proof_file,amount_cents FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1').get(o.id) || null;
    const a = o.tickets[0];
    if (a && o.trip) { const tr = getTrip(o.trip_id); o.from = stopAt(tr, a.from_ord); o.to = stopAt(tr, a.to_ord); o.depart_at_stop = departAtStop(tr, a.from_ord); }
  }
  return orders;
}
module.exports = { expireOrders, getTrip, stopAt, departAtStop, fareFor, seasonPct, priceTicket, seatMap, createOrder, issueTickets, ticketFull, maskCedula, ordersWithTickets, summarizeTrip, CATEGORIES, ACTIVE, upsertPassenger };
