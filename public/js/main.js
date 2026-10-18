/* Estructura de la aplicación (cabecera, menú lateral, pie) y arranque */
'use strict';
const NAV = {
  CLIENT: [['/', 'Buscar viajes', '🔎'], ['/tickets', 'Mis boletos', '🎫'], ['/orders', 'Mis compras', '🧾'], ['/help', 'Ayuda', '❓']],
  OFFICE: [['/office', 'Panel', '🏠'], ['/office/sell', 'Vender boletos', '🎟️'], ['/office/payments', 'Pagos por validar', '✅'], ['/office/orders', 'Órdenes y búsqueda', '🔍'], ['/office/cash', 'Caja', '💵'], ['/office/trips', 'Salidas y manifiestos', '🚌']],
  DRIVER: [['/driver', 'Mis viajes', '🚌'], ['/driver/history', 'Historial', '🕘']],
  COOP: [['/coop', 'Panel', '📊'], ['/coop/trips', 'Viajes del día', '🚌'], ['/coop/sheets', 'Hojas de ruta', '🗓️'], ['/coop/frequencies', 'Frecuencias y tarifas', '🛣️'], ['/coop/buses', 'Flota', '🚍'], ['/coop/templates', 'Plantillas de asientos', '💺'], ['/coop/staff', 'Personal', '👥'], ['/coop/setup', 'Oficinas, bancos y temporadas', '🏦'], ['/coop/reports', 'Reportes', '📈'], ['/coop/audit', 'Auditoría e incidencias', '🛡️']],
  ADMIN: [['/admin', 'Resumen global', '🌎'], ['/admin/coops', 'Cooperativas', '🏢'], ['/admin/users', 'Usuarios', '👤'], ['/admin/settings', 'Sitio y reglas', '⚙️'], ['/admin/geo', 'Ciudades y terminales', '📍'], ['/admin/audit', 'Auditoría y correos', '🛡️']],
};
const STAFF = ['OFFICE', 'DRIVER', 'ASSISTANT', 'COOP_ADMIN', 'AUDITOR', 'SUPERADMIN'];
function navGroups(u) {
  if (!u || u.role === 'CLIENT') return [['', NAV.CLIENT]];
  if (u.role === 'OFFICE') return [['Oficina', NAV.OFFICE]];
  if (u.role === 'DRIVER' || u.role === 'ASSISTANT') return [['Ruta', NAV.DRIVER]];
  if (u.role === 'COOP_ADMIN' || u.role === 'AUDITOR') return [['Cooperativa', NAV.COOP], ...(u.role === 'AUDITOR' ? [['Global', [['/admin', 'Resumen global', '🌎'], ['/admin/audit', 'Auditoría y correos', '🛡️']]]] : [])];
  return [['Global', NAV.ADMIN], ['Cooperativa (contexto)', NAV.COOP], ['Operación', NAV.OFFICE.slice(1)]];
}
let shellKey = '';
async function renderShell(path = '/') {
  const u = App.user, key = (u ? u.role + u.id : 'anon');
  if (key !== shellKey || !$('#view')) {
    shellKey = key;
    const cfg = App.cfg, groups = navGroups(u), isStaff = u && STAFF.includes(u.role);
    const logo = cfg.logo ? `<img src="${esc(cfg.logo)}" alt="">` : `<span class="dot">R</span>`;
    const side = isStaff ? `<aside class="side" id="side">${['SUPERADMIN', 'AUDITOR'].includes(u.role) ? '<div class="field" style="padding:0 6px"><label>Cooperativa en contexto</label><select id="coopCtx" data-change="coopCtx"></select></div>' : ''}${groups.map(([t, items]) => `${t ? `<h4>${esc(t)}</h4>` : ''}${items.map(([p, l, i]) => `<a href="#${p}" data-path="${p}">${i} ${esc(l)}</a>`).join('')}`).join('')}</aside>` : '';
    const topnav = !isStaff ? `<nav>${NAV.CLIENT.map(([p, l]) => `<a href="#${p}" data-path="${p}">${esc(l)}</a>`).join('')}</nav>` : '';
    const tabbar = !isStaff ? `<div class="tabbar">${[['/', 'Buscar', '🔎'], ['/tickets', 'Boletos', '🎫'], ['/orders', 'Compras', '🧾'], [u ? '/profile' : '/login', u ? 'Perfil' : 'Entrar', '👤']].map(([p, l, i]) => `<a href="#${p}" data-path="${p}"><b>${i}</b>${l}</a>`).join('')}</div>` : '';
    const foot = !isStaff ? `<footer class="foot"><div class="cols"><div><b>${esc(cfg.site_name)}</b><br>${esc(cfg.tagline)}<br><span class="small">© ${new Date().getFullYear()} · Ecuador</span></div>
      <div><b>Ayuda</b><br><a href="#/help">Preguntas frecuentes</a><br><a href="#/terms">Términos y condiciones</a><br><a href="#/privacy">Privacidad (LOPDP)</a></div>
      <div><b>Contacto</b><br>${esc(cfg.support_email)}<br>${esc(cfg.support_phone)}<br><span class="small">${esc(cfg.support_hours)}</span></div>
      <div><b>Síguenos</b><br>${['facebook', 'instagram', 'tiktok', 'twitter', 'youtube'].filter((k) => cfg[k]).map((k) => `<a href="${esc(cfg[k])}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a>`).join(' · ')}${cfg.whatsapp ? `<br><a href="https://wa.me/${esc(cfg.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div></footer>` : '';
    $('#app').innerHTML = `<header class="top">${isStaff ? '<button class="iconbtn burger" data-act="menu" aria-label="Menú">☰</button>' : ''}<a class="brand" href="#${u ? HOME[u.role] : '/'}">${logo}<span>${esc(cfg.site_name)}</span></a>${topnav}<span class="sp"></span>
      ${u ? `<button class="iconbtn" data-act="notifs" aria-label="Notificaciones">🔔${u.unread ? `<span class="badge">${u.unread}</span>` : ''}</button><a class="iconbtn" href="#/profile" title="${esc(u.nombres)}">👤</a><button class="iconbtn" data-act="logout" title="Salir" style="font-size:.9rem;font-weight:700">Salir</button>` : '<a class="btn acc sm" href="#/login">Ingresar</a><a class="btn sm sec" href="#/register">Crear cuenta</a>'}</header>
      <div class="layout">${side}<div style="flex:1;min-width:0;display:flex;flex-direction:column"><main id="view"></main>${foot}</div></div>${tabbar}`;
    if ($('#coopCtx')) loadCoopCtx();
  }
  $$('[data-path]').forEach((a) => { const p = a.dataset.path; a.classList.toggle('on', p === path || (p.length > 1 && path.startsWith(p + '/') && !$$('[data-path]').some((b) => b.dataset.path.length > p.length && (path === b.dataset.path || path.startsWith(b.dataset.path + '/'))))); });
  const s = $('#side'); if (s) s.classList.remove('open');
}
async function loadCoopCtx() {
  const list = await api('/admin/cooperatives'); let cur = ''; try { cur = localStorage.getItem('rutaec_coop') || ''; } catch (e) { /* */ }
  if (!cur || !list.find((c) => String(c.id) === cur)) { cur = String(list[0] && list[0].id || ''); try { localStorage.setItem('rutaec_coop', cur); } catch (e) { /* */ } }
  paint($('#coopCtx'), html`${opts(list, cur, (c) => c.id, (c) => c.short_name || c.name)}`);
}
App.A.coopCtx = (el) => { try { localStorage.setItem('rutaec_coop', el.value); } catch (e) { /* */ } dispatch(); };
App.A.menu = () => $('#side').classList.toggle('open');
App.A.logout = () => { logout(); shellKey = ''; renderShell(); };
App.A.notifs = async () => {
  const list = await api('/notifications');
  modal('Notificaciones', list.length ? html`${list.map((n) => html`<div class="card flat ${n.read ? '' : 'unread'}" style="${n.read ? '' : 'border-left:4px solid var(--accent)'}"><b>${n.title}</b><div class="small">${n.body}</div><div class="small muted">${fdt(n.created_at)} ${n.link ? html`· <a href="${n.link}" data-act="closeModal">abrir</a>` : ''}</div></div>`)}` : empty('Sin notificaciones', '🔔'));
  if (App.user.unread) { await api('/notifications/read', { method: 'POST' }); App.user.unread = 0; $$('.badge', $('.top')).forEach((b) => b.remove()); }
};

