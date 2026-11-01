/* Cooperativa: panel, viajes, hojas de ruta, frecuencias, flota, plantillas, personal, configuración, reportes y auditoría */
'use strict';
const CO = ['COOP_ADMIN', 'AUDITOR'];
const canWrite = () => ['COOP_ADMIN', 'SUPERADMIN'].includes(App.user.role);

/* ---------- CRUD genérico basado en definición de campos ---------- */
const CR = {};
function fieldHtml(f, v) {
  const val = v == null ? (f.def ?? '') : v, req = f.required ? raw('required') : '', cls = f.full ? 'full' : '';
  let input;
  if (f.type === 'select') input = html`<select name="${f.name}" ${req}>${f.empty ? html`<option value="">${f.empty}</option>` : ''}${(f.options || []).map((o) => html`<option value="${o[0]}" ${String(o[0]) === String(val) ? raw('selected') : ''}>${o[1]}</option>`)}</select>`;
  else if (f.type === 'checkbox') return html`<div class="${cls}"><label><input type="checkbox" name="${f.name}" ${val === 1 || val === true || val === '1' ? raw('checked') : ''}> ${f.label}</label></div>`;
  else if (f.type === 'textarea') input = html`<textarea name="${f.name}" rows="3" ${req}>${val}</textarea>`;
  else input = html`<input name="${f.name}" type="${f.type || 'text'}" value="${val}" ${f.step ? raw(`step="${f.step}"`) : ''} ${f.min != null ? raw(`min="${f.min}"`) : ''} ${f.max != null ? raw(`max="${f.max}"`) : ''} ${f.maxlength ? raw(`maxlength="${f.maxlength}"`) : ''} ${f.ph ? raw(`placeholder="${esc(f.ph)}"`) : ''} ${req}>`;
  return html`<div class="${cls}"><label>${f.label}</label>${input}${f.hint ? html`<div class="small muted">${f.hint}</div>` : ''}</div>`;
}
async function crudRender(box, spec) {
  CR[spec.key] = spec;
  if (spec.load) spec.ctx = await spec.load();
  spec.rows = await api(spec.url);
  const w = canWrite() && spec.write !== false;
  paint(box, html`<div class="card">${spec.title ? html`<div class="row spread mb"><h2 style="margin:0">${spec.title}</h2>${w ? html`<button class="btn sm" data-act="crNew" data-k="${spec.key}">+ ${spec.newLabel || 'Nuevo'}</button>` : ''}</div>` : ''}
    ${spec.rows.length ? tbl([...spec.cols.map((c) => c[0]), ''], spec.rows.map((r) => html`<tr>${spec.cols.map((c) => html`<td>${c[1](r, spec.ctx)}</td>`)}<td class="right nowrap">${spec.extra ? spec.extra(r) : ''}${w ? html`<button class="btn sm sec" data-act="crEdit" data-k="${spec.key}" data-id="${r.id}">Editar</button> ${spec.del === false ? '' : html`<button class="btn sm err" data-act="crDel" data-k="${spec.key}" data-id="${r.id}">✕</button>`}` : ''}</td></tr>`)) : empty(spec.emptyMsg || 'Sin registros todavía.')}</div>`);
}
function crudForm(k, id) {
  const s = CR[k], row = id ? s.rows.find((r) => String(r.id) === String(id)) : null, fields = typeof s.fields === 'function' ? s.fields(s.ctx, row) : s.fields;
  modal((row ? 'Editar ' : 'Nuevo ') + (s.single || 'registro'), html`<form data-submit="crSave" data-k="${k}" data-id="${id || ''}"><div class="frm">${fields.map((f) => fieldHtml(f, row ? row[f.name] : undefined))}</div><div class="row mt"><button class="btn">Guardar</button><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button></div></form>`, { wide: s.wide });
}
App.A.crNew = (el) => crudForm(el.dataset.k);
App.A.crEdit = (el) => crudForm(el.dataset.k, el.dataset.id);
App.A.crSave = async (f) => {
  const s = CR[f.dataset.k], id = f.dataset.id, fields = typeof s.fields === 'function' ? s.fields(s.ctx, null) : s.fields, o = formObj(f), body = {};
  for (const fl of fields) {
    const v = o[fl.name];
    if (fl.type === 'checkbox') body[fl.name] = v ? 1 : 0;
    else if (fl.type === 'number') body[fl.name] = v === '' || v == null ? null : (fl.cents ? Math.round(parseFloat(v) * 100) : Number(v));
    else if (fl.num) body[fl.name] = v === '' ? null : Number(v);
    else if (v !== undefined) body[fl.name] = v;
  }
  if (s.transform) s.transform(body);
  await guard($('button', f), async () => {
    const r = await api(id ? `${s.url}/${id}` : s.url, { method: id ? 'PUT' : 'POST', body });
    closeModal(); toast('Guardado', 'ok');
    if (r && r.temp_password) modal('Usuario creado', html`<p>Entrega esta contraseña temporal (se pedirá cambiarla al ingresar):</p><div class="alert ok mono" style="font-size:1.4rem;text-align:center">${r.temp_password}</div>`);
    await crudRender($('#crud_' + s.key) || view(), s);
    if (s.onSaved) s.onSaved();
  });
};
App.A.crDel = async (el) => { const s = CR[el.dataset.k]; if (!(await confirmBox('Eliminar', '¿Eliminar este registro? Si tiene historial, se desactivará.', 'Eliminar'))) return; try { await api(`${s.url}/${el.dataset.id}`, { method: 'DELETE' }); toast('Hecho', 'ok'); await crudRender($('#crud_' + s.key) || view(), s); } catch (e) { toast(e.message, 'err'); } };
const yesno = (v) => (v ? html`<span class="chip ok">Sí</span>` : html`<span class="chip gray">No</span>`);

