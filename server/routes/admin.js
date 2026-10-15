/** Administración global (SUPERADMIN) y auditoría (AUDITOR). */
const router = require('express').Router();
const S = require('../lib/settings');
const { requireRole } = require('../lib/auth');
const { audit } = require('../lib/notify');
const { imageUpload, saveImage } = require('../lib/upload');
const { httpError } = require('../lib/util');

const sa = requireRole(), both = requireRole('AUDITOR'); // requireRole() sin roles = solo SUPERADMIN
const need = (v, m) => { if (v === undefined || v === null || String(v).trim() === '') throw httpError(400, m); };

/* ---- Ajustes del sitio (marca, redes, políticas, reglas de negocio) ---- */
router.get('/admin/settings', both, (req, res) => res.json(S.all()));
router.put('/admin/settings', sa, (req, res) => {
  const before = S.all(), b = req.body || {}, allowed = Object.keys(S.DEFAULTS);
  const num = ['reserve_minutes', 'cash_hold_minutes', 'review_grace_minutes', 'max_seats', 'online_cutoff_minutes', 'review_max_minutes', 'terminal_fee_cents', 'discount_minor_pct', 'discount_senior_pct', 'discount_disability_pct', 'senior_age', 'driver_price_min_pct', 'driver_price_max_pct'];
  for (const k of Object.keys(b)) {
    if (!allowed.includes(k)) continue;
    let v = b[k];
    if (num.includes(k)) { v = Math.round(+v); if (!(v >= 0)) throw httpError(400, `Valor inválido para ${k}`); }
    if (/_color$/.test(k) && !/^#[0-9a-fA-F]{6}$/.test(v)) throw httpError(400, 'Los colores deben ser #RRGGBB');
    S.set(k, v);
  }
  if (S.get('driver_price_min_pct') > S.get('driver_price_max_pct')) throw httpError(400, 'El precio mínimo del chofer no puede superar el máximo');
  audit(req, 'update', 'settings', null, null, Object.keys(b));
  res.json(S.all());
});
router.post('/admin/logo', sa, imageUpload, (req, res) => { const u = saveImage(req.file); S.set('logo', u); audit(req, 'update', 'settings', 'logo'); res.json({ logo: u }); });

module.exports = router;
