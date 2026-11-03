/* Cliente: inicio, búsqueda, selección de asientos, pasajeros y pago */
'use strict';
async function catalog() { if (!App.cat) App.cat = await api('/catalog'); return App.cat; }
const cityId = (n) => (App.cat.cities.find((c) => c.name === n) || {}).id;

/* Componente reutilizable: mapa de asientos (cliente, oficina y chofer) */
function seatMapHtml(seats, selected = new Set()) {
  const floors = [...new Set(seats.map((s) => s.floor))].sort();
  return html`<div class="bus"><div class="wheel">🛞 Frente</div>${floors.map((f) => {
    const list = seats.filter((s) => s.floor === f), maxCol = Math.max(...list.map((s) => s.col));
    return html`<div>${floors.length > 1 ? html`<div class="small muted center mb">Piso ${f}</div>` : ''}<div class="deck" style="grid-template-columns:repeat(${maxCol},42px)">${list.map((s) => {
      const sel = selected.has(s.id), cls = `seat ${/vip/i.test(s.type) ? 'vip' : /piso/i.test(s.type) ? 'sup' : ''} ${sel ? 'sel' : s.status}`;
      return html`<button type="button" class="${cls}" style="grid-row:${s.row};grid-column:${s.col}" data-act="seat" data-id="${s.id}" ${s.status === 'libre' || s.status === 'mio' ? '' : raw('disabled')} title="Asiento ${s.label} · ${s.type}${s.price_cents != null ? ' · ' + money(s.price_cents) : ''}${s.status !== 'libre' ? ' · ' + s.status : ''}">${s.label}</button>`;
    })}</div></div>`;
  })}</div>
  <div class="legend"><span><i style="background:#eaf1fb;border-color:#9bb3d3"></i>Libre</span><span><i style="background:#fff6dc;border-color:#c79a1a"></i>VIP</span><span><i style="background:var(--primary);border-color:var(--primary)"></i>Tu selección</span><span><i style="background:#ffe3a8;border-color:#e0a520"></i>Reservado</span><span><i style="background:#d9dde4;border-color:#c0c6d0"></i>Ocupado</span></div>`;
}

/* ---------- Inicio ---------- */
route('/', async () => {
  const cat = await catalog(), cfg = App.cfg, t = todayStr();
  const popular = [['Quito', 'Cuenca'], ['Guayaquil', 'Cuenca'], ['Quito', 'Manta'], ['Cuenca', 'Guayaquil'], ['Quito', 'Ambato'], ['Guayaquil', 'Machala']].filter(([a, b]) => cityId(a) && cityId(b));
  paint(view(), html`<section class="hero"><h1>${cfg.tagline}</h1><p>Compara cooperativas, elige tu asiento en el mapa del bus y viaja mostrando el código QR de tu celular. Compra en minutos, sin filas.</p>
    <form class="searchbox" data-submit="doSearch"><div><label>Origen</label><select name="origin" required><option value="">Selecciona…</option>${opts(cat.cities, '', (c) => c.id, (c) => `${c.name} (${c.province})`)}</select></div>
    <div><label>Destino</label><select name="dest" required><option value="">Selecciona…</option>${opts(cat.cities, '', (c) => c.id, (c) => `${c.name} (${c.province})`)}</select></div>
    <div><label>Fecha de viaje</label><input type="date" name="date" min="${t}" max="${addD(t, 90)}" value="${t}" required></div>
    <div><label>Pasajeros</label><select name="pax">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => html`<option>${n}</option>`)}</select></div>
    <button class="btn acc lg">Buscar</button></form></section>
    <h2>Rutas populares</h2><div class="row mb">${popular.map(([a, b]) => html`<a class="btn sec" href="#/search?origin=${cityId(a)}&dest=${cityId(b)}&date=${addD(t, 1)}">${a} → ${b}</a>`)}</div>
    <div class="grid g3"><div class="card feat"><div class="ic">🎫</div><div><h3>Boleto con QR</h3><p class="muted small">Abre tu boleto en el celular o descárgalo en PDF. El chofer lo escanea al abordar.</p></div></div>
    <div class="card feat"><div class="ic">💺</div><div><h3>Elige tu asiento</h3><p class="muted small">Mapa interactivo del bus real que te llevará, por tramo de viaje.</p></div></div>
    <div class="card feat"><div class="ic">🏦</div><div><h3>Paga como prefieras</h3><p class="muted small">Transferencia o depósito con comprobante, o reserva y paga en efectivo en la oficina.</p></div></div></div>
    <div class="card mt"><h2>Cooperativas</h2><div class="row">${cat.coops.map((c) => html`<span class="chip" style="background:${c.color}22;color:${c.color}">${c.name}</span>`)}</div></div>`);
});
App.A.doSearch = (f) => { const o = formObj(f); if (o.origin === o.dest) return toast('El origen y el destino deben ser distintos', 'err'); go(`/search?origin=${o.origin}&dest=${o.dest}&date=${o.date}&pax=${o.pax || 1}`); };