/* ---------- Panel ---------- */
route('/coop', async () => {
  const [d, r] = await Promise.all([api('/coop/dashboard'), api('/coop/reports/sales')]);
  paint(view(), html`<h1>Panel de la cooperativa</h1>
    <div class="grid g4 mb"><div class="card kpi"><span>Ventas hoy</span><b>${money(d.today.revenue)}</b><span>${d.today.tickets} boletos</span></div><div class="card kpi"><span>Ventas del mes</span><b>${money(d.month.revenue)}</b><span>${d.month.tickets} boletos</span></div>
    <a class="card kpi" style="color:inherit" href="#/coop/trips"><span>Viajes hoy</span><b>${d.trips_today}</b><span>ver detalle</span></a><div class="card kpi"><span>Pagos por validar</span><b>${d.pending_payments}</b><span>en oficina</span></div></div>
    ${d.alerts.length ? html`<div class="alert warn"><b>Alertas de cumplimiento</b><ul style="margin:6px 0 0">${d.alerts.map((a) => html`<li>${a}</li>`)}</ul></div>` : ''}
    <div class="grid g2"><div class="card"><h3>Ventas últimos 30 días</h3>${r.by_day.length ? bars(r.by_day.slice(-14), 'day', 'revenue') : empty('Sin ventas')}</div><div class="card"><h3>Ocupación y canales</h3><div class="kpi mb"><b>${r.occupancy == null ? '—' : r.occupancy + '%'}</b><span>ocupación promedio</span></div>${bars(r.by_channel, 'channel', 'revenue')}</div></div>
    <div class="card mt"><h3>Accesos rápidos</h3><div class="row"><a class="btn sec" href="#/coop/sheets">Generar hoja de ruta</a><a class="btn sec" href="#/coop/frequencies">Frecuencias y tarifas</a><a class="btn sec" href="#/coop/buses">Flota</a><a class="btn sec" href="#/coop/reports">Reportes</a></div></div>`);
}, CO);

