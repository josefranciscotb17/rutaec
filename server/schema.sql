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

CREATE TABLE IF NOT EXISTS seat_types (id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), name TEXT NOT NULL, factor_pct INTEGER NOT NULL DEFAULT 100, description TEXT, UNIQUE(coop_id, name));
CREATE TABLE IF NOT EXISTS seat_templates (id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), name TEXT NOT NULL, floors INTEGER NOT NULL DEFAULT 1, rows INTEGER NOT NULL, cols INTEGER NOT NULL, layout TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bus_groups (id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), name TEXT NOT NULL, description TEXT, UNIQUE(coop_id, name));
CREATE TABLE IF NOT EXISTS buses (
  id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), group_id INTEGER REFERENCES bus_groups(id), number TEXT NOT NULL, plate TEXT NOT NULL UNIQUE,
  color TEXT, year INTEGER, chassis_brand TEXT, body_brand TEXT, model TEXT, floors INTEGER NOT NULL DEFAULT 1, capacity INTEGER NOT NULL DEFAULT 0,
  amenities TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','MANTENIMIENTO','BAJA')), photo TEXT,
  tech_review_expires TEXT, registration_expires TEXT, template_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(coop_id, number)
);
CREATE TABLE IF NOT EXISTS bus_seats (
  id INTEGER PRIMARY KEY, bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE, floor INTEGER NOT NULL DEFAULT 1, row INTEGER NOT NULL, col INTEGER NOT NULL,
  label TEXT NOT NULL, seat_type_id INTEGER NOT NULL REFERENCES seat_types(id), sellable INTEGER NOT NULL DEFAULT 1, UNIQUE(bus_id, label)
);

