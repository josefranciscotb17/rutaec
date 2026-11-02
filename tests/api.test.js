const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, stop, api, login, db, util } = require('./helpers');

test.before(boot);
test.after(stop);

test('configuración pública y catálogo', async () => {
  const c = await api('GET', '/api/config'); assert.equal(c.status, 200); assert.equal(c.data.site_name, 'RutaEC');
  const cat = await api('GET', '/api/catalog'); assert.ok(cat.data.cities.length >= 10); assert.ok(cat.data.coops.length === 3);
});

test('login: credenciales incorrectas y bloqueo', async () => {
  const bad = await api('POST', '/api/auth/login', { body: { email: 'cliente4@rutaec.test', password: 'mala' } });
  assert.equal(bad.status, 401);
  for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login', { body: { email: 'cliente3@rutaec.test', password: 'x' + i } });
  const locked = await api('POST', '/api/auth/login', { body: { email: 'cliente3@rutaec.test', password: 'Demo1234!' } });
  assert.equal(locked.status, 423);
});

test('registro valida cédula ecuatoriana', async () => {
  const r = await api('POST', '/api/auth/register', { body: { email: 'nuevo@ejemplo.com', password: 'Clave1234', cedula: '1234567890', nombres: 'A', apellidos: 'B', accept: true } });
  assert.equal(r.status, 400);
  const ok = await api('POST', '/api/auth/register', { body: { email: 'nuevo@ejemplo.com', password: 'Clave1234', cedula: util.makeCedula('171234567'), nombres: 'Nuevo', apellidos: 'Usuario', accept: true } });
  assert.equal(ok.status, 201); assert.ok(ok.data.token);
});

let flow = {};
test('flujo completo: buscar → reservar → comprobante → aprobar → boleto → QR → escaneo', async () => {
  const cat = (await api('GET', '/api/catalog')).data, id = (n) => cat.cities.find(c => c.name === n).id;
  const date = util.addDays(util.today(), 2);
  const s = await api('GET', `/api/search?origin=${id('Quito')}&dest=${id('Ambato')}&date=${date}`);
  assert.equal(s.status, 200); assert.ok(s.data.length >= 3, 'hay viajes Quito → Ambato');
  const card = s.data.find(x => x.free_seats >= 3);
  const seats = (await api('GET', `/api/trips/${card.trip_id}/seats?from=${card.from_ord}&to=${card.to_ord}`)).data.seats.filter(x => x.status === 'libre').slice(0, 2);
  const tok = await login('cliente@rutaec.test');
  const mk = (seat, i) => ({ seatId: seat.id, cedula: util.makeCedula('1720' + (30000 + i * 7 + Date.now() % 1000).toString().slice(0, 5)), nombres: 'Pasajero', apellidos: 'Prueba' + i, email: `p${i}@example.com`, category: i ? 'MENOR' : 'ADULTO' });
  const o = await api('POST', '/api/orders', { token: tok, body: { tripId: card.trip_id, from: card.from_ord, to: card.to_ord, passengers: seats.map(mk) } });
  assert.equal(o.status, 201, JSON.stringify(o.data)); assert.equal(o.data.status, 'RESERVADO');
  const minor = o.data.tickets.find(t => t.category === 'MENOR'), adult = o.data.tickets.find(t => t.category === 'ADULTO');
  assert.ok(minor.total_cents < adult.total_cents, 'el menor paga menos (descuento sobre la tarifa)');
  // los asientos ya no están libres
  const again = await api('POST', '/api/orders', { token: await login('cliente2@rutaec.test'), body: { tripId: card.trip_id, from: card.from_ord, to: card.to_ord, passengers: [mk(seats[0], 9)] } });
  assert.equal(again.status, 409);
  await api('POST', `/api/orders/${o.data.id}/pay`, { token: tok, body: { method: 'TRANSFERENCIA' } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'c.png'); fd.append('reference', 'REF-' + Date.now()); fd.append('amount', (o.data.total_cents / 100).toFixed(2)); fd.append('bank', 'Banco Pichincha'); fd.append('paid_date', util.today());
  const pr = await api('POST', `/api/orders/${o.data.id}/proof`, { token: tok, form: fd });
  assert.equal(pr.status, 200, JSON.stringify(pr.data)); assert.equal(pr.data.status, 'EN_REVISION');
  // el cliente aún no tiene boleto emitido
  assert.equal((await api('GET', `/api/tickets/${o.data.tickets[0].id}/pdf`, { token: tok })).status, 409);
  const off = await login('oficina.andina@rutaec.test');
  const pend = await api('GET', '/api/office/payments', { token: off });
  const pay = pend.data.find(p => p.order_id === o.data.id); assert.ok(pay, 'el pago aparece en revisión');
  const ap = await api('POST', `/api/office/payments/${pay.id}/approve`, { token: off }); assert.equal(ap.status, 200, JSON.stringify(ap.data));
  const mine = (await api('GET', '/api/tickets/mine', { token: tok })).data;
  const t = mine.find(x => x.order_id === o.data.id || x.id === o.data.tickets[0].id); assert.ok(t); assert.equal(t.status, 'VALIDO'); assert.ok(t.number);
  const png2 = await api('GET', `/api/tickets/${t.id}/qr.png`, { token: tok, raw: true }); assert.equal(png2.headers.get('content-type'), 'image/png');
  const pdf = await api('GET', `/api/tickets/${t.id}/pdf`, { token: tok, raw: true }); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).slice(0, 4).toString(), '%PDF');
  const html = await api('GET', `/api/tickets/${t.id}/print?w=80`, { token: off }); assert.equal(html.status, 200); assert.match(html.data, /<img/);
  assert.equal((await api('GET', `/api/tickets/${t.id}/print`, { token: tok })).status, 403, 'el cliente no imprime por la ruta de oficina');
  // QR público
  const row = db.prepare('SELECT public_id||qr_tag AS code FROM tickets WHERE id=?').get(t.id);
  const v = await api('GET', `/api/verify/${row.code}`); assert.equal(v.data.valid, true);
  const page = await api('GET', `/v/${row.code}`); assert.match(page.data, /BOLETO VÁLIDO/);
  assert.equal((await api('GET', `/api/verify/${row.code.slice(0, 33)}X`)).data.valid, false, 'QR alterado no valida');
  // chofer escanea: una sola vez
  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(card.trip_id), drv = db.prepare('SELECT email FROM users WHERE id=?').get(trip.driver_id);
  const dt = await login(drv.email);
  const s1 = await api('POST', '/api/driver/scan', { token: dt, body: { tripId: trip.id, code: `http://localhost/v/${row.code}` } }); assert.equal(s1.data.result, 'VALIDO');
  const s2 = await api('POST', '/api/driver/scan', { token: dt, body: { tripId: trip.id, code: row.code } }); assert.equal(s2.data.result, 'YA_USADO');
  const other = db.prepare("SELECT id FROM trips WHERE id<>? AND driver_id=? AND status='PROGRAMADO' LIMIT 1").get(trip.id, trip.driver_id);
  if (other) assert.equal((await api('POST', '/api/driver/scan', { token: dt, body: { tripId: other.id, code: row.code } })).data.result, 'OTRO_VIAJE');
  flow = { tok, off, tripId: trip.id, ticketId: t.id };
});

