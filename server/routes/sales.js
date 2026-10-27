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

router.get('/office/payments', ...office, (req, res) => {
  const c = coopId(req), st = req.query.status || 'EN_REVISION';
  const rows = db.prepare(`SELECT p.*, o.code AS order_code, o.total_cents, o.buyer_id, o.trip_id, o.created_at AS order_created, u.nombres, u.apellidos, u.email FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=o.buyer_id
    WHERE o.coop_id=? AND p.status=? AND p.method IN ('TRANSFERENCIA','DEPOSITO') ORDER BY p.created_at`).all(c, st);
  for (const r of rows) { r.trip = core.summarizeTrip(r.trip_id); r.tickets = db.prepare('SELECT s.label seat, p.nombres, p.apellidos, p.cedula FROM tickets t JOIN bus_seats s ON s.id=t.seat_id JOIN passengers p ON p.id=t.passenger_id WHERE t.order_id=?').all(r.order_id); r.waiting_min = diffMinutes(nowLocal(), r.created_at); }
  res.json(rows);
});
router.post('/office/payments/:id/approve', ...office, (req, res) => {
  const c = coopId(req), p = db.prepare('SELECT p.*, o.coop_id, o.buyer_id, o.code, o.total_cents FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=?').get(+req.params.id);
  if (!p || p.coop_id !== c) throw httpError(404, 'Pago no encontrado');
  if (p.status !== 'EN_REVISION') throw httpError(409, 'El pago no está en revisión');
  if (p.amount_cents < p.total_cents) throw httpError(400, `El monto pagado (${money(p.amount_cents)}) es menor al total (${money(p.total_cents)}). Rechaza indicando la diferencia.`);
  tx(() => {
    db.prepare("UPDATE payments SET status='APROBADO', reviewed_by=?, reviewed_at=? WHERE id=?").run(req.user.id, nowLocal(), p.id);
    db.prepare('UPDATE orders SET seller_id=COALESCE(seller_id,?), office_id=COALESCE(office_id,?) WHERE id=?').run(req.user.id, req.user.office_id, p.order_id);
    core.issueTickets(p.order_id, req.user.id, p.method);
  })();
  if (p.buyer_id) notify(p.buyer_id, 'Pago aprobado: tu boleto está listo', `La orden ${p.code} fue aprobada. Descarga o muestra tu boleto con QR desde "Mis boletos".`, '#/tickets');
  audit(req, 'PAYMENT_APPROVE', 'payment', p.id);
  res.json({ ok: true });
});
router.post('/office/payments/:id/reject', ...office, (req, res) => {
  const c = coopId(req), reason = String(req.body && req.body.reason || '').trim();
  if (!reason) throw httpError(400, 'Indica el motivo del rechazo');
  const p = db.prepare('SELECT p.*, o.coop_id, o.buyer_id, o.code FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=?').get(+req.params.id);
  if (!p || p.coop_id !== c) throw httpError(404, 'Pago no encontrado');
  if (p.status !== 'EN_REVISION') throw httpError(409, 'El pago no está en revisión');
  const grace = S.get('review_grace_minutes');
  tx(() => {
    db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason=?, reviewed_by=?, reviewed_at=? WHERE id=?").run(reason, req.user.id, nowLocal(), p.id);
    db.prepare("UPDATE orders SET status='RESERVADO', expires_at=? WHERE id=?").run(addMinutes(nowLocal(), grace), p.order_id);
  })();
  if (p.buyer_id) notify(p.buyer_id, 'Pago rechazado', `Orden ${p.code}: ${reason}. Tienes ${grace} minutos para corregir y volver a enviar el comprobante.`, '#/orders');
  audit(req, 'PAYMENT_REJECT', 'payment', p.id, null, { reason });
  res.json({ ok: true });
});

