# 🚌 RutaEC — Pasajes interprovinciales del Ecuador

Sistema web (computador y celular, instalable como PWA) para que las cooperativas de transporte vendan y controlen boletos de bus interprovincial: **búsqueda y compra en línea con mapa de asientos, pago por transferencia/depósito con comprobante o en efectivo, boleto con código QR verificable, impresión en la impresora del oficinista, control de abordaje por el chofer (incluso sin internet), hojas de ruta con rotación de buses, reportes y auditoría**.

Este repositorio implementa el **Documento de Diseño v1** (`docs/RutaEC_Documento_de_Diseno_v1.pdf`) y el proyecto de segundo parcial de UTA (base de datos + sitio web + datos de clase de buses/rotación + boleto tipo *wallet* con QR).

> ✅ Listo para probar: al primer arranque se crea la base de datos con **3 cooperativas, 17 buses, 16 frecuencias, ~460 viajes, miles de boletos de ejemplo y 79 usuarios**.

---

## 📌 Estado del proyecto (v0.5.0)

| Módulo | Estado |
|---|---|
| Repositorio, licencia, documentación y plantillas | ✅ Completo |
| Base de datos y autenticación con 7 roles | ✅ Completo |
| CRUD de cooperativa: buses, asientos, frecuencias, hojas de ruta, viajes | ✅ Completo |
| Búsqueda de viajes, mapa de asientos y compra con comprobante | ✅ Completo |
| Boletos con QR, PDF e historial de compras | ✅ Completo |
| Ventanilla del oficinista, validación de pagos y caja | ✅ Completo |
| Aplicación del chofer con escáner QR y modo sin conexión | ✅ Completo |
| Administración global, auditoría y pruebas de la API | ✅ Completo |
| Control de cambios con Jira | 🔜 Segunda etapa |

## Inicio rápido (2 minutos)

Requisitos: **Node.js 22.13 o superior (22, 24…)** y Git (nada más; la base SQLite viene integrada en Node, no se compila nada).

```bash
npm install
npm start          # abre http://localhost:3000 — la primera vez carga los datos de demostración (~5 s)
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca con recarga automática |
| `npm test` | 17+ pruebas automáticas (reglas de negocio, flujo de compra, QR, permisos…) |
| `npm run db:reset` | Borra todo y recarga los datos de demostración (las fechas se recalculan desde **hoy**) |
| `npm run docs:api` | Regenera `docs/API.md` |
| `docker compose up --build` | Alternativa con Docker |

### Cuentas de demostración (contraseña de todas: `Demo1234!`)

| Rol | Usuario | Qué probar |
|---|---|---|
| Cliente | `cliente@rutaec.test` (también `cliente2…4`) | Buscar, comprar, subir comprobante, ver boletos con QR |
| Oficinista | `oficina.andina@rutaec.test` | Vender en mostrador, validar comprobantes, caja, imprimir |
| Oficinista 2 | `oficina2.andina@rutaec.test` · `oficina.costaazul@…` · `oficina.sierraverde@…` | Impresora 58 mm |
| Chofer | `chofer1.andina@rutaec.test` … `chofer7…` | Iniciar viaje, escanear QR, vender en ruta |
| Ayudante | `ayudante1.andina@rutaec.test` | Escanear (no inicia/finaliza) |
| Admin cooperativa | `gerente.andina@rutaec.test` · `gerente.costaazul@…` · `gerente.sierraverde@…` | Flota, frecuencias, hojas de ruta, reportes |
| Superadmin | `admin@rutaec.test` | Cooperativas, usuarios, marca, reglas, auditoría |
| Auditor | `auditor@rutaec.test` | Solo lectura de todo |

La pantalla de ingreso muestra botones de acceso rápido mientras `DEMO_MODE=true`.

**Casos ya preparados para probar:** una orden de `cliente2` con *comprobante en revisión* (oficina → Pagos por validar), una *reserva para pagar en efectivo* de `cliente3` (Órdenes → Cobrar), boletos de `cliente@` listos con QR, viajes de hoy con ventas para escanear y viajes finalizados con historial/calificaciones para los reportes.

---

## ¿Qué incluye? (por rol)

**Cliente / público**
- Búsqueda por origen/destino (incluye paradas intermedias), fecha, cooperativa, tipo de asiento, chasis, carrocería, servicio directo/con paradas y horario; orden por hora, precio o duración.
- **Mapa de asientos por tramo** (1 o 2 pisos): un asiento puede venderse en tramos que no se solapan (Quito→Ambato y luego Ambato→Cuenca).
- Reserva temporal tipo cine (4 min, configurable) con cuenta regresiva; al subir el comprobante el tiempo se detiene hasta que el oficinista lo valida; si lo rechazan, hay 10 min de gracia.
- Pago por **transferencia/depósito** (cuentas de la cooperativa con botón copiar) o **reserva para pagar en efectivo** (60 min).
- **Boleto con QR**: pantalla completa, PDF A5 y código manual de 10 caracteres. Descuentos por categoría (menor, tercera edad, discapacidad) y recargo por temporada/tipo de asiento.
- Registro con **cédula ecuatoriana validada**, recuperación de contraseña, notificaciones y correos, calificación de viajes.

**Oficinista**
- **Punto de venta** con mapa, autocompletado de pasajeros por cédula, cobro con cálculo de cambio y tasa de terminal.
- **Cola de pagos por validar** con visor del comprobante, aprobar/rechazar con motivo (notifica al cliente).
- Búsqueda de órdenes (código, cédula, nombre, N.º de boleto, código QR), cobro de reservas, anulación (con permiso) y **reimpresión auditada**.
- **Caja**: apertura, arqueo, cierre con diferencia e impresión A4. Manifiestos de pasajeros imprimibles.
- **Impresión en tu impresora**: boleto/nota de venta térmico **58/80 mm** (vista previa + diálogo del sistema), PDF A5 y documentos A4. Ver `docs/IMPRESION.md`.

**Chofer / ayudante**
- Lista de viajes, **escáner QR con la cámara** (jsQR) y código manual; resultados *válido / ya usado / otro viaje / anulado / sin pago / inválido* con sonido y vibración; alerta de documento si el pasajero tiene descuento.
- **Modo sin conexión**: descarga el manifiesto, valida localmente y sincroniza después (gana el escaneo más antiguo).
- Inicio/fin de viaje, resumen (abordados, *no-show*, retraso), **venta en ruta** con precio acotado (50%–150% de la tarifa) e incidencias.

**Administrador de cooperativa**
- Flota (datos, grupos, revisión técnica), **plantillas y editor visual de asientos**, frecuencias con paradas, minutos, km y **matriz de tarifas** (con cálculo proporcional), resolución ANT, días de operación.
- **Hojas de ruta con rotación automática** (caso del Excel de clase: N buses × F frecuencias → posición "parada" cuando sobran buses; detección de conflictos/descanso; edición manual y publicación que crea los viajes).
- Viajes del día (asignar bus/chofer/andén, cancelar con notificación a pasajeros), personal, oficinas e impresoras, cuentas bancarias, tipos de asiento, temporadas, reportes (ingresos por día/ruta/canal/método/oficina/categoría, ocupación, *no-show*, CSV), bitácora e incidencias.

**Superadministrador / auditor**
- Cooperativas (con su administrador inicial), usuarios, marca (colores, logo, redes sociales, eslogan), reglas de negocio, textos legales y FAQ, temporadas globales, ciudades y terminales, bitácora global y bandeja de correos. El auditor solo lee.

---

## Cómo se prueba el QR con un celular

El QR contiene `BASE_URL/v/<código>`; al escanearlo con la cámara del celular se abre una página pública que muestra si el boleto es válido (sin marcar abordaje: solo el personal puede hacerlo).

1. PC y celular en la **misma Wi‑Fi**. Averigua la IP de tu PC (p. ej. `192.168.1.50`).
2. Arranca con `BASE_URL=http://192.168.1.50:3000 npm start` (Windows PowerShell: `$env:BASE_URL="http://192.168.1.50:3000"; npm start`).
3. En el celular abre `http://192.168.1.50:3000`, inicia sesión como cliente y abre un boleto; escanéalo con **otra** cámara/celular.
4. **La cámara del escáner del chofer exige HTTPS** (o `localhost`). Para probarla en el celular usa un túnel HTTPS (`npx cloudflared tunnel --url http://localhost:3000` o ngrok) y pon esa URL en `BASE_URL`; o prueba el escáner en la PC con su webcam; o usa el código manual.

