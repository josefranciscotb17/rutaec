const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { DATA } = require('../db');

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

module.exports = { sign, hmac, publicUser, STAFF, SECRET };
