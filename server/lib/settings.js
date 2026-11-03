const { db } = require('../db');
const DEFAULTS = {
  site_name: 'RutaEC', tagline: 'Tu pasaje interprovincial, sin filas y en tu celular',
  primary_color: '#134074', secondary_color: '#0B2545', accent_color: '#F2A900', logo: '',
  facebook: 'https://facebook.com', instagram: 'https://instagram.com', tiktok: '', twitter: '', youtube: '', whatsapp: '593999999999', website: '',
  support_email: 'soporte@rutaec.test', support_phone: '+593 3 245 0000', support_hours: 'Lunes a domingo, 06:00 - 22:00',
  reserve_minutes: 4, cash_hold_minutes: 60, review_grace_minutes: 10, max_seats: 10, online_cutoff_minutes: 30, review_max_minutes: 120,
  terminal_fee_cents: 20, discount_minor_pct: 50, discount_senior_pct: 50, discount_disability_pct: 50, senior_age: 65,
  driver_price_min_pct: 50, driver_price_max_pct: 150, ticket_footer: 'Conserve su boleto. Válido solo para la fecha y tramo indicados. Buen viaje.',
  terms: 'Al comprar acepta las condiciones de transporte de la cooperativa. Los boletos son personales e intransferibles salvo autorización. Las devoluciones se rigen por la política de la cooperativa.',
  privacy: 'Tratamos sus datos personales conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador, únicamente para la emisión y control de boletos. Puede solicitar acceso, rectificación o eliminación escribiendo a soporte.',
  refund_policy: 'Devolución del 90% hasta 24 h antes de la salida, 50% hasta 2 h antes. Luego no es reembolsable.',
  faq: [
    ['¿Cómo compro un pasaje?', 'Busca tu ruta, elige el viaje y los asientos, ingresa los datos de los pasajeros y paga por transferencia/depósito subiendo el comprobante, o reserva y paga en efectivo en oficina.'],
    ['¿Cuánto tiempo tengo para pagar?', 'Los asientos se bloquean unos minutos mientras completas tu compra. Al subir el comprobante, el tiempo se detiene hasta que un oficinista lo valide.'],
    ['¿Dónde está mi boleto?', 'En "Mis boletos". Puedes verlo, descargarlo en PDF y presentarlo con el código QR desde tu celular.'],
    ['¿Hay descuentos?', 'Sí: menores de edad, personas con discapacidad y tercera edad. Se valida con la cédula y el personal verificará tu documento al abordar.'],
  ],
};
function all() {
  const out = { ...DEFAULTS };
  for (const r of db.prepare('SELECT key,value FROM settings').all()) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}
const get = (k) => all()[k];
function set(k, v) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v)); }
const PUBLIC_KEYS = ['site_name', 'tagline', 'primary_color', 'secondary_color', 'accent_color', 'logo', 'facebook', 'instagram', 'tiktok', 'twitter', 'youtube', 'whatsapp', 'website', 'support_email', 'support_phone', 'support_hours', 'terms', 'privacy', 'refund_policy', 'faq', 'reserve_minutes', 'max_seats', 'terminal_fee_cents', 'discount_minor_pct', 'discount_senior_pct', 'discount_disability_pct', 'ticket_footer', 'driver_price_min_pct', 'driver_price_max_pct', 'cash_hold_minutes'];
function publicConfig() { const a = all(); const o = {}; PUBLIC_KEYS.forEach(k => o[k] = a[k]); return o; }
module.exports = { all, get, set, DEFAULTS, publicConfig, PUBLIC_KEYS };