/* ---------- Viajes ---------- */
route('/coop/trips', async (p, q) => {
  const date = q.date || todayStr(), trips = await api('/coop/trips?date=' + date);
  paint(view(), html`<div class="row spread"><h1>Viajes</h1><div class="row"><input type="date" value="${date}" style="width:auto" data-change="coopDate">${canWrite() ? html`<button class="btn" data-act="tripNew">+ Viaje manual</button>` : ''}</div></div>
    <div class="card">${trips.length ? tbl(['Hora', 'Ruta', 'Bus', 'Chofer', 'Andén', 'Vendidos', 'Ingresos', 'Estado', ''], trips.map((t) => html`<tr><td><b>${ftime(t.depart_at)}</b></td><td>${t.origin}→${t.dest}</td><td>${t.bus_number} · ${t.plate}</td><td>${t.driver || '—'}</td><td>${t.platform || '—'}</td><td>${t.sold}/${t.capacity}</td><td>${money(t.revenue_cents)}</td><td>${chip(t.status)}</td>
      <td class="nowrap right"><button class="btn sm sec" data-act="manifest" data-id="${t.id}">Manifiesto</button> ${canWrite() && !['EN_RUTA', 'FINALIZADO', 'CANCELADO'].includes(t.status) ? html`<button class="btn sm sec" data-act="tripEdit" data-id="${t.id}">Asignar</button> <button class="btn sm err" data-act="tripCancel" data-id="${t.id}">Cancelar</button>` : ''}</td></tr>`)) : empty('No hay viajes en esta fecha. Genera y publica una hoja de ruta.', '🚌')}</div>`);
  window.__trips = trips;
}, CO);
App.A.coopDate = (el) => go('/coop/trips?date=' + el.value);
async function staffLists() { const u = await api('/coop/users'); return { drivers: u.filter((x) => x.role === 'DRIVER' && x.active), assistants: u.filter((x) => x.role === 'ASSISTANT' && x.active), buses: (await api('/coop/buses')).filter((b) => b.status === 'ACTIVO') }; }
App.A.tripEdit = async (el) => {
  const t = window.__trips.find((x) => String(x.id) === el.dataset.id), L = await staffLists();
  modal('Asignar viaje ' + ftime(t.depart_at), html`<form data-submit="tripSave" data-id="${t.id}"><div class="frm"><div><label>Bus</label><select name="bus_id">${opts(L.buses, t.bus_id, (b) => b.id, (b) => `${b.number} · ${b.plate}`)}</select></div><div><label>Chofer</label><select name="driver_id"><option value="">—</option>${opts(L.drivers, t.driver_id, (u) => u.id, (u) => `${u.nombres} ${u.apellidos}`)}</select></div>
    <div><label>Ayudante</label><select name="assistant_id"><option value="">—</option>${opts(L.assistants, t.assistant_id, (u) => u.id, (u) => `${u.nombres} ${u.apellidos}`)}</select></div><div><label>Andén</label><input name="platform" value="${t.platform || ''}"></div></div><button class="btn mt">Guardar</button></form>`);
};
App.A.tripSave = (f) => guard($('button', f), async () => { const o = formObj(f); await api('/coop/trips/' + f.dataset.id, { method: 'PUT', body: { bus_id: +o.bus_id, driver_id: o.driver_id ? +o.driver_id : null, assistant_id: o.assistant_id ? +o.assistant_id : null, platform: o.platform } }); closeModal(); toast('Guardado', 'ok'); dispatch(); });
App.A.tripCancel = async (el) => { const r = await promptBox('Cancelar viaje', 'Motivo (se notificará a los pasajeros)', { area: true, okLabel: 'Cancelar viaje' }); if (!r) return; try { const x = await api(`/coop/trips/${el.dataset.id}/cancel`, { method: 'POST', body: { reason: r } }); toast(`Viaje cancelado. ${x.orders} órdenes afectadas, ${x.refunds_pending} con devolución pendiente.`, 'ok'); dispatch(); } catch (e) { toast(e.message, 'err'); } };
App.A.tripNew = async () => {
  const [fr, L] = await Promise.all([api('/coop/frequencies'), staffLists()]);
  modal('Viaje manual', html`<form data-submit="tripCreate"><div class="frm"><div><label>Frecuencia</label><select name="frequency_id">${fr.filter((f) => f.active).map((f) => html`<option value="${f.id}">${f.depart_time} ${f.origin} → ${f.dest}</option>`)}</select></div><div><label>Fecha</label><input type="date" name="date" value="${todayStr()}" required></div>
    <div><label>Bus</label><select name="bus_id">${opts(L.buses, '', (b) => b.id, (b) => `${b.number} · ${b.plate}`)}</select></div><div><label>Chofer</label><select name="driver_id"><option value="">—</option>${opts(L.drivers, '', (u) => u.id, (u) => `${u.nombres} ${u.apellidos}`)}</select></div></div><button class="btn mt">Crear viaje</button></form>`);
};
App.A.tripCreate = (f) => guard($('button', f), async () => { const o = formObj(f); await api('/coop/trips', { method: 'POST', body: { frequency_id: +o.frequency_id, date: o.date, bus_id: +o.bus_id, driver_id: o.driver_id ? +o.driver_id : null } }); closeModal(); toast('Viaje creado', 'ok'); dispatch(); });

