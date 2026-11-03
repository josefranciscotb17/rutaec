/* Genera docs/API.md leyendo las rutas de Express. Uso: npm run docs:api */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'server', 'routes');
const files = { 'public.js': 'Público (sin sesión)', 'auth.js': 'Autenticación (/api/auth)', 'sales.js': 'Compras, boletos, oficina y caja', 'driver.js': 'Chofer / ayudante', 'coop.js': 'Cooperativa', 'admin.js': 'Administración y auditoría' };
let md = '# Referencia de la API REST\n\n> Generado automáticamente con `npm run docs:api`. Todas las rutas cuelgan de `/api` (la autenticación de `auth.js` va bajo `/api/auth`). Las respuestas son JSON; los errores tienen la forma `{ "error": "mensaje", "code": "CODIGO" }`.\n\n**Autenticación:** cabecera `Authorization: Bearer <token>` (JWT de 12 h obtenido en `POST /api/auth/login`). Los documentos imprimibles aceptan además `?token=` en `GET` para abrirse en una ventana nueva.\n\n**Contexto de cooperativa:** superadministrador y auditor indican la cooperativa con la cabecera `X-Coop-Id` (o `?coop_id=`).\n\n';
for (const [f, title] of Object.entries(files)) {
  if (!fs.existsSync(path.join(dir, f))) continue; // módulos aún no incorporados al repositorio
  const src = fs.readFileSync(path.join(dir, f), 'utf8'), rows = [];
  const re = /router\.(get|post|put|delete|patch)\(\s*'([^']+)'([^\n]*)/g; let m;
  while ((m = re.exec(src))) {
    const guards = m[3];
    let access = 'Público';
    if (/requireRole\('AUDITOR'\)|\bboth\b/.test(guards)) access = 'Auditor / Superadmin (lectura)';
    else if (/\bsa\b/.test(guards)) access = 'Superadmin';
    else if (/\bwrite\b/.test(guards)) access = 'Admin de cooperativa';
    else if (/\bread\b/.test(guards)) access = 'Admin de cooperativa / Auditor';
    else if (/\.\.\.office|requireRole\('OFFICE'/.test(guards)) access = 'Oficinista / Admin coop';
    else if (/\.\.\.crew/.test(guards)) access = 'Chofer / Ayudante';
    else if (/requireAuth/.test(guards)) access = 'Sesión iniciada';
    const prefix = f === 'auth.js' ? '/auth' : '';
    rows.push(`| \`${m[1].toUpperCase()}\` | \`/api${prefix}${m[2]}\` | ${access} |`);
  }
  // CRUD genéricos de coop.js
  if (f === 'coop.js') for (const m of src.matchAll(/^crud\('([^']+)'/gm)) for (const [v, p, a] of [['GET', m[1], 'lista'], ['POST', m[1], 'crear'], ['PUT', m[1] + '/:id', 'editar'], ['DELETE', m[1] + '/:id', 'eliminar']]) rows.push(`| \`${v}\` | \`/api${p}\` | Admin de cooperativa (${a}) |`);
  md += `## ${title}\n\n| Método | Ruta | Acceso |\n|---|---|---|\n${rows.join('\n')}\n\n`;
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'API.md'), md);
console.log('docs/API.md generado');
