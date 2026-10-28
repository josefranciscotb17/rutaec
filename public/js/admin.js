/* Superadministrador y auditor: resumen global, cooperativas, usuarios, sitio, geografía y auditoría */
'use strict';
const ADM = ['AUDITOR'];
const isSA = () => App.user.role === 'SUPERADMIN';

route('/admin', async () => {
  const s = await api('/admin/stats');
  paint(view(), html`<h1>Resumen global</h1><div class="grid g4 mb"><div class="card kpi"><span>Cooperativas activas</span><b>${s.coops}</b></div><div class="card kpi"><span>Buses activos</span><b>${s.buses}</b></div><div class="card kpi"><span>Clientes registrados</span><b>${s.clients}</b></div><div class="card kpi"><span>Ventas de hoy</span><b>${money(s.sales_today.s)}</b><span>${s.sales_today.n} boletos</span></div></div>
    <div class="grid g2"><div class="card"><h3>Ventas últimos 7 días</h3>${s.last7.length ? bars(s.last7, 'day', 'revenue') : empty('Sin ventas')}</div><div class="card"><h3>Ingresos por cooperativa</h3>${bars(s.by_coop, 'name', 'revenue')}</div></div>`);
}, ADM);
