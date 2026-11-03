# Alcance de esta entrega frente al Documento de Diseño

Leyenda: ✅ implementado · 🟡 simplificado / manual · ⏳ pendiente (hoja de ruta)

| Área | Estado | Detalle |
|---|---|---|
| Base de datos relacional con integridad | ✅ | 32 tablas, FK, CHECK, índices. **SQLite** en lugar de PostgreSQL (ver `BASE_DE_DATOS.md`, sección de migración) |
| Sitio web adaptable PC/celular, PWA | ✅ | SPA vanilla (sin framework) + manifest + service worker; instalable |
| Búsqueda, filtros, mapa de asientos por tramo | ✅ | Incluye 1 y 2 pisos y tipos de asiento |
| Reserva temporal, pago con comprobante, efectivo | ✅ | Con revisión, rechazo y gracia |
| Boleto con QR firmado, PDF, escaneo, offline | ✅ | HMAC, un solo uso, cola offline |
| Impresión en la impresora del oficinista | ✅ | Térmico 58/80 mm, A5, A4; reimpresión auditada |
| Roles y permisos (7) y alcance por cooperativa | ✅ | RBAC en servidor |
| Hojas de ruta con rotación (Excel de clase) | ✅ | Con "parada", conflictos y edición manual |
| Reportes, auditoría, caja, incidencias, calificaciones | ✅ | CSV de ventas |
| Marca configurable, redes sociales, textos legales | ✅ | Superadmin |
| Contexto Ecuador | ✅ | Cédula/RUC/placa, USD, zona horaria, descuentos por ley (menor, 3.ª edad, discapacidad), resolución ANT por frecuencia, LOPDP (enmascarado, política) |
| Repositorio profesional (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CITATION, plantillas, CI) | ✅ | Ver raíz y `.github/` |
| Control de cambios con Jira Service Management | ⏳ | Segunda etapa del proyecto |
| Pago con **tarjeta / pasarela** (PayPhone, Datafast, PlacetoPay…) | ⏳ | El método `TARJETA` en oficina registra la autorización del POS físico; falta integración en línea |
| **Factura electrónica SRI** | ⏳ | Requiere certificado de firma y servicios del SRI; el boleto actual es comprobante interno |
| **Apple/Google Wallet** (pase como el de Autostradale) | ⏳ | El boleto con QR y PDF cubre el caso; los pases `.pkpass`/Google Wallet requieren cuentas de desarrollador y certificados |
| Notificaciones **push**, SMS, WhatsApp API | ⏳ | Hoy: notificaciones internas + correo (SMTP opcional) + enlace a WhatsApp |
| Seguimiento GPS del bus, tiempo estimado en vivo | ⏳ | Campos de viaje y estado ya existen para extenderlo |
| Verificación biométrica / doble factor (2FA) | ⏳ | — |
| Multi-idioma (inglés, kichwa) | ⏳ | Interfaz solo en español |
| Reembolsos automáticos | 🟡 | Se cancela la orden y se notifica; la devolución del dinero es manual |
| Migraciones de BD versionadas | ⏳ | Usar Knex/Prisma/Flyway al pasar a PostgreSQL |

## Ruta recomendada hacia producción

1. Migrar a PostgreSQL y contenerizar (`Dockerfile` incluido).
2. Detrás de proxy HTTPS; `JWT_SECRET`, `DEMO_MODE=false`, SMTP real, copias de seguridad.
3. Integrar pasarela de pagos y facturación electrónica SRI.
4. Pase en Wallet y notificaciones push/WhatsApp.
5. Pruebas de carga (ventas simultáneas del mismo asiento) y pruebas de penetración.