test('rechazo de comprobante devuelve la orden a RESERVADO con gracia', async () => {
  const off = await login('oficina.andina@rutaec.test');
  const list = (await api('GET', '/api/office/payments', { token: off })).data;
  assert.ok(list.length >= 1, 'el seed deja un comprobante en revisión');
  const r = await api('POST', `/api/office/payments/${list[0].id}/reject`, { token: off, body: { reason: 'Monto incorrecto' } });
  assert.equal(r.status, 200);
  const o = db.prepare('SELECT status, expires_at FROM orders WHERE id=?').get(list[0].order_id);
  assert.equal(o.status, 'RESERVADO'); assert.ok(o.expires_at);
});

test('permisos: cliente no accede a oficina, admin ni cooperativa; cooperativas aisladas', async () => {
  const c = await login('cliente2@rutaec.test');
  for (const u of ['/api/office/payments', '/api/coop/buses', '/api/admin/stats', '/api/driver/trips']) assert.equal((await api('GET', u, { token: c })).status, 403, u);
  assert.equal((await api('GET', '/api/orders/mine')).status, 401);
  const g1 = await login('gerente.andina@rutaec.test'), g2 = await login('gerente.costaazul@rutaec.test');
  const b1 = (await api('GET', '/api/coop/buses', { token: g1 })).data, b2 = (await api('GET', '/api/coop/buses', { token: g2 })).data;
  assert.ok(b1.length === 7 && b2.length === 5 && !b1.some(x => b2.find(y => y.id === x.id)));
  assert.equal((await api('PUT', `/api/coop/buses/${b1[0].id}`, { token: g2, body: { status: 'BAJO' } })).status, 404);
});

