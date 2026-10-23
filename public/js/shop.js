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
