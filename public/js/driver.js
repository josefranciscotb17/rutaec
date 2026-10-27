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
function tabScan() {
  paint($('#drBody'), html`<div class="grid" style="grid-template-columns:minmax(0,520px) minmax(0,1fr);align-items:start" id="scGrid"><div><div class="scanwrap" id="cam"><video playsinline muted></video><div class="frame"></div></div><div class="row mt"><button class="btn" data-act="camToggle" id="camBtn">Activar cámara</button></div>
    <form data-submit="manualScan" class="row mt"><input name="code" class="grow mono" placeholder="Código manual (10 caracteres) o pega el enlace" autocomplete="off"><button class="btn sec">Validar</button></form></div><div id="scRes"><div class="card muted center">Apunta la cámara al código QR del boleto.</div></div></div>`);
  if (window.innerWidth < 900) $('#scGrid').style.gridTemplateColumns = '1fr';
  startCam();
}
let camStream = null;
async function startCam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#camBtn').disabled = true; return toast('Este navegador no permite cámara (se requiere HTTPS o localhost). Usa el código manual.', 'err'); }
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); } catch (e) { $('#camBtn').textContent = 'Permitir cámara'; return toast('No se pudo abrir la cámara: ' + e.message, 'err'); }
  const video = $('#cam video'); if (!video) { stopCam(); return; }
  video.srcObject = camStream; await video.play().catch(() => {}); $('#camBtn').textContent = 'Detener cámara';
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const iv = setInterval(() => {
    if (!$('#cam') || !camStream) { clearInterval(iv); stopCam(); return; }
    if (video.readyState < 2) return;
    const w = Math.min(640, video.videoWidth), h = Math.round(w * video.videoHeight / video.videoWidth); if (!w) return;
    cv.width = w; cv.height = h; ctx.drawImage(video, 0, 0, w, h);
    const r = window.jsQR && jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    if (r && r.data && (r.data !== DR.last || Date.now() - DR.lastAt > 3500)) { DR.last = r.data; DR.lastAt = Date.now(); handleCode(r.data); }
  }, 160);
}
function stopCam() { if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; } }
App.A.camToggle = () => { if (camStream) { stopCam(); $('#camBtn').textContent = 'Activar cámara'; } else startCam(); };
App.A.manualScan = (f) => { const v = formObj(f).code; f.reset(); if (v) handleCode(v); };
const norm = (raw) => { let c = String(raw || '').trim(); const i = c.lastIndexOf('/v/'); if (i >= 0) c = c.slice(i + 3); return c.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); };
function beep(ok) { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = ok ? 880 : 220; g.gain.value = 0.15; o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.35)); } catch (e) { /* */ } if (navigator.vibrate) navigator.vibrate(ok ? 80 : [200, 80, 200]); }
async function handleCode(raw) {
  const code = norm(raw); if (!code) return;
  let r;
  try { r = await api('/driver/scan', { method: 'POST', body: { tripId: DR.trip.id, code, device: navigator.userAgent.slice(0, 60) } }); if (DR.offline) { DR.offline = false; } }
  catch (e) { if (e.offline) r = localScan(code); else r = { result: 'ERROR', message: e.message }; }
  showScan(r);
}
function localScan(code) {
  DR.offline = true;
  const t = DR.man && DR.man.tickets.find((x) => x.code === code || x.short_code === code);
  if (!t) return { result: 'INVALIDO', message: 'No pertenece a este viaje o código no reconocido (sin conexión)' };
  const info = { name: t.name, seat: t.seat, seat_type: t.seat_type, category: t.category, cedula: t.cedula, from: t.from, to: t.to, number: t.number };
  if (t.status === 'ANULADO') return { result: 'ANULADO', message: 'Boleto anulado', ticket: info };
  if (['ABORDADO', 'BAJO'].includes(t.status)) return { result: 'YA_USADO', message: 'Ya fue escaneado', ticket: info };
  t.status = 'ABORDADO'; saveMan();
  const q = getQ(); q.push({ local_id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), tripId: DR.trip.id, code, scannedAt: new Date().toLocaleString('sv-SE', { timeZone: 'America/Guayaquil' }) }); setQ(q);
  return { result: 'VALIDO', message: 'Boleto válido (pendiente de sincronizar)', ticket: info, review_doc: t.category !== 'ADULTO' };
}
function showScan(r) {
  const ok = r.result === 'VALIDO'; beep(ok);
  if (ok && DR.man) { const t = DR.man.tickets.find((x) => x.code === norm(DR.last) || x.short_code === norm(DR.last)); if (t) { t.status = 'ABORDADO'; saveMan(); } }
  if (ok && r.counts) { const el = $('#cnt'); if (el) el.textContent = `${r.counts.boarded}/${r.counts.total}`; } else if (ok) { const c = counts(), el = $('#cnt'); if (el) el.textContent = `${c.boarded}/${c.total}`; }
  const tk = r.ticket;
  const box = $('#scRes'); if (!box) return;
  paint(box, html`<div class="res ${r.result}"><div style="font-size:2.4rem">${ok ? '✔' : r.result === 'YA_USADO' || r.result === 'OTRO_VIAJE' ? '⚠' : '✖'}</div><div style="font-size:1.4rem">${r.result.replace('_', ' ')}</div><div style="font-weight:400">${r.message}</div></div>
    ${tk ? html`<div class="card mt"><div style="font-size:1.4rem;font-weight:800">${tk.name}</div><div class="grid g2 mt"><div><span class="muted small">Asiento</span><br><b style="font-size:1.4rem">${tk.seat}</b> <span class="small">${tk.seat_type || ''}</span></div><div><span class="muted small">Cédula</span><br><b>${tk.cedula}</b></div><div><span class="muted small">Tramo</span><br>${tk.from} → ${tk.to}</div><div><span class="muted small">Categoría</span><br>${CAT[tk.category] || tk.category}</div></div>
      ${r.review_doc ? html`<div class="alert warn mt"><b>Verifica el documento:</b> ${CAT[tk.category]} (el pasajero debe presentar cédula/carné).</div>` : ''}</div>` : ''}`);
}
async function syncQueue(quiet) {
  const q = getQ(); if (!q.length) return;
  try {
    const r = await api('/driver/scans/batch', { method: 'POST', body: { scans: q.map((s) => ({ ...s, device: 'offline-sync' })) } });
    const bad = r.results.filter((x) => x.result !== 'VALIDO' && x.result !== 'YA_USADO');
    setQ([]); await loadMan();
    if (!quiet) toast(`Sincronizados ${r.results.length} escaneos${bad.length ? ' · ' + bad.length + ' con observaciones' : ''}`, bad.length ? 'err' : 'ok');
    if ($('#drBody')) drawConsole();
  } catch (e) { if (!quiet) toast('No se pudo sincronizar: ' + e.message, 'err'); }
}
App.A.syncNow = () => syncQueue(false);

/* ---- Pasajeros ---- */
