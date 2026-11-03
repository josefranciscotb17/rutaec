const { db } = require('../db');
const { nowLocal } = require('./util');
let transporter = null;
if (process.env.SMTP_HOST) {
  try { transporter = require('nodemailer').createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }); } catch (e) { console.warn('SMTP no disponible:', e.message); }
}
/** Registra el correo en email_log (bandeja local) y lo envía si hay SMTP configurado */
function email(to, subject, body) {
  if (!to) return;
  const r = db.prepare('INSERT INTO email_log(to_addr,subject,body,sent,created_at) VALUES(?,?,?,0,?)').run(to, subject, body, nowLocal());
  if (transporter) {
    transporter.sendMail({ from: process.env.MAIL_FROM || 'RutaEC <no-reply@rutaec.test>', to, subject, text: body })
      .then(() => db.prepare('UPDATE email_log SET sent=1 WHERE id=?').run(r.lastInsertRowid))
      .catch(e => db.prepare('UPDATE email_log SET error=? WHERE id=?').run(String(e.message), r.lastInsertRowid));
  }
}
function notify(userId, title, body, link, mail = true) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES(?,?,?,?,?)').run(userId, title, body || '', link || '', nowLocal());
  if (mail) { const u = db.prepare('SELECT email FROM users WHERE id=?').get(userId); if (u) email(u.email, title, body || title); }
}
function notifyRole(coopId, roles, title, body, link) {
  for (const u of db.prepare(`SELECT id FROM users WHERE active=1 AND coop_id=? AND role IN (${roles.map(() => '?').join(',')})`).all(coopId, ...roles)) notify(u.id, title, body, link, false);
}
function audit(req, action, entity, entityId, before, after) {
  const u = req && req.user;
  db.prepare('INSERT INTO audit_logs(user_id,user_email,action,entity,entity_id,before,after,ip,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(u ? u.id : null, u ? u.email : null, action, entity || null, entityId == null ? null : String(entityId), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req && req.ip || null, nowLocal());
}
module.exports = { email, notify, notifyRole, audit };
