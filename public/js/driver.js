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
route('/driver/trip/:id', async (p, q) => {
  const list = await api('/driver/trips'); const x = list.find((t) => String(t.id) === p.id);
  if (!x) throw new Error('Viaje no encontrado o no asignado');
  DR = { trip: x, tab: q.tab || 'scan', man: null, last: null, lastAt: 0, sale: null };
  await loadMan();
  drawConsole();
  window.addEventListener('online', syncQueue, { once: true });
  every(() => { if (!document.hidden) syncQueue(true); }, 30000);
}, CREW);
async function loadMan() {
  try { DR.man = await api(`/driver/trips/${DR.trip.id}/manifest`); saveMan(); DR.offline = false; }
  catch (e) { try { DR.man = JSON.parse(localStorage.getItem(manKey(DR.trip.id))); } catch (e2) { DR.man = null; } DR.offline = true; }
}
function counts() { const t = DR.man ? DR.man.tickets : []; return { total: t.filter((x) => ['VALIDO', 'ABORDADO', 'BAJO'].includes(x.status)).length, boarded: t.filter((x) => ['ABORDADO', 'BAJO'].includes(x.status)).length }; }
function drawConsole() {
  const x = DR.trip, c = counts(), pend = getQ().length, isDriver = App.user.role === 'DRIVER';
  paint(view(), html`<a href="#/driver" class="small">◀ Mis viajes</a><div class="card mt"><div class="row spread"><div><h2 style="margin:0">${x.origin} → ${x.dest}</h2><div class="muted small">${fdt(x.depart_at)} · Bus ${x.bus_number} (${x.plate})</div></div><div class="right">${chip(x.status)}<div class="mt"><b style="font-size:1.5rem" id="cnt">${c.boarded}/${c.total}</b><div class="small muted">abordados</div></div></div></div>
    <div class="row mt">${isDriver && ['PROGRAMADO', 'ABORDANDO'].includes(x.status) ? html`<button class="btn ok" data-act="tripStart">▶ Iniciar viaje</button>` : ''}${isDriver && x.status === 'EN_RUTA' ? html`<button class="btn err" data-act="tripFinish">■ Finalizar viaje</button>` : ''}<button class="btn sec sm" data-act="reloadMan">⟳ Actualizar lista</button>
    ${DR.offline ? html`<span class="chip warn">Sin conexión · usando lista descargada ${DR.man ? ftime(DR.man.downloaded_at) : ''}</span>` : html`<span class="chip ok">En línea</span>`}${pend ? html`<span class="chip warn">${pend} escaneo(s) pendientes <button class="btn sm" data-act="syncNow">Sincronizar</button></span>` : ''}</div></div>
    <div class="tabs">${[['scan', '📷 Escanear'], ['pax', '👥 Pasajeros'], ['sell', '💵 Vender'], ['inc', '⚠️ Incidencia']].map(([k, l]) => html`<a class="${DR.tab === k ? 'on' : ''}" data-act="drTab" data-t="${k}">${l}</a>`)}</div><div id="drBody"></div>`);
  drawTab();
}
App.A.drTab = (el) => { DR.tab = el.dataset.t; drawConsole(); };
App.A.reloadMan = async () => { await loadMan(); drawConsole(); toast(DR.offline ? 'Sin conexión: se mantiene la lista guardada' : 'Lista actualizada', DR.offline ? 'err' : 'ok'); };
App.A.tripStart = async (el) => guard(el, async () => { await api(`/driver/trips/${DR.trip.id}/start`, { method: 'POST' }); DR.trip.status = 'EN_RUTA'; toast('Viaje iniciado. ¡Buen viaje!', 'ok'); drawConsole(); });
App.A.tripFinish = async () => {
  if (!(await confirmBox('Finalizar viaje', 'Los boletos válidos que no abordaron quedarán como "No se presentó". ¿Finalizar?', 'Finalizar'))) return;
  try { const s = await api(`/driver/trips/${DR.trip.id}/finish`, { method: 'POST' }); modal('Resumen del viaje', html`<table><tr><td>Abordaron</td><td><b>${s.boarded}/${s.expected}</b></td></tr><tr><td>No se presentaron</td><td>${s.no_show}</td></tr><tr><td>Ventas en ruta</td><td>${s.route_sales.n} · ${money(s.route_sales.amt)}</td></tr><tr><td>Duración</td><td>${s.duration_min == null ? '—' : dur(s.duration_min)}</td></tr><tr><td>Retraso de salida</td><td>${s.delay_min} min</td></tr></table>`, { onclose: () => go('/driver') }); } catch (e) { toast(e.message, 'err'); }
};
function drawTab() { ({ scan: tabScan, pax: tabPax, sell: tabSell, inc: tabInc })[DR.tab](); }

/* ---- Escáner ---- */
