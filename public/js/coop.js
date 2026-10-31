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
