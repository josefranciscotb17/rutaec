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
