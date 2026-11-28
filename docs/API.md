# Referencia de la API REST

> Generado automáticamente con `npm run docs:api`. Todas las rutas cuelgan de `/api` (la autenticación de `auth.js` va bajo `/api/auth`). Las respuestas son JSON; los errores tienen la forma `{ "error": "mensaje", "code": "CODIGO" }`.

**Autenticación:** cabecera `Authorization: Bearer <token>` (JWT de 12 h obtenido en `POST /api/auth/login`). Los documentos imprimibles aceptan además `?token=` en `GET` para abrirse en una ventana nueva.

**Contexto de cooperativa:** el personal opera siempre sobre su propia cooperativa; el Administrador no opera dentro de las cooperativas.

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
| `POST` | `/api/notifications/read` | Cooperativa |
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

## Bus (chofer / ayudante)

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/driver/trips` | Bus (chofer / ayudante) |
| `GET` | `/api/driver/history` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/trips/:id/start` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/trips/:id/finish` | Bus (chofer / ayudante) |
| `GET` | `/api/driver/trips/:id/summary` | Bus (chofer / ayudante) |
| `GET` | `/api/driver/trips/:id/manifest` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/scan` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/scans/batch` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/trips/:id/alight` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/sale` | Bus (chofer / ayudante) |
| `GET` | `/api/driver/trips/:id/free-seats` | Bus (chofer / ayudante) |
| `POST` | `/api/driver/trips/:id/incident` | Bus (chofer / ayudante) |

## Cooperativa

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/coop/profile` | Cooperativa |
| `PUT` | `/api/coop/profile` | Cooperativa |
| `POST` | `/api/coop/logo` | Cooperativa |
| `GET` | `/api/coop/users` | Cooperativa |
| `POST` | `/api/coop/users` | Cooperativa |
| `PUT` | `/api/coop/users/:id` | Cooperativa |
| `POST` | `/api/coop/users/:id/reset-password` | Cooperativa |
| `POST` | `/api/coop/seat-templates/generate` | Cooperativa |
| `GET` | `/api/coop/buses` | Cooperativa |
| `POST` | `/api/coop/buses` | Cooperativa |
| `PUT` | `/api/coop/buses/:id` | Cooperativa |
| `DELETE` | `/api/coop/buses/:id` | Cooperativa |
| `POST` | `/api/coop/buses/:id/photo` | Cooperativa |
| `GET` | `/api/coop/buses/:id/seats` | Cooperativa |
| `PUT` | `/api/coop/buses/:id/seats` | Cooperativa |
| `GET` | `/api/coop/frequencies` | Cooperativa |
| `POST` | `/api/coop/frequencies` | Cooperativa |
| `PUT` | `/api/coop/frequencies/:id` | Cooperativa |
| `DELETE` | `/api/coop/frequencies/:id` | Cooperativa |
| `GET` | `/api/coop/terminals` | Cooperativa |
| `POST` | `/api/coop/route-sheets/preview` | Cooperativa |
| `POST` | `/api/coop/route-sheets` | Cooperativa |
| `GET` | `/api/coop/route-sheets` | Cooperativa |
| `GET` | `/api/coop/route-sheets/:id` | Cooperativa |
| `PUT` | `/api/coop/route-sheets/:id/entries/:eid` | Cooperativa |
| `POST` | `/api/coop/route-sheets/:id/publish` | Cooperativa |
| `DELETE` | `/api/coop/route-sheets/:id` | Cooperativa |
| `GET` | `/api/coop/route-sheets/:id/print` | Cooperativa |
| `GET` | `/api/coop/trips` | Cooperativa |
| `POST` | `/api/coop/trips` | Cooperativa |
| `PUT` | `/api/coop/trips/:id` | Cooperativa |
| `POST` | `/api/coop/trips/:id/cancel` | Cooperativa |
| `GET` | `/api/coop/dashboard` | Cooperativa |
| `GET` | `/api/coop/reports/sales` | Cooperativa |
| `GET` | `/api/coop/audit` | Cooperativa |
| `GET` | `/api/coop/incidents` | Cooperativa |
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

## Administración global

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/admin/settings` | Administrador |
| `PUT` | `/api/admin/settings` | Administrador |
| `POST` | `/api/admin/logo` | Administrador |
| `GET` | `/api/admin/cooperatives` | Administrador |
| `POST` | `/api/admin/cooperatives` | Administrador |
| `PUT` | `/api/admin/cooperatives/:id` | Administrador |
| `GET` | `/api/admin/geo` | Administrador |
| `POST` | `/api/admin/cities` | Administrador |
| `DELETE` | `/api/admin/cities/:id` | Administrador |
| `POST` | `/api/admin/terminals` | Administrador |
| `PUT` | `/api/admin/terminals/:id` | Administrador |
| `DELETE` | `/api/admin/terminals/:id` | Administrador |
| `GET` | `/api/admin/users` | Administrador |
| `POST` | `/api/admin/users` | Administrador |
| `PUT` | `/api/admin/users/:id` | Administrador |
| `POST` | `/api/admin/users/:id/reset-password` | Administrador |
| `GET` | `/api/admin/seasons` | Administrador |
| `POST` | `/api/admin/seasons` | Administrador |
| `DELETE` | `/api/admin/seasons/:id` | Administrador |
| `GET` | `/api/admin/audit` | Administrador |
| `GET` | `/api/admin/email-log` | Administrador |
| `GET` | `/api/admin/stats` | Administrador |

