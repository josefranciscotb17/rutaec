/* Chofer / ayudante: viajes, escáner QR (con o sin conexión), pasajeros, venta en ruta e incidencias */
'use strict';
const CREW = ['DRIVER', 'ASSISTANT'];
let DR = null;
const Q_KEY = 'rutaec_scanq';
const getQ = () => { try { return JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { return []; } };
const setQ = (q) => { try { localStorage.setItem(Q_KEY, JSON.stringify(q)); } catch (e) { /* */ } };
const manKey = (id) => 'rutaec_man_' + id;
const saveMan = () => { try { localStorage.setItem(manKey(DR.trip.id), JSON.stringify(DR.man)); } catch (e) { /* */ } };

route('/driver', async () => {
  const list = await api('/driver/trips'), t = todayStr();
  const group = (title, items) => items.length ? html`<h2 class="mt">${title}</h2>${items.map(driverCard)}` : '';
  paint(view(), html`<h1>Mis viajes</h1>${App.user.role === 'ASSISTANT' ? html`<div class="alert">Eres ayudante: puedes escanear, vender y registrar incidencias. Solo el chofer inicia y finaliza el viaje.</div>` : ''}
    ${list.length ? html`${group('Hoy', list.filter((x) => x.date === t))}${group('Próximos', list.filter((x) => x.date > t))}${group('Ayer', list.filter((x) => x.date < t))}` : html`<div class="card">${empty('No tienes viajes asignados en los próximos días.', '🚌')}</div>`}`);
}, CREW);
function driverCard(x) {
  return html`<a class="card mb" style="display:block;color:inherit;border-left:6px solid var(--primary)" href="#/driver/trip/${x.id}"><div class="row spread"><div><b style="font-size:1.15rem">${x.origin} → ${x.dest}</b> ${chip(x.status)}<div class="muted small">${fdt(x.depart_at)} · Bus ${x.bus_number} (${x.plate}) ${x.platform ? '· Andén ' + x.platform : ''}</div></div>
    <div class="right"><div class="chip">${x.role}</div><div class="mt"><b>${x.boarded}</b>/${x.sold} abordados</div></div></div></a>`;
}
route('/driver/history', async () => {
  const list = await api('/driver/history');
  paint(view(), html`<h1>Historial de viajes</h1>${list.length ? html`<div class="card">${tbl(['Fecha', 'Ruta', 'Bus', 'Salida real', 'Retraso', 'Abordaron', 'No show', 'Ventas en ruta'], list.map((s) => html`<tr><td>${fdate(s.date)}</td><td>${s.origin} → ${s.dest}</td><td>${s.bus_number}</td><td>${s.started_at ? ftime(s.started_at) : '—'}</td><td>${s.delay_min == null ? '—' : s.delay_min + ' min'}</td><td>${s.boarded}/${s.expected}</td><td>${s.no_show}</td><td>${s.route_sales.n} (${money(s.route_sales.amt)})</td></tr>`))}</div>` : html`<div class="card">${empty('Aún no has finalizado viajes.', '🕘')}</div>`}`);
}, CREW);

/* ---------- Consola del viaje ---------- */
