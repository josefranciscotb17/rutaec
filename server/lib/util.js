const crypto = require('crypto');
const TZ = process.env.TZ_APP || 'America/Guayaquil';

/** Fecha/hora local (Ecuador) como 'YYYY-MM-DD HH:MM:SS' */
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function nowLocal(d = new Date()) { return FMT.format(d); }
const today = () => nowLocal().slice(0, 10);
function parseLocal(s) { return new Date(s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + 'Z'); }
function addMinutes(s, m) { return new Date(parseLocal(s).getTime() + m * 60000).toISOString().slice(0, 19).replace('T', ' '); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function diffMinutes(a, b) { return Math.round((parseLocal(a) - parseLocal(b)) / 60000); }
function dow(dateStr) { const d = new Date(dateStr + 'T00:00:00Z').getUTCDay(); return d === 0 ? 6 : d - 1; } // 0=lunes

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
function randCode(n) { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += ALPHA[b[i] % 32]; return s; }

/** Validación de cédula ecuatoriana (módulo 10) */
function validCedula(c) {
  if (!/^\d{10}$/.test(c || '')) return false;
  const prov = parseInt(c.slice(0, 2), 10);
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  const d = c.split('').map(Number);
  if (d[2] >= 6) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let v = d[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; sum += v; }
  return (10 - (sum % 10)) % 10 === d[9];
}
/** Genera una cédula válida a partir de 9 dígitos base (semillas y pruebas) */
function makeCedula(base9) {
  const d = base9.split('').map(Number); let sum = 0;
  for (let i = 0; i < 9; i++) { let v = d[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; sum += v; }
  return base9 + ((10 - (sum % 10)) % 10);
}
function validRuc(r) { return /^\d{13}$/.test(r || '') && r.endsWith('001'); }
function validPlate(p) { return /^[A-Z]{2,3}-\d{3,4}$/.test((p || '').toUpperCase()); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); }
const money = (c) => '$' + (c / 100).toFixed(2);
const hhmm = (s) => s.slice(11, 16);
function httpError(status, message, code) { const e = new Error(message); e.status = status; e.code = code; return e; }

module.exports = { nowLocal, today, parseLocal, addMinutes, addDays, diffMinutes, dow, randCode, validCedula, makeCedula, validRuc, validPlate, validEmail, money, hhmm, httpError, TZ };
