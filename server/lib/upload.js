const multer = require('multer');
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
const { UPLOADS } = require('../db');
const { httpError } = require('./util');
const PUB = path.join(UPLOADS, 'public');
fs.mkdirSync(PUB, { recursive: true });
const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
/** Guarda una imagen pública validando firma (magic bytes). Devuelve la URL relativa. */
function saveImage(file) {
  if (!file) throw httpError(400, 'Adjunta una imagen');
  const ext = sniff(file.buffer);
  if (!ext) throw httpError(400, 'Formato no permitido (usa PNG, JPG o WEBP)');
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(PUB, name), file.buffer);
  return '/uploads/public/' + name;
}
module.exports = { imageUpload: mem.single('file'), saveImage, sniff };