router.get('/office/orders', ...office, (req, res) => {
  const c = coopId(req), q = `%${String(req.query.q || '').trim()}%`;
  core.expireOrders();
  res.json(core.ordersWithTickets(`o.coop_id=? AND (o.code LIKE ? OR EXISTS (SELECT 1 FROM tickets t JOIN passengers p ON p.id=t.passenger_id WHERE t.order_id=o.id AND (p.cedula LIKE ? OR p.nombres||' '||p.apellidos LIKE ? OR p.email LIKE ? OR t.short_code LIKE ? OR t.number LIKE ?)) OR EXISTS (SELECT 1 FROM users u WHERE u.id=o.buyer_id AND u.email LIKE ?))` + (req.query.status ? ' AND o.status=?' : ''),
    [c, q, q, q, q, q, q, q, ...(req.query.status ? [req.query.status] : [])]));
});
router.post('/office/orders/:id/collect', ...office, (req, res) => {
  const c = coopId(req);
  core.expireOrders();
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+req.params.id);
  if (!o || o.coop_id !== c) throw httpError(404, 'Orden no encontrada');
  if (o.status !== 'RESERVADO') throw httpError(409, 'La orden no está pendiente de pago (estado: ' + o.status + ')');
  const sess = openSession(req.user); if (!sess) throw httpError(409, 'Abre tu caja antes de cobrar', 'CASH_CLOSED');
  const rec = req.body && req.body.received_cents != null ? +req.body.received_cents : o.total_cents;
  if (rec < o.total_cents) throw httpError(400, 'El monto recibido es menor al total');
  tx(() => {
    db.prepare("UPDATE payments SET status='RECHAZADO', reject_reason='Cobrado en oficina' WHERE order_id=? AND status IN ('PENDIENTE')").run(o.id);
    db.prepare("INSERT INTO payments(order_id,method,amount_cents,status,received_cents,reviewed_by,reviewed_at,created_at) VALUES(?,'EFECTIVO',?,'APROBADO',?,?,?,?)").run(o.id, o.total_cents, rec, req.user.id, nowLocal(), nowLocal());
    db.prepare('UPDATE orders SET cash_session_id=?, seller_id=?, office_id=? WHERE id=?').run(sess.id, req.user.id, req.user.office_id, o.id);
    core.issueTickets(o.id, req.user.id, 'EFECTIVO');
  })();
  if (o.buyer_id) notify(o.buyer_id, 'Pago recibido', `Recibimos el pago de la orden ${o.code}. Tu boleto está disponible.`, '#/tickets');
  audit(req, 'OFFICE_COLLECT', 'order', o.id);
  res.json({ ...orderDetail(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)), change_cents: rec - o.total_cents });
});

