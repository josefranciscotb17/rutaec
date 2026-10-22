require('express-async-errors');
require('./db');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { db, ROOT, UPLOADS } = require('./db');
const { loadUser } = require('./lib/auth');
const core = require('./lib/core');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], mediaSrc: ["'self'", 'blob:'], workerSrc: ["'self'"], frameSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'self'"],
  } },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: +(process.env.RATE_LIMIT || 600), standardHeaders: true, legacyHeaders: false }));
app.use('/api', loadUser);
app.use('/api/auth', require('./routes/auth'));
// Cada módulo del sistema es un archivo en server/routes/: se cargan todos los que existan (excepto auth)
for (const f of fs.readdirSync(path.join(__dirname, 'routes')).sort()) {
  if (f.endsWith('.js') && f !== 'auth.js') app.use('/api', require('./routes/' + f));
}
app.get('/api/health', (req, res) => res.json({ ok: true, time: require('./lib/util').nowLocal() }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use('/uploads/public', express.static(path.join(UPLOADS, 'public'), { maxAge: '7d', index: false }));
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', setHeaders: (res, p) => { if (/sw\.js$|\.html$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, req, res, next) => {
  void next;
  let status = err.status || 500, msg = err.message;
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') { status = 409; msg = 'Ya existe un registro con esos datos'; }
  else if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) { status = 409; msg = 'Los datos violan una restricción (registro relacionado o dato obligatorio)'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 413; msg = 'El archivo supera el tamaño permitido'; }
  else if (err.type === 'entity.parse.failed') { status = 400; msg = 'JSON inválido'; }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : msg, code: err.code && !String(err.code).startsWith('SQLITE') ? err.code : undefined });
});

function start() {
  const port = +(process.env.PORT || 3000);
    // Libera los asientos de las reservas vencidas cada 30 segundos
  setInterval(() => { try { core.expireOrders(); } catch (e) { console.error(e); } }, 30000).unref();
  return app.listen(port, () => console.log(`RutaEC lista en http://localhost:${port}`));
}
if (require.main === module) start();
module.exports = { app, start };
