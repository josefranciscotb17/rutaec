// Respaldo manual de la base: npm run db:backup  →  data/backups/rutaec-AAAAMMDD-HHMM-manual.db
const { db, DATA } = require('../server/db');
console.log('Respaldo creado: ' + require('../server/migrate').backup(db, DATA, 'manual'));
