# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

## [0.5.0] - 2026-11-02 — Primera presentación

### Añadido
- **Repositorio y gobernanza (HU-1, HU-2, HU-3):** estructura Node.js, licencia MIT, `CITATION.cff`, guías de contribución, código de conducta, política de seguridad, plantillas de issues y PR, `CODEOWNERS` y documentación técnica.
- **Base de datos (HU-4, HU-6):** esquema SQLite por capas, servidor Express con cabeceras de seguridad y ajustes del sitio.
- **Autenticación (HU-9):** JWT, siete roles, registro e inicio de sesión.
- **Interfaz base (HU-5, HU-7):** página responsiva e instalable (PWA), núcleo del front-end y menú por rol.
- **Cooperativa (HU-8, HU-11, HU-16, HU-21, HU-25):** perfil, personal, plantillas de asientos, buses, frecuencias con paradas y tarifas, hojas de ruta con rotación y días de parada, viajes, reportes y panel web.
- **Motor de negocio (HU-12, HU-13):** inventario de asientos por tramo, descuentos por categoría, reservas con temporizador, boletos con QR firmado y PDF.
- **Búsqueda y compra (HU-14, HU-17, HU-22, HU-26):** catálogo público, búsqueda con filtros, mapa de asientos, pago por transferencia con comprobante, notificaciones, boletos con QR e historial de compras.
- **Ventanilla del oficinista (HU-20, HU-24):** venta presencial, validación de pagos, órdenes y caja.
- **Aplicación del chofer (HU-15, HU-19):** escáner de QR con cola sin conexión, manifiesto, ventas en ruta e incidencias.
- **Administración global (HU-10, HU-28):** ajustes del sitio, cooperativas, usuarios y auditoría.
- **Calidad (HU-18, HU-23, HU-27):** datos de demostración, pruebas unitarias y de integración, integración continua en Node 22 y 24, CodeQL y Dependabot.

### Pendiente para la segunda etapa
Gestión del control de cambios con Jira (solicitudes de cambio, comité y trazabilidad) y los cambios que de ella resulten.
