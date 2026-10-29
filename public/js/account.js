/* Cuenta: ingreso, registro, compras, boletos, perfil y páginas informativas */
'use strict';
const DEMO = [['cliente@rutaec.test', 'Cliente'], ['oficina.andina@rutaec.test', 'Oficinista (Andina Express)'], ['chofer1.andina@rutaec.test', 'Chofer'], ['ayudante1.andina@rutaec.test', 'Ayudante'], ['gerente.andina@rutaec.test', 'Admin cooperativa'], ['admin@rutaec.test', 'Superadministrador'], ['auditor@rutaec.test', 'Auditor']];

route('/login', async (p, q) => {
  if (App.user) return go(q.next || HOME[App.user.role]);
  paint(view(), html`<div style="max-width:430px;margin:20px auto"><div class="card"><h1>Ingresar</h1><form data-submit="doLogin"><input type="hidden" name="next" value="${q.next || ''}">
    <div class="field"><label>Correo o cédula</label><input name="email" autocomplete="username" required autofocus></div><div class="field"><label>Contraseña</label><input type="password" name="password" autocomplete="current-password" required></div>
    <button class="btn block lg">Ingresar</button></form><div class="row spread mt small"><a href="#/forgot">¿Olvidaste tu contraseña?</a><a href="#/register">Crear cuenta</a></div></div>
    ${App.cfg.demo ? html`<div class="card flat mt"><b class="small">Cuentas de demostración</b> <span class="small muted">(contraseña <span class="mono">Demo1234!</span>)</span><div class="row mt">${DEMO.map(([e, l]) => html`<button class="btn sm sec" data-act="demoLogin" data-e="${e}">${l}</button>`)}</div></div>` : ''}</div>`);
});
async function afterLogin(r, next) {
  setSession(r.token, r.user); await refreshUser(); await ensureCoopCtx(); shellKey = '';
  if (App.user.must_change) { toast('Por seguridad, cambia tu contraseña temporal'); return go('/profile'); }
  go(next || HOME[App.user.role]);
}
App.A.doLogin = async (f) => { const o = formObj(f); await guard($('button', f), async () => afterLogin(await api('/auth/login', { method: 'POST', body: { email: o.email, password: o.password } }), o.next)); };
App.A.demoLogin = async (el) => guard(el, async () => afterLogin(await api('/auth/login', { method: 'POST', body: { email: el.dataset.e, password: 'Demo1234!' } }), parseHash().q.next));

route('/register', async () => {
  paint(view(), html`<div style="max-width:620px;margin:10px auto"><div class="card"><h1>Crear cuenta</h1><form data-submit="doRegister"><div class="frm">
    <div><label>Nombres</label><input name="nombres" required></div><div><label>Apellidos</label><input name="apellidos" required></div>
    <div><label>Cédula</label><input name="cedula" inputmode="numeric" maxlength="10" pattern="\\d{10}" required></div><div><label>Celular</label><input name="phone" inputmode="tel"></div>
    <div class="full"><label>Correo electrónico</label><input type="email" name="email" required></div>
    <div><label>Contraseña</label><input type="password" name="password" minlength="8" autocomplete="new-password" required><div class="small muted">Mínimo 8 caracteres con letras y números.</div></div><div><label>Repite la contraseña</label><input type="password" name="password2" autocomplete="new-password" required></div></div>
    <label class="mt"><input type="checkbox" name="accept" required> Acepto los <a href="#/terms" target="_blank">términos</a> y la <a href="#/privacy" target="_blank">política de privacidad</a> (LOPDP).</label>
    <button class="btn block lg mt">Crear mi cuenta</button></form></div></div>`);
});
App.A.doRegister = async (f) => { const o = formObj(f); if (o.password !== o.password2) return toast('Las contraseñas no coinciden', 'err'); await guard($('button', f), async () => afterLogin(await api('/auth/register', { method: 'POST', body: o }), parseHash().q.next)); };

