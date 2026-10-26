const router = require('express').Router();
const multer = require('multer');
const fs = require('fs'), path = require('path');
const { db, tx, UPLOADS } = require('../db');
const S = require('../lib/settings');
const core = require('../lib/core');
const { requireAuth } = require('../lib/auth');
const { notify, audit } = require('../lib/notify');
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

module.exports = router; module.exports.orderDetail = orderDetail;