/* ---------- Resultados ---------- */
route('/search', async (p, q) => {
  const cat = await catalog();
  const qs = new URLSearchParams(q);
  const list = await api('/search?' + qs.toString());
  const oName = (cat.cities.find((c) => String(c.id) === q.origin) || {}).name, dName = (cat.cities.find((c) => String(c.id) === q.dest) || {}).name;
  const nav = (d) => { const n = new URLSearchParams(q); n.set('date', d); return '#/search?' + n; };
  const sel = (name, label, items) => html`<div class="field"><label>${label}</label><select name="${name}" data-change="filt"><option value="">Todos</option>${items.map((i) => html`<option value="${i.v}" ${String(q[name]) === String(i.v) ? raw('selected') : ''}>${i.l}</option>`)}</select></div>`;
  paint(view(), html`<div class="row spread mb"><div><h1>${oName} → ${dName}</h1><div class="muted">${fdate(q.date)} · ${list.length} servicio(s)</div></div>
    <div class="row"><a class="btn ghost sm" href="${nav(addD(q.date, -1))}" ${q.date <= todayStr() ? raw('style="visibility:hidden"') : ''}>◀ Día anterior</a><a class="btn ghost sm" href="${nav(addD(q.date, 1))}">Día siguiente ▶</a><a class="btn sec sm" href="#/">Cambiar búsqueda</a></div></div>
    <div class="cols2"><aside class="card filters"><h3>Filtros</h3><form id="filters">
      ${sel('coop', 'Cooperativa', cat.coops.map((c) => ({ v: c.id, l: c.name })))}${sel('seat_type', 'Tipo de asiento', cat.seat_types.map((x) => ({ v: x, l: x })))}${sel('kind', 'Servicio', [{ v: 'DIRECTA', l: 'Directo' }, { v: 'CON_PARADAS', l: 'Con paradas' }])}
      ${sel('chassis', 'Chasis', cat.chassis.map((x) => ({ v: x, l: x })))}${sel('body', 'Carrocería', cat.bodies.map((x) => ({ v: x, l: x })))}
      <div class="row"><div class="grow field"><label>Desde</label><input type="time" name="from_time" value="${q.from_time || ''}" data-change="filt"></div><div class="grow field"><label>Hasta</label><input type="time" name="to_time" value="${q.to_time || ''}" data-change="filt"></div></div>
      <div class="field"><label>Ordenar por</label><select name="sort" data-change="filt">${[['', 'Hora de salida'], ['price', 'Precio'], ['duration', 'Duración']].map(([v, l]) => html`<option value="${v}" ${q.sort === v ? raw('selected') : ''}>${l}</option>`)}</select></div></form></aside>
    <div>${list.length ? list.map((t) => tripCard(t, q)) : html`<div class="card">${empty('No hay viajes con esos criterios. Prueba otro día o quita filtros.', '🚌')}</div>`}</div></div>`);
});
App.A.filt = () => { const q = parseHash().q; const o = formObj($('#filters')); Object.keys(o).forEach((k) => { if (o[k]) q[k] = o[k]; else delete q[k]; }); go('/search?' + new URLSearchParams(q)); };
function tripCard(t, q) {
  const amen = t.amenities.slice(0, 4).map((a) => html`<span class="chip gray">${a}</span> `);
  return html`<div class="card trip mb" style="border-color:${t.coop_color}"><div><div class="time">${ftime(t.depart_at)}</div><div class="small muted">${t.origin_terminal}</div></div>
    <div><div class="row small" style="gap:8px"><b style="color:${t.coop_color}">${t.coop_name}</b>${t.kind === 'DIRECTA' ? html`<span class="chip ok">Directo</span>` : html`<span class="chip info">Con paradas</span>`}${t.rating ? html`<span class="chip warn">★ ${t.rating.avg} (${t.rating.n})</span>` : ''}</div>
      <div class="bar mt"><span>${ftime(t.depart_at)}</span><i></i><span>${dur(t.duration_min)}</span><i></i><span><b>${ftime(t.arrive_at)}</b> ${t.arrive_at.slice(0, 10) !== t.depart_at.slice(0, 10) ? '(+1)' : ''}</span></div>
      <div class="small muted mt">Bus ${t.bus_number} · ${t.chassis_brand || ''} ${t.body_brand || ''} · ${t.dest_terminal}</div><div class="mt">${amen}${t.seat_types.map((s) => html`<span class="chip">${s.name}: ${money(s.price_cents)} (${s.free} libres)</span> `)}</div></div>
    <div class="right"><div class="muted small">Desde</div><div style="font-size:1.6rem;font-weight:800">${money(t.price_from_cents)}</div><div class="small ${t.free_seats < 6 ? 'err' : 'muted'}" style="${t.free_seats < 6 ? 'color:var(--err)' : ''}">${t.soldout ? 'Agotado' : t.free_seats + ' asientos libres'}</div>
      ${t.soldout ? '' : html`<a class="btn mt" href="#/trip/${t.trip_id}?from=${t.from_ord}&to=${t.to_ord}&pax=${q.pax || 1}">Elegir asientos</a>`}</div></div>`;
}

