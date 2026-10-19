/** Gestión de la cooperativa: catálogo operativo, flota, frecuencias, hojas de ruta, viajes y reportes. */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, tx } = require('../db');
const { requireRole, coopId } = require('../lib/auth');
const { audit } = require('../lib/notify');
const { imageUpload, saveImage } = require('../lib/upload');
const { today, httpError, validCedula, validEmail, validRuc, randCode } = require('../lib/util');

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

/* ---------- Personal ---------- */
const STAFF_ROLES = ['COOP_ADMIN', 'OFFICE', 'DRIVER', 'ASSISTANT'];
router.get('/coop/users', read, (req, res) => {
  res.json(db.prepare(`SELECT u.id,u.email,u.cedula,u.nombres,u.apellidos,u.phone,u.role,u.office_id,u.license,u.license_expires,u.active,u.perm_void,u.last_login,o.name AS office FROM users u LEFT JOIN offices o ON o.id=u.office_id WHERE u.coop_id=? AND u.role IN ('COOP_ADMIN','OFFICE','DRIVER','ASSISTANT') ORDER BY u.role,u.apellidos`).all(coopId(req)));
});
function checkStaff(b, id) {
  need(b.nombres, 'Nombres requeridos'); need(b.apellidos, 'Apellidos requeridos');
  if (!validEmail(b.email)) throw httpError(400, 'Correo inválido');
  if (!STAFF_ROLES.includes(b.role)) throw httpError(400, 'Rol inválido');
  if (b.cedula && !validCedula(b.cedula)) throw httpError(400, 'Cédula inválida');
  if (b.role === 'DRIVER' && b.license_expires && b.license_expires < today()) throw httpError(400, 'La licencia del chofer está vencida');
  const dup = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(b.email, id || 0);
  if (dup) throw httpError(409, 'Ya existe un usuario con ese correo');
}
router.post('/coop/users', write, (req, res) => {
  const cid = coopId(req), b = req.body || {}; checkStaff(b);
  const pass = b.password || randCode(8);
  const id = db.prepare('INSERT INTO users(email,cedula,nombres,apellidos,phone,password_hash,role,coop_id,office_id,license,license_expires,must_change,perm_void) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)')
    .run(b.email.trim().toLowerCase(), b.cedula || null, b.nombres.trim(), b.apellidos.trim(), b.phone || null, bcrypt.hashSync(pass, 10), b.role, cid, b.office_id || null, b.license || null, b.license_expires || null, b.perm_void ? 1 : 0).lastInsertRowid;
  audit(req, 'create', 'users', id, null, { email: b.email, role: b.role });
  res.status(201).json({ id, temp_password: pass });
});
router.put('/coop/users/:id', write, (req, res) => {
  const cid = coopId(req), u = own('users', req.params.id, cid), b = { ...u, ...req.body }; checkStaff(b, u.id);
  if (u.id === req.user.id && (b.active === 0 || b.role !== u.role)) throw httpError(400, 'No puedes desactivarte ni cambiar tu propio rol');
  db.prepare('UPDATE users SET email=?,cedula=?,nombres=?,apellidos=?,phone=?,role=?,office_id=?,license=?,license_expires=?,active=?,perm_void=? WHERE id=?')
    .run(b.email.trim().toLowerCase(), b.cedula || null, b.nombres, b.apellidos, b.phone || null, b.role, b.office_id || null, b.license || null, b.license_expires || null, b.active ? 1 : 0, b.perm_void ? 1 : 0, u.id);
  audit(req, 'update', 'users', u.id, { role: u.role, active: u.active }, { role: b.role, active: b.active });
  res.json({ ok: true });
});
router.post('/coop/users/:id/reset-password', write, (req, res) => {
  const u = own('users', req.params.id, coopId(req)), pass = randCode(8);
  db.prepare('UPDATE users SET password_hash=?, must_change=1, failed_attempts=0, locked_until=NULL WHERE id=?').run(bcrypt.hashSync(pass, 10), u.id);
  audit(req, 'reset_password', 'users', u.id);
  res.json({ temp_password: pass });
});

