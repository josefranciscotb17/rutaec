const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const S = require('./settings');
const { money, hhmm } = require('./util');
const { maskCedula } = require('./core');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fdate = (d) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd} ${MONTHS[+m - 1]} ${y}`; };
const qrUrl = (base, code) => `${base}/v/${code}`;
const qrPng = (url, w = 300) => QRCode.toBuffer(url, { margin: 1, width: w, errorCorrectionLevel: 'M' });
const qrData = (url, w = 300) => QRCode.toDataURL(url, { margin: 1, width: w, errorCorrectionLevel: 'M' });
const CAT = { ADULTO: 'Adulto', MENOR: 'Menor de edad', TERCERA_EDAD: 'Tercera edad', DISCAPACIDAD: 'Discapacidad' };

/** PDF del boleto (A5 vertical) — un boleto por página */
async function ticketPdf(tickets, base, res) {
  const cfg = S.all();
  const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: 'Boleto RutaEC', Author: cfg.site_name } });
  doc.pipe(res);
  const W = doc.page.width, navy = cfg.secondary_color || '#0B2545', accent = cfg.accent_color || '#F2A900';
  let first = true;
  for (const t of tickets) {
    if (!first) doc.addPage(); first = false;
    doc.rect(0, 0, W, 70).fill(navy);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(22).text(cfg.site_name, 24, 18);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text(t.coop.name, 24, 46);
    doc.font('Helvetica').fontSize(7).text('RESERVA #', W - 150, 16, { width: 126, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(13).text(t.order_code, W - 150, 26, { width: 126, align: 'right' });
    doc.font('Helvetica').fontSize(7).text('BOLETO ' + (t.number || '-'), W - 170, 48, { width: 146, align: 'right' });
    doc.fillColor('#5B6770').font('Helvetica-Bold').fontSize(7).text((t.from.terminal || '').toUpperCase(), 24, 88).text((t.to.terminal || '').toUpperCase(), W - 24 - 150, 88, { width: 150, align: 'right' });
    doc.fillColor(navy).font('Helvetica').fontSize(30).text(t.from.city, 24, 100, { width: 170 }).text(t.to.city, W - 24 - 170, 100, { width: 170, align: 'right' });
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(16).text('>>', W / 2 - 12, 110);
    const fld = (x, y, k, v, w = 100, size = 12) => { doc.fillColor('#5B6770').font('Helvetica-Bold').fontSize(6.5).text(k, x, y, { width: w }); doc.fillColor(navy).font('Helvetica').fontSize(size).text(v, x, y + 10, { width: w }); };
    let y = 150;
    fld(24, y, 'FECHA', fdate(t.depart_at_stop)); fld(130, y, 'SALIDA', hhmm(t.depart_at_stop)); fld(200, y, 'LLEGADA EST.', hhmm(t.arrive_at_stop)); fld(290, y, 'ANDEN', t.trip.platform || '-', 60);
    y += 38;
    fld(24, y, 'PASAJERO', `${t.nombres} ${t.apellidos}`, 230, 12); fld(270, y, 'ASIENTO', `${t.seat_label} · ${t.seat_type}`, 110, 12);
    y += 38;
    fld(24, y, 'CEDULA', maskCedula(t.cedula), 100, 11); fld(130, y, 'CATEGORIA', CAT[t.category] || t.category, 120, 11); fld(270, y, 'BUS', `N° ${t.trip.bus_number} · ${t.trip.plate}`, 140, 11);
    y += 38;
    fld(24, y, 'TRAMO', `${t.from.city} - ${t.to.city} (${t.trip.kind === 'DIRECTA' ? 'directo' : 'con paradas'})`, 230, 10); fld(270, y, 'TOTAL', money(t.total_cents) + ' USD', 110, 12);
    y += 44;
    doc.moveTo(14, y).lineTo(W - 14, y).dash(3, { space: 3 }).strokeColor('#C9D3DF').stroke().undash();
    const png = await qrPng(qrUrl(base, t.code), 400);
    doc.image(png, W / 2 - 75, y + 12, { width: 150 });
    doc.fillColor(navy).font('Courier-Bold').fontSize(13).text(t.short_code, 0, y + 168, { width: W, align: 'center' });
    doc.fillColor('#5B6770').font('Helvetica').fontSize(7).text(cfg.ticket_footer, 30, y + 190, { width: W - 60, align: 'center' });
    if (t.status === 'ANULADO') { doc.save(); doc.fillColor('#C0392B').opacity(0.25).font('Helvetica-Bold').fontSize(40).rotate(-25, { origin: [W / 2, 300] }).text('ANULADO', 40, 280); doc.restore(); }
  }
  doc.end();
}

/** HTML imprimible para impresora térmica (58/80 mm) */

module.exports = { ticketPdf, qrPng, qrData, qrUrl, esc, fdate, CAT };
