/* Oficinista: panel, punto de venta, validación de pagos, órdenes, caja y salidas */
'use strict';
const OFF = ['OFFICE', 'COOP_ADMIN'];
const pw = () => (App.user.office && App.user.office.printer_width) || 80;
const autoPrint = () => !App.user.office || App.user.office.auto_print;

route('/office', async () => {
  const d = await api('/office/dashboard'), trips = await api('/office/trips');
  paint(view(), html`<div class="row spread"><h1>Panel de oficina</h1><div class="row"><a class="btn acc lg" href="#/office/sell">🎟️ Vender boletos</a></div></div>
    <div class="grid g4 mb"><div class="card kpi"><span>Ventas de hoy</span><b>${money(d.sales_today.v)}</b><span>${d.sales_today.n} órdenes</span></div>
    <a class="card kpi" href="#/office/payments" style="color:inherit"><span>Pagos por validar</span><b style="${d.pending_payments ? 'color:var(--err)' : ''}">${d.pending_payments}</b><span>transferencias / depósitos</span></a>
    <a class="card kpi" href="#/office/orders?status=RESERVADO" style="color:inherit"><span>Reservas para cobrar</span><b>${d.cash_reservations}</b><span>pago en efectivo</span></a>
    <a class="card kpi" href="#/office/cash" style="color:inherit"><span>Caja</span><b>${d.session ? 'Abierta' : 'Cerrada'}</b><span>${d.session ? 'desde ' + ftime(d.session.opened_at) : 'Ábrela para cobrar en efectivo'}</span></a></div>
    <div class="card"><h2>Salidas de hoy</h2>${tripsTable(trips)}</div>`);
}, OFF);
function tripsTable(trips) {
  if (!trips.length) return empty('No hay salidas programadas para esta fecha.', '🚌');
  return tbl(['Hora', 'Ruta', 'Bus', 'Ocupación', 'Estado', ''], trips.map((t) => html`<tr><td><b>${ftime(t.depart_at)}</b></td><td>${t.origin} → ${t.dest} ${t.kind === 'CON_PARADAS' ? html`<span class="chip info">paradas</span>` : ''}</td><td>${t.bus_number} · ${t.plate}</td><td>${t.sold}/${t.capacity}</td><td>${chip(t.status)}</td>
    <td class="right nowrap"><a class="btn sm" href="#/office/sell?trip=${t.id}">Vender</a> <button class="btn sm sec" data-act="manifest" data-id="${t.id}">Manifiesto</button></td></tr>`));
}
App.A.manifest = (el) => openPrint(`/manifest/${el.dataset.id}`);
route('/office/trips', async (p, q) => {
  const date = q.date || todayStr(), trips = await api('/office/trips?date=' + date);
  paint(view(), html`<div class="row spread"><h1>Salidas y manifiestos</h1><input type="date" value="${date}" style="width:auto" data-change="tripsDate"></div><div class="card">${tripsTable(trips)}</div>`);
}, OFF);
App.A.tripsDate = (el) => go('/office/trips?date=' + el.value);

