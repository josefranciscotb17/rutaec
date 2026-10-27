/**
 * Datos de demostración de RutaEC (Ecuador). Uso: `npm run seed` (agrega si la BD está vacía) o `npm run db:reset` (borra y recarga).
 * Todas las cuentas usan la contraseña Demo1234!  Cédulas, placas y RUC son ficticios pero con formato válido.
 */
const bcrypt = require('bcryptjs');
const fs = require('fs'), path = require('path');
const { db, UPLOADS } = require('./db');
const S = require('./lib/settings');
const core = require('./lib/core');
const { genLayout, syncSeats, autoFares } = require('./routes/coop');
const { generateRotation } = require('./lib/rotation');
const { nowLocal, today, addDays, addMinutes, makeCedula, randCode } = require('./lib/util');

const PASS = 'Demo1234!';
let seedN = 20260101;
const rnd = () => { seedN |= 0; seedN = (seedN + 0x6D2B79F5) | 0; let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NOMBRES = ['Juan Carlos', 'María Fernanda', 'Luis Alberto', 'Ana Lucía', 'José Miguel', 'Carmen Elena', 'Pedro Pablo', 'Sofía Alejandra', 'Diego Armando', 'Gabriela Estefanía', 'Andrés Felipe', 'Paola Cristina', 'Mario Esteban', 'Daniela Nicole', 'Fabián Eduardo', 'Verónica Isabel', 'Santiago Javier', 'Lorena Patricia', 'Byron Marcelo', 'Karla Dayana', 'Édison Rolando', 'Jessica Alexandra', 'Wilson Patricio', 'Rosa Amelia'];
const APELLIDOS = ['Cárdenas Mora', 'Villacís Pérez', 'Toapanta Chiluisa', 'Jaramillo Ortiz', 'Quishpe Yánez', 'Pazmiño Ruiz', 'Zambrano Vera', 'Mendoza Loor', 'Cevallos Naranjo', 'Andrade Salazar', 'Guamán Cuji', 'Morocho Lema', 'Intriago Cedeño', 'Altamirano Freire', 'Peñafiel Barrera', 'Cabrera Espinoza', 'Ochoa Vintimilla', 'Sarango Jiménez', 'Macías Delgado', 'Espín Tapia'];
let cedN = 0;
const newCedula = () => { cedN++; const r = String(cedN * 7919 % 999999).padStart(6, '0'); return makeCedula(pick(['17', '09', '01', '18', '11']) + String(cedN % 6) + r); };
const hash = bcrypt.hashSync(PASS, 8);
const asc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

function wipe() {
  db.pragma('foreign_keys = OFF');
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.prepare(`DELETE FROM ${name}`).run();
  db.pragma('foreign_keys = ON');
}
function proofPdf(ref, amount) {
  return new Promise((resolve) => {
  const PDFDocument = require('pdfkit'), doc = new PDFDocument({ size: [300, 380], margin: 24 }), chunks = [];
  doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.fontSize(15).text('COMPROBANTE DE TRANSFERENCIA', { align: 'center' }).moveDown(0.4).fontSize(9).fillColor('#666').text('(documento de demostración generado por el seed)', { align: 'center' }).moveDown();
  doc.fillColor('#000').fontSize(11).text('Banco: Banco Pichincha').text('Referencia: ' + ref).text('Fecha: ' + today()).text('Monto: USD ' + amount).text('Estado: EXITOSA').moveDown().text('Beneficiario: Cooperativa Andina Express').text('Cuenta: Ahorros 2200123456');
  doc.end();
  });
}

async function run({ force = false } = {}) {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n && !force) return console.log('La base ya tiene datos. Usa --reset para recargar.');
  if (force) wipe();
  let proofJob = null;
  const T = today(), ins = (sql, ...p) => db.prepare(sql).run(...p).lastInsertRowid;

  db.transaction(() => {
    /* ---- Geografía ---- */
    const prov = {}, city = {}, term = {};
    const geo = {
      Pichincha: { Quito: ['Terminal Terrestre Quitumbe', 'Terminal Terrestre Carcelén'] }, Guayas: { Guayaquil: ['Terminal Terrestre Jaime Roldós'] }, Azuay: { Cuenca: ['Terminal Terrestre Cuenca'] },
      Tungurahua: { Ambato: ['Terminal Terrestre Ambato'], 'Baños de Agua Santa': ['Terminal Terrestre Baños'] }, Chimborazo: { Riobamba: ['Terminal Terrestre Riobamba'] }, Cotopaxi: { Latacunga: ['Terminal Terrestre Latacunga'] },
      Loja: { Loja: ['Terminal Terrestre Reina del Cisne'] }, Manabí: { Manta: ['Terminal Terrestre Manta'], Portoviejo: ['Terminal Terrestre Portoviejo'] }, Esmeraldas: { Esmeraldas: ['Terminal Terrestre Esmeraldas'] },
      Imbabura: { Ibarra: ['Terminal Terrestre Ibarra'] }, 'Santo Domingo de los Tsáchilas': { 'Santo Domingo': ['Terminal Terrestre Santo Domingo'] }, 'El Oro': { Machala: ['Terminal Terrestre Machala'] },
    };
    for (const [p, cs] of Object.entries(geo)) {
      prov[p] = ins('INSERT INTO provinces(name) VALUES(?)', p);
      for (const [c, ts] of Object.entries(cs)) { city[c] = ins('INSERT INTO cities(province_id,name) VALUES(?,?)', prov[p], c); for (const t of ts) term[t] = ins('INSERT INTO terminals(city_id,name,address) VALUES(?,?,?)', city[c], t, c + ', Ecuador'); }
    }
    const TQ = term['Terminal Terrestre Quitumbe'], TL = term['Terminal Terrestre Latacunga'], TA = term['Terminal Terrestre Ambato'], TR = term['Terminal Terrestre Riobamba'], TC = term['Terminal Terrestre Cuenca'],
      TG = term['Terminal Terrestre Jaime Roldós'], TSD = term['Terminal Terrestre Santo Domingo'], TP = term['Terminal Terrestre Portoviejo'], TM = term['Terminal Terrestre Manta'], TMA = term['Terminal Terrestre Machala'], TCAR = term['Terminal Terrestre Carcelén'], TIB = term['Terminal Terrestre Ibarra'];

    ins("INSERT INTO season_rules(coop_id,name,start_date,end_date,pct,active) VALUES(NULL,?,?,?,10,1)", 'Feriado de demostración (+10%)', addDays(T, 6), addDays(T, 9));

    /* ---- Usuarios globales y clientes ---- */
    const user = (email, nombres, apellidos, role, extra = {}) => ins('INSERT INTO users(email,cedula,nombres,apellidos,phone,password_hash,role,coop_id,office_id,license,license_expires,perm_void) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      email, extra.cedula || newCedula(), nombres, apellidos, extra.phone || '09' + String(Math.floor(rnd() * 1e8)).padStart(8, '0'), hash, role, extra.coop || null, extra.office || null, extra.license || null, extra.licExp || null, extra.void ? 1 : 0);
    user('admin@rutaec.test', 'Administrador', 'General RutaEC', 'SUPERADMIN');
    user('auditor@rutaec.test', 'Alexandra', 'Auditora Pérez', 'AUDITOR');
    const clients = [
      user('cliente@rutaec.test', 'María Fernanda', 'Cárdenas Mora', 'CLIENT'), user('cliente2@rutaec.test', 'Juan Carlos', 'Villacís Pérez', 'CLIENT'),
      user('cliente3@rutaec.test', 'Ana Lucía', 'Jaramillo Ortiz', 'CLIENT'), user('cliente4@rutaec.test', 'Diego Armando', 'Pazmiño Ruiz', 'CLIENT'),
    ];

    // Viajeros de relleno para las ventas históricas (los 4 clientes de demostración quedan "limpios")
    const filler = Array.from({ length: 30 }, (_, i) => user(`viajero${String(i + 1).padStart(2, '0')}@rutaec.test`, pick(NOMBRES), pick(APELLIDOS), 'CLIENT'));

    /* ---- Cooperativas ---- */
    const COOPS = [
      { key: 'andina', name: 'Cooperativa de Transportes Andina Express', short: 'Andina Express', ruc: '1790012345001', color: '#134074', phone: '02 380 1000', city: 'Quito', office: 'Oficina Terminal Quitumbe', officeT: TQ, office2: 'Oficina Terminal Cuenca', office2T: TC, bank: ['Banco Pichincha', 'Ahorros', '2200123456', 'Cooperativa Andina Express', '1790012345001'], bank2: ['Banco del Pacífico', 'Corriente', '7456123', 'Cooperativa Andina Express', '1790012345001'], nbuses: 7, plates: 'PBA', tpl: 'doble' },
      { key: 'costaazul', name: 'Compañía de Transportes Costa Azul', short: 'Costa Azul', ruc: '1391234567001', color: '#0A7E8C', phone: '05 262 4000', city: 'Manta', office: 'Oficina Terminal Quitumbe', officeT: TQ, office2: 'Oficina Terminal Manta', office2T: TM, bank: ['Banco Guayaquil', 'Ahorros', '0034567812', 'Costa Azul Transportes S.A.', '1391234567001'], bank2: ['Produbanco', 'Ahorros', '12034567890', 'Costa Azul Transportes S.A.', '1391234567001'], nbuses: 5, plates: 'MBA', tpl: 'simple' },
      { key: 'sierraverde', name: 'Cooperativa de Transportes Sierra Verde', short: 'Sierra Verde', ruc: '0190456789001', color: '#2E7D32', phone: '07 410 2000', city: 'Cuenca', office: 'Oficina Terminal Guayaquil', officeT: TG, office2: 'Oficina Terminal Cuenca', office2T: TC, bank: ['Banco del Austro', 'Ahorros', '1203456789', 'Cooperativa Sierra Verde', '0190456789001'], bank2: ['Banco Pichincha', 'Corriente', '3100456789', 'Cooperativa Sierra Verde', '0190456789001'], nbuses: 5, plates: 'ABC', tpl: 'simple' },
    ];
    const FREQS = {
      andina: [
        // [origen, destino, hora, duración, paradas [terminal, min, km], tarifa completa]
        [TQ, TC, '07:00', 540, [[TQ, 0, 0], [TL, 90, 90], [TA, 150, 135], [TR, 210, 190], [TC, 540, 450]], 1300], [TQ, TC, '13:00', 540, [[TQ, 0, 0], [TL, 90, 90], [TA, 150, 135], [TR, 210, 190], [TC, 540, 450]], 1300], [TQ, TC, '21:00', 540, [[TQ, 0, 0], [TL, 90, 90], [TA, 150, 135], [TR, 210, 190], [TC, 540, 450]], 1400],
        [TC, TQ, '07:00', 540, [[TC, 0, 0], [TR, 330, 260], [TA, 390, 315], [TL, 450, 360], [TQ, 540, 450]], 1300], [TC, TQ, '13:00', 540, [[TC, 0, 0], [TR, 330, 260], [TA, 390, 315], [TL, 450, 360], [TQ, 540, 450]], 1300], [TC, TQ, '21:00', 540, [[TC, 0, 0], [TR, 330, 260], [TA, 390, 315], [TL, 450, 360], [TQ, 540, 450]], 1400],
      ],
      costaazul: [
        [TQ, TM, '08:00', 480, [[TQ, 0, 0], [TSD, 150, 130], [TP, 400, 340], [TM, 480, 400]], 1100], [TQ, TM, '20:30', 480, [[TQ, 0, 0], [TSD, 150, 130], [TP, 400, 340], [TM, 480, 400]], 1200],
        [TM, TQ, '08:00', 480, [[TM, 0, 0], [TP, 80, 60], [TSD, 330, 270], [TQ, 480, 400]], 1100], [TM, TQ, '20:30', 480, [[TM, 0, 0], [TP, 80, 60], [TSD, 330, 270], [TQ, 480, 400]], 1200],
        [TCAR, TIB, '09:30', 150, [[TCAR, 0, 0], [TIB, 150, 115]], 400],
      ],
      sierraverde: [
        [TG, TC, '06:30', 240, [[TG, 0, 0], [TC, 240, 200]], 800], [TG, TC, '14:00', 240, [[TG, 0, 0], [TC, 240, 200]], 800],
        [TC, TG, '06:30', 240, [[TC, 0, 0], [TG, 240, 200]], 800], [TC, TG, '14:00', 240, [[TC, 0, 0], [TG, 240, 200]], 800],
        [TG, TMA, '09:00', 180, [[TG, 0, 0], [TMA, 180, 190]], 550],
      ],
    };
    const AMEN = [['Aire acondicionado', 'WiFi', 'Baño', 'Pantallas'], ['Aire acondicionado', 'Baño', 'Cargadores USB'], ['Baño', 'Música', 'Cargadores USB']];
    const CH = ['Hino', 'Mercedes-Benz', 'Volvo', 'Scania', 'Volkswagen'], BO = ['Busscar', 'Marcopolo', 'Varma', 'Picasso', 'Metrobus'];
    const ctx = {};

    for (const C of COOPS) {
      const cid = ins('INSERT INTO cooperatives(ruc,name,short_name,color,phone,email,address) VALUES(?,?,?,?,?,?,?)', C.ruc, C.name, C.short, C.color, C.phone, `info@${C.key}.test`, C.city + ', Ecuador');
      ins('INSERT INTO bank_accounts(coop_id,bank,type,number,holder,holder_id) VALUES(?,?,?,?,?,?)', cid, ...C.bank);
      ins('INSERT INTO bank_accounts(coop_id,bank,type,number,holder,holder_id) VALUES(?,?,?,?,?,?)', cid, ...C.bank2);
      const off1 = ins('INSERT INTO offices(coop_id,terminal_id,name,printer_width,auto_print) VALUES(?,?,?,80,1)', cid, C.officeT, C.office);
      const off2 = ins('INSERT INTO offices(coop_id,terminal_id,name,printer_width,auto_print) VALUES(?,?,?,58,0)', cid, C.office2T, C.office2);
      const stN = ins('INSERT INTO seat_types(coop_id,name,factor_pct,description) VALUES(?,?,100,?)', cid, 'Normal', 'Asiento estándar');
      ins('INSERT INTO seat_types(coop_id,name,factor_pct,description) VALUES(?,?,130,?)', cid, 'VIP', 'Mayor espacio, reclinable completo');
      ins('INSERT INTO seat_types(coop_id,name,factor_pct,description) VALUES(?,?,110,?)', cid, 'Piso superior', 'Vista panorámica');
      const gen = C.tpl === 'doble' ? { floors: 2, rows: 7, cols: 4, aisle: 2, vip_rows: 2 } : { floors: 1, rows: 10, cols: 4, aisle: 2, vip_rows: 2 };
      const layout = genLayout(gen);
      const tplId = ins('INSERT INTO seat_templates(coop_id,name,floors,rows,cols,layout) VALUES(?,?,?,?,?,?)', cid, C.tpl === 'doble' ? 'Doble piso 56 asientos' : 'Un piso 40 asientos', gen.floors, gen.rows, gen.cols + 1, JSON.stringify(layout));
      const grp = ins('INSERT INTO bus_groups(coop_id,name,description) VALUES(?,?,?)', cid, 'Flota principal', 'Unidades que rotan en la hoja de ruta');
      const buses = [];
      for (let i = 1; i <= C.nbuses; i++) {
        const bid = ins('INSERT INTO buses(coop_id,group_id,number,plate,color,year,chassis_brand,body_brand,model,floors,amenities,status,tech_review_expires,registration_expires,template_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          cid, grp, String(i), `${C.plates}-${String(1000 + i * 37 + cid * 100).slice(-4)}`, pick(['Blanco', 'Azul', 'Verde', 'Plateado']), 2016 + (i % 8), pick(CH), pick(BO), 'Interprovincial ' + (2016 + (i % 8)), gen.floors, JSON.stringify(AMEN[i % 3]), 'ACTIVO', addDays(T, i === 3 ? 15 : 200 + i * 10), addDays(T, 300), tplId);
        syncSeats({ id: bid, coop_id: cid }, layout);
        buses.push({ id: bid, number: String(i) });
      }
      // Personal
      const staff = { drivers: [], assistants: [] };
      const mk = (email, nom, ape, role, extra) => user(email, nom, ape, role, { coop: cid, ...extra });
      mk(`gerente.${C.key}@rutaec.test`, 'Gerente', C.short, 'COOP_ADMIN');
      mk(`oficina.${C.key}@rutaec.test`, pick(NOMBRES), pick(APELLIDOS), 'OFFICE', { office: off1, void: true });
      mk(`oficina2.${C.key}@rutaec.test`, pick(NOMBRES), pick(APELLIDOS), 'OFFICE', { office: off2 });
      for (let i = 1; i <= C.nbuses; i++) {
        staff.drivers.push({ id: mk(`chofer${i}.${C.key}@rutaec.test`, pick(NOMBRES), pick(APELLIDOS), 'DRIVER', { license: 'E' + (1000000 + i * 1111 + cid), licExp: addDays(T, i === 2 ? 20 : 400) }) });
        staff.assistants.push({ id: mk(`ayudante${i}.${C.key}@rutaec.test`, pick(NOMBRES), pick(APELLIDOS), 'ASSISTANT') });
      }
      // Frecuencias + tarifas
      const fids = [];
      for (const [o, d, hh, dur, stops, full] of FREQS[C.key]) {
        const kind = stops.length > 2 ? 'CON_PARADAS' : 'DIRECTA';
        const fid = ins('INSERT INTO frequencies(coop_id,origin_terminal_id,dest_terminal_id,depart_time,duration_min,kind,resolution_number,resolution_date,days,active) VALUES(?,?,?,?,?,?,?,?,?,1)', cid, o, d, hh, dur, kind, 'ANT-' + (2020 + fids.length) + '-' + (100 + fids.length), '2023-03-15', '1111111');
        const st = stops.map((s, i) => ({ ord: i, terminal_id: s[0], minutes: s[1], km: s[2] }));
        st.forEach(s => ins('INSERT INTO frequency_stops(frequency_id,ord,terminal_id,minutes,km) VALUES(?,?,?,?,?)', fid, s.ord, s.terminal_id, s.minutes, s.km));
        autoFares(st, full).forEach(f => ins('INSERT INTO fares(frequency_id,from_ord,to_ord,price_cents) VALUES(?,?,?,?)', fid, f.from_ord, f.to_ord, f.price_cents));
        fids.push({ id: fid, depart_time: hh, days: '1111111', duration_min: dur });
      }
      // Hoja de ruta (rotación) de hace 3 días a 14 días y viajes
      const start = addDays(T, -14), end = addDays(T, 14);
      const rot = generateRotation({ buses, frequencies: fids, start, end, drivers: staff.drivers, assistants: staff.assistants });
      const sid = ins("INSERT INTO route_sheets(coop_id,group_id,start_date,end_date,mode,status,created_at) VALUES(?,?,?,?,'AUTO','PUBLICADA',?)", cid, grp, start, end, nowLocal());
      for (const e of rot.entries) {
        ins('INSERT INTO route_sheet_entries(sheet_id,date,slot,frequency_id,bus_id,driver_id,assistant_id) VALUES(?,?,?,?,?,?,?)', sid, e.date, e.slot, e.frequency_id, e.bus_id, e.driver_id, e.assistant_id);
        if (!e.frequency_id) continue;
        const f = fids.find(x => x.id === e.frequency_id);
        ins('INSERT INTO trips(frequency_id,bus_id,date,depart_at,driver_id,assistant_id,platform,status,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)', e.frequency_id, e.bus_id, e.date, `${e.date} ${f.depart_time}:00`, e.driver_id, e.assistant_id, String(1 + (e.slot % 12)),
          'PROGRAMADO', null, null);
      }
      ctx[C.key] = { cid, off1, off2, staff };
    }

    /* ---- Ventas de demostración ---- */
    const officeUser = (key, n = 1) => db.prepare('SELECT * FROM users WHERE email=?').get(`oficina${n === 2 ? '2' : ''}.${key}@rutaec.test`);
    const sessions = {};
    for (const C of COOPS) { const u = officeUser(C.key); sessions[C.key] = ins('INSERT INTO cash_sessions(user_id,office_id,opened_at,opening_cents) VALUES(?,?,?,5000)', u.id, u.office_id, `${T} 06:00:00`); }

    function mkPaid({ tripId, from, to, seatIds, key, buyer = null, channel = 'OFICINA', method = 'EFECTIVO', when = null }) {
      const trip = core.getTrip(tripId), ou = officeUser(key);
      const passengers = seatIds.map(sid => { const n = pick(NOMBRES), a = pick(APELLIDOS), r = rnd(); return { seatId: sid, cedula: newCedula(), nombres: n, apellidos: a, email: `${asc(n.split(' ')[0])}.${asc(a.split(' ')[0])}${cedN}@example.com`, phone: '09' + String(Math.floor(rnd() * 1e8)).padStart(8, '0'), category: r < 0.8 ? 'ADULTO' : r < 0.88 ? 'MENOR' : r < 0.96 ? 'TERCERA_EDAD' : 'DISCAPACIDAD' }; });
      if (buyer && channel === 'WEB' && !db.prepare("SELECT 1 FROM tickets t JOIN passengers p ON p.id=t.passenger_id WHERE t.trip_id=? AND p.cedula=? AND t.status IN ('RESERVADO','VALIDO','ABORDADO','BAJO')").get(tripId, db.prepare('SELECT cedula FROM users WHERE id=?').get(buyer).cedula)) { const u = db.prepare('SELECT * FROM users WHERE id=?').get(buyer); passengers[0] = { ...passengers[0], cedula: u.cedula, nombres: u.nombres, apellidos: u.apellidos, email: u.email, phone: u.phone, category: 'ADULTO' }; }
      const oid = core.createOrder({ tripId, from, to, passengers, buyerId: buyer, channel: channel === 'WEB' ? 'OFICINA' : channel, officeId: channel === 'WEB' ? null : ou.office_id, sellerId: channel === 'WEB' ? null : ou.id, expiresMinutes: 5, allowStarted: true });
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(oid);
      ins("INSERT INTO payments(order_id,method,amount_cents,status,bank,reference,reviewed_by,reviewed_at,created_at) VALUES(?,?,?,'APROBADO',?,?,?,?,?)", oid, method, o.total_cents, method === 'EFECTIVO' ? null : 'Banco Pichincha', method === 'EFECTIVO' ? null : String(100000 + Math.floor(rnd() * 899999)), ou.id, nowLocal(), nowLocal());
      core.issueTickets(oid, ou.id, method);
      if (channel === 'WEB') db.prepare("UPDATE orders SET channel='WEB', office_id=NULL, seller_id=NULL WHERE id=?").run(oid);
      const past = trip.date < T;
      // Fecha de la venta repartida en los días previos (reportes con historia) — nunca después de ahora
      const baseDay = past ? trip.date : T, day = addDays(baseDay, -Math.floor(rnd() * 5));
      const stamp = when || (day === T ? addMinutes(nowLocal(), -(10 + Math.floor(rnd() * 400))) : `${day} ${String(7 + Math.floor(rnd() * 12)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`);
      db.prepare('UPDATE orders SET created_at=?, paid_at=? WHERE id=?').run(stamp, stamp, oid);
      db.prepare('UPDATE tickets SET created_at=? WHERE order_id=?').run(stamp, oid);
      if (method === 'EFECTIVO' && stamp.slice(0, 10) === T && channel !== 'WEB') db.prepare('UPDATE orders SET cash_session_id=? WHERE id=?').run(sessions[key], oid);
      if (past) {
        for (const t of db.prepare('SELECT id FROM tickets WHERE order_id=?').all(oid)) {
          const r = rnd(), st = r < 0.9 ? 'BAJO' : 'VALIDO';
          db.prepare('UPDATE tickets SET status=?, boarded_at=?, alighted_at=? WHERE id=?').run(st, st === 'VALIDO' ? null : trip.depart_at, st === 'BAJO' ? addMinutes(trip.depart_at, trip.stops[trip.stops.length - 1].minutes) : null, t.id);
        }
      }
      return oid;
    }
    const freeSeats = (tripId, a, b, n) => core.seatMap(tripId, a, b).seats.filter(s => s.status === 'libre').sort(() => rnd() - 0.5).slice(0, n).map(s => s.id);
    const tripsOf = (cid) => db.prepare('SELECT t.id, t.date, t.frequency_id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? ORDER BY t.date, t.depart_at').all(cid);
    for (const C of COOPS) {
      const { cid } = ctx[C.key];
      for (const t of tripsOf(cid)) {
        const stops = core.getTrip(t.id).stops, last = stops.length - 1;
        const occ = t.date < T ? 0.35 + rnd() * 0.45 : t.date <= addDays(T, 3) ? 0.15 + rnd() * 0.45 : rnd() * 0.2;
        const cap = db.prepare('SELECT capacity FROM buses b JOIN trips x ON x.bus_id=b.id WHERE x.id=?').get(t.id).capacity;
        let left = Math.floor(cap * occ);
        while (left > 0) {
          const n = Math.min(left, 1 + Math.floor(rnd() * 3));
          const a = stops.length > 2 && rnd() < 0.3 ? Math.floor(rnd() * (last - 1)) : 0, b = stops.length > 2 && rnd() < 0.3 ? a + 1 + Math.floor(rnd() * (last - a)) : last;
          const seats = freeSeats(t.id, a, b, n); if (!seats.length) break;
          const webby = rnd() < 0.45, buyer = webby ? filler[Math.floor(rnd() * filler.length)] : null;
          try { mkPaid({ tripId: t.id, from: a, to: b, seatIds: seats, key: C.key, buyer, channel: webby ? 'WEB' : 'OFICINA', method: webby ? pick(['TRANSFERENCIA', 'DEPOSITO']) : 'EFECTIVO' }); } catch (e) { if (!/ya tiene|misma/.test(e.message)) throw e; }
          left -= seats.length;
        }
      }
    }

    // Casos concretos para probar flujos: mañana, ruta Quito → Cuenca 07:00 (Andina)
    const A = ctx.andina, tomorrow = addDays(T, 1);
    const tripA = db.prepare("SELECT t.id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date=? AND f.depart_time='13:00' AND f.origin_terminal_id=?").get(A.cid, tomorrow, TQ);
    if (tripA) {
      const mkOrder = (buyer, n, a, b) => {
        const u = db.prepare('SELECT * FROM users WHERE id=?').get(buyer), seats = freeSeats(tripA.id, a, b, n);
        const ps = seats.map((sid, i) => i === 0 ? { seatId: sid, cedula: newCedula(), nombres: u.nombres, apellidos: u.apellidos, email: u.email, phone: u.phone, category: 'ADULTO' } : { seatId: sid, cedula: newCedula(), nombres: pick(NOMBRES), apellidos: pick(APELLIDOS), email: u.email, category: i === 1 ? 'MENOR' : 'ADULTO' });
        return core.createOrder({ tripId: tripA.id, from: a, to: b, passengers: ps, buyerId: buyer, channel: 'WEB', expiresMinutes: 60 });
      };
      // 1) Comprobante en revisión (el oficinista debe aprobar/rechazar)
      const o1 = mkOrder(clients[1], 2, 0, 3), ord1 = db.prepare('SELECT * FROM orders WHERE id=?').get(o1);
      const pf = 'seed-proof-' + randCode(6) + '.pdf'; fs.mkdirSync(path.join(UPLOADS, 'private'), { recursive: true }); proofJob = { pf, ref: 'DEMO-778812', amount: (ord1.total_cents / 100).toFixed(2) };
      ins("INSERT INTO payments(order_id,method,amount_cents,status,bank,reference,paid_date,proof_file,proof_hash,created_at) VALUES(?,'TRANSFERENCIA',?,'EN_REVISION','Banco Pichincha','DEMO-778812',?,?,?,?)", o1, ord1.total_cents, T, pf, 'seedhash-' + o1, nowLocal());
      db.prepare("UPDATE orders SET status='EN_REVISION', method='TRANSFERENCIA', expires_at=NULL WHERE id=?").run(o1);
      // 2) Reserva para pagar en efectivo en oficina (con código R…)
      const o2 = mkOrder(clients[2], 1, 0, 2);
      db.prepare("UPDATE orders SET method='EFECTIVO', expires_at=? WHERE id=?").run(addMinutes(nowLocal(), 55), o2);
      ins("INSERT INTO payments(order_id,method,amount_cents,status,created_at) VALUES(?,'EFECTIVO',(SELECT total_cents FROM orders WHERE id=?),'PENDIENTE',?)", o2, o2, nowLocal());
      // 3) Boleto pagado del cliente demo
      mkPaid({ tripId: tripA.id, from: 0, to: 4, seatIds: freeSeats(tripA.id, 0, 4, 1), key: 'andina', buyer: clients[0], channel: 'WEB', method: 'TRANSFERENCIA' });
    }
    // Boletos del cliente demo también en un viaje de hoy o pasado para probar "Mis boletos" y el escáner
    const todayTrip = db.prepare("SELECT t.id FROM trips t JOIN frequencies f ON f.id=t.frequency_id WHERE f.coop_id=? AND t.date=? ORDER BY t.depart_at DESC LIMIT 1").get(A.cid, T);
    if (todayTrip) mkPaid({ tripId: todayTrip.id, from: 0, to: core.getTrip(todayTrip.id).stops.length - 1, seatIds: freeSeats(todayTrip.id, 0, core.getTrip(todayTrip.id).stops.length - 1, 1), key: 'andina', buyer: clients[0], channel: 'WEB', method: 'TRANSFERENCIA' });

    // Los viajes de días pasados se cierran una vez cargadas sus ventas históricas
    db.prepare(`UPDATE trips SET status='FINALIZADO', started_at=depart_at, finished_at=datetime(depart_at, '+' || (SELECT duration_min FROM frequencies f WHERE f.id=trips.frequency_id) || ' minutes') WHERE date < ?`).run(T);
    // Calificaciones, incidencias y avisos
    const past = db.prepare("SELECT id FROM trips WHERE status='FINALIZADO' ORDER BY id LIMIT 12").all();
    past.forEach((t, i) => ins('INSERT OR IGNORE INTO ratings(trip_id,user_id,stars,comment,created_at) VALUES(?,?,?,?,?)', t.id, clients[i % clients.length], 3 + (i % 3), pick(['Puntual y cómodo', 'Buen servicio', 'El bus salió con retraso pero el trato fue excelente', 'Todo bien']), nowLocal()));
    if (past[0]) ins("INSERT INTO incidents(trip_id,user_id,kind,detail,created_at) VALUES(?,?,?,?,?)", past[0].id, null, 'RETRASO', 'Tráfico en la vía por derrumbe, 25 minutos de demora', nowLocal());
    ins("INSERT INTO notifications(user_id,title,body,link,created_at) VALUES(?,?,?,?,?)", clients[0], 'Bienvenido a RutaEC', 'Tu cuenta de demostración está lista. Busca un viaje y prueba el flujo completo de compra.', '#/', nowLocal());
    // Caja de ayer cerrada (ejemplo para el historial)
    const ou = officeUser('andina');
    ins('INSERT INTO cash_sessions(user_id,office_id,opened_at,closed_at,opening_cents,expected_cents,counted_cents,note) VALUES(?,?,?,?,5000,12500,12500,?)', ou.id, ou.office_id, `${addDays(T, -1)} 06:00:00`, `${addDays(T, -1)} 18:00:00`, 'Cierre sin novedades');
  })();

  if (proofJob) fs.writeFileSync(path.join(UPLOADS, 'private', proofJob.pf), await proofPdf(proofJob.ref, proofJob.amount));
  S.set('site_name', 'RutaEC');
  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`Seed listo: ${c('cooperatives')} cooperativas, ${c('buses')} buses, ${c('frequencies')} frecuencias, ${c('trips')} viajes, ${c('orders')} órdenes, ${c('tickets')} boletos, ${c('users')} usuarios.`);
  console.log(`Contraseña de todas las cuentas de demostración: ${PASS}`);
}
module.exports = { run, PASS };
if (require.main === module) { run({ force: process.argv.includes('--reset') }).catch((e) => { console.error(e); process.exit(1); }); }