route('/forgot', async () => paint(view(), html`<div style="max-width:430px;margin:20px auto" class="card"><h1>Recuperar contraseña</h1><form data-submit="doForgot"><div class="field"><label>Correo registrado</label><input type="email" name="email" required></div><button class="btn block">Enviar enlace</button></form></div>`));
App.A.doForgot = async (f) => guard($('button', f), async () => { await api('/auth/forgot', { method: 'POST', body: formObj(f) }); paint(f.parentElement, html`<h1>Revisa tu correo</h1><p>Si el correo existe, enviamos un enlace para restablecer tu contraseña (válido 30 minutos).</p>${App.cfg.demo ? html`<p class="small muted">Modo demostración: el correo queda en la bandeja interna (Superadmin → Auditoría y correos).</p>` : ''}`); });
route('/reset', async (p, q) => paint(view(), html`<div style="max-width:430px;margin:20px auto" class="card"><h1>Nueva contraseña</h1><form data-submit="doReset"><input type="hidden" name="token" value="${q.token || ''}"><div class="field"><label>Nueva contraseña</label><input type="password" name="password" minlength="8" required></div><button class="btn block">Guardar</button></form></div>`));
App.A.doReset = async (f) => guard($('button', f), async () => { await api('/auth/reset', { method: 'POST', body: formObj(f) }); toast('Contraseña actualizada', 'ok'); go('/login'); });

/* ---------- Mis compras ---------- */
route('/orders', async () => {
  const list = await api('/orders/mine');
  paint(view(), html`<h1>Mis compras</h1>${list.length ? list.map((o) => html`<div class="card"><div class="row spread"><div><b>${o.trip.origin} → ${o.trip.dest}</b> ${chip(o.status)}<div class="small muted">${o.coop_name} · ${fdt(o.depart_at_stop || o.trip.depart_at)} · ${o.tickets.length} boleto(s) · Orden ${o.code}</div>
    <div class="small">${o.tickets.map((t) => `${t.seat_label} (${t.nombres})`).join(', ')}</div>${o.payment && o.payment.status === 'RECHAZADO' && o.status === 'RESERVADO' ? html`<div class="small" style="color:var(--err)">Pago rechazado: ${o.payment.reject_reason}</div>` : ''}</div>
    <div class="right"><b style="font-size:1.2rem">${money(o.total_cents)}</b><div class="mt">${['RESERVADO', 'EN_REVISION'].includes(o.status) ? html`<a class="btn sm" href="#/checkout/${o.id}">${o.status === 'RESERVADO' ? 'Continuar pago' : 'Ver estado'}</a>` : o.status === 'PAGADO' ? html`<a class="btn sm" href="#/tickets">Ver boletos</a>` : ''}</div></div></div></div>`) : html`<div class="card">${empty('Aún no tienes compras.', '🧾')}<div class="center"><a class="btn" href="#/">Buscar viajes</a></div></div>`}`);
}, ['CLIENT']);

