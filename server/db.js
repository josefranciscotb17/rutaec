const { DatabaseSync } = require('node:sqlite'); // SQLite integrado en Node (sin compilar módulos nativos)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const UPLOADS = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
fs.mkdirSync(path.join(UPLOADS, 'private'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS, 'public'), { recursive: true });
const file = process.env.DB_FILE || path.join(DATA, 'rutaec.db');
const db = new DatabaseSync(file);
db.pragma = (s) => { db.exec('PRAGMA ' + s); };
db.transaction = (fn) => (...args) => {
  if (db.isTransaction) return fn(...args); // anidada: participa de la transacción activa
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(...args); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
};
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
// Caché de sentencias preparadas: evita recompilar el mismo SQL en cada petición
const rawPrepare = db.prepare.bind(db), stmts = new Map();
db.prepare = (sql) => { let st = stmts.get(sql); if (!st) { st = rawPrepare(sql); stmts.set(sql, st); } return st; };
const tx = (fn) => db.transaction(fn);
module.exports = { db, tx, ROOT, DATA, UPLOADS, file };
