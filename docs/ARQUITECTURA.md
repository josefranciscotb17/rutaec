# Arquitectura

## Visión general

```
Navegador (PC / celular, PWA)                      Servidor Node 22/24
┌─────────────────────────────┐   HTTPS/JSON    ┌───────────────────────────────────────────┐
│ SPA vanilla (public/js/*)   │ ◄─────────────► │ Express 4  (server/index.js)               │
│  · shop/account (cliente)   │                 │  helmet+CSP · rate-limit · JWT · RBAC      │
│  · office (POS, caja)       │                 │  routes/ public · auth · sales · driver    │
│  · driver (escáner QR)      │                 │          coop · admin                      │
│  · coop / admin             │                 │  lib/ core (reservas, precios, asientos)   │
│ Service worker + cola       │                 │       rotation · docs (PDF/QR/térmico)     │
│ offline de escaneos         │                 │       notify (correo+notificaciones)       │
└─────────────────────────────┘                 │ SQLite (node:sqlite, WAL) data/rutaec.db│
                                                │ uploads/private (comprobantes)             │
                                                └───────────────────────────────────────────┘
```

## Decisiones

| Tema | Decisión | Motivo / alternativa de diseño |
|---|---|---|
| Base de datos | **SQLite** (WAL, claves foráneas) | Cero instalación: cada compañero prueba su rama con `npm start`. El documento de diseño recomienda PostgreSQL para producción: el SQL usado es estándar y las consultas están aisladas en `routes/` y `lib/`; la migración está descrita en `docs/ALCANCE.md`. |
| Front-end | SPA sin *build* con plantillas que **escapan por defecto** (`html\`…\``) | Sin toolchain que instalar; CSP estricta sin `eval` ni CDN. |
| Dinero | Enteros en **centavos** | Evita errores de coma flotante. |
| Tiempo | Texto local `YYYY-MM-DD HH:MM:SS` en `America/Guayaquil` | Ecuador continental no tiene horario de verano; comparaciones lexicográficas simples y deterministas. |
| Concurrencia | `createOrder` corre en **transacción** y verifica solape de tramos | node:sqlite es síncrono y serializa escrituras: no hay doble venta de un asiento en un tramo. |
| Autenticación | JWT 12 h + RBAC en servidor | `requireRole` por ruta; el alcance por cooperativa lo resuelve `coopId(req)`. |
| QR | `BASE_URL/v/<public_id(26)><HMAC(8)>` | 130 bits aleatorios + etiqueta HMAC-SHA256; un solo uso; verificable offline con el manifiesto. |

## Reglas de negocio centrales (`server/lib/core.js`)

- **Inventario por tramo.** Un boleto ocupa `[from_ord, to_ord)` sobre las paradas ordenadas de la frecuencia. Dos boletos del mismo asiento conviven si sus intervalos no se solapan.
- **Estados de la orden:** `RESERVADO → (EN_REVISION ↔ RESERVADO) → PAGADO | EXPIRADO | CANCELADO`. `expireOrders()` corre cada 30 s y en cada lectura relevante, liberando asientos.
- **Precio de un boleto** = `tarifa × factor del asiento × (1 + temporada %) − descuento de categoría (solo sobre la tarifa) + tasa de terminal`. El chofer, en ruta, puede fijar el precio dentro de `[min %, max %]` de la tarifa.
- **Emisión:** al aprobar el pago se asigna número de boleto `COOP-OFICINA-SECUENCIA` y el QR queda activo.
- **Escaneo:** `VALIDO` (marca `ABORDADO`), `YA_USADO`, `OTRO_VIAJE`, `ANULADO`, `NO_PAGADO`, `INVALIDO`. En sincronización offline gana el escaneo más antiguo.
- **Rotación de la hoja de ruta (`lib/rotation.js`):** con `N` buses y `F` frecuencias, `P = max(N, F)` posiciones; el bus de la posición `p` el día `d` es `buses[(p − d) mod P]`. Las posiciones `≥ F` son *parada*. Si `F > N` se advierte que algunas frecuencias quedarán sin bus.

## Seguridad (resumen; ver `SECURITY.md`)

CSP estricta (`script-src 'self'`), `helmet`, límite de peticiones, bcrypt, bloqueo por intentos, validación de cédula/RUC/placa, comprobantes validados por firma y servidos con control de acceso, auditoría de acciones sensibles.

## Cómo añadir una funcionalidad

1. Tabla/columna nueva → `server/schema.sql` (usa `CREATE TABLE IF NOT EXISTS`). Todavía no hay migraciones automáticas: en desarrollo recrea con `npm run db:reset`; antes de producción adopta una herramienta de migraciones (Knex/Prisma/Flyway).
2. Lógica en `server/lib/` y ruta en `server/routes/` (con `requireRole`).
3. Pantalla en `public/js/*.js` con `route('/ruta', handler, roles)` y acciones `App.A.nombre`.
4. Prueba en `tests/` y actualización de `docs/` (`npm run docs:api`).