/* ---------- Mis boletos ---------- */
route('/tickets', async (p, q) => {
  const all = await api('/tickets/mine'), now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const tab = q.tab || 'next';
  const nextL = all.filter((t) => ['VALIDO', 'ABORDADO'].includes(t.status) && !['FINALIZADO', 'CANCELADO'].includes(t.trip_status)), past = all.filter((t) => !nextL.includes(t));
  void now;
  const list = tab === 'next' ? nextL : past;
  paint(view(), html`<h1>Mis boletos</h1><div class="tabs"><a class="${tab === 'next' ? 'on' : ''}" href="#/tickets?tab=next">Próximos (${nextL.length})</a><a class="${tab === 'past' ? 'on' : ''}" href="#/tickets?tab=past">Historial (${past.length})</a></div>
    ${list.length ? list.map(ticketCard) : html`<div class="card">${empty(tab === 'next' ? 'No tienes boletos próximos.' : 'Sin historial.', '🎫')}${tab === 'next' ? html`<div class="center"><a class="btn" href="#/">Comprar un pasaje</a></div>` : ''}</div>`}`);
}, ['CLIENT']);
function ticketCard(t) {
  const active = ['VALIDO', 'ABORDADO'].includes(t.status);
  return html`<div class="tk mb"><div><div class="hd" style="background:${t.coop_color}"><div class="row spread"><b>${t.coop}</b>${chip(t.status)}</div></div>
    <div class="bd"><div class="route"><div>${t.from.city}<small>${ftime(t.depart_at)} · ${t.from.terminal}</small></div><span>→</span><div>${t.to.city}<small>${ftime(t.arrive_at)} · ${t.to.terminal}</small></div></div>
    <div class="muted small mt">${fdate(t.depart_at)}</div>
    <div class="grid g2 mt small"><div><span class="muted">Pasajero</span><br><b>${t.nombres} ${t.apellidos}</b><br>${t.cedula_masked}</div><div><span class="muted">Asiento</span><br><b>${t.seat_label}</b> · ${t.seat_type}<br>Bus ${t.bus_number} ${t.platform ? '· Andén ' + t.platform : ''}</div>
    <div><span class="muted">Boleto N.º</span><br><span class="mono">${t.number}</span></div><div><span class="muted">Total</span><br><b>${money(t.total_cents)}</b> · ${CAT[t.category]}</div></div>
    <div class="row mt noprint"><button class="btn sm" data-act="bigQr" data-id="${t.id}" ${active ? '' : raw('disabled')}>Pantalla completa</button><button class="btn sm sec" data-act="tkPdf" data-id="${t.id}">PDF</button><button class="btn sm sec" data-act="dlQr" data-id="${t.id}">Guardar QR</button>
    ${['ABORDADO', 'BAJO'].includes(t.status) ? html`<button class="btn sm ghost" data-act="rate" data-trip="${t.trip_id}">Calificar viaje</button>` : ''}</div></div></div>
    <div class="qr">${active ? html`<img data-src="/tickets/${t.id}/qr.png" alt="Código QR del boleto" width="180" height="180"><div class="mono small" style="letter-spacing:2px">${t.short_code}</div><div class="small muted">Código manual</div>` : html`<div class="muted">QR no disponible<br>(${STATUS[t.status] ? STATUS[t.status][1] : t.status})</div>`}</div></div>`;
}
App.A.tkPdf = (el) => openFile(`/tickets/${el.dataset.id}/pdf`);
App.A.dlQr = async (el) => { const u = await blobUrl(`/tickets/${el.dataset.id}/qr.png`); const a = document.createElement('a'); a.href = u; a.download = `boleto-qr-${el.dataset.id}.png`; a.click(); };
App.A.bigQr = (el) => { modal('Muestra este código al abordar', html`<div class="center"><img data-src="/tickets/${el.dataset.id}/qr.png" alt="QR" style="width:min(80vw,380px);height:auto"><p class="small muted">Sube el brillo de tu pantalla. No compartas este código: es de un solo uso.</p></div>`); };
App.A.rate = async (el) => { const stars = await promptBox('Calificar viaje', 'Estrellas (1 a 5)', { type: 'number', value: '5', okLabel: 'Enviar' }); if (!stars) return; try { await api(`/trips/${el.dataset.trip}/rating`, { method: 'POST', body: { stars: +stars } }); toast('¡Gracias por tu calificación!', 'ok'); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Perfil ---------- */
route('/profile', async () => {
  const u = App.user;
  paint(view(), html`<div style="max-width:720px;margin:auto"><h1>Mi perfil</h1>${u.must_change ? html`<div class="alert warn">Tu contraseña es temporal. Cámbiala para continuar usando el sistema con seguridad.</div>` : ''}
    <div class="card"><div class="row spread"><div><b>${u.nombres} ${u.apellidos}</b><div class="small muted">${u.email} · ${ROLE[u.role]} ${u.coop ? '· ' + u.coop.name : ''}</div></div></div>
    <form data-submit="saveProfile" class="mt"><div class="frm"><div><label>Nombres</label><input name="nombres" value="${u.nombres}"></div><div><label>Apellidos</label><input name="apellidos" value="${u.apellidos}"></div><div><label>Celular</label><input name="phone" value="${u.phone || ''}"></div><div><label>Cédula</label><input value="${u.cedula || ''}" disabled></div></div><button class="btn mt">Guardar</button></form></div>
    <div class="card"><h3>Cambiar contraseña</h3><form data-submit="changePass"><div class="frm"><div><label>Actual</label><input type="password" name="current" required></div><div><label>Nueva</label><input type="password" name="password" minlength="8" required></div></div><button class="btn mt">Actualizar</button></form></div>
    <div class="card"><h3>Mis datos (LOPDP)</h3><p class="small muted">Puedes pedir acceso, rectificación o eliminación de tus datos escribiendo a ${App.cfg.support_email}.</p><button class="btn err sm" data-act="logout">Cerrar sesión</button></div></div>`);
}, ['CLIENT', 'OFFICE', 'DRIVER', 'ASSISTANT', 'COOP_ADMIN', 'AUDITOR']);
App.A.saveProfile = async (f) => guard($('button', f), async () => { App.user = { ...App.user, ...(await api('/auth/me', { method: 'PUT', body: formObj(f) })) }; toast('Perfil actualizado', 'ok'); });
App.A.changePass = async (f) => guard($('button', f), async () => { await api('/auth/change-password', { method: 'POST', body: formObj(f) }); App.user.must_change = 0; f.reset(); toast('Contraseña actualizada', 'ok'); });
