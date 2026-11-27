// Ejecutor de migraciones: aplica una sola vez cada archivo y revierte si una migración falla.
require('./helpers');
const { test } = require('node:test');
const assert = require('node:assert');
const { db } = require('../server/db');
const migrate = require('../server/migrate');

test('migraciones: todas aplicadas y ninguna pendiente', () => {
  const done = db.prepare('SELECT version FROM schema_version ORDER BY version').all().map((r) => r.version);
  assert.ok(done.includes('001_schema_version.sql'));
  assert.deepEqual(migrate.pending(db), []);
  assert.deepEqual(migrate.run(db, { log: () => {} }), [], 'volver a ejecutar no aplica nada');
});
