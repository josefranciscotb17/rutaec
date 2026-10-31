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
