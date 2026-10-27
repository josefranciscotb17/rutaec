const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { db, tx, UPLOADS } = require('../db');
const S = require('../lib/settings');
const core = require('../lib/core');
const docs = require('../lib/docs');
const { requireAuth, requireRole, coopId } = require('../lib/auth');
const { notify, notifyRole, audit } = require('../lib/notify');
const { nowLocal, addMinutes, diffMinutes, httpError, money } = require('../lib/util');

const PRIV = path.join(UPLOADS, 'private');
const upload = multer({ dest: PRIV, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const base = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
const isStaff = (u) => ['SUPERADMIN', 'AUDITOR', 'COOP_ADMIN', 'OFFICE'].includes(u.role);

function canSeeOrder(u, o) { return o.buyer_id === u.id || ['SUPERADMIN', 'AUDITOR'].includes(u.role) || (['COOP_ADMIN', 'OFFICE'].includes(u.role) && u.coop_id === o.coop_id); }
function loadOrder(req, id) {
  core.expireOrders();
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+id);
  if (!o) throw httpError(404, 'Orden no encontrada');
  if (!canSeeOrder(req.user, o)) throw httpError(403, 'No tienes acceso a esta orden');
  return o;
}
function orderDetail(o) {
  const full = core.ordersWithTickets('o.id=?', [o.id])[0];
  full.bank_accounts = db.prepare('SELECT id,bank,type,number,holder,holder_id FROM bank_accounts WHERE coop_id=? AND active=1').all(o.coop_id);
  full.payments = db.prepare('SELECT id,method,status,reference,bank,paid_date,reject_reason,amount_cents,proof_file,created_at FROM payments WHERE order_id=? ORDER BY id').all(o.id);
  full.seconds_left = o.status === 'RESERVADO' && o.expires_at ? Math.max(0, -diffMinutes(nowLocal(), o.expires_at) * 60) : null;
  return full;
}
function fileKind(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return '.png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.slice(0, 4).toString() === '%PDF') return '.pdf';
  return null;
}

/* ---------------- Cliente: crear / ver / pagar ---------------- */
router.post('/orders', requireAuth, (req, res) => {
  const b = req.body || {};
  const id = core.createOrder({ tripId: +b.tripId, from: b.from, to: b.to, passengers: b.passengers, buyerId: req.user.id, channel: 'WEB' });
  audit(req, 'ORDER_CREATE', 'order', id);
  res.status(201).json(orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
});
router.get('/orders/mine', requireAuth, (req, res) => { core.expireOrders(); res.json(core.ordersWithTickets('o.buyer_id=?', [req.user.id])); });
router.get('/orders/:id', requireAuth, (req, res) => res.json(orderDetail(loadOrder(req, req.params.id))));

router.post('/orders/:id/cancel', requireAuth, (req, res) => {
  const o = loadOrder(req, req.params.id);
  if (!['RESERVADO', 'EN_REVISION'].includes(o.status)) throw httpError(409, 'Solo puedes cancelar compras sin pagar');
  tx(() => {
    db.prepare("UPDATE orders SET status='CANCELADO', expires_at=NULL WHERE id=?").run(o.id);
    db.prepare("UPDATE tickets SET status='ANULADO', void_reason='Cancelado por el cliente' WHERE order_id=? AND status='RESERVADO'").run(o.id);
    db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason='Compra cancelada' WHERE order_id=? AND status IN ('PENDIENTE','EN_REVISION')").run(o.id);
  })();
  audit(req, 'ORDER_CANCEL', 'order', o.id);
  res.json({ ok: true });
});

router.post('/orders/:id/pay', requireAuth, (req, res) => {
  const o = loadOrder(req, req.params.id), { method, bank_account_id } = req.body || {};
  if (o.status !== 'RESERVADO') throw httpError(409, 'La orden ya no está disponible para pago');
  if (!['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO'].includes(method)) throw httpError(400, 'Método de pago inválido');
  const cfg = S.all(), now = nowLocal();
  let expAt = null;
  tx(() => {
    db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason='Método cambiado' WHERE order_id=? AND status='PENDIENTE'").run(o.id);
    if (method === 'EFECTIVO') {
      const trip = core.getTrip(o.trip_id); const first = db.prepare('SELECT from_ord FROM tickets WHERE order_id=? LIMIT 1').get(o.id);
      const dep = core.departAtStop(trip, first.from_ord);
      let exp = addMinutes(now, cfg.cash_hold_minutes); const limit = addMinutes(dep, -15); if (exp > limit) exp = limit > now ? limit : addMinutes(now, 5);
      expAt = exp;
      db.prepare("UPDATE orders SET method='EFECTIVO', expires_at=? WHERE id=?").run(exp, o.id);
      db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,created_at) VALUES(?,?,?,'PENDIENTE',?)").run(o.id, 'EFECTIVO', o.total_cents, now);
    } else {
      db.prepare('UPDATE orders SET method=? WHERE id=?').run(method, o.id);
      db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,bank_account_id,created_at) VALUES(?,?,?,'PENDIENTE',?,?)").run(o.id, method, o.total_cents, bank_account_id || null, now);
    }
  })();
  if (method === 'EFECTIVO') notify(req.user.id, 'Reserva para pago en efectivo', `Paga ${money(o.total_cents)} en la oficina de la cooperativa antes de las ${expAt.slice(11, 16)} con el código ${o.code}.`, '#/orders');
  res.json(orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)));
});