/* ---------- Selección de asientos y pasajeros ---------- */
let Sel = null, selTimer = null;
route('/trip/:id', async (p, q) => {
  const trip = await api('/trips/' + p.id), from = +q.from, to = +q.to;
  if (!Sel || Sel.tripId !== +p.id || Sel.from !== from || Sel.to !== to) Sel = { tripId: +p.id, from, to, seats: new Map(), step: 1, pax: +q.pax || 1, trip, all: [] };
  Sel.trip = trip; Sel.step = Sel.step || 1;
  await drawTrip();
  every(refreshSeats, 20000);
});
async function loadSeats() { const r = await api(`/trips/${Sel.tripId}/seats?from=${Sel.from}&to=${Sel.to}`); Sel.all = r.seats; for (const id of [...Sel.seats.keys()]) { const s = r.seats.find((x) => x.id === id); if (!s || s.status !== 'libre') { Sel.seats.delete(id); toast('Un asiento seleccionado ya no está disponible', 'err'); } } }
async function refreshSeats() { if (!Sel || Sel.step !== 1) return; try { await loadSeats(); paint($('#seatArea'), seatMapHtml(Sel.all, new Set(Sel.seats.keys()))); drawSummary(); } catch (e) { /* */ } }
async function drawTrip() {
  const t = Sel.trip, a = t.stops.find((s) => s.ord === Sel.from), b = t.stops.find((s) => s.ord === Sel.to), max = App.cfg.max_seats || 10;
  if (!Sel.all.length) await loadSeats();
  const dep = new Date(t.depart_at.replace(' ', 'T')); void dep;
  paint(view(), html`<a href="javascript:history.back()" class="small" data-act="back">◀ Volver a resultados</a>
    <div class="steps mt"><span class="${Sel.step === 1 ? 'on' : 'done'}">1 · Asientos</span><span class="${Sel.step === 2 ? 'on' : ''}">2 · Pasajeros</span><span>3 · Pago</span><span>4 · Boleto</span></div>
    <div class="card mb"><div class="row spread"><div class="route"><div>${a.city}<small>${a.terminal}</small></div><span>→</span><div>${b.city}<small>${b.terminal}</small></div></div>
    <div class="right"><b style="color:${t.coop_color}">${t.coop_name}</b><div class="small muted">${fdt(addMin(t.depart_at, a.minutes))} · Bus ${t.bus_number} (${t.plate})</div></div></div></div>
    <div id="stepBody"></div>`);
  Sel.step === 1 ? drawStep1(max) : drawStep2();
}
function addMin(s, m) { const d = new Date(s.replace(' ', 'T') + 'Z'); d.setUTCMinutes(d.getUTCMinutes() + m); return d.toISOString().slice(0, 19).replace('T', ' '); }
function drawStep1(max) {
  paint($('#stepBody'), html`<div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start" id="gridSel"><div class="card center"><h3>Elige tus asientos (máx. ${max})</h3><div id="seatArea">${seatMapHtml(Sel.all, new Set(Sel.seats.keys()))}</div></div>
    <div class="card" id="sumBox"></div></div>`);
  if (window.innerWidth < 900) $('#gridSel').style.gridTemplateColumns = '1fr';
  drawSummary();
}
function drawSummary() {
  const box = $('#sumBox'); if (!box) return;
  const list = [...Sel.seats.values()], tot = list.reduce((s, x) => s + x.price_cents, 0);
  paint(box, html`<h3>Tu selección</h3>${list.length ? html`<table>${list.map((s) => html`<tr><td>Asiento <b>${s.label}</b><div class="small muted">${s.type}</div></td><td class="right">${money(s.price_cents)}</td></tr>`)}<tr><td><b>Total referencial</b></td><td class="right"><b>${money(tot)}</b></td></tr></table><p class="small muted">Incluye tasa de terminal. Menores, tercera edad y discapacidad tienen descuento en la tarifa (se aplica en el siguiente paso).</p><button class="btn block lg" data-act="toStep2">Continuar</button>` : html`<p class="muted">Toca los asientos libres del mapa. Pasajeros indicados en tu búsqueda: ${Sel.pax}.</p>`}`);
}
App.A.back = (el, e) => { e.preventDefault(); history.back(); };
App.A.seat = (el) => {
  const id = +el.dataset.id, s = Sel.all.find((x) => x.id === id);
  if (Sel.seats.has(id)) Sel.seats.delete(id); else { if (Sel.seats.size >= (App.cfg.max_seats || 10)) return toast(`Máximo ${App.cfg.max_seats} asientos por compra`, 'err'); Sel.seats.set(id, s); }
  el.classList.toggle('sel'); drawSummary();
};
App.A.toStep2 = () => { if (!App.user) { toast('Inicia sesión o crea tu cuenta para continuar'); return go('/login?next=' + encodeURIComponent(location.hash.slice(1))); } if (App.user.role !== 'CLIENT') return toast('Las compras en línea son para clientes. Usa el módulo de oficina.', 'err'); Sel.step = 2; drawTrip(); };
function drawStep2() {
  const u = App.user, list = [...Sel.seats.values()];
  paint($('#stepBody'), html`<form data-submit="createOrder" class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start" id="gridPax"><div>
    ${list.map((s, i) => html`<div class="card"><div class="row spread"><h3>Pasajero ${i + 1} · Asiento ${s.label}</h3><span class="chip">${s.type}</span></div>
      <div class="frm"><div><label>Cédula</label><input name="cedula_${s.id}" inputmode="numeric" maxlength="10" required pattern="\\d{10}" value="${i === 0 && u.cedula ? u.cedula : ''}"></div>
      <div><label>Nombres</label><input name="nombres_${s.id}" required value="${i === 0 ? u.nombres : ''}"></div><div><label>Apellidos</label><input name="apellidos_${s.id}" required value="${i === 0 ? u.apellidos : ''}"></div>
      <div><label>Correo (envío del boleto)</label><input type="email" name="email_${s.id}" required value="${u.email}"></div><div><label>Celular</label><input name="phone_${s.id}" value="${i === 0 && u.phone ? u.phone : ''}"></div>
      <div><label>Categoría</label><select name="category_${s.id}">${Object.entries(CAT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div></div>
      <div class="small muted">Si eliges una categoría con descuento, deberás presentar tu cédula al abordar.</div></div>`)}</div>
    <div class="card"><h3>Resumen</h3><table>${list.map((s) => html`<tr><td>Asiento ${s.label}</td><td class="right">${money(s.price_cents)}</td></tr>`)}</table>
    <div class="alert warn mt">Tendrás <b>${App.cfg.reserve_minutes} minutos</b> para completar el pago o subir tu comprobante. Luego los asientos se liberan.</div>
    <label><input type="checkbox" required> Acepto los <a href="#/terms" target="_blank">términos</a> y la <a href="#/privacy" target="_blank">política de privacidad</a></label>
    <button class="btn block lg mt">Reservar y pagar</button><button type="button" class="btn ghost block mt" data-act="toStep1">◀ Cambiar asientos</button></div></form>`);
  if (window.innerWidth < 900) $('#gridPax').style.gridTemplateColumns = '1fr';
}
App.A.toStep1 = () => { Sel.step = 1; drawTrip(); };
App.A.createOrder = async (f) => {
  const o = formObj(f), passengers = [...Sel.seats.keys()].map((id) => ({ seatId: id, cedula: o['cedula_' + id], nombres: o['nombres_' + id], apellidos: o['apellidos_' + id], email: o['email_' + id], phone: o['phone_' + id], category: o['category_' + id] }));
  const btn = $('button:not([type])', f);
  await guard(btn, async () => { const r = await api('/orders', { method: 'POST', body: { tripId: Sel.tripId, from: Sel.from, to: Sel.to, passengers } }); Sel = null; go('/checkout/' + r.id); });
};

/* ---------- Pago ---------- */
let CK = null;
route('/checkout/:id', async (p) => { CK = { id: p.id, bank: null }; await drawCheckout(); every(tickCheckout, 1000); every(pollCheckout, 10000); }, ['CLIENT']);
async function drawCheckout() {
  const o = await api('/orders/' + CK.id); CK.o = o; CK.end = o.seconds_left != null ? Date.now() + o.seconds_left * 1000 : null;
  const t = o.trip, last = o.payments[o.payments.length - 1];
  const head = html`<div class="steps"><span class="done">1 · Asientos</span><span class="done">2 · Pasajeros</span><span class="${o.status === 'PAGADO' ? 'done' : 'on'}">3 · Pago</span><span class="${o.status === 'PAGADO' ? 'on' : ''}">4 · Boleto</span></div>`;
  const summary = html`<div class="card"><div class="row spread"><h3>Orden ${o.code}</h3>${chip(o.status)}</div><div class="route mt"><div>${t.origin}</div><span>→</span><div>${t.dest}</div></div><div class="muted small">${o.coop_name} · ${fdt(o.depart_at_stop)} · Bus ${t.bus_number}</div>
    <table class="mt">${o.tickets.map((x) => html`<tr><td>Asiento <b>${x.seat_label}</b> · ${x.nombres} ${x.apellidos}<div class="small muted">${CAT[x.category]}</div></td><td class="right">${money(x.total_cents)}</td></tr>`)}
    <tr><td class="muted">Subtotal</td><td class="right">${money(o.subtotal_cents)}</td></tr>${o.discount_cents ? html`<tr><td class="muted">Descuentos</td><td class="right">-${money(o.discount_cents)}</td></tr>` : ''}<tr><td class="muted">Tasa de terminal</td><td class="right">${money(o.fee_cents)}</td></tr><tr><td><b>Total a pagar</b></td><td class="right"><b style="font-size:1.2rem">${money(o.total_cents)}</b></td></tr></table></div>`;
  let main;
  if (o.status === 'PAGADO') main = html`<div class="card center"><div style="font-size:3rem">🎉</div><h2>¡Pago confirmado!</h2><p>Tus boletos están listos. Muestra el código QR desde tu celular al abordar.</p><div class="row" style="justify-content:center"><a class="btn lg" href="#/tickets">Ver mis boletos</a><button class="btn sec lg" data-act="orderPdf" data-id="${o.id}">Descargar PDF</button></div></div>`;
  else if (o.status === 'EN_REVISION') main = html`<div class="card center"><div style="font-size:3rem">⏳</div><h2>Comprobante en revisión</h2><p>Un oficinista de la cooperativa validará tu pago. El tiempo de reserva está detenido. Te avisaremos por correo y notificación.</p><span class="spinner"></span><div class="small muted mt">Esta página se actualiza sola.</div></div>`;
  else if (o.status === 'RESERVADO') main = payPanel(o, last);
  else main = html`<div class="card center">${empty(o.status === 'EXPIRADO' ? 'Esta reserva expiró y los asientos fueron liberados.' : 'Esta orden fue cancelada.', '⌛')}<a class="btn" href="#/">Buscar otro viaje</a></div>`;
  paint(view(), html`${head}<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);align-items:start" id="ckGrid">${summary}${main}</div>`);
  if (window.innerWidth < 900) $('#ckGrid').style.gridTemplateColumns = '1fr';
}
function payPanel(o, last) {
  const cash = o.method === 'EFECTIVO' && o.expires_at;
  const timer = o.expires_at ? html`<div class="center"><div class="small muted">${cash ? 'Reserva válida hasta' : 'Tiempo para pagar'}</div><div class="timer" id="timer">--:--</div></div>` : '';
  const rej = last && last.status === 'RECHAZADO' && last.reject_reason && !/Método cambiado|Reemplazado|Cobrado|expirada/.test(last.reject_reason) ? html`<div class="alert err"><b>Pago rechazado:</b> ${last.reject_reason}. Corrige y vuelve a enviar tu comprobante antes de que termine el tiempo.</div>` : '';
  if (cash) return html`<div class="card">${timer}<div class="alert ok"><b>Reserva para pago en efectivo</b><br>Acércate a la oficina de ${o.coop_name} con tu código de orden y cédula, y paga <b>${money(o.total_cents)}</b>.</div><div class="center"><div class="muted small">Código de orden</div><div class="mono" style="font-size:2rem;font-weight:800;letter-spacing:3px">${o.code}</div></div>
    <div class="row mt"><button class="btn ghost" data-act="useTransfer">Prefiero pagar por transferencia</button><button class="btn err sm" data-act="cancelOrder">Cancelar orden</button></div></div>`;
  const acc = o.bank_accounts, b = acc.find((x) => String(x.id) === String(CK.bank)) || acc[0];
  return html`<div class="card">${timer}${rej}<h3>Pago por transferencia o depósito</h3>
    ${acc.length ? html`<div class="field"><label>Cuenta de la cooperativa</label><select data-change="pickBank">${opts(acc, b && b.id, (x) => x.id, (x) => `${x.bank} · ${x.type} ${x.number}`)}</select></div>
      <div class="card flat small"><b>${b.holder}</b> ${b.holder_id ? `· RUC/CI ${b.holder_id}` : ''}<br>${b.bank} — Cuenta ${b.type} <span class="mono">${b.number}</span> <button class="btn sm sec" data-act="copyNum" data-v="${b.number}">Copiar</button><br>Monto exacto: <b>${money(o.total_cents)}</b> <button class="btn sm sec" data-act="copyNum" data-v="${(o.total_cents / 100).toFixed(2)}">Copiar</button></div>` : html`<div class="alert warn">La cooperativa no tiene cuentas registradas. Reserva para pagar en efectivo.</div>`}
    <form data-submit="sendProof" class="mt"><div class="frm"><div><label>Método</label><select name="method"><option>TRANSFERENCIA</option><option>DEPOSITO</option></select></div><div><label>Banco de origen / depósito</label><input name="bank" value="${b ? b.bank : ''}" required></div>
      <div><label>N.º de comprobante</label><input name="reference" required></div><div><label>Fecha del pago</label><input type="date" name="paid_date" value="${todayStr()}" max="${todayStr()}" required></div>
      <div><label>Monto pagado (USD)</label><input name="amount" type="number" step="0.01" min="0.01" value="${(o.total_cents / 100).toFixed(2)}" required></div><div><label>Foto o PDF del comprobante</label><input type="file" name="file" accept="image/png,image/jpeg,application/pdf" required></div></div>
      <button class="btn block lg mt">Enviar comprobante</button><div class="small muted mt">Al enviarlo, el tiempo se detiene hasta que un oficinista lo valide.</div></form>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="row spread"><button class="btn ghost" data-act="payCash">Reservar y pagar en efectivo en oficina</button><button class="btn err sm" data-act="cancelOrder">Cancelar orden</button></div></div>`;
}
function tickCheckout() { const el = $('#timer'); if (!el || !CK || !CK.end) return; const s = Math.max(0, Math.round((CK.end - Date.now()) / 1000)); const o = CK.o; el.textContent = o.method === 'EFECTIVO' ? (o.expires_at || '').slice(11, 16) : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; if (s === 0 && o.method !== 'EFECTIVO') { CK.end = null; drawCheckout(); } }
async function pollCheckout() { if (!CK || !$('#ckGrid')) return; try { const o = await api('/orders/' + CK.id); if (o.status !== CK.o.status) drawCheckout(); } catch (e) { /* */ } }
App.A.pickBank = (el) => { CK.bank = el.value; drawCheckout(); };
App.A.copyNum = (el) => copy(el.dataset.v);
App.A.useTransfer = () => { CK.o.method = null; CK.o.expires_at = null; paint($('#ckGrid').children[1], payPanel({ ...CK.o, method: null, expires_at: null }, null)); };
App.A.payCash = async (el) => guard(el, async () => { await api(`/orders/${CK.id}/pay`, { method: 'POST', body: { method: 'EFECTIVO' } }); await drawCheckout(); });
App.A.cancelOrder = async () => { if (!(await confirmBox('Cancelar orden', '¿Seguro que deseas cancelar? Los asientos se liberarán.', 'Sí, cancelar'))) return; try { await api(`/orders/${CK.id}/cancel`, { method: 'POST' }); toast('Orden cancelada', 'ok'); go('/orders'); } catch (e) { toast(e.message, 'err'); } };
App.A.sendProof = async (f) => { const fd = new FormData(f); const btn = $('button', f); await guard(btn, async () => { await api(`/orders/${CK.id}/proof`, { method: 'POST', form: fd }); toast('Comprobante enviado', 'ok'); await drawCheckout(); }); };
App.A.orderPdf = (el) => openFile(`/orders/${el.dataset.id}/pdf`);
