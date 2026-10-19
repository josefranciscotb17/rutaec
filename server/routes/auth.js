const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { sign, publicUser } = require('../lib/auth');
const { validCedula, validEmail, httpError } = require('../lib/util');
const { email } = require('../lib/notify');

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

module.exports = router;