router.post('/orders/:id/proof', requireAuth, upload.single('file'), (req, res) => {
  try {
    const o = loadOrder(req, req.params.id);
    if (o.status !== 'RESERVADO') throw httpError(409, 'La orden no admite comprobante en su estado actual (¿expiró?)');
    if (!req.file) throw httpError(400, 'Adjunta el comprobante (JPG, PNG o PDF)');
    const ext = fileKind(req.file.path);
    if (!ext) throw httpError(400, 'Formato de archivo no permitido. Usa JPG, PNG o PDF.');
    const { bank, reference, paid_date, amount, method } = req.body || {};
    if (!reference || !String(reference).trim()) throw httpError(400, 'Ingresa el número de comprobante / referencia');
    const cents = Math.round(parseFloat(amount) * 100);
    if (!(cents > 0)) throw httpError(400, 'Ingresa el monto pagado');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
    const dupe = db.prepare("SELECT 1 FROM payments WHERE order_id<>? AND status IN ('EN_REVISION','APROBADO') AND (proof_hash=? OR (bank=? AND reference=? AND amount_cents=?))").get(o.id, hash, bank || '', String(reference).trim(), cents);
    if (dupe) throw httpError(409, 'Este comprobante ya fue utilizado en otra compra', 'PROOF_DUP');
    const name = crypto.randomBytes(16).toString('hex') + ext; fs.renameSync(req.file.path, path.join(PRIV, name));
    const now = nowLocal();
    tx(() => {
      db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason='Reemplazado por nuevo comprobante' WHERE order_id=? AND status IN ('PENDIENTE','EN_REVISION')").run(o.id);
      db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,bank,reference,paid_date,proof_file,proof_hash,created_at) VALUES(?,?,?,'EN_REVISION',?,?,?,?,?,?)")
        .run(o.id, ['TRANSFERENCIA', 'DEPOSITO'].includes(method) ? method : (o.method || 'TRANSFERENCIA'), cents, bank || null, String(reference).trim(), paid_date || null, name, hash, now);
      db.prepare("UPDATE orders SET status='EN_REVISION', expires_at=NULL WHERE id=?").run(o.id);
    })();
    notifyRole(o.coop_id, ['OFFICE', 'COOP_ADMIN'], 'Comprobante por validar', `Orden ${o.code} por ${money(o.total_cents)}`, '#/office/payments');
    notify(req.user.id, 'Comprobante recibido', `Recibimos tu comprobante de la orden ${o.code}. Un oficinista lo validará en breve.`, '#/orders');
    audit(req, 'PROOF_UPLOAD', 'order', o.id);
    res.json(orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)));
  } catch (e) { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); throw e; }
});

/** Archivos privados (comprobantes): dueño de la orden o personal de la cooperativa */
router.get('/files/:name', requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  const p = db.prepare('SELECT order_id FROM payments WHERE proof_file=?').get(name);
  if (!p) throw httpError(404, 'Archivo no encontrado');
  if (!canSeeOrder(req.user, db.prepare('SELECT * FROM orders WHERE id=?').get(p.order_id))) throw httpError(403, 'Sin acceso');
  res.sendFile(path.join(PRIV, name));
});

