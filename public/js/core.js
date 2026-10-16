/* RutaEC · núcleo del front-end: utilidades, API, plantillas seguras, router, modales */
'use strict';
const App = { cfg: {}, user: null, token: null, cat: null, routes: [], A: {}, tmr: [] };
try { App.token = localStorage.getItem('rutaec_token'); } catch (e) { /* almacenamiento bloqueado */ }

/* ---- Plantillas con escape automático ---- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const toS = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(toS).join('') : esc(v));
const html = (st, ...v) => new Raw(st.reduce((a, s, i) => a + s + (i < v.length ? toS(v[i]) : ''), ''));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = () => $('#view');
function paint(el, r) { el.innerHTML = r instanceof Raw ? r.s : esc(r); hydrate(el); }

/* ---- Formato ---- */
const money = (c) => (c == null ? '—' : (c < 0 ? '-$' : '$') + Math.abs(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fdate = (s) => { if (!s) return ''; const d = new Date(s.slice(0, 10) + 'T00:00:00'); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
const ftime = (s) => (s ? s.slice(11, 16) : '');
const fdt = (s) => (s ? `${fdate(s)} · ${ftime(s)}` : '');
const dur = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil' }).format(new Date());
const addD = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const STATUS = { RESERVADO: ['warn', 'Reservado'], EN_REVISION: ['info', 'En revisión'], PAGADO: ['ok', 'Pagado'], EXPIRADO: ['gray', 'Expirado'], CANCELADO: ['err', 'Cancelado'], VALIDO: ['ok', 'Válido'], ABORDADO: ['info', 'Abordado'], BAJO: ['gray', 'Finalizado'], ANULADO: ['err', 'Anulado'], NO_SHOW: ['gray', 'No se presentó'], PROGRAMADO: ['info', 'Programado'], ABORDANDO: ['warn', 'Abordando'], EN_RUTA: ['ok', 'En ruta'], FINALIZADO: ['gray', 'Finalizado'], APROBADO: ['ok', 'Aprobado'], RECHAZADO: ['err', 'Rechazado'], PENDIENTE: ['warn', 'Pendiente'], ACTIVO: ['ok', 'Activo'], MANTENIMIENTO: ['warn', 'Mantenimiento'], BAJA: ['err', 'De baja'], BORRADOR: ['warn', 'Borrador'], PUBLICADA: ['ok', 'Publicada'] };
const chip = (s) => { const [c, t] = STATUS[s] || ['', s]; return html`<span class="chip ${c}">${t}</span>`; };
const ROLE = { SUPERADMIN: 'Superadministrador', COOP_ADMIN: 'Administrador de cooperativa', OFFICE: 'Oficinista', DRIVER: 'Chofer', ASSISTANT: 'Ayudante', CLIENT: 'Cliente', AUDITOR: 'Auditor' };
const CAT = { ADULTO: 'Adulto', MENOR: 'Menor de edad', TERCERA_EDAD: 'Tercera edad', DISCAPACIDAD: 'Discapacidad' };
const opts = (list, sel, val = (x) => x.id, lab = (x) => x.name) => list.map((x) => html`<option value="${val(x)}" ${String(val(x)) === String(sel) ? raw('selected') : ''}>${lab(x)}</option>`);

/* ---- API ---- */
async function api(path, { method = 'GET', body, form, quiet } = {}) {
  const headers = {};
  if (App.token) headers.Authorization = 'Bearer ' + App.token;
  const ctx = (() => { try { return localStorage.getItem('rutaec_coop'); } catch (e) { return null; } })();
  if (ctx && App.user && ['SUPERADMIN', 'AUDITOR'].includes(App.user.role)) headers['X-Coop-Id'] = ctx;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload }); } catch (e) { const err = new Error('Sin conexión con el servidor'); err.offline = true; throw err; }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && App.token && !path.startsWith('/auth/login')) { logout(true); }
    const err = new Error((data && data.error) || 'Error ' + res.status); err.status = res.status; err.code = data && data.code; throw err;
  }
  return data;
}
async function blobUrl(path) {
  const res = await fetch('/api' + path, { headers: App.token ? { Authorization: 'Bearer ' + App.token } : {} });
  if (!res.ok) throw new Error('No se pudo cargar el archivo');
  return URL.createObjectURL(await res.blob());
}
function hydrate(root) {
  $$('img[data-src]', root).forEach(async (img) => { try { img.src = await blobUrl(img.dataset.src); img.removeAttribute('data-src'); } catch (e) { img.alt = 'no disponible'; } });
}
const withToken = (p) => `/api${p}${p.includes('?') ? '&' : '?'}token=${encodeURIComponent(App.token || '')}`;
async function openFile(path) { const w = window.open('', '_blank'); try { const u = await blobUrl(path); if (w) w.location = u; else location.href = u; } catch (e) { if (w) w.close(); toast(e.message, 'err'); } }
function openPrint(path, extra = '') { const w = window.open(withToken(path) + extra, '_blank', 'width=480,height=720'); if (!w) toast('Permite las ventanas emergentes para imprimir', 'err'); }