/* ---------- Punto de venta ---------- */
let POS = null;
route('/office/sell', async (p, q) => {
  POS = { date: q.date || todayStr(), trips: [], trip: null, from: 0, to: 0, seats: new Map(), all: [], session: await api('/office/cash/current'), done: null };
  if (q.trip) { await posLoadTrips(); const t = POS.trips.find((x) => String(x.id) === q.trip); if (t) await posPick(t.id); } else await posLoadTrips();
  posDraw();
}, OFF);
async function posLoadTrips() { POS.trips = await api('/office/trips?date=' + POS.date); }
function posDraw() {
  paint(view(), html`<div class="row spread mb"><h1>Venta de boletos</h1><div class="row"><span class="chip ${POS.session ? 'ok' : 'warn'}">${POS.session ? 'Caja abierta' : 'Caja cerrada'}</span><input type="date" value="${POS.date}" style="width:auto" data-change="posDate"></div></div>
    <div class="card mb"><div class="row" style="overflow-x:auto;flex-wrap:nowrap">${POS.trips.length ? POS.trips.map((t) => html`<button class="btn ${POS.trip && POS.trip.id === t.id ? '' : 'sec'}" style="flex:none;flex-direction:column;align-items:flex-start;line-height:1.2" data-act="posTrip" data-id="${t.id}"><b>${ftime(t.depart_at)}</b><span class="small">${t.origin}→${t.dest}</span><span class="small">${t.sold}/${t.capacity}</span></button>`) : html`<span class="muted">Sin salidas para esta fecha.</span>`}</div></div>
    <div id="posBody">${POS.trip ? '' : html`<div class="card">${empty('Selecciona una salida para vender.', '🎟️')}</div>`}</div>`);
  if (POS.trip) posBody();
}
App.A.posDate = async (el) => { POS.date = el.value; POS.trip = null; POS.seats.clear(); await posLoadTrips(); posDraw(); };
App.A.posTrip = async (el) => { await posPick(+el.dataset.id); posDraw(); };
async function posPick(id) { POS.trip = POS.trips.find((t) => t.id === id); POS.from = 0; POS.to = POS.trip.stops.length - 1; POS.seats.clear(); await posSeats(); }
async function posSeats() { const r = await api(`/office/trips/${POS.trip.id}/seats?from=${POS.from}&to=${POS.to}`); POS.all = r.seats; for (const id of [...POS.seats.keys()]) { const s = POS.all.find((x) => x.id === id); if (!s || s.status !== 'libre') POS.seats.delete(id); else POS.seats.set(id, s); } }
function estimate(seat, cat) {
  const c = App.cfg, fee = c.terminal_fee_cents, fare = seat.price_cents - fee, pct = { MENOR: c.discount_minor_pct, TERCERA_EDAD: c.discount_senior_pct, DISCAPACIDAD: c.discount_disability_pct }[cat] || 0;
  return fare - Math.round(fare * pct / 100) + fee;
}
function posBody() {
  const t = POS.trip, list = [...POS.seats.values()];
  paint($('#posBody'), html`<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:start" id="posGrid">
    <div class="card center"><div class="row spread" style="text-align:left"><div><b>${t.origin} → ${t.dest}</b><div class="small muted">Bus ${t.bus_number} · ${t.plate} · ${chip(t.status)}</div></div></div>
      <div class="frm mt" style="text-align:left"><div><label>Sube en</label><select data-change="posFrom">${t.stops.slice(0, -1).map((s) => html`<option value="${s.ord}" ${s.ord === POS.from ? raw('selected') : ''}>${s.city} · ${ftime(addMin(t.depart_at, s.minutes))}</option>`)}</select></div>
      <div><label>Baja en</label><select data-change="posTo">${t.stops.filter((s) => s.ord > POS.from).map((s) => html`<option value="${s.ord}" ${s.ord === POS.to ? raw('selected') : ''}>${s.city}</option>`)}</select></div></div>
      <div class="mt" id="posSeats">${seatMapHtml(POS.all, new Set(POS.seats.keys()))}</div></div>
    <div class="card" id="posForm"></div></div>`);
  if (window.innerWidth < 900) $('#posGrid').style.gridTemplateColumns = '1fr';
  posForm();
}
App.A.posFrom = async (el) => { POS.from = +el.value; if (POS.to <= POS.from) POS.to = POS.trip.stops.length - 1; POS.seats.clear(); await posSeats(); posBody(); };
App.A.posTo = async (el) => { POS.to = +el.value; POS.seats.clear(); await posSeats(); posBody(); };
App.A.seat = ((orig) => (el, e) => {
  if (POS && POS.trip && $('#posSeats')) { const id = +el.dataset.id, s = POS.all.find((x) => x.id === id); if (POS.seats.has(id)) POS.seats.delete(id); else { if (POS.seats.size >= App.cfg.max_seats) return toast(`Máximo ${App.cfg.max_seats} asientos`, 'err'); POS.seats.set(id, s); } el.classList.toggle('sel'); return posForm(); }
  if (DR && DR.sale && $('#drSeats')) return drSeat(el);
  return orig(el, e);
})(App.A.seat);
function posForm() {
  const list = [...POS.seats.values()], box = $('#posForm');
  if (!list.length) return paint(box, html`<h3>Pasajeros y cobro</h3><p class="muted">Toca los asientos libres del mapa.</p>`);
  paint(box, html`<form data-submit="posSell" id="posFrm"><h3>Pasajeros y cobro</h3>${list.map((s, i) => html`<div class="card flat" data-seat="${s.id}"><div class="row spread"><b>Asiento ${s.label}</b><span class="chip">${s.type}</span><b class="est" data-seat-est="${s.id}">${money(s.price_cents)}</b></div>
    <div class="frm mt"><div><label>Cédula</label><input name="cedula_${s.id}" inputmode="numeric" maxlength="10" pattern="\\d{10}" required data-change="posLookup" data-sid="${s.id}"></div><div><label>Nombres</label><input name="nombres_${s.id}" required></div><div><label>Apellidos</label><input name="apellidos_${s.id}" required></div>
    <div><label>Categoría</label><select name="category_${s.id}" data-change="posCat" data-sid="${s.id}">${Object.entries(CAT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div><div><label>Correo (opcional)</label><input type="email" name="email_${s.id}"></div><div><label>Celular</label><input name="phone_${s.id}"></div></div></div>`)}
    <div class="row spread"><b>Total</b><b style="font-size:1.6rem" id="posTotal"></b></div>
    <div class="frm mt"><div><label>Forma de pago</label><select name="method" data-change="posMethod"><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>DEPOSITO</option><option>TARJETA</option></select></div>
    <div id="cashBox"><label>Efectivo recibido</label><input name="received" type="number" step="0.01" min="0" data-input="posChange"><div class="small" id="posChange"></div></div>
    <div id="refBox" class="hide"><label>N.º de referencia / autorización</label><input name="reference"></div></div>
    ${POS.session ? '' : html`<div class="alert warn mt">Tu caja está cerrada. <a href="#/office/cash">Ábrela</a> para cobrar en efectivo.</div>`}
    <button class="btn ok lg block mt">Cobrar y emitir boletos</button></form>`);
  posTotal();
}
function posTotal() {
  const f = $('#posFrm'); if (!f) return; let tot = 0;
  for (const s of POS.seats.values()) { const e = estimate(s, f['category_' + s.id].value); tot += e; const el = $(`[data-seat-est="${s.id}"]`); if (el) el.textContent = money(e); }
  POS.total = tot; $('#posTotal').textContent = money(tot); App.A.posChange();
}
App.A.posCat = posTotal;
App.A.posMethod = (el) => { const cash = el.value === 'EFECTIVO'; $('#cashBox').classList.toggle('hide', !cash); $('#refBox').classList.toggle('hide', cash); $('#posFrm').reference.required = !cash; };
App.A.posChange = () => { const f = $('#posFrm'); if (!f || !f.received) return; const r = Math.round(parseFloat(f.received.value || 0) * 100), el = $('#posChange'); el.innerHTML = r ? (r >= POS.total ? `Cambio: <b>${money(r - POS.total)}</b>` : `<span style="color:var(--err)">Falta ${money(POS.total - r)}</span>`) : ''; };
App.A.posLookup = async (el) => { const id = el.dataset.sid; if (!/^\d{10}$/.test(el.value)) return; try { const p = await api('/office/passenger?cedula=' + el.value); if (p) { const f = $('#posFrm'); f['nombres_' + id].value = p.nombres; f['apellidos_' + id].value = p.apellidos; f['email_' + id].value = p.email || ''; f['phone_' + id].value = p.phone || ''; f['category_' + id].value = p.category; posTotal(); } } catch (e) { /* */ } };
App.A.posSell = async (f) => {
  const o = formObj(f), passengers = [...POS.seats.keys()].map((id) => ({ seatId: id, cedula: o['cedula_' + id], nombres: o['nombres_' + id], apellidos: o['apellidos_' + id], email: o['email_' + id], phone: o['phone_' + id], category: o['category_' + id] }));
  const body = { tripId: POS.trip.id, from: POS.from, to: POS.to, passengers, method: o.method, reference: o.reference };
  if (o.method === 'EFECTIVO') { if (!POS.session) return toast('Abre tu caja primero', 'err'); body.received_cents = o.received ? Math.round(parseFloat(o.received) * 100) : POS.total; if (body.received_cents < POS.total) return toast('El efectivo recibido es menor al total', 'err'); }
  await guard($('button', f), async () => {
    const r = await api('/office/sale', { method: 'POST', body });
    POS.seats.clear(); await posLoadTrips(); POS.trip = POS.trips.find((t) => t.id === POS.trip.id); await posSeats();
    saleDone(r);
  });
};
function saleDone(r) {
  modal('Venta registrada', html`<div class="center"><div style="font-size:3rem">✅</div><h2>${money(r.total_cents)}</h2><p>Orden <b>${r.code}</b> · ${r.tickets.length} boleto(s)</p>${r.change_cents ? html`<div class="alert warn" style="font-size:1.3rem">Cambio: <b>${money(r.change_cents)}</b></div>` : ''}
    <div class="row" style="justify-content:center"><button class="btn lg" data-act="prOrder" data-id="${r.id}">🖨️ Imprimir boletos</button><button class="btn sec" data-act="orderPdf" data-id="${r.id}">PDF A5</button><button class="btn ghost" data-act="closeModal">Nueva venta</button></div></div>`, { onclose: () => posDraw() });
  if (autoPrint()) openPrint(`/orders/${r.id}/print`, `&w=${pw()}&auto=1`);
}
App.A.prOrder = (el) => openPrint(`/orders/${el.dataset.id}/print`, `&w=${pw()}&auto=1`);
App.A.prTicket = (el) => openPrint(`/tickets/${el.dataset.id}/print`, `&w=${pw()}&auto=1&reprint=${el.dataset.re || 0}`);

/* ---------- Validación de pagos ---------- */
route('/office/payments', async () => { await drawPayments(); every(drawPayments, 20000); }, OFF);
async function drawPayments() {
  const list = await api('/office/payments');
  if (!$('#view')) return;
  paint(view(), html`<div class="row spread"><h1>Pagos por validar</h1><span class="chip info">${list.length} pendientes</span></div>
    ${list.length ? list.map((p) => html`<div class="card"><div class="row spread" style="align-items:start"><div class="grow"><b>Orden ${p.order_code}</b> <span class="chip ${p.waiting_min > 15 ? 'err' : 'warn'}">espera ${p.waiting_min} min</span>
      <div class="small muted">${p.nombres ? p.nombres + ' ' + p.apellidos + ' · ' + p.email : ''}</div><div class="mt">${p.trip.origin} → ${p.trip.dest} · ${fdt(p.trip.depart_at)} · Bus ${p.trip.bus_number}</div>
      <div class="small mt">${p.tickets.map((t) => `${t.seat}: ${t.nombres} ${t.apellidos} (${t.cedula})`).join(' | ')}</div>
      <table class="mt" style="max-width:420px"><tr><td class="muted">Total de la orden</td><td class="right"><b>${money(p.total_cents)}</b></td></tr><tr><td class="muted">Monto del comprobante</td><td class="right"><b style="${p.amount_cents !== p.total_cents ? 'color:var(--err)' : ''}">${money(p.amount_cents)}</b></td></tr><tr><td class="muted">Banco / referencia</td><td class="right">${p.bank || '-'} · <span class="mono">${p.reference}</span></td></tr><tr><td class="muted">Fecha del pago</td><td class="right">${p.paid_date || '-'}</td></tr></table></div>
      <div class="center">${/\.pdf$/i.test(p.proof_file) ? html`<button class="btn sec" data-act="viewProof" data-f="${p.proof_file}">Abrir PDF</button>` : html`<img data-src="/files/${p.proof_file}" alt="Comprobante" style="max-width:200px;max-height:220px;border-radius:10px;border:1px solid var(--line);cursor:zoom-in" data-act="viewProof" data-f="${p.proof_file}">`}<div class="small muted">toca para ampliar</div></div></div>
      <div class="row mt"><button class="btn ok" data-act="approve" data-id="${p.id}">✔ Aprobar y emitir</button><button class="btn err" data-act="reject" data-id="${p.id}">✖ Rechazar</button></div></div>`) : html`<div class="card">${empty('No hay comprobantes pendientes. ¡Todo al día!', '✅')}</div>`}`);
}
App.A.viewProof = async (el) => { const f = el.dataset.f; if (/\.pdf$/i.test(f)) return openFile('/files/' + f); modal('Comprobante', html`<img data-src="/files/${f}" style="max-width:100%">`, { wide: true }); };
App.A.approve = async (el) => { if (!(await confirmBox('Aprobar pago', 'Verifica que el dinero ya esté en la cuenta de la cooperativa. Se emitirán los boletos.', 'Aprobar'))) return; await guard(el, async () => { await api(`/office/payments/${el.dataset.id}/approve`, { method: 'POST' }); toast('Pago aprobado y boletos emitidos', 'ok'); drawPayments(); }); };
App.A.reject = async (el) => { const r = await promptBox('Rechazar pago', 'Motivo (se enviará al cliente)', { area: true, okLabel: 'Rechazar' }); if (!r) return; await guard(el, async () => { await api(`/office/payments/${el.dataset.id}/reject`, { method: 'POST', body: { reason: r } }); toast('Pago rechazado', 'ok'); drawPayments(); }); };

/* ---------- Órdenes ---------- */
