// Restaura un respaldo: DETÉN el servidor y ejecuta  npm run db:restore -- data/backups/<archivo>.db
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Uso: npm run db:restore -- data/backups/<archivo>.db'); process.exit(1); }
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const file = process.env.DB_FILE || path.join(DATA, 'rutaec.db');
if (fs.existsSync(file)) fs.copyFileSync(file, file + '.antes-de-restaurar');
for (const ext of ['-wal', '-shm']) if (fs.existsSync(file + ext)) fs.unlinkSync(file + ext);
fs.copyFileSync(src, file);
console.log(`Base restaurada desde ${src}. La anterior quedó en ${file}.antes-de-restaurar`);
