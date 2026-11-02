const os = require('os'), fs = require('fs'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rutaec-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.UPLOADS_DIR = path.join(dir, 'uploads');
process.env.RATE_LIMIT = '100000';
const { app } = require('../server/index');
const { db } = require('../server/db');
const seed = require('../server/seed');
const util = require('../server/lib/util');

let server, base;
async function boot() {
  const origLog = console.log; console.log = () => {};
  await seed.run({ force: true });
  console.log = origLog;
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
const stop = () => new Promise(r => { server.close(r); server.closeAllConnections(); });
async function api(method, url, { token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  if (raw) return res;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}
async function login(email, password = seed.PASS) { const r = await api('POST', '/api/auth/login', { body: { email, password } }); if (r.status !== 200) throw new Error('login ' + email + ' ' + JSON.stringify(r.data)); return r.data.token; }
module.exports = { boot, stop, api, login, db, util, seed };
