/** Gestión de la cooperativa: catálogo operativo, flota, frecuencias, hojas de ruta, viajes y reportes. */
const router = require('express').Router();
const { db } = require('../db');
const { requireRole, coopId } = require('../lib/auth');
const { audit } = require('../lib/notify');
const { imageUpload, saveImage } = require('../lib/upload');
const { httpError, validEmail, validRuc } = require('../lib/util');

const read = requireRole('COOP_ADMIN', 'AUDITOR');
const write = requireRole('COOP_ADMIN');
const asJson = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? []));
const fkGuard = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { if (String(e.code).startsWith('SQLITE_CONSTRAINT_FOREIGNKEY')) e = httpError(409, 'No se puede eliminar: tiene registros asociados. Desactívalo en su lugar.'); next(e); } };
function own(table, id, cid) { const r = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(+id); if (!r || r.coop_id !== cid) throw httpError(404, 'Registro no encontrado'); return r; }

/** CRUD genérico con alcance por cooperativa */
function crud(path, table, cols, { order = 'id', extra, validate } = {}) {
  router.get(path, read, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE coop_id=? ORDER BY ${order}`).all(coopId(req));
    res.json(extra ? rows.map(extra) : rows);
  });
  router.post(path, write, fkGuard((req, res) => {
    const cid = coopId(req), b = req.body || {};
    if (validate) validate(b, null, cid);
    const vals = cols.map(c => (c === 'amenities' ? asJson(b[c]) : b[c] ?? null));
    const id = db.prepare(`INSERT INTO ${table}(coop_id,${cols.join(',')}) VALUES(?,${cols.map(() => '?').join(',')})`).run(cid, ...vals).lastInsertRowid;
    audit(req, 'create', table, id, null, b);
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
  }));
  router.put(path + '/:id', write, fkGuard((req, res) => {
    const cid = coopId(req), before = own(table, req.params.id, cid), b = { ...before, ...req.body };
    if (validate) validate(b, before, cid);
    db.prepare(`UPDATE ${table} SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => (c === 'amenities' ? asJson(b[c]) : b[c] ?? null)), before.id);
    audit(req, 'update', table, before.id, before, req.body);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(before.id));
  }));
  router.delete(path + '/:id', write, fkGuard((req, res) => {
    const before = own(table, req.params.id, coopId(req));
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(before.id);
    audit(req, 'delete', table, before.id, before);
    res.json({ ok: true });
  }));
}
const need = (v, msg) => { if (v === undefined || v === null || String(v).trim() === '') throw httpError(400, msg); };

/* ---------- Perfil de la cooperativa ---------- */
router.get('/coop/profile', read, (req, res) => res.json(db.prepare('SELECT id,ruc,name,short_name,color,phone,email,address,logo,active FROM cooperatives WHERE id=?').get(coopId(req))));
router.put('/coop/profile', write, (req, res) => {
  const cid = coopId(req), b = req.body || {}, before = db.prepare('SELECT * FROM cooperatives WHERE id=?').get(cid);
  if (b.email && !validEmail(b.email)) throw httpError(400, 'Correo inválido');
  if (b.ruc && !validRuc(b.ruc)) throw httpError(400, 'RUC inválido (13 dígitos terminados en 001)');
  db.prepare('UPDATE cooperatives SET ruc=?, name=?, short_name=?, color=?, phone=?, email=?, address=? WHERE id=?')
    .run(b.ruc ?? before.ruc, b.name || before.name, b.short_name ?? before.short_name, b.color || before.color, b.phone ?? before.phone, b.email ?? before.email, b.address ?? before.address, cid);
  audit(req, 'update', 'cooperatives', cid, before, b);
  res.json({ ok: true });
});
router.post('/coop/logo', write, imageUpload, (req, res) => {
  const url = saveImage(req.file); db.prepare('UPDATE cooperatives SET logo=? WHERE id=?').run(url, coopId(req)); res.json({ logo: url });
});

/* ---------- Cuentas bancarias, oficinas, tipos de asiento, grupos, temporadas ---------- */
crud('/coop/bank-accounts', 'bank_accounts', ['bank', 'type', 'number', 'holder', 'holder_id', 'active'], { order: 'bank', validate: (b) => { need(b.bank, 'Indica el banco'); need(b.number, 'Indica el número de cuenta'); need(b.holder, 'Indica el titular'); b.active = b.active ?? 1; b.type = b.type || 'Ahorros'; } });
crud('/coop/offices', 'offices', ['terminal_id', 'name', 'printer_width', 'auto_print'], { order: 'name', validate: (b) => { need(b.name, 'Indica el nombre'); b.printer_width = [58, 80].includes(+b.printer_width) ? +b.printer_width : 80; b.auto_print = b.auto_print ? 1 : 0; } });
crud('/coop/seat-types', 'seat_types', ['name', 'factor_pct', 'description'], { order: 'factor_pct', validate: (b) => { need(b.name, 'Indica el nombre'); b.factor_pct = Math.max(10, Math.min(500, +b.factor_pct || 100)); } });
crud('/coop/bus-groups', 'bus_groups', ['name', 'description'], { order: 'name', validate: (b) => need(b.name, 'Indica el nombre del grupo'), extra: (g) => ({ ...g, buses: db.prepare("SELECT COUNT(*) c FROM buses WHERE group_id=? AND status='ACTIVO'").get(g.id).c }) });
crud('/coop/seasons', 'season_rules', ['name', 'start_date', 'end_date', 'pct', 'active'], { order: 'start_date', validate: (b) => { need(b.name, 'Indica el nombre'); if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.end_date || '') || b.end_date < b.start_date) throw httpError(400, 'Rango de fechas inválido'); b.pct = Math.max(-50, Math.min(200, +b.pct || 0)); b.active = b.active ?? 1; } });

module.exports = router;
