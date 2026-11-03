# Referencia de la API REST

> Generado automáticamente con `npm run docs:api`. Todas las rutas cuelgan de `/api` (la autenticación de `auth.js` va bajo `/api/auth`). Las respuestas son JSON; los errores tienen la forma `{ "error": "mensaje", "code": "CODIGO" }`.

**Autenticación:** cabecera `Authorization: Bearer <token>` (JWT de 12 h obtenido en `POST /api/auth/login`). Los documentos imprimibles aceptan además `?token=` en `GET` para abrirse en una ventana nueva.

**Contexto de cooperativa:** superadministrador y auditor indican la cooperativa con la cabecera `X-Coop-Id` (o `?coop_id=`).

## Público (sin sesión)

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/config` | Público |
| `GET` | `/api/catalog` | Público |
| `GET` | `/api/search` | Público |
| `GET` | `/api/trips/:id` | Público |
| `GET` | `/api/trips/:id/seats` | Público |
| `GET` | `/api/verify/:code` | Público |

## Autenticación (/api/auth)

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/api/auth/register` | Público |
| `POST` | `/api/auth/login` | Público |
| `GET` | `/api/auth/me` | Sesión iniciada |
| `PUT` | `/api/auth/me` | Sesión iniciada |
| `POST` | `/api/auth/change-password` | Sesión iniciada |
| `POST` | `/api/auth/forgot` | Público |
| `POST` | `/api/auth/reset` | Público |

## Compras, boletos, oficina y caja

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/api/orders` | Sesión iniciada |
| `GET` | `/api/orders/mine` | Sesión iniciada |
| `GET` | `/api/orders/:id` | Sesión iniciada |
| `POST` | `/api/orders/:id/cancel` | Sesión iniciada |
| `POST` | `/api/orders/:id/pay` | Sesión iniciada |
| `POST` | `/api/orders/:id/proof` | Sesión iniciada |
| `GET` | `/api/files/:name` | Sesión iniciada |
| `GET` | `/api/tickets/mine` | Sesión iniciada |
| `GET` | `/api/tickets/:id` | Sesión iniciada |
| `GET` | `/api/tickets/:id/qr.png` | Sesión iniciada |
| `GET` | `/api/tickets/:id/pdf` | Sesión iniciada |
| `GET` | `/api/orders/:id/pdf` | Sesión iniciada |
| `GET` | `/api/tickets/:id/print` | Oficinista / Admin coop |
| `GET` | `/api/orders/:id/print` | Oficinista / Admin coop |
| `GET` | `/api/notifications` | Sesión iniciada |
| `POST` | `/api/notifications/read` | Admin de cooperativa / Auditor |
| `POST` | `/api/trips/:id/rating` | Sesión iniciada |
| `GET` | `/api/office/trips` | Oficinista / Admin coop |
| `GET` | `/api/office/trips/:id/seats` | Oficinista / Admin coop |
| `POST` | `/api/office/sale` | Oficinista / Admin coop |
| `GET` | `/api/office/payments` | Oficinista / Admin coop |
| `POST` | `/api/office/payments/:id/approve` | Oficinista / Admin coop |
| `POST` | `/api/office/payments/:id/reject` | Oficinista / Admin coop |
| `GET` | `/api/office/orders` | Oficinista / Admin coop |
| `POST` | `/api/office/orders/:id/collect` | Oficinista / Admin coop |
| `POST` | `/api/office/tickets/:id/void` | Oficinista / Admin coop |
| `GET` | `/api/office/passenger` | Oficinista / Admin coop |
| `GET` | `/api/office/lookup` | Oficinista / Admin coop |
| `GET` | `/api/office/cash/current` | Oficinista / Admin coop |
| `POST` | `/api/office/cash/open` | Oficinista / Admin coop |
| `POST` | `/api/office/cash/close` | Oficinista / Admin coop |
| `GET` | `/api/office/cash/history` | Oficinista / Admin coop |
| `GET` | `/api/office/cash/:id/print` | Oficinista / Admin coop |
| `GET` | `/api/office/dashboard` | Oficinista / Admin coop |
| `GET` | `/api/manifest/:tripId` | Oficinista / Admin coop |

## Chofer / ayudante

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/driver/trips` | Chofer / Ayudante |
| `GET` | `/api/driver/history` | Chofer / Ayudante |
| `POST` | `/api/driver/trips/:id/start` | Chofer / Ayudante |
| `POST` | `/api/driver/trips/:id/finish` | Chofer / Ayudante |
| `GET` | `/api/driver/trips/:id/summary` | Chofer / Ayudante |
| `GET` | `/api/driver/trips/:id/manifest` | Chofer / Ayudante |
| `POST` | `/api/driver/scan` | Chofer / Ayudante |
| `POST` | `/api/driver/scans/batch` | Chofer / Ayudante |
| `POST` | `/api/driver/trips/:id/alight` | Chofer / Ayudante |
| `POST` | `/api/driver/sale` | Chofer / Ayudante |
| `GET` | `/api/driver/trips/:id/free-seats` | Chofer / Ayudante |
| `POST` | `/api/driver/trips/:id/incident` | Chofer / Ayudante |