CREATE TABLE IF NOT EXISTS frequencies (
  id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), origin_terminal_id INTEGER NOT NULL REFERENCES terminals(id),
  dest_terminal_id INTEGER NOT NULL REFERENCES terminals(id), depart_time TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 240,
  kind TEXT NOT NULL DEFAULT 'DIRECTA' CHECK (kind IN ('DIRECTA','CON_PARADAS')), resolution_number TEXT, resolution_date TEXT,
  days TEXT NOT NULL DEFAULT '1111111', active INTEGER NOT NULL DEFAULT 1, UNIQUE(coop_id, origin_terminal_id, dest_terminal_id, depart_time)
);
CREATE TABLE IF NOT EXISTS frequency_stops (id INTEGER PRIMARY KEY, frequency_id INTEGER NOT NULL REFERENCES frequencies(id) ON DELETE CASCADE, ord INTEGER NOT NULL, terminal_id INTEGER NOT NULL REFERENCES terminals(id), minutes INTEGER NOT NULL DEFAULT 0, km INTEGER NOT NULL DEFAULT 0, UNIQUE(frequency_id, ord));
CREATE TABLE IF NOT EXISTS fares (frequency_id INTEGER NOT NULL REFERENCES frequencies(id) ON DELETE CASCADE, from_ord INTEGER NOT NULL, to_ord INTEGER NOT NULL, price_cents INTEGER NOT NULL, PRIMARY KEY (frequency_id, from_ord, to_ord));
CREATE TABLE IF NOT EXISTS season_rules (id INTEGER PRIMARY KEY, coop_id INTEGER REFERENCES cooperatives(id), name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, pct INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS route_sheets (id INTEGER PRIMARY KEY, coop_id INTEGER NOT NULL REFERENCES cooperatives(id), group_id INTEGER NOT NULL REFERENCES bus_groups(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'AUTO', status TEXT NOT NULL DEFAULT 'BORRADOR', created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS route_sheet_entries (id INTEGER PRIMARY KEY, sheet_id INTEGER NOT NULL REFERENCES route_sheets(id) ON DELETE CASCADE, date TEXT NOT NULL, slot INTEGER NOT NULL, frequency_id INTEGER REFERENCES frequencies(id), bus_id INTEGER NOT NULL REFERENCES buses(id), driver_id INTEGER REFERENCES users(id), assistant_id INTEGER REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_rse_sheet ON route_sheet_entries(sheet_id, date);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY, frequency_id INTEGER NOT NULL REFERENCES frequencies(id), bus_id INTEGER NOT NULL REFERENCES buses(id), date TEXT NOT NULL, depart_at TEXT NOT NULL,
  driver_id INTEGER REFERENCES users(id), assistant_id INTEGER REFERENCES users(id), platform TEXT, status TEXT NOT NULL DEFAULT 'PROGRAMADO' CHECK (status IN ('PROGRAMADO','ABORDANDO','EN_RUTA','FINALIZADO','CANCELADO')),
  started_at TEXT, finished_at TEXT, cancel_reason TEXT, UNIQUE(frequency_id, date, depart_at)
);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date, status);

CREATE TABLE IF NOT EXISTS passengers (id INTEGER PRIMARY KEY, cedula TEXT NOT NULL UNIQUE, nombres TEXT NOT NULL, apellidos TEXT NOT NULL, email TEXT, phone TEXT, category TEXT NOT NULL DEFAULT 'ADULTO');
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, buyer_id INTEGER REFERENCES users(id), channel TEXT NOT NULL CHECK (channel IN ('WEB','OFICINA','RUTA')), office_id INTEGER REFERENCES offices(id), seller_id INTEGER REFERENCES users(id),
  coop_id INTEGER NOT NULL REFERENCES cooperatives(id), trip_id INTEGER NOT NULL REFERENCES trips(id),
  status TEXT NOT NULL DEFAULT 'RESERVADO' CHECK (status IN ('RESERVADO','EN_REVISION','PAGADO','EXPIRADO','CANCELADO')), method TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0, discount_cents INTEGER NOT NULL DEFAULT 0, fee_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT, created_at TEXT NOT NULL, paid_at TEXT, cash_session_id INTEGER, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, expires_at);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, qr_tag TEXT NOT NULL, short_code TEXT NOT NULL UNIQUE, number TEXT, order_id INTEGER NOT NULL REFERENCES orders(id), trip_id INTEGER NOT NULL REFERENCES trips(id),
  seat_id INTEGER NOT NULL REFERENCES bus_seats(id), passenger_id INTEGER NOT NULL REFERENCES passengers(id), from_ord INTEGER NOT NULL, to_ord INTEGER NOT NULL, category TEXT NOT NULL DEFAULT 'ADULTO',
  base_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, fee_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVADO' CHECK (status IN ('RESERVADO','VALIDO','ABORDADO','BAJO','ANULADO','EXPIRADO','NO_SHOW')),
  boarded_at TEXT, boarded_by INTEGER, alighted_at TEXT, void_reason TEXT, voided_by INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_trip ON tickets(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), method TEXT NOT NULL CHECK (method IN ('EFECTIVO','TRANSFERENCIA','DEPOSITO','TARJETA')), amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','EN_REVISION','APROBADO','RECHAZADO')), bank_account_id INTEGER REFERENCES bank_accounts(id), bank TEXT, reference TEXT, paid_date TEXT,
  proof_file TEXT, proof_hash TEXT, received_cents INTEGER, reviewed_by INTEGER, reviewed_at TEXT, reject_reason TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE TABLE IF NOT EXISTS cash_sessions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), office_id INTEGER REFERENCES offices(id), opened_at TEXT NOT NULL, closed_at TEXT, opening_cents INTEGER NOT NULL DEFAULT 0, expected_cents INTEGER, counted_cents INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS scan_events (id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id), trip_id INTEGER, code TEXT, result TEXT NOT NULL, device TEXT, offline INTEGER NOT NULL DEFAULT 0, user_id INTEGER, scanned_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_scan_trip ON scan_events(trip_id);
CREATE TABLE IF NOT EXISTS print_jobs (id INTEGER PRIMARY KEY, ticket_id INTEGER, order_id INTEGER, doc_type TEXT NOT NULL, user_id INTEGER, copy_n INTEGER NOT NULL DEFAULT 1, reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT, link TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, user_id INTEGER, user_email TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, before TEXT, after TEXT, ip TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit ON audit_logs(created_at);
CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id), user_id INTEGER, kind TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id), user_id INTEGER NOT NULL REFERENCES users(id), stars INTEGER NOT NULL, comment TEXT, created_at TEXT NOT NULL, UNIQUE(trip_id, user_id));
