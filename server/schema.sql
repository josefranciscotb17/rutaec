-- RutaEC - Esquema de base de datos (SQLite). Dinero en centavos enteros. Fechas locales America/Guayaquil (texto ISO sin zona).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS provinces (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS cities (id INTEGER PRIMARY KEY, province_id INTEGER NOT NULL REFERENCES provinces(id), name TEXT NOT NULL, UNIQUE(province_id, name));
CREATE TABLE IF NOT EXISTS terminals (id INTEGER PRIMARY KEY, city_id INTEGER NOT NULL REFERENCES cities(id), name TEXT NOT NULL, address TEXT, lat REAL, lng REAL);

CREATE TABLE IF NOT EXISTS cooperatives (
  id INTEGER PRIMARY KEY, ruc TEXT UNIQUE, name TEXT NOT NULL, short_name TEXT, color TEXT DEFAULT '#134074',
  phone TEXT, email TEXT, address TEXT, logo TEXT, active INTEGER NOT NULL DEFAULT 1, ticket_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), bank TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'Ahorros',
  number TEXT NOT NULL, holder TEXT NOT NULL, holder_id TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS offices (id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), terminal_id INTEGER REFERENCES terminals(id), name TEXT NOT NULL, printer_width INTEGER NOT NULL DEFAULT 80, auto_print INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, cedula TEXT, nombres TEXT NOT NULL, apellidos TEXT NOT NULL, phone TEXT,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','COOP_ADMIN','OFFICE','DRIVER','ASSISTANT','CLIENT','AUDITOR')),
  coop_id INTEGER REFERENCES cooperatives(id), office_id INTEGER REFERENCES offices(id), license TEXT, license_expires TEXT,
  active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  reset_token TEXT, reset_expires TEXT, perm_void INTEGER NOT NULL DEFAULT 0, last_login TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_coop ON users(coop_id, role);