/* ---------------- Boletos ---------------- */
function ticketAccess(req, id) {
  const t = core.ticketFull(+id);
  if (!t) throw httpError(404, 'Boleto no encontrado');
  const u = req.user;
  if (!(t.buyer_id === u.id || ['SUPERADMIN', 'AUDITOR'].includes(u.role) || (['COOP_ADMIN', 'OFFICE'].includes(u.role) && u.coop_id === t.coop_id))) throw httpError(403, 'No tienes acceso a este boleto');
  return t;
}
function publicTicket(t) {
  return { id: t.id, number: t.number, code: t.code, short_code: t.short_code, status: t.status, order_code: t.order_code, seat_label: t.seat_label, seat_type: t.seat_type, category: t.category,
    nombres: t.nombres, apellidos: t.apellidos, cedula_masked: core.maskCedula(t.cedula), total_cents: t.total_cents, base_cents: t.base_cents, discount_cents: t.discount_cents, fee_cents: t.fee_cents,
    from: t.from, to: t.to, depart_at: t.depart_at_stop, arrive_at: t.arrive_at_stop, coop: t.coop.name, coop_color: t.coop.color, bus_number: t.trip.bus_number, plate: t.trip.plate, platform: t.trip.platform,
    trip_id: t.trip_id, trip_status: t.trip.status, kind: t.trip.kind, boarded_at: t.boarded_at, method: t.method, channel: t.channel };
}
router.get('/tickets/mine', requireAuth, (req, res) => {
  core.expireOrders();
  const rows = db.prepare(`SELECT t.id FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.buyer_id=? AND t.status IN ('VALIDO','ABORDADO','BAJO','ANULADO','NO_SHOW') ORDER BY t.created_at DESC, t.id DESC LIMIT 200`).all(req.user.id);
  res.json(rows.map(r => publicTicket(core.ticketFull(r.id))));
});
router.get('/tickets/:id', requireAuth, (req, res) => res.json(publicTicket(ticketAccess(req, req.params.id))));
router.get('/tickets/:id/qr.png', requireAuth, async (req, res) => { const t = ticketAccess(req, req.params.id); res.type('png').send(await docs.qrPng(docs.qrUrl(base(req), t.code), 480)); });
router.get('/tickets/:id/pdf', requireAuth, async (req, res) => {
  const t = ticketAccess(req, req.params.id);
  if (!['VALIDO', 'ABORDADO', 'BAJO', 'ANULADO', 'NO_SHOW'].includes(t.status)) throw httpError(409, 'El boleto aún no ha sido emitido');
  res.type('pdf').set('Content-Disposition', `inline; filename="boleto-${t.number || t.id}.pdf"`);
  await docs.ticketPdf([t], base(req), res);
});
router.get('/orders/:id/pdf', requireAuth, async (req, res) => {
  const o = loadOrder(req, req.params.id);
  const ids = db.prepare("SELECT id FROM tickets WHERE order_id=? AND status IN ('VALIDO','ABORDADO','BAJO')").all(o.id);
  if (!ids.length) throw httpError(409, 'La orden no tiene boletos emitidos');
  res.type('pdf').set('Content-Disposition', `inline; filename="boletos-${o.code}.pdf"`);
  await docs.ticketPdf(ids.map(r => core.ticketFull(r.id)), base(req), res);
});
async function printTickets(req, res, ids) {
  const tickets = ids.map(core.ticketFull);
  const width = +req.query.w === 58 ? 58 : 80, reprint = req.query.reprint === '1';
  let copy = 1;
  for (const t of tickets) {
    copy = db.prepare("SELECT COUNT(*)+1 n FROM print_jobs WHERE ticket_id=? AND doc_type='BOLETO'").get(t.id).n;
    db.prepare('INSERT INTO print_jobs(ticket_id,order_id,doc_type,user_id,copy_n,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(t.id, t.order_id, 'BOLETO', req.user.id, copy, req.query.reason || (reprint ? 'Reimpresión' : null), nowLocal());
  }
  res.type('html').send(await docs.thermalHtml(tickets, base(req), { width, auto: req.query.auto === '1', copy, reprint: reprint || copy > 1 }));
}
const office = [requireAuth, requireRole('OFFICE', 'COOP_ADMIN')];
router.get('/tickets/:id/print', ...office, async (req, res) => { const t = ticketAccess(req, req.params.id); await printTickets(req, res, [t.id]); });
router.get('/orders/:id/print', ...office, async (req, res) => {
  const o = loadOrder(req, req.params.id);
  await printTickets(req, res, db.prepare("SELECT id FROM tickets WHERE order_id=? AND status IN ('VALIDO','ABORDADO')").all(o.id).map(r => r.id));
});

/* ---------------- Notificaciones y calificaciones ---------------- */
router.get('/notifications', requireAuth, (req, res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)));
router.post('/notifications/read', requireAuth, (req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });
router.post('/trips/:id/rating', requireAuth, (req, res) => {
  const { stars, comment } = req.body || {};
  const ok = db.prepare("SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.buyer_id=? AND t.trip_id=? AND t.status IN ('ABORDADO','BAJO')").get(req.user.id, +req.params.id);
  if (!ok) throw httpError(403, 'Solo puedes calificar viajes en los que abordaste');
  if (!(stars >= 1 && stars <= 5)) throw httpError(400, 'Calificación inválida');
  db.prepare('INSERT OR REPLACE INTO ratings(trip_id,user_id,stars,comment,created_at) VALUES(?,?,?,?,?)').run(+req.params.id, req.user.id, stars, comment || null, nowLocal());
  res.json({ ok: true });
});

