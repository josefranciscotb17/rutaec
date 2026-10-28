/* Superadministrador y auditor: resumen global, cooperativas, usuarios, sitio, geografía y auditoría */
'use strict';
const ADM = ['AUDITOR'];
const isSA = () => App.user.role === 'SUPERADMIN';

route('/admin', async () => {
  const s = await api('/admin/stats');
  paint(view(), html`<h1>Resumen global</h1><div class="grid g4 mb"><div class="card kpi"><span>Cooperativas activas</span><b>${s.coops}</b></div><div class="card kpi"><span>Buses activos</span><b>${s.buses}</b></div><div class="card kpi"><span>Clientes registrados</span><b>${s.clients}</b></div><div class="card kpi"><span>Ventas de hoy</span><b>${money(s.sales_today.s)}</b><span>${s.sales_today.n} boletos</span></div></div>
    <div class="grid g2"><div class="card"><h3>Ventas últimos 7 días</h3>${s.last7.length ? bars(s.last7, 'day', 'revenue') : empty('Sin ventas')}</div><div class="card"><h3>Ingresos por cooperativa</h3>${bars(s.by_coop, 'name', 'revenue')}</div></div>`);
}, ADM);

route('/admin/coops', async () => {
  paint(view(), html`<h1>Cooperativas</h1><div id="crud_coops"></div>`);
  const spec = {
    key: 'coops', title: '', url: '/admin/cooperatives', single: 'cooperativa', newLabel: 'Nueva cooperativa', wide: true,
    cols: [['Nombre', (r) => html`<b style="color:${r.color}">${r.short_name || r.name}</b><div class="small muted">${r.name}</div>`], ['RUC', (r) => r.ruc || '—'], ['Buses', (r) => r.buses], ['Usuarios', (r) => r.users], ['Contacto', (r) => `${r.phone || ''} ${r.email || ''}`], ['Activa', (r) => yesno(r.active)]],
    extra: (r) => html`<button class="btn sm sec" data-act="ctxCoop" data-id="${r.id}">Administrar</button> `,
    fields: (c, row) => [{ name: 'name', label: 'Razón social', required: true, full: true }, { name: 'short_name', label: 'Nombre corto' }, { name: 'ruc', label: 'RUC (13 dígitos, termina en 001)', maxlength: 13 }, { name: 'phone', label: 'Teléfono' }, { name: 'email', label: 'Correo', type: 'email' }, { name: 'address', label: 'Dirección', full: true }, { name: 'color', label: 'Color', type: 'color', def: '#134074' },
      ...(row ? [{ name: 'active', label: 'Activa', type: 'checkbox' }] : [{ name: 'admin_email', label: 'Correo del administrador inicial', type: 'email', hint: 'Se crea con contraseña temporal' }, { name: 'admin_nombres', label: 'Nombres del administrador' }, { name: 'admin_apellidos', label: 'Apellidos del administrador' }])],
    transform: (b) => { if (b.admin_email) b.admin = { email: b.admin_email, nombres: b.admin_nombres, apellidos: b.admin_apellidos }; delete b.admin_email; delete b.admin_nombres; delete b.admin_apellidos; },
  };
  await crudRender($('#crud_coops'), spec);
}, ADM);
App.A.ctxCoop = (el) => { try { localStorage.setItem('rutaec_coop', el.dataset.id); } catch (e) { /* */ } shellKey = ''; go('/coop'); };

route('/admin/users', async (p, q) => {
  const [coops, users] = await Promise.all([api('/admin/cooperatives'), api('/admin/users?' + new URLSearchParams(q))]);
  window.__coops = coops;
  paint(view(), html`<div class="row spread"><h1>Usuarios</h1>${isSA() ? html`<button class="btn" data-act="uNew">+ Superadmin / auditor / admin de cooperativa</button>` : ''}</div>
    <div class="card mb"><form data-submit="uSearch" class="row"><input name="q" class="grow" placeholder="Nombre, correo o cédula" value="${q.q || ''}"><select name="role" style="width:auto"><option value="">Todos los roles</option>${Object.entries(ROLE).map(([k, v]) => html`<option value="${k}" ${q.role === k ? raw('selected') : ''}>${v}</option>`)}</select><select name="coop_id" style="width:auto"><option value="">Todas las cooperativas</option>${opts(coops, q.coop_id, (c) => c.id, (c) => c.short_name || c.name)}</select><button class="btn">Filtrar</button></form></div>
    <div class="card">${users.length ? tbl(['Usuario', 'Rol', 'Cooperativa', 'Último ingreso', 'Estado', ''], users.map((u) => html`<tr><td><b>${u.nombres} ${u.apellidos}</b><div class="small muted">${u.email}</div></td><td>${ROLE[u.role]}</td><td>${u.coop || '—'}</td><td class="small">${u.last_login || '—'}</td><td>${u.locked_until && u.locked_until > '0' ? chip('PENDIENTE') : ''} ${u.active ? chip('ACTIVO') : chip('BAJA')}</td>
      <td class="right nowrap">${isSA() ? html`<button class="btn sm sec" data-act="uToggle" data-id="${u.id}" data-a="${u.active ? 0 : 1}">${u.active ? 'Suspender' : 'Activar'}</button> <button class="btn sm sec" data-act="uReset" data-id="${u.id}">Clave</button>` : ''}</td></tr>`)) : empty('Sin resultados.', '👤')}</div>`);
}, ADM);
App.A.uSearch = (f) => { const o = formObj(f); go('/admin/users?' + new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v)))); };
App.A.uToggle = async (el) => { try { await api('/admin/users/' + el.dataset.id, { method: 'PUT', body: { active: +el.dataset.a } }); dispatch(); } catch (e) { toast(e.message, 'err'); } };
App.A.uReset = async (el) => { if (!(await confirmBox('Restablecer contraseña', 'Se generará una contraseña temporal.', 'Restablecer'))) return; try { const r = await api(`/admin/users/${el.dataset.id}/reset-password`, { method: 'POST' }); modal('Contraseña temporal', html`<div class="alert ok mono" style="font-size:1.4rem;text-align:center">${r.temp_password}</div>`); } catch (e) { toast(e.message, 'err'); } };
App.A.uNew = () => modal('Nuevo usuario', html`<form data-submit="uCreate"><div class="frm"><div><label>Nombres</label><input name="nombres" required></div><div><label>Apellidos</label><input name="apellidos" required></div><div class="full"><label>Correo</label><input type="email" name="email" required></div><div><label>Rol</label><select name="role"><option value="COOP_ADMIN">Administrador de cooperativa</option><option value="AUDITOR">Auditor</option><option value="SUPERADMIN">Superadministrador</option></select></div><div><label>Cooperativa (si aplica)</label><select name="coop_id"><option value="">—</option>${opts(window.__coops, '', (c) => c.id, (c) => c.short_name || c.name)}</select></div></div><button class="btn mt">Crear</button></form>`);
App.A.uCreate = (f) => guard($('button', f), async () => { const o = formObj(f); const r = await api('/admin/users', { method: 'POST', body: { ...o, coop_id: o.coop_id ? +o.coop_id : null } }); closeModal(); modal('Usuario creado', html`<p>Contraseña temporal:</p><div class="alert ok mono" style="font-size:1.4rem;text-align:center">${r.temp_password}</div>`, { onclose: dispatch }); });

/* ---------- Sitio y reglas ---------- */
