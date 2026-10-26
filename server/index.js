require('express-async-errors');
require('./db');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { db, ROOT, UPLOADS } = require('./db');
const { loadUser } = require('./lib/auth');
const S = require('./lib/settings');
const docs = require('./lib/docs');
const { verify } = require('./routes/public');
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
const verifyViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: +(process.env.VERIFY_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', loadUser);
app.use('/api/auth', require('./routes/auth'));
// Cada módulo del sistema es un archivo en server/routes/: se cargan todos los que existan (excepto auth)
for (const f of fs.readdirSync(path.join(__dirname, 'routes')).sort()) {
  if (f.endsWith('.js') && f !== 'auth.js') app.use('/api', require('./routes/' + f));
}
app.get('/api/health', (req, res) => res.json({ ok: true, time: require('./lib/util').nowLocal() }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

/** Página pública que abre el celular al escanear el QR de un boleto */
app.get('/v/:code', verifyViewLimiter, (req, res) => {
  const r = verify(req.params.code), cfg = S.all();
  const color = r.valid ? '#1b7f3b' : '#b3261e';
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación de boleto - ${docs.esc(cfg.site_name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f4f6fa;display:grid;place-items:center;min-height:100vh}.c{background:#fff;border-radius:16px;padding:28px;max-width:380px;width:92%;box-shadow:0 6px 24px #0002;text-align:center}.b{display:inline-block;color:#fff;background:${color};border-radius:99px;padding:6px 18px;font-weight:700}dl{text-align:left;margin:18px 0 0}dt{font-size:12px;color:#667}dd{margin:0 0 8px;font-weight:600}small{color:#889}</style></head><body><div class="c"><h2 style="margin:0 0 12px;color:${cfg.primary_color}">${docs.esc(cfg.site_name)}</h2>
<span class="b">${r.valid ? 'BOLETO VÁLIDO' : 'NO VÁLIDO'}</span>
${r.coop ? `<dl><dt>Cooperativa</dt><dd>${docs.esc(r.coop)}</dd><dt>Ruta</dt><dd>${docs.esc(r.route)}</dd><dt>Salida</dt><dd>${docs.esc(r.depart_at)}</dd><dt>Asiento</dt><dd>${docs.esc(r.seat)}</dd><dt>N.º</dt><dd>${docs.esc(r.number || '-')}</dd><dt>Estado</dt><dd>${docs.esc(r.status)}</dd></dl>` : `<p>${docs.esc(r.reason || '')}</p>`}
<p><small>Solo el personal de la cooperativa puede marcar el abordaje.</small></p></div></body></html>`);
});


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