/* ---------------- Oficinista ---------------- */
function openSession(user) { return db.prepare('SELECT * FROM cash_sessions WHERE user_id=? AND closed_at IS NULL').get(user.id); }

router.get('/office/trips', ...office, (req, res) => {
  const c = coopId(req), date = req.query.date || nowLocal().slice(0, 10);
  core.expireOrders();
  const rows = db.prepare(`SELECT t.id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date=? AND t.status<>'CANCELADO' ORDER BY t.depart_at`).all(c, date);
  res.json(rows.map(r => { const t = core.getTrip(r.id); const sold = db.prepare(`SELECT COUNT(*) n FROM tickets WHERE trip_id=? AND status IN ${core.ACTIVE}`).get(t.id).n;
    return { id: t.id, depart_at: t.depart_at, status: t.status, bus_number: t.bus_number, plate: t.plate, capacity: t.capacity, sold, stops: t.stops, kind: t.kind, platform: t.platform, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city }; }));
});
router.get('/office/trips/:id/seats', ...office, (req, res) => {
  const c = coopId(req), t = core.getTrip(+req.params.id); if (!t || t.coop_id !== c) throw httpError(404, 'Viaje no encontrado');
  const m = core.seatMap(t.id, +req.query.from, +req.query.to); res.json({ seats: m.seats, floors: t.floors });
});

router.post('/office/sale', ...office, (req, res) => {
  const b = req.body || {}, c = coopId(req);
  const method = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA'].includes(b.method) ? b.method : 'EFECTIVO';
  const trip = core.getTrip(+b.tripId); if (!trip || trip.coop_id !== c) throw httpError(404, 'Viaje no encontrado en tu cooperativa');
  const sess = openSession(req.user);
  if (method === 'EFECTIVO' && !sess) throw httpError(409, 'Abre tu caja antes de cobrar en efectivo', 'CASH_CLOSED');
  if (['TRANSFERENCIA', 'DEPOSITO', 'TARJETA'].includes(method) && !String(b.reference || '').trim()) throw httpError(400, 'Ingresa el número de referencia / autorización');
  const out = tx(() => {
    const id = core.createOrder({ tripId: trip.id, from: b.from, to: b.to, passengers: b.passengers, buyerId: b.buyerId || null, channel: 'OFICINA', officeId: req.user.office_id, sellerId: req.user.id, expiresMinutes: 5 });
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (method === 'EFECTIVO' && b.received_cents != null && +b.received_cents < o.total_cents) throw httpError(400, 'El monto recibido es menor al total');
    db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,bank,reference,received_cents,reviewed_by,reviewed_at,created_at) VALUES(?,?,?,'APROBADO',?,?,?,?,?,?)")
      .run(id, method, o.total_cents, b.bank || null, b.reference || null, b.received_cents != null ? +b.received_cents : null, req.user.id, nowLocal(), nowLocal());
    db.prepare('UPDATE orders SET cash_session_id=? WHERE id=?').run(sess ? sess.id : null, id);
    core.issueTickets(id, req.user.id, method);
    return id;
  })();
  audit(req, 'OFFICE_SALE', 'order', out);
  const d = orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(out));
  d.change_cents = b.received_cents != null ? Math.max(0, +b.received_cents - d.total_cents) : 0;
  res.status(201).json(d);
});

module.exports = router; module.exports.orderDetail = orderDetail; module.exports.publicTicket = publicTicket;