## Cooperativa

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/coop/profile` | Admin de cooperativa / Auditor |
| `PUT` | `/api/coop/profile` | Admin de cooperativa |
| `POST` | `/api/coop/logo` | Admin de cooperativa |
| `GET` | `/api/coop/users` | Admin de cooperativa / Auditor |
| `POST` | `/api/coop/users` | Admin de cooperativa |
| `PUT` | `/api/coop/users/:id` | Admin de cooperativa |
| `POST` | `/api/coop/users/:id/reset-password` | Admin de cooperativa |
| `POST` | `/api/coop/seat-templates/generate` | Admin de cooperativa |
| `GET` | `/api/coop/buses` | Admin de cooperativa / Auditor |
| `POST` | `/api/coop/buses` | Admin de cooperativa |
| `PUT` | `/api/coop/buses/:id` | Admin de cooperativa |
| `DELETE` | `/api/coop/buses/:id` | Admin de cooperativa |
| `POST` | `/api/coop/buses/:id/photo` | Admin de cooperativa |
| `GET` | `/api/coop/buses/:id/seats` | Admin de cooperativa / Auditor |
| `PUT` | `/api/coop/buses/:id/seats` | Admin de cooperativa |
| `GET` | `/api/coop/frequencies` | Admin de cooperativa / Auditor |
| `POST` | `/api/coop/frequencies` | Admin de cooperativa |
| `PUT` | `/api/coop/frequencies/:id` | Admin de cooperativa |
| `DELETE` | `/api/coop/frequencies/:id` | Admin de cooperativa |
| `GET` | `/api/coop/terminals` | Admin de cooperativa / Auditor |
| `POST` | `/api/coop/route-sheets/preview` | Admin de cooperativa |
| `POST` | `/api/coop/route-sheets` | Admin de cooperativa |
| `GET` | `/api/coop/route-sheets` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/route-sheets/:id` | Admin de cooperativa / Auditor |
| `PUT` | `/api/coop/route-sheets/:id/entries/:eid` | Admin de cooperativa |
| `POST` | `/api/coop/route-sheets/:id/publish` | Admin de cooperativa |
| `DELETE` | `/api/coop/route-sheets/:id` | Admin de cooperativa |
| `GET` | `/api/coop/route-sheets/:id/print` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/trips` | Admin de cooperativa / Auditor |
| `POST` | `/api/coop/trips` | Admin de cooperativa |
| `PUT` | `/api/coop/trips/:id` | Admin de cooperativa |
| `POST` | `/api/coop/trips/:id/cancel` | Admin de cooperativa |
| `GET` | `/api/coop/dashboard` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/reports/sales` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/audit` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/incidents` | Admin de cooperativa / Auditor |
| `GET` | `/api/coop/bank-accounts` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/bank-accounts` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/bank-accounts/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/bank-accounts/:id` | Admin de cooperativa (eliminar) |
| `GET` | `/api/coop/offices` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/offices` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/offices/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/offices/:id` | Admin de cooperativa (eliminar) |
| `GET` | `/api/coop/seat-types` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/seat-types` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/seat-types/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/seat-types/:id` | Admin de cooperativa (eliminar) |
| `GET` | `/api/coop/bus-groups` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/bus-groups` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/bus-groups/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/bus-groups/:id` | Admin de cooperativa (eliminar) |
| `GET` | `/api/coop/seasons` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/seasons` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/seasons/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/seasons/:id` | Admin de cooperativa (eliminar) |
| `GET` | `/api/coop/seat-templates` | Admin de cooperativa (lista) |
| `POST` | `/api/coop/seat-templates` | Admin de cooperativa (crear) |
| `PUT` | `/api/coop/seat-templates/:id` | Admin de cooperativa (editar) |
| `DELETE` | `/api/coop/seat-templates/:id` | Admin de cooperativa (eliminar) |

## Administración y auditoría

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/admin/settings` | Auditor / Superadmin (lectura) |
| `PUT` | `/api/admin/settings` | Superadmin |
| `POST` | `/api/admin/logo` | Superadmin |
| `GET` | `/api/admin/cooperatives` | Auditor / Superadmin (lectura) |
| `POST` | `/api/admin/cooperatives` | Superadmin |
| `PUT` | `/api/admin/cooperatives/:id` | Superadmin |
| `GET` | `/api/admin/geo` | Auditor / Superadmin (lectura) |
| `POST` | `/api/admin/cities` | Superadmin |
| `DELETE` | `/api/admin/cities/:id` | Superadmin |
| `POST` | `/api/admin/terminals` | Superadmin |
| `PUT` | `/api/admin/terminals/:id` | Superadmin |
| `DELETE` | `/api/admin/terminals/:id` | Superadmin |
| `GET` | `/api/admin/users` | Auditor / Superadmin (lectura) |
| `POST` | `/api/admin/users` | Superadmin |
| `PUT` | `/api/admin/users/:id` | Superadmin |
| `POST` | `/api/admin/users/:id/reset-password` | Superadmin |
| `GET` | `/api/admin/seasons` | Auditor / Superadmin (lectura) |
| `POST` | `/api/admin/seasons` | Superadmin |
| `DELETE` | `/api/admin/seasons/:id` | Superadmin |
| `GET` | `/api/admin/audit` | Auditor / Superadmin (lectura) |
| `GET` | `/api/admin/email-log` | Auditor / Superadmin (lectura) |
| `GET` | `/api/admin/stats` | Auditor / Superadmin (lectura) |

