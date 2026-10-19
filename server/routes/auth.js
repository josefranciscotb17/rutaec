const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { sign, requireAuth, publicUser } = require('../lib/auth');
const { validCedula, validEmail, httpError, nowLocal, addMinutes } = require('../lib/util');
const { email, audit } = require('../lib/notify');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', message: { error: 'Demasiados intentos, espera unos minutos.' } });
const strongPass = (p) => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

router.post('/register', limiter, (req, res) => {
  const { email: em, password, cedula, nombres, apellidos, phone, accept } = req.body || {};
  if (!validEmail(em)) throw httpError(400, 'Correo inválido');
  if (!strongPass(password)) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres, letras y números');
  if (!validCedula(cedula)) throw httpError(400, 'Cédula inválida');
  if (!nombres || !apellidos) throw httpError(400, 'Ingresa tus nombres y apellidos');
  if (!accept) throw httpError(400, 'Debes aceptar los términos y la política de privacidad');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(em)) throw httpError(409, 'Ese correo ya está registrado');
  const r = db.prepare("INSERT INTO users(email,cedula,nombres,apellidos,phone,password_hash,role) VALUES(?,?,?,?,?,?, 'CLIENT')").run(em.trim(), cedula, nombres.trim(), apellidos.trim(), phone || null, bcrypt.hashSync(password, 10));
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  email(em, 'Bienvenido a RutaEC', `Hola ${nombres}, tu cuenta fue creada. Ya puedes comprar tus pasajes.`);
  res.status(201).json({ token: sign(u), user: publicUser(u) });
});

router.post('/login', limiter, (req, res) => {
  const { email: em, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=? OR cedula=?').get(String(em || '').trim(), String(em || '').trim());
  if (!u) throw httpError(401, 'Credenciales incorrectas');
  if (!u.active) throw httpError(403, 'Tu cuenta está suspendida');
  const now = nowLocal();
  if (u.locked_until && u.locked_until > now) throw httpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.');
  if (!bcrypt.compareSync(String(password || ''), u.password_hash)) {
    const n = u.failed_attempts + 1;
    db.prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?').run(n >= 5 ? 0 : n, n >= 5 ? addMinutes(now, 15) : null, u.id);
    audit({ user: u, ip: req.ip }, 'LOGIN_FAIL', 'user', u.id);
    throw httpError(401, 'Credenciales incorrectas');
  }
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=? WHERE id=?').run(now, u.id);
  audit({ user: u, ip: req.ip }, 'LOGIN', 'user', u.id);
  res.json({ token: sign(u), user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => {
  const u = publicUser(req.user);
  if (u.coop_id) u.coop = db.prepare('SELECT id,name,short_name,color FROM cooperatives WHERE id=?').get(u.coop_id);
  if (u.office_id) u.office = db.prepare('SELECT * FROM offices WHERE id=?').get(u.office_id);
  u.unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(u.id).c;
  res.json(u);
});
router.put('/me', requireAuth, (req, res) => {
  const { nombres, apellidos, phone } = req.body || {};
  db.prepare('UPDATE users SET nombres=COALESCE(?,nombres), apellidos=COALESCE(?,apellidos), phone=COALESCE(?,phone) WHERE id=?').run(nombres || null, apellidos || null, phone || null, req.user.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)));
});
router.post('/change-password', requireAuth, (req, res) => {
  const { current, password } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) throw httpError(400, 'La contraseña actual no coincide');
  if (!strongPass(password)) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres, letras y números');
  db.prepare('UPDATE users SET password_hash=?, must_change=0 WHERE id=?').run(bcrypt.hashSync(password, 10), req.user.id);
  audit(req, 'PASSWORD_CHANGE', 'user', req.user.id);
  res.json({ ok: true });
});
router.post('/forgot', limiter, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body && req.body.email || '').trim());
  if (u) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE users SET reset_token=?, reset_expires=? WHERE id=?').run(crypto.createHash('sha256').update(token).digest('hex'), addMinutes(nowLocal(), 30), u.id);
    const base = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
email(u.email, 'Recuperación de contraseña', `Usa este enlace (válido 30 min): ${base}/#/reset?token=${token}`);
  }
  res.json({ ok: true, message: 'Si el correo existe, enviamos instrucciones (revisa la bandeja de correos del administrador en modo local).' });
});
router.post('/reset', limiter, (req, res) => {
  const { token, password } = req.body || {};
  if (!strongPass(password)) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres, letras y números');
  const h = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const u = db.prepare('SELECT * FROM users WHERE reset_token=? AND reset_expires > ?').get(h, nowLocal());
  if (!u) throw httpError(400, 'Enlace inválido o vencido');
  db.prepare('UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL, failed_attempts=0, locked_until=NULL WHERE id=?').run(bcrypt.hashSync(password, 10), u.id);
  res.json({ ok: true });
});
module.exports = router;
