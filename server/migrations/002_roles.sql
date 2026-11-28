-- 002 · Roles oficiales (HU-36). 5 roles: SUPERADMIN, COOP_ADMIN, OFFICE, BUS (CHOFER/AYUDANTE), CLIENT.
-- OFFICE: el CHECK no le exige cooperativa; la 003 (HU-48) la vuelve global.
-- DRIVER → BUS/CHOFER · ASSISTANT → BUS/AYUDANTE · AUDITOR → CLIENT desactivado (queda en audit_logs).
-- SQLite no permite cambiar un CHECK: se reconstruye la tabla users (el ejecutor desactiva las FK y verifica al final).
INSERT INTO audit_logs(action, entity, entity_id, before, after, created_at)
  SELECT 'migrate_role', 'users', id, role, 'CLIENT (inactivo)', datetime('now') FROM users WHERE role = 'AUDITOR';

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, cedula TEXT, nombres TEXT NOT NULL, apellidos TEXT NOT NULL, phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','COOP_ADMIN','OFFICE','BUS','CLIENT')),
  crew_position TEXT CHECK (crew_position IN ('CHOFER','AYUDANTE')),
  coop_id INTEGER REFERENCES cooperatives(id), office_id INTEGER REFERENCES offices(id), license TEXT, license_expires TEXT,
  active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  reset_token TEXT, reset_expires TEXT, perm_void INTEGER NOT NULL DEFAULT 0, last_login TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((role = 'BUS') = (crew_position IS NOT NULL)),
  -- OFFICE queda fuera de esta regla: la ventanilla pasa a ser global en la migración 003 (HU-48).
  CHECK (role = 'OFFICE' OR (role IN ('COOP_ADMIN','BUS') AND coop_id IS NOT NULL) OR (role IN ('SUPERADMIN','CLIENT') AND coop_id IS NULL))
);
INSERT INTO users_new (id, email, cedula, nombres, apellidos, phone, password_hash, role, crew_position, coop_id, office_id, license, license_expires,
  active, must_change, failed_attempts, locked_until, reset_token, reset_expires, perm_void, last_login, created_at)
SELECT id, email, cedula, nombres, apellidos, phone, password_hash,
  CASE role WHEN 'DRIVER' THEN 'BUS' WHEN 'ASSISTANT' THEN 'BUS' WHEN 'AUDITOR' THEN 'CLIENT' ELSE role END,
  CASE role WHEN 'DRIVER' THEN 'CHOFER' WHEN 'ASSISTANT' THEN 'AYUDANTE' END,
  CASE WHEN role IN ('SUPERADMIN','CLIENT','AUDITOR') THEN NULL ELSE coop_id END,
  CASE WHEN role IN ('SUPERADMIN','CLIENT','AUDITOR') THEN NULL ELSE office_id END,
  license, license_expires,
  CASE WHEN role = 'AUDITOR' THEN 0 ELSE active END,
  must_change, failed_attempts, locked_until, reset_token, reset_expires, perm_void, last_login, created_at
FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_coop ON users(coop_id, role);
