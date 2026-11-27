/**
 * Migraciones de esquema (desde v0.6.0).
 * schema.sql queda congelado como esquema base v0.5.1; cada cambio posterior es un archivo
 * server/migrations/NNN_descripcion.sql que se aplica UNA sola vez y queda anotado en schema_version.
 * Antes de aplicar migraciones pendientes se respalda la base (data/backups/) y cada migración
 * corre en su propia transacción: si falla, se revierte y el servidor no arranca con un esquema a medias.
 */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'migrations');

function pending(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const done = new Set(db.prepare('SELECT version FROM schema_version').all().map((r) => r.version));
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort().filter((f) => !done.has(f));
}

/** Copia consistente de la base con VACUUM INTO (funciona con el servidor encendido). */
function backup(db, dataDir, tag = 'manual') {
  const dir = path.join(dataDir, 'backups'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const out = path.join(dir, `rutaec-${stamp}-${tag}.db`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  return out;
}

function run(db, { dataDir, log = console.log } = {}) {
  const list = pending(db);
  if (!list.length) return [];
  const hasData = db.prepare('SELECT COUNT(*) n FROM users').get().n > 0;
  if (hasData && dataDir && process.env.NODE_ENV !== 'test') log('Respaldo previo a migrar: ' + backup(db, dataDir, 'pre-' + list[0].slice(0, 3)));
  db.exec('PRAGMA foreign_keys = OFF'); // necesario para reconstruir tablas; no tiene efecto dentro de una transacción
  try {
    for (const f of list) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`deja ${broken.length} llaves foráneas rotas (primera: tabla ${broken[0].table}, fila ${broken[0].rowid})`);
        db.prepare('INSERT INTO schema_version(version) VALUES(?)').run(f);
        db.exec('COMMIT');
        log('Migración aplicada: ' + f);
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* ya revertida */ }
        e.message = `La migración ${f} falló y se revirtió: ${e.message}`;
        throw e;
      }
    }
  } finally { db.exec('PRAGMA foreign_keys = ON'); }
  return list;
}

module.exports = { run, pending, backup, DIR };
