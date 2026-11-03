/** Gestión de la cooperativa: catálogo operativo, flota, frecuencias, hojas de ruta, viajes y reportes. */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, tx } = require('../db');
const S = require('../lib/settings');
const core = require('../lib/core');
const docs = require('../lib/docs');
const { requireRole, coopId } = require('../lib/auth');
const { notify, audit } = require('../lib/notify');
const { generateRotation, findConflicts } = require('../lib/rotation');
const { imageUpload, saveImage } = require('../lib/upload');
const { nowLocal, today, addDays, httpError, validCedula, validEmail, validPlate, validRuc, randCode, money, dow } = require('../lib/util');

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

/* ---------- Buses ---------- */
const BUS_COLS = ['group_id', 'number', 'plate', 'color', 'year', 'chassis_brand', 'body_brand', 'model', 'amenities', 'status', 'tech_review_expires', 'registration_expires', 'template_id'];
function busValidate(b, before, cid) {
  need(b.number, 'Indica el número de unidad');
  b.plate = String(b.plate || '').toUpperCase().trim();
  if (!validPlate(b.plate)) throw httpError(400, 'Placa inválida (formato ABC-1234)');
  if (b.year && (b.year < 1990 || b.year > new Date().getFullYear() + 1)) throw httpError(400, 'Año inválido');
  b.status = ['ACTIVO', 'MANTENIMIENTO', 'BAJA'].includes(b.status) ? b.status : 'ACTIVO';
  if (b.group_id) own('bus_groups', b.group_id, cid);
}
router.get('/coop/buses', read, (req, res) => {
  res.json(db.prepare('SELECT b.*, g.name AS group_name FROM buses b LEFT JOIN bus_groups g ON g.id=b.group_id WHERE b.coop_id=? ORDER BY b.number+0, b.number').all(coopId(req)).map(b => ({ ...b, amenities: JSON.parse(b.amenities || '[]') })));
});
router.post('/coop/buses', write, fkGuard((req, res) => {
  const cid = coopId(req), b = req.body || {}; busValidate(b, null, cid);
  const id = db.prepare(`INSERT INTO buses(coop_id,${BUS_COLS.join(',')}) VALUES(?,${BUS_COLS.map(() => '?').join(',')})`).run(cid, ...BUS_COLS.map(c => c === 'amenities' ? asJson(b[c]) : b[c] ?? null)).lastInsertRowid;
  if (b.template_id) { const t = own('seat_templates', b.template_id, cid); syncSeats({ id, coop_id: cid }, JSON.parse(t.layout)); }
  audit(req, 'create', 'buses', id, null, { number: b.number, plate: b.plate });
  res.status(201).json(db.prepare('SELECT * FROM buses WHERE id=?').get(id));
}));
router.put('/coop/buses/:id', write, fkGuard((req, res) => {
  const cid = coopId(req), before = own('buses', req.params.id, cid), b = { ...before, ...req.body, amenities: req.body.amenities ?? JSON.parse(before.amenities) }; busValidate(b, before, cid);
  db.prepare(`UPDATE buses SET ${BUS_COLS.map(c => c + '=?').join(',')} WHERE id=?`).run(...BUS_COLS.map(c => c === 'amenities' ? asJson(b[c]) : b[c] ?? null), before.id);
  if (req.body.template_id && req.body.template_id !== before.template_id) { const t = own('seat_templates', req.body.template_id, cid); syncSeats(before, JSON.parse(t.layout)); }
  audit(req, 'update', 'buses', before.id, before, req.body);
  res.json({ ok: true });
}));
router.delete('/coop/buses/:id', write, fkGuard((req, res) => {
  const b = own('buses', req.params.id, coopId(req));
  if (db.prepare('SELECT 1 FROM trips WHERE bus_id=? LIMIT 1').get(b.id)) { db.prepare("UPDATE buses SET status='BAJA' WHERE id=?").run(b.id); audit(req, 'retire', 'buses', b.id); return res.json({ ok: true, retired: true }); }
  db.prepare('DELETE FROM buses WHERE id=?').run(b.id); audit(req, 'delete', 'buses', b.id); res.json({ ok: true });
}));
router.post('/coop/buses/:id/photo', write, imageUpload, (req, res) => {
  const b = own('buses', req.params.id, coopId(req)), url = saveImage(req.file); db.prepare('UPDATE buses SET photo=? WHERE id=?').run(url, b.id); res.json({ photo: url });
});
router.get('/coop/buses/:id/seats', read, (req, res) => {
  const b = own('buses', req.params.id, coopId(req));
  res.json(db.prepare('SELECT s.*, st.name AS type_name FROM bus_seats s JOIN seat_types st ON st.id=s.seat_type_id WHERE s.bus_id=? ORDER BY floor,row,col').all(b.id));
});
router.put('/coop/buses/:id/seats', write, (req, res) => {
  const b = own('buses', req.params.id, coopId(req)), layout = req.body.seats;
  if (!Array.isArray(layout) || !layout.length) throw httpError(400, 'Envía el listado de asientos');
  const labels = new Set(); for (const s of layout) { if (labels.has(String(s.label))) throw httpError(400, `Etiqueta repetida: ${s.label}`); labels.add(String(s.label)); }
  syncSeats(b, layout); audit(req, 'update_seats', 'buses', b.id); res.json({ ok: true });
});