router.post('/office/tickets/:id/void', ...office, (req, res) => {
  const reason = String(req.body && req.body.reason || '').trim();
  if (!reason) throw httpError(400, 'Indica el motivo de la anulación');
  if (req.user.role === 'OFFICE' && !req.user.perm_void) throw httpError(403, 'No tienes permiso para anular boletos');
  const t = ticketAccess(req, req.params.id);
  if (!['VALIDO', 'RESERVADO'].includes(t.status)) throw httpError(409, 'Solo se pueden anular boletos vigentes y no abordados');
  tx(() => {
    db.prepare("UPDATE tickets SET status='ANULADO', void_reason=?, voided_by=? WHERE id=?").run(reason, req.user.id, t.id);
    const left = db.prepare("SELECT COUNT(*) n FROM tickets WHERE order_id=? AND status IN ('VALIDO','RESERVADO','ABORDADO')").get(t.order_id).n;
    if (!left) db.prepare("UPDATE orders SET status='CANCELADO' WHERE id=?").run(t.order_id);
  })();
  if (t.buyer_id) notify(t.buyer_id, 'Boleto anulado', `El boleto ${t.number} fue anulado: ${reason}`, '#/tickets');
  audit(req, 'TICKET_VOID', 'ticket', t.id, { status: t.status }, { reason });
  res.json({ ok: true });
});
/** Autocompleta pasajero por cédula (solo personal de la cooperativa) */
router.get('/office/passenger', ...office, (req, res) => {
  const p = db.prepare('SELECT cedula,nombres,apellidos,email,phone,category FROM passengers WHERE cedula=?').get(String(req.query.cedula || '').trim());
  res.json(p || null);
});
router.get('/office/lookup', ...office, (req, res) => {
  const c = coopId(req), q = String(req.query.q || '').trim().replace(/^.*\/v\//, '');
  if (!q) return res.json([]);
  const ids = db.prepare(`SELECT t.id FROM tickets t JOIN orders o ON o.id=t.order_id JOIN passengers p ON p.id=t.passenger_id WHERE o.coop_id=? AND t.status<>'EXPIRADO' AND (t.short_code=? OR t.number=? OR t.public_id=? OR substr(?,1,26)=t.public_id OR p.cedula=? OR o.code=?) ORDER BY t.id DESC LIMIT 30`).all(c, q.toUpperCase(), q, q.toUpperCase(), q.toUpperCase(), q, q.toUpperCase());
  res.json(ids.map(r => publicTicket(core.ticketFull(r.id))));
});

/* Caja */
function cashTotals(sid, opening) {
  const rows = db.prepare(`SELECT p.method, SUM(p.amount_cents) amt, COUNT(*) n FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.cash_session_id=? AND p.status='APROBADO' GROUP BY p.method`).all(sid);
  const voids = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(t.total_cents),0) amt FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.cash_session_id=? AND t.status='ANULADO'`).get(sid);
  const cash = (rows.find(r => r.method === 'EFECTIVO') || { amt: 0 }).amt;
  return { by_method: rows, voids, cash_cents: cash, expected_cents: opening + cash };
}
router.get('/office/cash/current', ...office, (req, res) => {
  const s = openSession(req.user); if (!s) return res.json(null);
  s.totals = cashTotals(s.id, s.opening_cents); res.json(s);
});
router.post('/office/cash/open', ...office, (req, res) => {
  if (openSession(req.user)) throw httpError(409, 'Ya tienes una caja abierta');
  const r = db.prepare('INSERT INTO cash_sessions(user_id,office_id,opened_at,opening_cents) VALUES(?,?,?,?)').run(req.user.id, req.user.office_id, nowLocal(), Math.round(+(req.body && req.body.opening_cents) || 0));
  audit(req, 'CASH_OPEN', 'cash_session', r.lastInsertRowid);
  res.status(201).json(db.prepare('SELECT * FROM cash_sessions WHERE id=?').get(r.lastInsertRowid));
});
router.post('/office/cash/close', ...office, (req, res) => {
  const s = openSession(req.user); if (!s) throw httpError(409, 'No tienes caja abierta');
  const t = cashTotals(s.id, s.opening_cents), counted = Math.round(+(req.body && req.body.counted_cents));
  if (!(counted >= 0)) throw httpError(400, 'Ingresa el efectivo contado');
  db.prepare('UPDATE cash_sessions SET closed_at=?, expected_cents=?, counted_cents=?, note=? WHERE id=?').run(nowLocal(), t.expected_cents, counted, req.body.note || null, s.id);
  audit(req, 'CASH_CLOSE', 'cash_session', s.id, null, { expected: t.expected_cents, counted });
  res.json({ id: s.id, expected_cents: t.expected_cents, counted_cents: counted, difference_cents: counted - t.expected_cents });
});
router.get('/office/cash/history', ...office, (req, res) => res.json(db.prepare('SELECT * FROM cash_sessions WHERE user_id=? ORDER BY id DESC LIMIT 30').all(req.user.id)));
router.get('/office/cash/:id/print', ...office, (req, res) => {
  const s = db.prepare('SELECT cs.*, u.nombres, u.apellidos FROM cash_sessions cs JOIN users u ON u.id=cs.user_id WHERE cs.id=?').get(+req.params.id);
  if (!s || (s.user_id !== req.user.id && req.user.role === 'OFFICE')) throw httpError(404, 'Sesión no encontrada');
  const t = cashTotals(s.id, s.opening_cents), exp = s.expected_cents == null ? t.expected_cents : s.expected_cents;
  const body = `<h1>Cierre de caja #${s.id}</h1><p class="m">${docs.esc(s.nombres + ' ' + s.apellidos)} · Apertura ${s.opened_at} · Cierre ${s.closed_at || '(abierta)'}</p>
  <table><tr><th>Método</th><th>Transacciones</th><th>Monto</th></tr>${t.by_method.map(r => `<tr><td>${r.method}</td><td>${r.n}</td><td>${money(r.amt)}</td></tr>`).join('')}</table>
  <table><tr><td>Fondo inicial</td><td>${money(s.opening_cents)}</td></tr><tr><td>Efectivo esperado</td><td>${money(exp)}</td></tr><tr><td>Efectivo contado</td><td>${s.counted_cents == null ? '-' : money(s.counted_cents)}</td></tr>
  <tr><th>Diferencia</th><th>${s.counted_cents == null ? '-' : money(s.counted_cents - exp)}</th></tr><tr><td>Boletos anulados</td><td>${t.voids.n} (${money(t.voids.amt)})</td></tr></table><div class="sig"><div>Oficinista</div><div>Supervisor</div></div>`;
  res.type('html').send(docs.a4Page('Cierre de caja', body));
});
router.get('/office/dashboard', ...office, (req, res) => {
  const c = coopId(req), d = nowLocal().slice(0, 10);
  const q = (sql, ...p) => db.prepare(sql).get(...p);
  res.json({
    sales_today: q("SELECT COALESCE(SUM(total_cents),0) v, COUNT(*) n FROM orders WHERE coop_id=? AND status='PAGADO' AND substr(paid_at,1,10)=?", c, d),
    pending_payments: q("SELECT COUNT(*) n FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.coop_id=? AND p.status='EN_REVISION'", c).n,
    cash_reservations: q("SELECT COUNT(*) n FROM orders WHERE coop_id=? AND status='RESERVADO' AND method='EFECTIVO'", c).n,
    trips_today: q("SELECT COUNT(*) n FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date=? AND t.status<>'CANCELADO'", c, d).n,
    session: openSession(req.user) || null,
  });
});

/* Manifiesto de pasajeros (HTML A4 imprimible) */
router.get('/manifest/:tripId', requireAuth, requireRole('OFFICE', 'COOP_ADMIN', 'DRIVER', 'ASSISTANT'), (req, res) => {
  const t = core.getTrip(+req.params.tripId);
  if (!t || (req.user.role !== 'SUPERADMIN' && t.coop_id !== req.user.coop_id)) throw httpError(404, 'Viaje no encontrado');
  const rows = db.prepare(`SELECT tk.*, p.cedula, p.nombres, p.apellidos, s.label FROM tickets tk JOIN passengers p ON p.id=tk.passenger_id JOIN bus_seats s ON s.id=tk.seat_id WHERE tk.trip_id=? AND tk.status IN ('VALIDO','ABORDADO','BAJO') ORDER BY CAST(s.label AS INTEGER), s.label`).all(t.id);
  const drv = t.driver_id ? db.prepare('SELECT nombres,apellidos FROM users WHERE id=?').get(t.driver_id) : null;
  const body = `<h1>Manifiesto de pasajeros</h1><p><b>${docs.esc(t.coop_name)}</b> · ${docs.esc(t.stops[0].city)} - ${docs.esc(t.stops[t.stops.length - 1].city)} · ${t.depart_at.slice(0, 16)} · Bus ${docs.esc(t.bus_number)} (${docs.esc(t.plate)})</p><p class="m">Chofer: ${drv ? docs.esc(drv.nombres + ' ' + drv.apellidos) : '-'} · Pasajeros: ${rows.length}</p>
  <table><tr><th>#</th><th>Asiento</th><th>Cédula</th><th>Pasajero</th><th>Tramo</th><th>Categoría</th><th>Estado</th></tr>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${docs.esc(r.label)}</td><td>${r.cedula}</td><td>${docs.esc(r.nombres + ' ' + r.apellidos)}</td><td>${docs.esc(t.stops.find(s => s.ord === r.from_ord).city)} - ${docs.esc(t.stops.find(s => s.ord === r.to_ord).city)}</td><td>${r.category}</td><td>${r.status}</td></tr>`).join('')}</table><div class="sig"><div>Chofer</div><div>Despachador</div></div>`;
  res.type('html').send(docs.a4Page('Manifiesto', body));
});
module.exports = router; module.exports.orderDetail = orderDetail; module.exports.publicTicket = publicTicket;