## Estructura

```
server/            Node + Express 4 + SQLite (node:sqlite)
  index.js         Servidor, seguridad (helmet/CSP, rate-limit), página pública /v/:codigo
  schema.sql       Esquema (32 tablas)           seed.js  Datos de demostración
  lib/             util, settings, auth (JWT/RBAC), core (reservas, precios, asientos), rotation, docs (PDF/QR/térmico)
  routes/          public, auth, sales (cliente+oficina+caja), driver, coop, admin
public/            SPA sin build (HTML + JS vanilla + CSS), PWA (manifest, service worker)
tests/             Pruebas con node:test (unitarias + API completa)
docs/              Diseño (PDF), arquitectura, BD, API, Git, roles, demostración, pruebas, impresión, alcance
.github/           Plantillas de issues/PR, CI, CodeQL, release, Dependabot, CODEOWNERS
```

## Configuración (`.env.example`)

`PORT`, `BASE_URL` (para QR/correos), `DATA_DIR`/`DB_FILE`, `JWT_SECRET`, `DEMO_MODE`, `RATE_LIMIT`, `TZ_APP`, y SMTP opcional (`SMTP_*`). Sin SMTP, los correos se guardan en la bandeja interna (Superadmin → Auditoría → Correos).

## Trabajo en equipo (Git y GitHub)

- Flujo de ramas y pasos para probar la rama de un compañero: [`CONTRIBUTING.md`](CONTRIBUTING.md) y [`docs/FLUJO_GIT.md`](docs/FLUJO_GIT.md).
- Roles, permisos y cuentas de demostración: [`docs/ROLES_Y_PERMISOS.md`](docs/ROLES_Y_PERMISOS.md) · Guion de la defensa: [`docs/GUIA_DE_DEMOSTRACION.md`](docs/GUIA_DE_DEMOSTRACION.md).
- Seguimiento: *issues* con código `HU-n` y tablero (GitHub Projects) del repositorio.
- Plan de pruebas: [`docs/PRUEBAS.md`](docs/PRUEBAS.md) · CI en `.github/workflows/ci.yml`.
- Seguridad: [`SECURITY.md`](SECURITY.md) · Conducta: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · Cita: [`CITATION.cff`](CITATION.cff) · Licencia MIT.

## Alcance honesto y siguientes pasos

Esta entrega es una **implementación funcional completa del núcleo del diseño** con una pila simplificada para que cualquier compañero la ejecute con `npm install && npm start`. Diferencias y pendientes frente al documento de diseño (PostgreSQL, pasarelas de tarjeta, facturación electrónica SRI, Apple/Google Wallet, notificaciones push/WhatsApp, etc.) están en [`docs/ALCANCE.md`](docs/ALCANCE.md), con la ruta de migración recomendada.
