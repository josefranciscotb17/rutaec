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
