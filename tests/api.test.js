const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, stop, api, login, db, util } = require('./helpers');

test.before(boot);
test.after(stop);

test('configuración pública y catálogo', async () => {
  const c = await api('GET', '/api/config'); assert.equal(c.status, 200); assert.equal(c.data.site_name, 'RutaEC');
  const cat = await api('GET', '/api/catalog'); assert.ok(cat.data.cities.length >= 10); assert.ok(cat.data.coops.length === 3);
});

test('login: credenciales incorrectas y bloqueo', async () => {
  const bad = await api('POST', '/api/auth/login', { body: { email: 'cliente4@rutaec.test', password: 'mala' } });
  assert.equal(bad.status, 401);
  for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login', { body: { email: 'cliente3@rutaec.test', password: 'x' + i } });
  const locked = await api('POST', '/api/auth/login', { body: { email: 'cliente3@rutaec.test', password: 'Demo1234!' } });
  assert.equal(locked.status, 423);
});

test('registro valida cédula ecuatoriana', async () => {
  const r = await api('POST', '/api/auth/register', { body: { email: 'nuevo@ejemplo.com', password: 'Clave1234', cedula: '1234567890', nombres: 'A', apellidos: 'B', accept: true } });
  assert.equal(r.status, 400);
  const ok = await api('POST', '/api/auth/register', { body: { email: 'nuevo@ejemplo.com', password: 'Clave1234', cedula: util.makeCedula('171234567'), nombres: 'Nuevo', apellidos: 'Usuario', accept: true } });
  assert.equal(ok.status, 201); assert.ok(ok.data.token);
});
