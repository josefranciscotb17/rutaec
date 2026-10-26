/**
 * Datos de demostración de RutaEC (Ecuador). Uso: `npm run seed` (agrega si la BD está vacía) o `npm run db:reset` (borra y recarga).
 * Todas las cuentas usan la contraseña Demo1234!  Cédulas, placas y RUC son ficticios pero con formato válido.
 */
const bcrypt = require('bcryptjs');
const fs = require('fs'), path = require('path');
const { db, UPLOADS } = require('./db');
const S = require('./lib/settings');
const { today, addDays, makeCedula } = require('./lib/util');

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
  })();

  if (proofJob) fs.writeFileSync(path.join(UPLOADS, 'private', proofJob.pf), await proofPdf(proofJob.ref, proofJob.amount));
  S.set('site_name', 'RutaEC');
  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`Seed listo: ${c('cooperatives')} cooperativas, ${c('buses')} buses, ${c('frequencies')} frecuencias, ${c('trips')} viajes, ${c('orders')} órdenes, ${c('tickets')} boletos, ${c('users')} usuarios.`);
  console.log(`Contraseña de todas las cuentas de demostración: ${PASS}`);
}
module.exports = { run, PASS };
if (require.main === module) { run({ force: process.argv.includes('--reset') }).catch((e) => { console.error(e); process.exit(1); }); }