/* ---------- Frecuencias, paradas y tarifas ---------- */
function freqFull(f) {
  f.stops = db.prepare('SELECT s.ord,s.terminal_id,s.minutes,s.km,tm.name AS terminal,ci.name AS city FROM frequency_stops s JOIN terminals tm ON tm.id=s.terminal_id JOIN cities ci ON ci.id=tm.city_id WHERE s.frequency_id=? ORDER BY s.ord').all(f.id);
  f.fares = db.prepare('SELECT from_ord,to_ord,price_cents FROM fares WHERE frequency_id=? ORDER BY from_ord,to_ord').all(f.id);
  f.origin = f.stops[0] && f.stops[0].city; f.dest = f.stops.length ? f.stops[f.stops.length - 1].city : null;
  return f;
}
router.get('/coop/frequencies', read, (req, res) => res.json(db.prepare('SELECT * FROM frequencies WHERE coop_id=? ORDER BY depart_time, id').all(coopId(req)).map(freqFull)));
/** Tarifa completa -> matriz proporcional a los km (redondeo a 5 centavos, mínimo $0.50) */
function autoFares(stops, fullCents) {
  const totalKm = stops[stops.length - 1].km || stops.length - 1, out = [];
  for (let a = 0; a < stops.length; a++) for (let b = a + 1; b < stops.length; b++) {
    const share = (stops[b].km - stops[a].km) / (totalKm || 1);
    out.push({ from_ord: a, to_ord: b, price_cents: Math.max(50, Math.round(fullCents * share / 5) * 5) });
  }
  return out;
}
const saveFreq = tx((cid, id, b) => {
  const f = [b.origin_terminal_id, b.dest_terminal_id];
  const stops = (b.stops || []).map((s, i) => ({ terminal_id: +s.terminal_id, minutes: +s.minutes || 0, km: +s.km || 0, ord: i }));
  if (stops.length < 2) throw httpError(400, 'Define al menos origen y destino');
  if (new Set(stops.map(s => s.terminal_id)).size !== stops.length) throw httpError(400, 'Una terminal se repite en la ruta');
  stops[0].minutes = 0; stops[0].km = 0; stops[stops.length - 1].minutes = +b.duration_min;
  for (let i = 1; i < stops.length; i++) if (stops[i].minutes <= stops[i - 1].minutes || stops[i].km < stops[i - 1].km) throw httpError(400, 'Los minutos y km de las paradas deben ser crecientes');
  const vals = [stops[0].terminal_id, stops[stops.length - 1].terminal_id, b.depart_time, +b.duration_min, stops.length > 2 ? 'CON_PARADAS' : (b.kind || 'DIRECTA'), b.resolution_number || null, b.resolution_date || null, b.days || '1111111', b.active === 0 || b.active === false ? 0 : 1];
  if (id) db.prepare('UPDATE frequencies SET origin_terminal_id=?,dest_terminal_id=?,depart_time=?,duration_min=?,kind=?,resolution_number=?,resolution_date=?,days=?,active=? WHERE id=?').run(...vals, id);
  else id = db.prepare('INSERT INTO frequencies(origin_terminal_id,dest_terminal_id,depart_time,duration_min,kind,resolution_number,resolution_date,days,active,coop_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(...vals, cid).lastInsertRowid;
  const hasTickets = db.prepare('SELECT 1 FROM tickets t JOIN trips tr ON tr.id=t.trip_id WHERE tr.frequency_id=? LIMIT 1').get(id);
  const oldN = db.prepare('SELECT COUNT(*) c FROM frequency_stops WHERE frequency_id=?').get(id).c;
  if (hasTickets && oldN !== stops.length) throw httpError(409, 'La frecuencia ya tiene boletos: no se puede cambiar el número de paradas');
  db.prepare('DELETE FROM frequency_stops WHERE frequency_id=?').run(id);
  for (const s of stops) db.prepare('INSERT INTO frequency_stops(frequency_id,ord,terminal_id,minutes,km) VALUES(?,?,?,?,?)').run(id, s.ord, s.terminal_id, s.minutes, s.km);
  let fares = b.fares;
  if (!fares && b.auto_fare_cents) fares = autoFares(stops, +b.auto_fare_cents);
  if (fares) {
    db.prepare('DELETE FROM fares WHERE frequency_id=?').run(id);
    for (const r of fares) { if (!(r.price_cents > 0)) throw httpError(400, 'Toda tarifa debe ser mayor a 0'); db.prepare('INSERT INTO fares(frequency_id,from_ord,to_ord,price_cents) VALUES(?,?,?,?)').run(id, r.from_ord, r.to_ord, Math.round(r.price_cents)); }
  } else if (!db.prepare('SELECT 1 FROM fares WHERE frequency_id=?').get(id)) throw httpError(400, 'Define las tarifas (matriz o tarifa completa)');
  return id;
});
function freqCheck(b) {
  if (!/^\d{2}:\d{2}$/.test(b.depart_time || '')) throw httpError(400, 'Hora de salida inválida (HH:MM)');
  if (!(+b.duration_min >= 15)) throw httpError(400, 'Duración inválida');
  if (b.days && !/^[01]{7}$/.test(b.days)) throw httpError(400, 'Días inválidos');
}
router.post('/coop/frequencies', write, (req, res) => { const cid = coopId(req); freqCheck(req.body); const id = saveFreq(cid, null, req.body); audit(req, 'create', 'frequencies', id); res.status(201).json(freqFull(db.prepare('SELECT * FROM frequencies WHERE id=?').get(id))); });
router.put('/coop/frequencies/:id', write, (req, res) => { const cid = coopId(req), f = own('frequencies', req.params.id, cid); freqCheck(req.body); saveFreq(cid, f.id, req.body); audit(req, 'update', 'frequencies', f.id, f, req.body); res.json(freqFull(db.prepare('SELECT * FROM frequencies WHERE id=?').get(f.id))); });
router.delete('/coop/frequencies/:id', write, fkGuard((req, res) => {
  const f = own('frequencies', req.params.id, coopId(req));
  if (db.prepare('SELECT 1 FROM trips WHERE frequency_id=? LIMIT 1').get(f.id)) { db.prepare('UPDATE frequencies SET active=0 WHERE id=?').run(f.id); return res.json({ ok: true, deactivated: true }); }
  db.prepare('DELETE FROM frequencies WHERE id=?').run(f.id); audit(req, 'delete', 'frequencies', f.id); res.json({ ok: true });
}));
router.get('/coop/terminals', read, (req, res) => res.json(db.prepare('SELECT t.id,t.name,t.address,c.name AS city,c.id AS city_id,p.name AS province FROM terminals t JOIN cities c ON c.id=t.city_id JOIN provinces p ON p.id=c.province_id ORDER BY c.name').all()));

/* ---------- Hojas de ruta (rotación) ---------- */
function sheetInputs(cid, b) {
  const group = own('bus_groups', b.group_id, cid);
  const buses = db.prepare("SELECT id,number FROM buses WHERE coop_id=? AND group_id=? AND status='ACTIVO' ORDER BY number+0, number").all(cid, group.id);
  let freqs = db.prepare('SELECT * FROM frequencies WHERE coop_id=? AND active=1 ORDER BY depart_time,id').all(cid);
  if (Array.isArray(b.frequency_ids) && b.frequency_ids.length) freqs = b.frequency_ids.map(id => freqs.find(f => f.id === +id)).filter(Boolean);
  const drivers = db.prepare("SELECT id FROM users WHERE coop_id=? AND role='DRIVER' AND active=1 ORDER BY id").all(cid);
  const assistants = db.prepare("SELECT id FROM users WHERE coop_id=? AND role='ASSISTANT' AND active=1 ORDER BY id").all(cid);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.end_date || '') || b.end_date < b.start_date) throw httpError(400, 'Rango de fechas inválido');
  if ((new Date(b.end_date) - new Date(b.start_date)) / 864e5 > 92) throw httpError(400, 'El rango máximo es de 93 días');
  return { group, buses, freqs, drivers, assistants };
}
router.post('/coop/route-sheets/preview', write, (req, res) => {
  const cid = coopId(req), b = req.body || {}, { buses, freqs, drivers, assistants } = sheetInputs(cid, b);
  const r = generateRotation({ buses, frequencies: freqs, start: b.start_date, end: b.end_date, drivers, assistants });
  const info = Object.fromEntries(freqs.map(f => [f.id, f]));
  r.conflicts = findConflicts(r.entries, info, +b.rest_min || 60);
  r.frequencies = freqs.map(f => ({ id: f.id, depart_time: f.depart_time, ...freqFull({ ...f }) }));
  r.buses = buses;
  res.json(r);
});
router.post('/coop/route-sheets', write, (req, res) => {
  const cid = coopId(req), b = req.body || {}; sheetInputs(cid, b);
  if (!Array.isArray(b.entries) || !b.entries.length) throw httpError(400, 'La hoja no tiene asignaciones');
  const id = tx(() => {
    const sid = db.prepare("INSERT INTO route_sheets(coop_id,group_id,start_date,end_date,mode,status,created_by,created_at) VALUES(?,?,?,?,?,'BORRADOR',?,?)").run(cid, b.group_id, b.start_date, b.end_date, b.mode || 'AUTO', req.user.id, nowLocal()).lastInsertRowid;
    for (const e of b.entries) {
      own('buses', e.bus_id, cid);
      db.prepare('INSERT INTO route_sheet_entries(sheet_id,date,slot,frequency_id,bus_id,driver_id,assistant_id) VALUES(?,?,?,?,?,?,?)').run(sid, e.date, e.slot, e.frequency_id || null, e.bus_id, e.driver_id || null, e.assistant_id || null);
    }
    return sid;
  })();
  audit(req, 'create', 'route_sheets', id);
  res.status(201).json({ id });
});
router.get('/coop/route-sheets', read, (req, res) => res.json(db.prepare(`SELECT r.*, g.name AS group_name, (SELECT COUNT(*) FROM route_sheet_entries e WHERE e.sheet_id=r.id) AS entries FROM route_sheets r JOIN bus_groups g ON g.id=r.group_id WHERE r.coop_id=? ORDER BY r.start_date DESC`).all(coopId(req))));
function sheetDetail(s) {
  s.entries = db.prepare(`SELECT e.*, b.number AS bus_number, f.depart_time, ot.name AS origin, dt.name AS dest, u.nombres||' '||u.apellidos AS driver, a.nombres||' '||a.apellidos AS assistant
    FROM route_sheet_entries e JOIN buses b ON b.id=e.bus_id LEFT JOIN frequencies f ON f.id=e.frequency_id LEFT JOIN terminals ot ON ot.id=f.origin_terminal_id LEFT JOIN terminals dt ON dt.id=f.dest_terminal_id
    LEFT JOIN users u ON u.id=e.driver_id LEFT JOIN users a ON a.id=e.assistant_id WHERE e.sheet_id=? ORDER BY e.date, e.slot`).all(s.id);
  return s;
}
router.get('/coop/route-sheets/:id', read, (req, res) => res.json(sheetDetail(own('route_sheets', req.params.id, coopId(req)))));
router.put('/coop/route-sheets/:id/entries/:eid', write, (req, res) => {
  const cid = coopId(req), s = own('route_sheets', req.params.id, cid), e = db.prepare('SELECT * FROM route_sheet_entries WHERE id=? AND sheet_id=?').get(+req.params.eid, s.id);
  if (!e) throw httpError(404, 'Asignación no encontrada');
  const b = { ...e, ...req.body }; own('buses', b.bus_id, cid);
  db.prepare('UPDATE route_sheet_entries SET bus_id=?, driver_id=?, assistant_id=?, frequency_id=? WHERE id=?').run(b.bus_id, b.driver_id || null, b.assistant_id || null, b.frequency_id || null, e.id);
  res.json({ ok: true });
});
router.post('/coop/route-sheets/:id/publish', write, (req, res) => {
  const cid = coopId(req), s = own('route_sheets', req.params.id, cid);
  const entries = db.prepare('SELECT e.*, f.depart_time FROM route_sheet_entries e JOIN frequencies f ON f.id=e.frequency_id WHERE e.sheet_id=? AND e.frequency_id IS NOT NULL').all(s.id);
  const info = Object.fromEntries(db.prepare('SELECT id,depart_time,duration_min FROM frequencies WHERE coop_id=?').all(cid).map(f => [f.id, f]));
  const conflicts = findConflicts(entries, info, 0);
  if (conflicts.length && !req.body.force) throw httpError(409, 'Hay conflictos: ' + conflicts.slice(0, 3).join('; '), 'CONFLICTS');
  let created = 0, updated = 0, skipped = 0;
  tx(() => {
    for (const e of entries) {
      const at = `${e.date} ${e.depart_time}:00`;
      const ex = db.prepare('SELECT * FROM trips WHERE frequency_id=? AND date=? AND depart_at=?').get(e.frequency_id, e.date, at);
      if (ex) {
        const sold = db.prepare("SELECT 1 FROM tickets WHERE trip_id=? AND status IN ('RESERVADO','VALIDO','ABORDADO') LIMIT 1").get(ex.id);
        if (sold && ex.bus_id !== e.bus_id) { skipped++; continue; }
        db.prepare("UPDATE trips SET bus_id=?, driver_id=?, assistant_id=? WHERE id=? AND status='PROGRAMADO'").run(e.bus_id, e.driver_id, e.assistant_id, ex.id); updated++;
      } else { db.prepare('INSERT INTO trips(frequency_id,bus_id,date,depart_at,driver_id,assistant_id) VALUES(?,?,?,?,?,?)').run(e.frequency_id, e.bus_id, e.date, at, e.driver_id, e.assistant_id); created++; }
    }
    db.prepare("UPDATE route_sheets SET status='PUBLICADA' WHERE id=?").run(s.id);
  })();
  audit(req, 'publish', 'route_sheets', s.id, null, { created, updated, skipped });
  res.json({ created, updated, skipped });
});
router.delete('/coop/route-sheets/:id', write, (req, res) => {
  const s = own('route_sheets', req.params.id, coopId(req));
  if (s.status === 'PUBLICADA') throw httpError(409, 'La hoja ya fue publicada; los viajes existen. Cancela los viajes si es necesario.');
  db.prepare('DELETE FROM route_sheets WHERE id=?').run(s.id); res.json({ ok: true });
});
router.get('/coop/route-sheets/:id/print', read, (req, res) => {
  const s = sheetDetail(own('route_sheets', req.params.id, coopId(req))), dates = [...new Set(s.entries.map(e => e.date))];
  const slots = [...new Set(s.entries.map(e => e.slot))].sort((a, b) => a - b), by = {};
  s.entries.forEach(e => by[e.date + '|' + e.slot] = e);
  const head = slots.map(sl => { const e = s.entries.find(x => x.slot === sl && x.frequency_id); return `<th>${e ? docs.esc(e.depart_time + ' ' + e.origin + '→' + e.dest) : 'PARADA'}</th>`; }).join('');
  const rows = dates.map(d => `<tr><td><b>${d}</b></td>${slots.map(sl => { const e = by[d + '|' + sl]; return `<td>${e ? (e.frequency_id ? `Bus ${docs.esc(e.bus_number)}<br><small>${docs.esc(e.driver || '')}</small>` : `<i>Parada (Bus ${docs.esc(e.bus_number)})</i>`) : '-'}</td>`; }).join('')}</tr>`).join('');
  res.type('html').send(docs.a4Page('Hoja de ruta', `<h1>Hoja de ruta ${s.start_date} a ${s.end_date}</h1><table><tr><th>Fecha</th>${head}</tr>${rows}</table><div class="sig"><div>Gerente</div><div>Despachador</div></div>`));
});