/* ---------- Plantillas de asientos ---------- */
/** Genera un diseño: filas x columnas, pasillo tras 'aisle' columnas, pisos, filas VIP delanteras */
function genLayout({ floors = 1, rows = 10, cols = 4, aisle = 2, vip_rows = 0, vip_name = 'VIP', normal_name = 'Normal', upper_name = 'Piso superior' }) {
  const out = []; let n = 1;
  for (let f = 1; f <= floors; f++) for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const col = c + (c > aisle ? 1 : 0);
    out.push({ f, r, c: col, label: String(n++), type: f === 1 ? (r <= vip_rows ? vip_name : normal_name) : upper_name });
  }
  return out;
}
router.post('/coop/seat-templates/generate', write, (req, res) => res.json({ layout: genLayout(req.body || {}) }));
crud('/coop/seat-templates', 'seat_templates', ['name', 'floors', 'rows', 'cols', 'layout'], {
  order: 'name',
  extra: (t) => ({ ...t, layout: JSON.parse(t.layout), seats: JSON.parse(t.layout).length }),
  validate: (b) => {
    need(b.name, 'Indica el nombre');
    const l = typeof b.layout === 'string' ? JSON.parse(b.layout) : b.layout;
    if (!Array.isArray(l) || !l.length) throw httpError(400, 'El diseño está vacío');
    const labels = new Set(); for (const s of l) { if (labels.has(s.label)) throw httpError(400, `Etiqueta de asiento repetida: ${s.label}`); labels.add(s.label); }
    b.layout = JSON.stringify(l); b.floors = Math.max(...l.map(s => s.f)); b.rows = Math.max(...l.map(s => s.r)); b.cols = Math.max(...l.map(s => s.c));
  },
});
function seatTypeId(cid, name) {
  let r = db.prepare('SELECT id FROM seat_types WHERE coop_id=? AND name=?').get(cid, name || 'Normal');
  if (!r) r = { id: db.prepare('INSERT INTO seat_types(coop_id,name,factor_pct) VALUES(?,?,100)').run(cid, name || 'Normal').lastInsertRowid };
  return r.id;
}
/** Sincroniza los asientos del bus con un diseño [{f,r,c,label,type|seat_type_id,sellable}] */
const syncSeats = tx((bus, layout) => {
  const existing = new Map(db.prepare('SELECT * FROM bus_seats WHERE bus_id=?').all(bus.id).map(s => [s.label, s]));
  const keep = new Set();
  for (const s of layout) {
    const tid = s.seat_type_id || seatTypeId(bus.coop_id, s.type), sell = s.sellable === 0 || s.sellable === false ? 0 : 1;
    keep.add(String(s.label));
    const ex = existing.get(String(s.label));
    if (ex) db.prepare('UPDATE bus_seats SET floor=?,row=?,col=?,seat_type_id=?,sellable=? WHERE id=?').run(s.f || s.floor || 1, s.r || s.row, s.c || s.col, tid, sell, ex.id);
    else db.prepare('INSERT INTO bus_seats(bus_id,floor,row,col,label,seat_type_id,sellable) VALUES(?,?,?,?,?,?,?)').run(bus.id, s.f || s.floor || 1, s.r || s.row, s.c || s.col, String(s.label), tid, sell);
  }
  for (const [label, ex] of existing) if (!keep.has(label)) {
    const used = db.prepare('SELECT 1 FROM tickets WHERE seat_id=? LIMIT 1').get(ex.id);
    if (used) db.prepare('UPDATE bus_seats SET sellable=0 WHERE id=?').run(ex.id); else db.prepare('DELETE FROM bus_seats WHERE id=?').run(ex.id);
  }
  const cap = db.prepare('SELECT COUNT(*) c FROM bus_seats WHERE bus_id=? AND sellable=1').get(bus.id).c;
  const floors = db.prepare('SELECT COALESCE(MAX(floor),1) f FROM bus_seats WHERE bus_id=?').get(bus.id).f;
  db.prepare('UPDATE buses SET capacity=?, floors=? WHERE id=?').run(cap, floors, bus.id);
});

module.exports = router; module.exports.genLayout = genLayout; module.exports.syncSeats = syncSeats;
