// Copia jsQR (lector de QR para navegadores sin BarcodeDetector) a /public/vendor
const fs = require('fs'), path = require('path');
try {
  const src = path.join(__dirname, '..', 'node_modules', 'jsqr', 'dist', 'jsQR.js');
  const dst = path.join(__dirname, '..', 'public', 'vendor', 'jsQR.js');
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
} catch (e) { console.warn('postinstall:', e.message); }