test('venta en oficina en efectivo exige caja abierta y cuadra el cierre', async () => {
  const off = await login('oficina2.sierraverde@rutaec.test');
  const date = util.addDays(util.today(), 3);
  const trips = (await api('GET', `/api/office/trips?date=${date}`, { token: off })).data; assert.ok(trips.length);
  const t = trips[0];
  const seat = (await api('GET', `/api/office/trips/${t.id}/seats?from=0&to=${t.stops.length - 1}`, { token: off })).data.seats.find(s => s.status === 'libre');
  const body = { tripId: t.id, from: 0, to: t.stops.length - 1, method: 'EFECTIVO', received_cents: 5000, passengers: [{ seatId: seat.id, cedula: util.makeCedula('171111111'), nombres: 'Cliente', apellidos: 'Mostrador', category: 'ADULTO' }] };
  const noCash = await api('POST', '/api/office/sale', { token: off, body });
  assert.equal(noCash.status, 409); assert.equal(noCash.data.code, 'CASH_CLOSED');
  assert.equal((await api('POST', '/api/office/cash/open', { token: off, body: { opening_cents: 2000 } })).status < 300, true);
  const sale = await api('POST', '/api/office/sale', { token: off, body }); assert.equal(sale.status, 201, JSON.stringify(sale.data)); assert.equal(sale.data.status, 'PAGADO');
  assert.equal(sale.data.change_cents, 5000 - sale.data.total_cents);
  const close = await api('POST', '/api/office/cash/close', { token: off, body: { counted_cents: 2000 + sale.data.total_cents } });
  assert.equal(close.status, 200, JSON.stringify(close.data));
});

test('cooperativa: crear frecuencia con tarifas, hoja de ruta con rotación y publicar', async () => {
  const g = await login('gerente.sierraverde@rutaec.test');
  const terms = (await api('GET', '/api/coop/terminals', { token: g })).data, tid = (n) => terms.find(t => t.city === n).id;
  const f = await api('POST', '/api/coop/frequencies', { token: g, body: { depart_time: '18:00', duration_min: 180, stops: [{ terminal_id: tid('Cuenca'), km: 0 }, { terminal_id: tid('Machala'), km: 160 }], auto_fare_cents: 600 } });
  assert.equal(f.status, 201, JSON.stringify(f.data)); assert.equal(f.data.fares.length, 1); assert.equal(f.data.fares[0].price_cents, 600);
  const group = (await api('GET', '/api/coop/bus-groups', { token: g })).data[0];
  const start = util.addDays(util.today(), 20), end = util.addDays(util.today(), 23);
  const pv = await api('POST', '/api/coop/route-sheets/preview', { token: g, body: { group_id: group.id, start_date: start, end_date: end } });
  assert.equal(pv.status, 200); assert.ok(pv.data.warnings.length >= 1, 'hay 6 frecuencias para 5 buses');
  const per = new Set(); pv.data.entries.filter(e => e.date === start).forEach(e => { assert.ok(!per.has(e.bus_id), 'un bus no repite posición el mismo día'); per.add(e.bus_id); });
  const sv = await api('POST', '/api/coop/route-sheets', { token: g, body: { group_id: group.id, start_date: start, end_date: end, entries: pv.data.entries } });
  assert.equal(sv.status, 201);
  const pub = await api('POST', `/api/coop/route-sheets/${sv.data.id}/publish`, { token: g, body: { force: true } });
  assert.equal(pub.status, 200, JSON.stringify(pub.data)); assert.ok(pub.data.created > 0);
});

test('reportes y administración', async () => {
  const g = await login('gerente.andina@rutaec.test');
  const r = await api('GET', '/api/coop/reports/sales', { token: g }); assert.equal(r.status, 200); assert.ok(r.data.totals.tickets > 0);
  const csv = await api('GET', '/api/coop/reports/sales?format=csv', { token: g }); assert.match(csv.data, /fecha;boletos/);
  const sa = await login('admin@rutaec.test');
  assert.equal((await api('GET', '/api/admin/stats', { token: sa })).status, 200);
  const bad = await api('PUT', '/api/admin/settings', { token: sa, body: { primary_color: 'rojo' } }); assert.equal(bad.status, 400);
  assert.equal((await api('PUT', '/api/admin/settings', { token: sa, body: { site_name: 'RutaEC', reserve_minutes: 5 } })).status, 200);
  const aud = await login('auditor@rutaec.test');
  assert.equal((await api('GET', '/api/admin/audit', { token: aud })).status, 200);
  assert.equal((await api('PUT', '/api/admin/settings', { token: aud, body: { reserve_minutes: 9 } })).status, 403);
});
