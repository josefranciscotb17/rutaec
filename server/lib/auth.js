const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { db, DATA } = require('../db');
const { httpError } = require('./util');

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
}
const SECRET = loadSecret();
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '12h' });
const hmac = (s, n = 8) => crypto.createHmac('sha256', SECRET).update(s).digest('hex').toUpperCase().slice(0, n);
const STAFF = ['COOP_ADMIN', 'OFFICE', 'DRIVER', 'ASSISTANT'];
function publicUser(u) { if (!u) return null; const { password_hash, reset_token, reset_expires, failed_attempts, locked_until, ...rest } = u; return rest; }

/** Carga req.user si hay token (cabecera Bearer o ?token= en GET para vistas imprimibles) */
function loadUser(req, res, next) {
  const h = req.headers.authorization;
  const t = h && h.startsWith('Bearer ') ? h.slice(7) : (req.method === 'GET' && req.query.token) || null;
  if (t) {
    try { const p = jwt.verify(t, SECRET); const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(p.id); if (u) req.user = u; } catch { /* anónimo */ }
  }
  next();
}
const requireAuth = (req, res, next) => req.user ? next() : next(httpError(401, 'Debes iniciar sesión', 'AUTH'));
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(httpError(401, 'Debes iniciar sesión', 'AUTH'));
  if (req.user.role === 'SUPERADMIN' || roles.includes(req.user.role)) return next();
  next(httpError(403, 'No tienes permiso para esta acción', 'FORBIDDEN'));
};
/** Cooperativa en contexto: el personal usa la suya; superadmin/auditor la indican con ?coop_id= o cabecera X-Coop-Id */
function coopId(req) {
  if (req.user.role === 'SUPERADMIN' || req.user.role === 'AUDITOR') {
    const c = +(req.query.coop_id || req.headers['x-coop-id'] || (req.body && req.body.coop_id) || 0);
    if (!c) throw httpError(400, 'Selecciona una cooperativa', 'COOP_REQUIRED');
    return c;
  }
  if (!req.user.coop_id) throw httpError(403, 'Tu usuario no pertenece a una cooperativa');
  return req.user.coop_id;
}
module.exports = { sign, hmac, loadUser, requireAuth, requireRole, coopId, publicUser, STAFF, SECRET };
