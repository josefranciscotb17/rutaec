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