/* ---------- Viajes ---------- */
router.get('/coop/trips', read, (req, res) => {
  const cid = coopId(req), date = req.query.date || today();
  core.expireOrders();
  const rows = db.prepare(`SELECT t.id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date BETWEEN ? AND ? ORDER BY t.depart_at`).all(cid, date, req.query.to || date);
  res.json(rows.map(({ id }) => {
    const t = core.getTrip(id), sold = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total_cents),0) s FROM tickets WHERE trip_id=? AND status IN ('VALIDO','ABORDADO','BAJO')").get(id);
    const drv = t.driver_id ? db.prepare('SELECT nombres,apellidos FROM users WHERE id=?').get(t.driver_id) : null;
    return { id, date: t.date, depart_at: t.depart_at, status: t.status, platform: t.platform, bus_id: t.bus_id, bus_number: t.bus_number, plate: t.plate, driver_id: t.driver_id, assistant_id: t.assistant_id, driver: drv ? drv.nombres + ' ' + drv.apellidos : null, origin: t.stops[0].city, dest: t.stops[t.stops.length - 1].city, capacity: t.capacity, sold: sold.c, revenue_cents: sold.s };
  }));
});
router.post('/coop/trips', write, (req, res) => {
  const cid = coopId(req), b = req.body || {}, f = own('frequencies', b.frequency_id, cid); own('buses', b.bus_id, cid);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw httpError(400, 'Fecha inválida');
  const id = db.prepare('INSERT INTO trips(frequency_id,bus_id,date,depart_at,driver_id,assistant_id,platform) VALUES(?,?,?,?,?,?,?)').run(f.id, b.bus_id, b.date, `${b.date} ${f.depart_time}:00`, b.driver_id || null, b.assistant_id || null, b.platform || null).lastInsertRowid;
  audit(req, 'create', 'trips', id); res.status(201).json({ id });
});
router.put('/coop/trips/:id', write, (req, res) => {
  const cid = coopId(req), t = db.prepare('SELECT t.*, f.coop_id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE t.id=?').get(+req.params.id);
  if (!t || t.coop_id !== cid) throw httpError(404, 'Viaje no encontrado');
  const b = { ...t, ...req.body };
  if (b.bus_id !== t.bus_id) {
    own('buses', b.bus_id, cid);
    if (db.prepare("SELECT 1 FROM tickets WHERE trip_id=? AND status IN ('RESERVADO','VALIDO','ABORDADO') LIMIT 1").get(t.id)) throw httpError(409, 'Ya hay boletos vendidos: no se puede cambiar el bus');
  }
  db.prepare('UPDATE trips SET bus_id=?, driver_id=?, assistant_id=?, platform=? WHERE id=?').run(b.bus_id, b.driver_id || null, b.assistant_id || null, b.platform || null, t.id);
  audit(req, 'update', 'trips', t.id, t, req.body); res.json({ ok: true });
});
router.post('/coop/trips/:id/cancel', write, (req, res) => {
  const cid = coopId(req), t = db.prepare('SELECT t.*, f.coop_id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE t.id=?').get(+req.params.id);
  if (!t || t.coop_id !== cid) throw httpError(404, 'Viaje no encontrado');
  if (['EN_RUTA', 'FINALIZADO', 'CANCELADO'].includes(t.status)) throw httpError(409, 'El viaje no puede cancelarse en su estado actual');
  const reason = String(req.body.reason || '').trim(); need(reason, 'Indica el motivo');
  const orders = db.prepare("SELECT DISTINCT o.* FROM orders o WHERE o.trip_id=? AND o.status IN ('RESERVADO','EN_REVISION','PAGADO')").all(t.id);
  tx(() => {
    db.prepare("UPDATE trips SET status='CANCELADO', cancel_reason=? WHERE id=?").run(reason, t.id);
    for (const o of orders) {
      db.prepare("UPDATE tickets SET status='ANULADO', void_reason=?, voided_by=? WHERE order_id=? AND status IN ('RESERVADO','VALIDO')").run('Viaje cancelado: ' + reason, req.user.id, o.id);
      db.prepare("UPDATE orders SET status='CANCELADO', note=? WHERE id=?").run('Viaje cancelado: ' + reason, o.id);
      if (o.buyer_id) notify(o.buyer_id, 'Viaje cancelado', `El viaje de tu orden ${o.code} fue cancelado (${reason}). ${o.status === 'PAGADO' ? 'Contacta a la cooperativa para la devolución de tu dinero.' : ''}`, '#/orders');
    }
  })();
  audit(req, 'cancel', 'trips', t.id, null, { reason, orders: orders.length });
  res.json({ ok: true, orders: orders.length, refunds_pending: orders.filter(o => o.status === 'PAGADO').length });
});

