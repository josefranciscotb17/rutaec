/** Administración global (SUPERADMIN) y auditoría (AUDITOR). */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const S = require('../lib/settings');
const { requireRole } = require('../lib/auth');
const { audit } = require('../lib/notify');
const { imageUpload, saveImage } = require('../lib/upload');
const { httpError, validEmail, validRuc, validCedula, randCode } = require('../lib/util');

const sa = requireRole(), both = requireRole('AUDITOR'); // requireRole() sin roles = solo SUPERADMIN
const need = (v, m) => { if (v === undefined || v === null || String(v).trim() === '') throw httpError(400, m); };

/* ---- Ajustes del sitio (marca, redes, políticas, reglas de negocio) ---- */
router.get('/admin/settings', both, (req, res) => res.json(S.all()));
router.put('/admin/settings', sa, (req, res) => {
  const before = S.all(), b = req.body || {}, allowed = Object.keys(S.DEFAULTS);
  const num = ['reserve_minutes', 'cash_hold_minutes', 'review_grace_minutes', 'max_seats', 'online_cutoff_minutes', 'review_max_minutes', 'terminal_fee_cents', 'discount_minor_pct', 'discount_senior_pct', 'discount_disability_pct', 'senior_age', 'driver_price_min_pct', 'driver_price_max_pct'];
  for (const k of Object.keys(b)) {
    if (!allowed.includes(k)) continue;
    let v = b[k];
    if (num.includes(k)) { v = Math.round(+v); if (!(v >= 0)) throw httpError(400, `Valor inválido para ${k}`); }
    if (/_color$/.test(k) && !/^#[0-9a-fA-F]{6}$/.test(v)) throw httpError(400, 'Los colores deben ser #RRGGBB');
    S.set(k, v);
  }
  if (S.get('driver_price_min_pct') > S.get('driver_price_max_pct')) throw httpError(400, 'El precio mínimo del chofer no puede superar el máximo');
  audit(req, 'update', 'settings', null, null, Object.keys(b));
  res.json(S.all());
});
router.post('/admin/logo', sa, imageUpload, (req, res) => { const u = saveImage(req.file); S.set('logo', u); audit(req, 'update', 'settings', 'logo'); res.json({ logo: u }); });

/* ---- Cooperativas ---- */
router.get('/admin/cooperatives', both, (req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM buses WHERE coop_id=c.id) buses, (SELECT COUNT(*) FROM users WHERE coop_id=c.id) users FROM cooperatives c ORDER BY c.name`).all()));
router.post('/admin/cooperatives', sa, (req, res) => {
  const b = req.body || {}; need(b.name, 'Indica el nombre');
  if (b.ruc && !validRuc(b.ruc)) throw httpError(400, 'RUC inválido (13 dígitos terminados en 001)');
  const admin = b.admin || {};
  if (admin.email && !validEmail(admin.email)) throw httpError(400, 'Correo del administrador inválido');
  let pass = null, id;
  db.transaction(() => {
    id = db.prepare('INSERT INTO cooperatives(ruc,name,short_name,color,phone,email,address) VALUES(?,?,?,?,?,?,?)').run(b.ruc || null, b.name.trim(), b.short_name || b.name.trim(), b.color || '#134074', b.phone || null, b.email || null, b.address || null).lastInsertRowid;
    for (const n of [['Normal', 100], ['VIP', 130], ['Piso superior', 100]]) db.prepare('INSERT INTO seat_types(coop_id,name,factor_pct) VALUES(?,?,?)').run(id, n[0], n[1]);
    if (admin.email) {
      pass = randCode(8);
      db.prepare("INSERT INTO users(email,nombres,apellidos,password_hash,role,coop_id,must_change) VALUES(?,?,?,?,'COOP_ADMIN',?,1)").run(admin.email.toLowerCase(), admin.nombres || 'Administrador', admin.apellidos || b.name, bcrypt.hashSync(pass, 10), id);
    }
  })();
  audit(req, 'create', 'cooperatives', id, null, { name: b.name });
  res.status(201).json({ id, admin_temp_password: pass });
});
router.put('/admin/cooperatives/:id', sa, (req, res) => {
  const c = db.prepare('SELECT * FROM cooperatives WHERE id=?').get(+req.params.id); if (!c) throw httpError(404, 'No encontrada');
  const b = { ...c, ...req.body };
  if (b.ruc && !validRuc(b.ruc)) throw httpError(400, 'RUC inválido');
  db.prepare('UPDATE cooperatives SET ruc=?,name=?,short_name=?,color=?,phone=?,email=?,address=?,active=? WHERE id=?').run(b.ruc, b.name, b.short_name, b.color, b.phone, b.email, b.address, b.active ? 1 : 0, c.id);
  audit(req, 'update', 'cooperatives', c.id, c, req.body); res.json({ ok: true });
});

/* ---- Geografía: provincias, ciudades, terminales ---- */
router.get('/admin/geo', both, (req, res) => res.json({
  provinces: db.prepare('SELECT * FROM provinces ORDER BY name').all(),
  cities: db.prepare('SELECT c.*, p.name AS province FROM cities c JOIN provinces p ON p.id=c.province_id ORDER BY c.name').all(),
  terminals: db.prepare('SELECT t.*, c.name AS city FROM terminals t JOIN cities c ON c.id=t.city_id ORDER BY c.name, t.name').all(),
}));
const fk = (fn) => (req, res, next) => { try { fn(req, res); } catch (e) { next(String(e.code).startsWith('SQLITE_CONSTRAINT_FOREIGNKEY') ? httpError(409, 'No se puede eliminar: está en uso') : e); } };
router.post('/admin/cities', sa, (req, res) => { const b = req.body; need(b.name, 'Nombre requerido'); need(b.province_id, 'Provincia requerida'); res.status(201).json({ id: db.prepare('INSERT INTO cities(province_id,name) VALUES(?,?)').run(+b.province_id, b.name.trim()).lastInsertRowid }); });
router.delete('/admin/cities/:id', sa, fk((req, res) => { db.prepare('DELETE FROM cities WHERE id=?').run(+req.params.id); res.json({ ok: true }); }));
router.post('/admin/terminals', sa, (req, res) => { const b = req.body; need(b.name, 'Nombre requerido'); need(b.city_id, 'Ciudad requerida'); res.status(201).json({ id: db.prepare('INSERT INTO terminals(city_id,name,address,lat,lng) VALUES(?,?,?,?,?)').run(+b.city_id, b.name.trim(), b.address || null, b.lat ?? null, b.lng ?? null).lastInsertRowid }); });
router.put('/admin/terminals/:id', sa, (req, res) => { const t = db.prepare('SELECT * FROM terminals WHERE id=?').get(+req.params.id); if (!t) throw httpError(404, 'No encontrada'); const b = { ...t, ...req.body }; db.prepare('UPDATE terminals SET city_id=?,name=?,address=?,lat=?,lng=? WHERE id=?').run(b.city_id, b.name, b.address, b.lat, b.lng, t.id); res.json({ ok: true }); });
router.delete('/admin/terminals/:id', sa, fk((req, res) => { db.prepare('DELETE FROM terminals WHERE id=?').run(+req.params.id); res.json({ ok: true }); }));

/* ---- Usuarios globales ---- */
router.get('/admin/users', both, (req, res) => {
  const { q, role, coop_id } = req.query, c = [], p = [];
  if (q) { c.push("(u.email LIKE ? OR u.nombres||' '||u.apellidos LIKE ? OR u.cedula LIKE ?)"); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (role) { c.push('u.role=?'); p.push(role); }
  if (coop_id) { c.push('u.coop_id=?'); p.push(+coop_id); }
  res.json(db.prepare(`SELECT u.id,u.email,u.cedula,u.nombres,u.apellidos,u.role,u.coop_id,u.active,u.last_login,u.locked_until,c.short_name AS coop FROM users u LEFT JOIN cooperatives c ON c.id=u.coop_id ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY u.id DESC LIMIT 300`).all(...p));
});
router.post('/admin/users', sa, (req, res) => {
  const b = req.body || {}; need(b.nombres, 'Nombres requeridos'); need(b.apellidos, 'Apellidos requeridos');
  if (!validEmail(b.email)) throw httpError(400, 'Correo inválido');
  if (!['SUPERADMIN', 'AUDITOR', 'COOP_ADMIN'].includes(b.role)) throw httpError(400, 'Desde aquí solo se crean SUPERADMIN, AUDITOR o COOP_ADMIN');
  if (b.role === 'COOP_ADMIN') need(b.coop_id, 'Selecciona la cooperativa');
  if (b.cedula && !validCedula(b.cedula)) throw httpError(400, 'Cédula inválida');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(b.email)) throw httpError(409, 'Ya existe un usuario con ese correo');
  const pass = randCode(8);
  const id = db.prepare('INSERT INTO users(email,cedula,nombres,apellidos,password_hash,role,coop_id,must_change) VALUES(?,?,?,?,?,?,?,1)').run(b.email.toLowerCase(), b.cedula || null, b.nombres, b.apellidos, bcrypt.hashSync(pass, 10), b.role, b.role === 'COOP_ADMIN' ? +b.coop_id : null).lastInsertRowid;
  audit(req, 'create', 'users', id, null, { email: b.email, role: b.role }); res.status(201).json({ id, temp_password: pass });
});
router.put('/admin/users/:id', sa, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(+req.params.id); if (!u) throw httpError(404, 'No encontrado');
  if (u.id === req.user.id && req.body.active === 0) throw httpError(400, 'No puedes desactivarte');
  const b = { ...u, ...req.body };
  db.prepare('UPDATE users SET active=?, failed_attempts=0, locked_until=NULL WHERE id=?').run(b.active ? 1 : 0, u.id);
  audit(req, 'update', 'users', u.id, { active: u.active }, { active: b.active }); res.json({ ok: true });
});
router.post('/admin/users/:id/reset-password', sa, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(+req.params.id); if (!u) throw httpError(404, 'No encontrado');
  const pass = randCode(8); db.prepare('UPDATE users SET password_hash=?, must_change=1, failed_attempts=0, locked_until=NULL WHERE id=?').run(bcrypt.hashSync(pass, 10), u.id);
  audit(req, 'reset_password', 'users', u.id); res.json({ temp_password: pass });
});

/* ---- Temporadas globales ---- */

module.exports = router;