async function ensureCoopCtx() {
  if (!App.user || !['SUPERADMIN', 'AUDITOR'].includes(App.user.role)) return;
  try { const l = await api('/admin/cooperatives'); let cur = ''; try { cur = localStorage.getItem('rutaec_coop') || ''; } catch (e) { /* */ } if (!l.find((c) => String(c.id) === cur)) { try { localStorage.setItem('rutaec_coop', String(l[0] && l[0].id || '')); } catch (e) { /* */ } } } catch (e) { /* */ }
}
async function boot() {
  try { App.cfg = await api('/config'); } catch (e) { App.cfg = { site_name: 'RutaEC' }; }
  const r = document.documentElement.style;
  if (App.cfg.primary_color) { r.setProperty('--primary', App.cfg.primary_color); r.setProperty('--secondary', App.cfg.secondary_color); r.setProperty('--accent', App.cfg.accent_color); }
  document.title = `${App.cfg.site_name} · Pasajes interprovinciales del Ecuador`;
  await refreshUser();
  await ensureCoopCtx();
  if (!location.hash) location.hash = App.user ? HOME[App.user.role] : '/';
  dispatch();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  setInterval(async () => { if (App.user && !document.hidden) { try { const u = await api('/auth/me'); if (u.unread !== App.user.unread) { App.user.unread = u.unread; shellKey = ''; renderShell(parseHash().path); } } catch (e) { /* */ } } }, 60000);
}
boot();