/* ---------- Reportes ---------- */
function range(req) { const to = req.query.to || today(), from = req.query.from || addDays(to, -29); return { from, to }; }
router.get('/coop/dashboard', read, (req, res) => {
  const cid = coopId(req), d = today(), m = d.slice(0, 7) + '-01';
  const q = (sql, ...p) => db.prepare(sql).get(cid, ...p);
  res.json({
    today: q("SELECT COUNT(*) tickets, COALESCE(SUM(t.total_cents),0) revenue FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.coop_id=? AND t.status IN ('VALIDO','ABORDADO','BAJO') AND substr(o.paid_at,1,10)=?", d),
    month: q("SELECT COUNT(*) tickets, COALESCE(SUM(t.total_cents),0) revenue FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.coop_id=? AND t.status IN ('VALIDO','ABORDADO','BAJO') AND substr(o.paid_at,1,10)>=?", m),
    trips_today: q("SELECT COUNT(*) c FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date=?", d).c,
    pending_payments: q("SELECT COUNT(*) c FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.coop_id=? AND p.status='EN_REVISION'").c,
    buses: db.prepare("SELECT status, COUNT(*) c FROM buses WHERE coop_id=? GROUP BY status").all(cid),
    alerts: [
      ...db.prepare("SELECT 'Revisión técnica por vencer: bus ' || number || ' (' || tech_review_expires || ')' a FROM buses WHERE coop_id=? AND status='ACTIVO' AND tech_review_expires IS NOT NULL AND tech_review_expires <= ?").all(cid, addDays(d, 30)).map(r => r.a),
      ...db.prepare("SELECT 'Licencia por vencer: ' || nombres || ' ' || apellidos || ' (' || license_expires || ')' a FROM users WHERE coop_id=? AND role='DRIVER' AND active=1 AND license_expires IS NOT NULL AND license_expires <= ?").all(cid, addDays(d, 30)).map(r => r.a),
    ],
  });
});
router.get('/coop/reports/sales', read, (req, res) => {
  const cid = coopId(req), { from, to } = range(req);
  const base = "FROM tickets t JOIN orders o ON o.id=t.order_id JOIN trips tr ON tr.id=t.trip_id JOIN frequencies f ON f.id=tr.frequency_id WHERE o.coop_id=? AND t.status IN ('VALIDO','ABORDADO','BAJO') AND substr(o.paid_at,1,10) BETWEEN ? AND ?";
  const out = {
    from, to,
    totals: db.prepare(`SELECT COUNT(*) tickets, COALESCE(SUM(t.total_cents),0) revenue, COALESCE(SUM(t.discount_cents),0) discounts, COALESCE(SUM(t.fee_cents),0) fees ${base}`).get(cid, from, to),
    by_day: db.prepare(`SELECT substr(o.paid_at,1,10) day, COUNT(*) tickets, SUM(t.total_cents) revenue ${base} GROUP BY 1 ORDER BY 1`).all(cid, from, to),
    by_channel: db.prepare(`SELECT o.channel, COUNT(*) tickets, SUM(t.total_cents) revenue ${base} GROUP BY 1`).all(cid, from, to),
    by_method: db.prepare(`SELECT COALESCE(o.method,'-') method, COUNT(*) tickets, SUM(t.total_cents) revenue ${base} GROUP BY 1`).all(cid, from, to),
    by_category: db.prepare(`SELECT t.category, COUNT(*) tickets, SUM(t.total_cents) revenue ${base} GROUP BY 1`).all(cid, from, to),
    by_route: db.prepare(`SELECT oc.name||' → '||dc.name route, COUNT(*) tickets, SUM(t.total_cents) revenue ${base.replace('WHERE', 'JOIN terminals ot ON ot.id=f.origin_terminal_id JOIN cities oc ON oc.id=ot.city_id JOIN terminals dt ON dt.id=f.dest_terminal_id JOIN cities dc ON dc.id=dt.city_id WHERE')} GROUP BY 1 ORDER BY revenue DESC LIMIT 15`).all(cid, from, to),
    by_office: db.prepare(`SELECT COALESCE(of.name,'(en línea / ruta)') office, COUNT(*) tickets, SUM(t.total_cents) revenue ${base.replace('WHERE', 'LEFT JOIN offices of ON of.id=o.office_id WHERE')} GROUP BY 1 ORDER BY revenue DESC`).all(cid, from, to),
    occupancy: db.prepare(`SELECT ROUND(100.0*SUM(sold)/NULLIF(SUM(cap),0),1) pct FROM (SELECT (SELECT COUNT(*) FROM tickets x WHERE x.trip_id=tr.id AND x.status IN ('VALIDO','ABORDADO','BAJO')) sold, b.capacity cap FROM trips tr JOIN frequencies f ON f.id=tr.frequency_id JOIN buses b ON b.id=tr.bus_id WHERE f.coop_id=? AND tr.date BETWEEN ? AND ? AND tr.status<>'CANCELADO')`).get(cid, from, to).pct,
    no_show: db.prepare("SELECT COUNT(*) c FROM tickets t JOIN trips tr ON tr.id=t.trip_id JOIN frequencies f ON f.id=tr.frequency_id WHERE f.coop_id=? AND tr.date BETWEEN ? AND ? AND tr.status='FINALIZADO' AND t.status='VALIDO'").get(cid, from, to).c,
  };
  if (req.query.format === 'csv') {
    const rows = [['fecha', 'boletos', 'ingresos_usd'], ...out.by_day.map(r => [r.day, r.tickets, (r.revenue / 100).toFixed(2)])];
    res.type('text/csv').attachment(`ventas_${from}_${to}.csv`).send('﻿' + rows.map(r => r.join(';')).join('\n'));
  } else res.json(out);
});
router.get('/coop/audit', read, (req, res) => {
  const cid = coopId(req);
  res.json(db.prepare('SELECT a.* FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE u.coop_id=? ORDER BY a.id DESC LIMIT 300').all(cid));
});
router.get('/coop/incidents', read, (req, res) => res.json(db.prepare(`SELECT i.*, t.date, b.number AS bus_number FROM incidents i JOIN trips t ON t.id=i.trip_id JOIN frequencies f ON f.id=t.frequency_id JOIN buses b ON b.id=t.bus_id WHERE f.coop_id=? ORDER BY i.id DESC LIMIT 200`).all(coopId(req))));
module.exports = router; module.exports.genLayout = genLayout; module.exports.syncSeats = syncSeats; module.exports.autoFares = autoFares;