/* ---- UI ---- */
function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500); }
function modal(title, body, { wide, onclose } = {}) {
  closeModal();
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'modal';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="row spread"><h2>${esc(title)}</h2><button class="iconbtn" style="color:#333" data-act="closeModal" aria-label="Cerrar">✕</button></div><div id="modalBody"></div></div>`;
  document.body.appendChild(ov); ov._onclose = onclose;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
  paint($('#modalBody'), body);
  return ov;
}
function closeModal() { const m = $('#modal'); if (m) { if (m._onclose) m._onclose(); m.remove(); } }
App.A.closeModal = closeModal;
const confirmBox = (title, msg, okLabel = 'Confirmar') => new Promise((res) => {
  modal(title, html`<p>${msg}</p><div class="row mt"><button class="btn err" data-act="cfmYes">${okLabel}</button><button class="btn ghost" data-act="cfmNo">Cancelar</button></div>`, { onclose: () => res(false) });
  App.A.cfmYes = () => { const m = $('#modal'); m._onclose = null; closeModal(); res(true); }; App.A.cfmNo = () => closeModal();
});
const promptBox = (title, label, { value = '', okLabel = 'Aceptar', type = 'text', area } = {}) => new Promise((res) => {
  modal(title, html`<form data-submit="pmtOk"><div class="field"><label>${label}</label>${area ? html`<textarea name="v" rows="3" required>${value}</textarea>` : html`<input name="v" type="${type}" value="${value}" required autofocus>`}</div><div class="row"><button class="btn">${okLabel}</button><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button></div></form>`, { onclose: () => res(null) });
  App.A.pmtOk = (f) => { const v = f.v.value; $('#modal')._onclose = null; closeModal(); res(v); };
});
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn._t = btn.innerHTML; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>'; } else if (btn._t) btn.innerHTML = btn._t; }
const formObj = (f) => { const o = {}; new FormData(f).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); $$('input[type=checkbox]', f).forEach((c) => { if (c.name) o[c.name] = c.checked; }); return o; };
async function guard(btn, fn) { busy(btn, true); try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { busy(btn, false); } }
const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado', 'ok'); } catch (e) { toast('No se pudo copiar', 'err'); } };
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const clearTimers = () => { App.tmr.forEach(clearInterval); App.tmr = []; };
const every = (fn, ms) => { const i = setInterval(fn, ms); App.tmr.push(i); return i; };
const loading = () => html`<div class="loading"><span class="spinner"></span></div>`;
const empty = (m, icon = '🗂️') => html`<div class="empty"><div style="font-size:2rem">${icon}</div>${m}</div>`;
const tbl = (head, rows, cls = '') => html`<div class="tbl"><table class="${cls}"><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
function bars(rows, key, val, fmt = money) { const max = Math.max(1, ...rows.map((r) => r[val])); return html`<div class="bars">${rows.map((r) => html`<div class="bar-row"><span title="${r[key]}">${String(r[key]).slice(0, 34)}</span><i style="width:${Math.max(2, (r[val] / max) * 100)}%"></i><b class="right">${fmt(r[val])}</b></div>`)}</div>`; }

/* ---- Eventos delegados ---- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && App.A[el.dataset.act]) { if (el.tagName === 'A') e.preventDefault(); App.A[el.dataset.act](el, e); }
  else if (!e.target.closest('.side') && !e.target.closest('[data-act=menu]')) { const s = $('.side'); if (s) s.classList.remove('open'); }
});
document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-submit]'); if (f) { e.preventDefault(); const fn = App.A[f.dataset.submit]; if (fn) fn(f, e); } });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && App.A[el.dataset.change]) App.A[el.dataset.change](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && App.A[el.dataset.input]) App.A[el.dataset.input](el, e); });

/* ---- Router por hash ---- */
function route(pattern, handler, roles) { const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); App.routes.push({ re, keys, handler, roles }); }
const go = (p) => { if (location.hash === '#' + p) dispatch(); else location.hash = p; };
function parseHash() { const h = location.hash.slice(1) || '/'; const [path, qs] = h.split('?'); return { path, q: Object.fromEntries(new URLSearchParams(qs || '')) }; }
async function dispatch() {
  clearTimers(); closeModal();
  const { path, q } = parseHash();
  for (const r of App.routes) {
    const m = path.match(r.re); if (!m) continue;
    const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (r.roles && !App.user) return go('/login?next=' + encodeURIComponent(location.hash.slice(1)));
    if (r.roles && !(r.roles.includes(App.user.role) || App.user.role === 'SUPERADMIN')) { renderShell(); paint(view(), html`<div class="card">${empty('No tienes permiso para ver esta página.', '🔒')}</div>`); return; }
    renderShell(path);
    paint(view(), loading());
    try { await r.handler(params, q); } catch (e) { paint(view(), html`<div class="alert err">${e.message}</div>`); if (e.status === 401) logout(true); }
    window.scrollTo(0, 0); return;
  }
  renderShell(path); paint(view(), html`<div class="card">${empty('Página no encontrada', '🧭')}</div>`);
}
window.addEventListener('hashchange', dispatch);

/* ---- Sesión ---- */
function setSession(token, user) { App.token = token; App.user = user; try { localStorage.setItem('rutaec_token', token); } catch (e) { /* */ } }
function logout(expired) { App.token = null; App.user = null; try { localStorage.removeItem('rutaec_token'); } catch (e) { /* */ } if (expired) toast('Tu sesión expiró. Inicia sesión nuevamente.', 'err'); go('/login'); }
async function refreshUser() { if (!App.token) return; try { App.user = await api('/auth/me'); } catch (e) { App.token = null; App.user = null; } }
const HOME = { CLIENT: '/', OFFICE: '/office', DRIVER: '/driver', ASSISTANT: '/driver', COOP_ADMIN: '/coop', AUDITOR: '/coop', SUPERADMIN: '/admin' };
window.App = App;
