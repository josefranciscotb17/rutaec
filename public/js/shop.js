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
