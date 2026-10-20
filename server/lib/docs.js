const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const S = require('./settings');
const { money, hhmm, nowLocal } = require('./util');
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
async function thermalHtml(tickets, base, { width = 80, auto = false, copy = 1, reprint = false } = {}) {
  const cfg = S.all();
  const mm = width === 58 ? 54 : 76, fs = width === 58 ? 10 : 11;
  const parts = [];
  for (const t of tickets) {
    const img = await qrData(qrUrl(base, t.code), 360);
    parts.push(`<section class="tk">
      <div class="c b big">${esc(t.coop.name.toUpperCase())}</div>
      <div class="c">RUC ${esc(t.coop.ruc || '-')}</div>
      <div class="c">${esc(t.from.terminal)}</div>
      <hr><div class="c b">BOLETO N° ${esc(t.number || '-')}</div>${reprint ? '<div class="c b">*** REIMPRESIÓN ***</div>' : ''}<hr>
      <div class="c b route">${esc(t.from.city.toUpperCase())} &gt;&gt; ${esc(t.to.city.toUpperCase())}</div>
      <div>FECHA: ${fdate(t.depart_at_stop)} &nbsp; SALIDA: <b>${hhmm(t.depart_at_stop)}</b></div>
      <div>BUS: ${esc(t.trip.bus_number)} &nbsp; PLACA: ${esc(t.trip.plate)}${t.trip.platform ? ' &nbsp; ANDEN: ' + esc(t.trip.platform) : ''}</div>
      <div class="b">ASIENTO: ${esc(t.seat_label)} (${esc(t.seat_type)})</div>
      <div>PASAJERO: ${esc((t.nombres + ' ' + t.apellidos).toUpperCase())}</div>
      <div>CI: ${esc(maskCedula(t.cedula))} &nbsp; ${esc((CAT[t.category] || '').toUpperCase())}</div><hr>
      <div class="r"><span>Pasaje</span><span>${(t.base_cents / 100).toFixed(2)}</span></div>
      ${t.discount_cents ? `<div class="r"><span>Descuento</span><span>-${(t.discount_cents / 100).toFixed(2)}</span></div>` : ''}
      ${t.fee_cents ? `<div class="r"><span>Tasa terminal</span><span>${(t.fee_cents / 100).toFixed(2)}</span></div>` : ''}
      <div class="r b"><span>TOTAL USD</span><span>${(t.total_cents / 100).toFixed(2)}</span></div>
      <div>Pago: ${esc(t.method || '-')} ${t.seller ? ' · Vend: ' + esc(t.seller.nombres.split(' ')[0] + ' ' + t.seller.apellidos.split(' ')[0]) : ''}</div>
      <div class="c"><img src="${img}" alt="QR"></div>
      <div class="c b mono">${esc(t.short_code)}</div>
      <div class="c small">Impreso: ${esc(nowLocal())}${copy > 1 ? ' · copia ' + copy : ''}</div>
      <div class="c small">${esc(cfg.ticket_footer)}</div>
    </section>`);
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleto</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { size: ${mm + 4}mm auto; margin: 0 }
*{box-sizing:border-box} body{margin:0;background:#eee;font-family:'Courier New',monospace;font-size:${fs}px;color:#000}
.tk{width:${mm}mm;margin:0 auto;background:#fff;padding:2mm 1mm;page-break-after:always;line-height:1.35}
.c{text-align:center}.b{font-weight:bold}.big{font-size:${fs + 2}px}.route{font-size:${fs + 3}px;margin:2px 0}.small{font-size:${fs - 2}px}.mono{letter-spacing:2px}
.r{display:flex;justify-content:space-between}hr{border:0;border-top:1px dashed #000;margin:3px 0}
img{width:${width === 58 ? 36 : 44}mm;height:auto;image-rendering:pixelated}
.bar{position:sticky;top:0;background:#0B2545;color:#fff;padding:8px;text-align:center;font-family:sans-serif}.bar button{padding:6px 14px;font-size:14px;margin:0 4px;cursor:pointer}
@media print{body{background:#fff}.bar{display:none}.tk:last-child{page-break-after:auto}}
</style></head><body>
<div class="bar">Vista previa ${width} mm · <button onclick="window.print()">Imprimir</button> <button onclick="window.close()">Cerrar</button></div>
${parts.join('\n')}
${auto ? '<script src="/js/autoprint.js"></script>' : ''}</body></html>`;
}

/** Documento A4 imprimible (manifiesto, cierre de caja, hoja de ruta) */
function a4Page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;font-size:12px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#e9eef5}.m{color:#555}
.bar{background:#0B2545;color:#fff;padding:8px;text-align:center}.bar button{padding:6px 14px;font-size:14px}.sig{margin-top:50px;display:flex;gap:40px}.sig div{border-top:1px solid #000;width:240px;padding-top:4px}
@media print{.bar{display:none}}</style></head><body><div class="bar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>${body}</body></html>`;
}
module.exports = { ticketPdf, thermalHtml, a4Page, qrPng, qrData, qrUrl, esc, fdate, CAT };
