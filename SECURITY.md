# Política de seguridad

## Versiones con soporte

| Versión | Soporte de seguridad |
|---|---|
| 1.x | ✅ |

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Escribe a **seguridad@rutaec.example** (o usa *Security → Report a vulnerability* de GitHub) con:

1. Descripción y pasos para reproducir.
2. Impacto estimado (datos expuestos, fraude de boletos, escalada de privilegios…).
3. Versión/commit y entorno.

Respuesta inicial en **72 horas**; plan de corrección en **7 días** para severidad alta/crítica. Reconocemos públicamente a quien reporta (si lo desea) una vez publicado el parche.

## Controles implementados

- Contraseñas con **bcrypt**; bloqueo temporal tras 5 intentos fallidos; recuperación con token de un solo uso (se guarda solo su hash SHA-256) que expira en 30 min.
- **JWT** de 12 h; roles y alcance por cooperativa verificados en el servidor en cada ruta (RBAC). Un usuario de una cooperativa no puede leer ni modificar datos de otra.
- Cabeceras de seguridad con **Helmet** (CSP estricta sin scripts de terceros), límite de peticiones por IP y tamaño máximo de cuerpo.
- **Consultas parametrizadas** (SQLite/node:sqlite) en todo el código; salida HTML escapada en el front-end y en los documentos imprimibles.
- **Comprobantes de pago**: solo JPG/PNG/PDF validados por firma (magic bytes), máximo 5 MB, almacenados fuera de la carpeta pública con nombre aleatorio y entregados solo al dueño de la orden o al personal de esa cooperativa; detección de comprobantes duplicados por hash y por banco+referencia+monto.
- **QR antifraude**: el código contiene un identificador aleatorio de 130 bits + etiqueta **HMAC-SHA256**; es de **un solo uso** (el segundo escaneo se marca "ya usado") y se valida contra el viaje.
- **Auditoría**: inicios de sesión, ventas, aprobaciones/rechazos de pago, anulaciones, reimpresiones, cierres de caja y cambios de configuración quedan en `audit_logs`.
- Datos personales (cédula) enmascarados en listados y pantallas del chofer, conforme a la **LOPDP**.

## Recomendaciones para producción

- Define `JWT_SECRET`, `DEMO_MODE=false` y `BASE_URL` con HTTPS; cambia las contraseñas de las cuentas de demostración o elimina los datos de ejemplo.
- Publica detrás de un proxy TLS (Nginx/Caddy). La cámara del escáner **requiere HTTPS**.
- Haz copias de seguridad de `data/` y `uploads/` y restringe permisos del servidor.
- Para alto volumen, migra SQLite a PostgreSQL (ver `docs/ARQUITECTURA.md`).
