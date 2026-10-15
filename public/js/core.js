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