/* ---------- Hojas de ruta ---------- */
route('/coop/sheets', async () => {
  const list = await api('/coop/route-sheets');
  paint(view(), html`<div class="row spread"><h1>Hojas de ruta</h1>${canWrite() ? html`<a class="btn" href="#/coop/sheets/new">+ Generar hoja de ruta</a>` : ''}</div><div class="card">${list.length ? tbl(['Grupo', 'Desde', 'Hasta', 'Asignaciones', 'Estado', ''], list.map((s) => html`<tr><td>${s.group_name}</td><td>${fdate(s.start_date)}</td><td>${fdate(s.end_date)}</td><td>${s.entries}</td><td>${chip(s.status)}</td><td class="right"><a class="btn sm sec" href="#/coop/sheets/${s.id}">Abrir</a></td></tr>`)) : empty('Aún no hay hojas de ruta. Genera una para programar los viajes.', '🗓️')}</div>`);
}, CO);
let SH = null;
route('/coop/sheets/new', async () => {
  const [groups, freqs] = await Promise.all([api('/coop/bus-groups'), api('/coop/frequencies')]);
  SH = { groups, freqs: freqs.filter((f) => f.active), preview: null };
  const t = addD(todayStr(), 1);
  paint(view(), html`<a href="#/coop/sheets" class="small">◀ Hojas de ruta</a><h1>Generar hoja de ruta</h1>
    <div class="card"><p class="muted small">El sistema rota los buses del grupo entre las frecuencias día a día: cada bus recorre todas las posiciones (incluida la "parada" si sobran buses). Puedes ajustar manualmente cada celda antes de guardar.</p>
    <form data-submit="shPreview"><div class="frm"><div><label>Grupo de buses</label><select name="group_id" required>${opts(groups, '')}</select></div><div><label>Desde</label><input type="date" name="start_date" value="${t}" required></div><div><label>Hasta</label><input type="date" name="end_date" value="${addD(t, 6)}" required></div><div><label>Descanso mínimo (min)</label><input type="number" name="rest_min" value="60" min="0"></div></div>
    <label class="mt">Frecuencias a cubrir</label><div class="row">${SH.freqs.map((f) => html`<label class="chip" style="padding:6px 12px;cursor:pointer"><input type="checkbox" name="f_${f.id}" checked> ${f.depart_time} ${f.origin}→${f.dest}</label>`)}</div><button class="btn mt">Generar vista previa</button></form></div><div id="shOut"></div>`);
}, CO);
App.A.shPreview = async (f) => {
  const o = formObj(f), ids = SH.freqs.filter((x) => o['f_' + x.id]).map((x) => x.id);
  if (!ids.length) return toast('Selecciona al menos una frecuencia', 'err');
  await guard($('button', f), async () => { SH.req = { group_id: +o.group_id, start_date: o.start_date, end_date: o.end_date, rest_min: +o.rest_min, frequency_ids: ids }; SH.preview = await api('/coop/route-sheets/preview', { method: 'POST', body: SH.req }); shDraw(); });
};
function sheetGrid(entries, freqs, buses, editable) {
  const dates = [...new Set(entries.map((e) => e.date))], slots = [...new Set(entries.map((e) => e.slot))].sort((a, b) => a - b), by = {};
  entries.forEach((e, i) => { by[e.date + '|' + e.slot] = [e, i]; });
  return html`<div class="tbl"><table class="sheet"><thead><tr><th>Fecha</th>${slots.map((s) => { const f = freqs[s]; return html`<th>${f ? html`${f.depart_time}<br><span style="text-transform:none">${f.origin}→${f.dest}</span>` : 'PARADA'}</th>`; })}</tr></thead>
    <tbody>${dates.map((d) => html`<tr><td class="nowrap"><b>${fdate(d)}</b></td>${slots.map((s) => { const x = by[d + '|' + s]; if (!x) return html`<td>—</td>`; const [e, i] = x; const par = !e.frequency_id; return html`<td class="${par ? 'par' : ''}">${editable ? html`<select data-change="shCell" data-i="${i}" style="min-height:30px;padding:2px">${opts(buses, e.bus_id, (b) => b.id, (b) => 'Bus ' + b.number)}</select>` : html`<b>Bus ${e.bus_number}</b><br><small>${e.driver || ''}</small>`}</td>`; })}</tr>`)}</tbody></table></div>`;
}
function shDraw() {
  const p = SH.preview;
  paint($('#shOut'), html`<div class="card mt"><h2>Vista previa</h2>${p.warnings.map((w) => html`<div class="alert warn">${w}</div>`)}${p.conflicts.length ? html`<div class="alert err"><b>Conflictos detectados:</b><ul style="margin:4px 0 0">${p.conflicts.slice(0, 6).map((c) => html`<li>${c}</li>`)}</ul></div>` : html`<div class="alert ok">Sin conflictos de horario ni descanso.</div>`}
    <div class="small muted mb">${p.positions} posiciones · ${p.parada_count} bus(es) en parada por día. Cambia la celda para ajustar manualmente.</div>${sheetGrid(p.entries, p.frequencies, p.buses, true)}
    <div class="row mt"><button class="btn" data-act="shSave" data-pub="0">Guardar borrador</button><button class="btn ok" data-act="shSave" data-pub="1">Guardar y publicar viajes</button></div></div>`);
}
App.A.shCell = (el) => { SH.preview.entries[+el.dataset.i].bus_id = +el.value; };
App.A.shSave = async (el) => guard(el, async () => {
  const r = await api('/coop/route-sheets', { method: 'POST', body: { ...SH.req, entries: SH.preview.entries } });
  if (el.dataset.pub === '1') { const x = await api(`/coop/route-sheets/${r.id}/publish`, { method: 'POST', body: { force: true } }); toast(`Publicada: ${x.created} viajes creados, ${x.updated} actualizados`, 'ok'); } else toast('Borrador guardado', 'ok');
  go('/coop/sheets/' + r.id);
});
route('/coop/sheets/:id', async (p) => {
  const s = await api('/coop/route-sheets/' + p.id), freqs = {}; const fr = await api('/coop/frequencies');
  const slotsF = {}; s.entries.forEach((e) => { if (e.frequency_id) slotsF[e.slot] = fr.find((f) => f.id === e.frequency_id); });
  paint(view(), html`<a href="#/coop/sheets" class="small">◀ Hojas de ruta</a><div class="row spread"><h1>Hoja ${fdate(s.start_date)} → ${fdate(s.end_date)}</h1><div class="row">${chip(s.status)}<button class="btn sec" data-act="shPrint" data-id="${s.id}">🖨️ Imprimir</button>${canWrite() && s.status !== 'PUBLICADA' ? html`<button class="btn ok" data-act="shPublish" data-id="${s.id}">Publicar viajes</button><button class="btn err" data-act="shDelete" data-id="${s.id}">Eliminar</button>` : ''}</div></div>
    <div class="card">${sheetGrid(s.entries, slotsF, [], false)}</div>`);
  void freqs;
}, CO);
App.A.shPrint = (el) => openPrint(`/coop/route-sheets/${el.dataset.id}/print`);
App.A.shPublish = (el) => guard(el, async () => { try { const x = await api(`/coop/route-sheets/${el.dataset.id}/publish`, { method: 'POST', body: {} }); toast(`${x.created} viajes creados, ${x.updated} actualizados`, 'ok'); dispatch(); } catch (e) { if (e.code === 'CONFLICTS' && (await confirmBox('Conflictos', e.message + '. ¿Publicar de todas formas?', 'Publicar'))) { const x = await api(`/coop/route-sheets/${el.dataset.id}/publish`, { method: 'POST', body: { force: true } }); toast(`${x.created} viajes creados`, 'ok'); dispatch(); } else if (e.code !== 'CONFLICTS') throw e; } });
App.A.shDelete = async (el) => { if (!(await confirmBox('Eliminar borrador', '¿Eliminar esta hoja de ruta?', 'Eliminar'))) return; try { await api('/coop/route-sheets/' + el.dataset.id, { method: 'DELETE' }); go('/coop/sheets'); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Frecuencias y tarifas ---------- */
let FQ = null;
route('/coop/frequencies', async () => {
  const [list, terms] = await Promise.all([api('/coop/frequencies'), api('/coop/terminals')]);
  FQ = { list, terms };
  paint(view(), html`<div class="row spread"><h1>Frecuencias y tarifas</h1>${canWrite() ? html`<button class="btn" data-act="fqNew">+ Nueva frecuencia</button>` : ''}</div>
    <div class="card">${list.length ? tbl(['Salida', 'Ruta', 'Paradas', 'Duración', 'Días', 'Tarifa completa', 'Resolución ANT', 'Estado', ''], list.map((f) => { const full = f.fares.find((x) => x.from_ord === 0 && x.to_ord === f.stops.length - 1); return html`<tr><td><b>${f.depart_time}</b></td><td>${f.origin} → ${f.dest}</td><td>${f.stops.map((s) => s.city).join(' · ')}</td><td>${dur(f.duration_min)}</td><td class="small">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (f.days[i] === '1' ? d : '·')).join(' ')}</td><td>${full ? money(full.price_cents) : '—'}</td><td class="small">${f.resolution_number || '—'}</td><td>${f.active ? chip('ACTIVO') : chip('BAJA')}</td><td class="right nowrap">${canWrite() ? html`<button class="btn sm sec" data-act="fqEdit" data-id="${f.id}">Editar</button> <button class="btn sm err" data-act="fqDel" data-id="${f.id}">✕</button>` : ''}</td></tr>`; })) : empty('Define tu primera frecuencia (ruta, horario y tarifas).', '🛣️')}</div>`);
}, CO);
const termOpts = () => FQ.terms.map((t) => [t.id, `${t.city} · ${t.name}`]);
App.A.fqNew = () => fqOpen(null);
App.A.fqEdit = (el) => fqOpen(FQ.list.find((f) => String(f.id) === el.dataset.id));
function fqOpen(f) {
  FQ.cur = f ? { id: f.id, stops: f.stops.map((s) => ({ terminal_id: s.terminal_id, minutes: s.minutes, km: s.km })), fares: Object.fromEntries(f.fares.map((x) => [x.from_ord + '-' + x.to_ord, x.price_cents])) } : { id: null, stops: [{ terminal_id: FQ.terms[0].id, minutes: 0, km: 0 }, { terminal_id: FQ.terms[1].id, minutes: 240, km: 200 }], fares: {} };
  modal(f ? 'Editar frecuencia' : 'Nueva frecuencia', html`<form data-submit="fqSave"><div class="frm"><div><label>Hora de salida</label><input type="time" name="depart_time" value="${f ? f.depart_time : '07:00'}" required></div><div><label>Duración total (min)</label><input type="number" name="duration_min" min="15" value="${f ? f.duration_min : 240}" required data-change="fqDur"></div>
    <div><label>N.º de resolución ANT</label><input name="resolution_number" value="${f ? f.resolution_number || '' : ''}"></div><div><label>Fecha de resolución</label><input type="date" name="resolution_date" value="${f ? f.resolution_date || '' : ''}"></div></div>
    <label class="mt">Días de operación</label><div class="row">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => html`<label class="chip" style="cursor:pointer"><input type="checkbox" name="d${i}" ${(!f || f.days[i] === '1') ? raw('checked') : ''}> ${d}</label>`)}</div>
    <label class="mt"><input type="checkbox" name="active" ${(!f || f.active) ? raw('checked') : ''}> Frecuencia activa</label>
    <h3 class="mt">Paradas (primera = origen, última = destino)</h3><div id="fqStops"></div><button type="button" class="btn sm sec" data-act="fqAddStop">+ Agregar parada intermedia</button>
    <h3 class="mt">Tarifas por tramo (USD)</h3><div class="row mb"><input id="fqFull" type="number" step="0.05" min="0.5" placeholder="Tarifa completa origen→destino" style="max-width:260px"><button type="button" class="btn sm sec" data-act="fqCalc">Calcular proporcional a los km</button></div><div id="fqFares"></div>
    <button class="btn mt block lg">Guardar frecuencia</button></form>`, { wide: true });
  fqStops(); fqFares();
}
function fqStops() {
  const S = FQ.cur.stops;
  paint($('#fqStops'), html`${S.map((s, i) => html`<div class="row mb" style="align-items:end"><div class="grow" style="min-width:200px"><label>${i === 0 ? 'Origen' : i === S.length - 1 ? 'Destino' : 'Parada ' + i}</label><select data-change="fqStopSet" data-i="${i}" data-k="terminal_id">${termOpts().map((o) => html`<option value="${o[0]}" ${o[0] === s.terminal_id ? raw('selected') : ''}>${o[1]}</option>`)}</select></div>
    <div style="width:110px"><label>Minutos</label><input type="number" value="${s.minutes}" ${i === 0 || i === S.length - 1 ? raw('disabled') : ''} data-change="fqStopSet" data-i="${i}" data-k="minutes"></div><div style="width:110px"><label>Km</label><input type="number" value="${s.km}" ${i === 0 ? raw('disabled') : ''} data-change="fqStopSet" data-i="${i}" data-k="km"></div>${i > 0 && i < S.length - 1 ? html`<button type="button" class="btn sm err" data-act="fqDelStop" data-i="${i}">✕</button>` : ''}</div>`)}`);
}
App.A.fqStopSet = (el) => { const s = FQ.cur.stops[+el.dataset.i]; s[el.dataset.k] = +el.value; if (el.dataset.k === 'terminal_id') return; };
App.A.fqDur = (el) => { const S = FQ.cur.stops; S[S.length - 1].minutes = +el.value; fqStops(); };
App.A.fqAddStop = () => { const S = FQ.cur.stops, last = S[S.length - 1], prev = S[S.length - 2]; S.splice(S.length - 1, 0, { terminal_id: FQ.terms[0].id, minutes: Math.round((prev.minutes + last.minutes) / 2), km: Math.round((prev.km + last.km) / 2) }); fqStops(); fqFares(); };
App.A.fqDelStop = (el) => { FQ.cur.stops.splice(+el.dataset.i, 1); FQ.cur.fares = {}; fqStops(); fqFares(); };
function fqFares() {
  const S = FQ.cur.stops, rows = [];
  for (let a = 0; a < S.length - 1; a++) for (let b = a + 1; b < S.length; b++) rows.push([a, b]);
  const cityOf = (i) => (FQ.terms.find((t) => t.id === S[i].terminal_id) || {}).city;
  paint($('#fqFares'), html`<div class="tbl"><table><thead><tr><th>Tramo</th><th>Tarifa (USD)</th></tr></thead><tbody>${rows.map(([a, b]) => html`<tr><td>${cityOf(a)} → ${cityOf(b)}</td><td><input type="number" step="0.05" min="0.5" style="max-width:120px" data-change="fqFareSet" data-key="${a}-${b}" value="${FQ.cur.fares[a + '-' + b] ? (FQ.cur.fares[a + '-' + b] / 100).toFixed(2) : ''}" required></td></tr>`)}</tbody></table></div>`);
}
App.A.fqFareSet = (el) => { FQ.cur.fares[el.dataset.key] = Math.round(parseFloat(el.value) * 100); };
App.A.fqCalc = () => {
  const full = Math.round(parseFloat($('#fqFull').value) * 100); if (!(full > 0)) return toast('Ingresa la tarifa completa', 'err');
  const S = FQ.cur.stops, total = S[S.length - 1].km || 1;
  for (let a = 0; a < S.length - 1; a++) for (let b = a + 1; b < S.length; b++) FQ.cur.fares[a + '-' + b] = Math.max(50, Math.round(full * (S[b].km - S[a].km) / total / 5) * 5);
  fqFares();
};
App.A.fqSave = async (f) => {
  const o = formObj(f), c = FQ.cur, S = c.stops; S[S.length - 1].minutes = +o.duration_min;
  const fares = Object.entries(c.fares).map(([k, v]) => { const [a, b] = k.split('-').map(Number); return { from_ord: a, to_ord: b, price_cents: v }; }).filter((x) => x.price_cents > 0);
  const need = S.length * (S.length - 1) / 2; if (fares.length !== need) return toast(`Completa las ${need} tarifas de la matriz`, 'err');
  const body = { depart_time: o.depart_time, duration_min: +o.duration_min, resolution_number: o.resolution_number, resolution_date: o.resolution_date || null, days: [0, 1, 2, 3, 4, 5, 6].map((i) => (o['d' + i] ? '1' : '0')).join(''), active: o.active ? 1 : 0, stops: S, fares };
  await guard($('button', f), async () => { await api(c.id ? '/coop/frequencies/' + c.id : '/coop/frequencies', { method: c.id ? 'PUT' : 'POST', body }); closeModal(); toast('Frecuencia guardada', 'ok'); dispatch(); });
};
App.A.fqDel = async (el) => { if (!(await confirmBox('Eliminar frecuencia', 'Si tiene viajes, solo se desactivará.', 'Eliminar'))) return; try { const r = await api('/coop/frequencies/' + el.dataset.id, { method: 'DELETE' }); toast(r.deactivated ? 'Desactivada (tiene historial)' : 'Eliminada', 'ok'); dispatch(); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Flota ---------- */
route('/coop/buses', async (p, q) => {
  const tab = q.tab || 'buses';
  paint(view(), html`<h1>Flota</h1><div class="tabs"><a class="${tab === 'buses' ? 'on' : ''}" href="#/coop/buses?tab=buses">Buses</a><a class="${tab === 'groups' ? 'on' : ''}" href="#/coop/buses?tab=groups">Grupos para hoja de ruta</a></div><div id="crud_${tab}"></div>`);
  if (tab === 'groups') return crudRender($('#crud_groups'), { key: 'groups', title: 'Grupos de buses', url: '/coop/bus-groups', single: 'grupo', newLabel: 'Nuevo grupo', cols: [['Nombre', (r) => html`<b>${r.name}</b>`], ['Descripción', (r) => r.description || '—'], ['Buses activos', (r) => r.buses]], fields: [{ name: 'name', label: 'Nombre', required: true }, { name: 'description', label: 'Descripción', full: true }] });
  const spec = {
    key: 'buses', title: '', url: '/coop/buses', single: 'bus', newLabel: 'Nuevo bus', wide: true,
    load: async () => ({ groups: await api('/coop/bus-groups'), tpls: await api('/coop/seat-templates') }),
    cols: [['N.º', (r) => html`<b>${r.number}</b>`], ['Placa', (r) => r.plate], ['Grupo', (r) => r.group_name || '—'], ['Chasis / carrocería', (r) => `${r.chassis_brand || ''} / ${r.body_brand || ''}`], ['Año', (r) => r.year || '—'], ['Asientos', (r) => `${r.capacity} · ${r.floors} piso(s)`], ['Rev. técnica', (r) => r.tech_review_expires || '—'], ['Estado', (r) => chip(r.status)]],
    extra: (r) => html`<a class="btn sm" href="#/coop/buses/${r.id}/seats">💺 Asientos</a> `,
    fields: (c) => [{ name: 'number', label: 'N.º de unidad', required: true }, { name: 'plate', label: 'Placa', required: true, ph: 'PBA-1234' }, { name: 'group_id', label: 'Grupo', type: 'select', num: true, empty: '— sin grupo —', options: c.groups.map((g) => [g.id, g.name]) },
      { name: 'status', label: 'Estado', type: 'select', options: [['ACTIVO', 'Activo'], ['MANTENIMIENTO', 'Mantenimiento'], ['BAJA', 'De baja']] }, { name: 'chassis_brand', label: 'Marca de chasis' }, { name: 'body_brand', label: 'Marca de carrocería' }, { name: 'model', label: 'Modelo' }, { name: 'year', label: 'Año', type: 'number' }, { name: 'color', label: 'Color' },
      { name: 'tech_review_expires', label: 'Vence revisión técnica', type: 'date' }, { name: 'registration_expires', label: 'Vence matrícula', type: 'date' }, { name: 'template_id', label: 'Plantilla de asientos (aplica al guardar)', type: 'select', num: true, empty: '— conservar actuales —', options: c.tpls.map((t) => [t.id, `${t.name} (${t.seats})`]) },
      { name: 'amenities', label: 'Servicios (separados por coma)', full: true, ph: 'Aire acondicionado, WiFi, Baño' }],
    transform: (b) => { b.amenities = String(b.amenities || '').split(',').map((x) => x.trim()).filter(Boolean); },
  };
  const orig = crudForm; void orig;
  await crudRender($('#crud_buses'), spec);
  spec.rows.forEach((r) => { r.amenities = (r.amenities || []).join(', '); });
}, CO);
route('/coop/buses/:id/seats', async (p) => {
  const [seats, types, buses] = await Promise.all([api(`/coop/buses/${p.id}/seats`), api('/coop/seat-types'), api('/coop/buses')]);
  const bus = buses.find((b) => String(b.id) === p.id);
  BE = { id: p.id, seats: seats.map((s) => ({ ...s, f: s.floor, r: s.row, c: s.col })), types, tool: 'type', typeId: types[0].id };
  paint(view(), html`<a href="#/coop/buses" class="small">◀ Flota</a><div class="row spread"><h1>Asientos del bus ${bus ? bus.number : ''}</h1>${canWrite() ? html`<button class="btn ok" data-act="beSave">Guardar cambios</button>` : ''}</div>
    <div class="card"><p class="muted small">Elige una herramienta y toca los asientos del mapa. Los asientos con boletos vendidos no se eliminan: se marcan como no vendibles.</p>
    <div class="row mb"><label><input type="radio" name="tool" value="type" checked data-change="beTool"> Asignar tipo:</label><select id="beType" data-change="beType" style="width:auto">${opts(types, types[0].id)}</select><label><input type="radio" name="tool" value="block" data-change="beTool"> Bloquear / habilitar</label><label><input type="radio" name="tool" value="label" data-change="beTool"> Cambiar número</label></div><div class="center" id="beMap"></div></div>`);
  beDraw();
}, CO);
let BE = null;
function beDraw() {
  const floors = [...new Set(BE.seats.map((s) => s.f))].sort();
  paint($('#beMap'), html`<div class="bus"><div class="wheel">🛞 Frente</div>${floors.map((f) => { const list = BE.seats.filter((s) => s.f === f), maxCol = Math.max(...list.map((s) => s.c)); return html`<div>${floors.length > 1 ? html`<div class="small muted center mb">Piso ${f}</div>` : ''}<div class="deck" style="grid-template-columns:repeat(${maxCol},46px)">${list.map((s) => { const ty = BE.types.find((t) => t.id === s.seat_type_id); return html`<button class="seat ${/vip/i.test(ty ? ty.name : '') ? 'vip' : ''} ${s.sellable ? '' : 'bloqueado'}" style="grid-row:${s.r};grid-column:${s.c};width:46px;height:46px" data-act="beSeat" data-l="${s.label}" title="${ty ? ty.name : ''}">${s.label}<div style="font-size:.55rem;font-weight:400">${ty ? ty.name.slice(0, 5) : ''}</div></button>`; })}</div></div>`; })}</div>`);
}
App.A.beTool = (el) => { BE.tool = el.value; };
App.A.beType = (el) => { BE.typeId = +el.value; };
App.A.beSeat = (el) => {
  if (!canWrite()) return;
  const s = BE.seats.find((x) => x.label === el.dataset.l);
  if (BE.tool === 'type') s.seat_type_id = BE.typeId; else if (BE.tool === 'block') s.sellable = s.sellable ? 0 : 1;
  else { const v = prompt('Nuevo número/etiqueta del asiento', s.label); if (v && !BE.seats.some((x) => x.label === v.trim())) s.label = v.trim(); }
  beDraw();
};
App.A.beSave = (el) => guard(el, async () => { await api(`/coop/buses/${BE.id}/seats`, { method: 'PUT', body: { seats: BE.seats.map((s) => ({ f: s.f, r: s.r, c: s.c, label: s.label, seat_type_id: s.seat_type_id, sellable: s.sellable })) } }); toast('Asientos actualizados', 'ok'); });

/* ---------- Plantillas de asientos ---------- */
