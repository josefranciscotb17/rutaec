# Roles, permisos y cuentas de demostración

RutaEC tiene **cinco roles**, los del documento de diseño. El servidor valida el rol en **cada** petición (`requireRole`); el menú del navegador solo muestra lo que corresponde, pero esconder un botón nunca reemplaza la validación del servidor.

| Rol | Código | Cuenta de demostración | Qué puede hacer |
|---|---|---|---|
| Cliente (Usuario final) | `CLIENT` | `cliente@rutaec.test` | Buscar viajes, elegir asientos, comprar, subir el comprobante, ver sus boletos con QR e historial |
| Oficinista | `OFFICE` | `oficina.andina@rutaec.test` | Vender en ventanilla, validar comprobantes, cobrar reservas, anular boletos, imprimir |
| Bus (chofer o ayudante) | `BUS` + `crew_position` | `chofer1.andina@rutaec.test` (CHOFER), `ayudante1.andina@rutaec.test` (AYUDANTE) | Ver sus viajes, escanear boletos, vender en ruta. Solo el chofer inicia y finaliza el viaje |
| Cooperativa (Usuario de cooperativa) | `COOP_ADMIN` | `gerente.andina@rutaec.test` | Flota, asientos, frecuencias, hojas de ruta, viajes, personal y reportes **solo de su cooperativa** |
| Administrador | `SUPERADMIN` | `admin@rutaec.test` | Cooperativas, usuarios, ciudades y terminales, marca y reglas del sitio, auditoría. **No opera dentro de las cooperativas** |

La contraseña de todas las cuentas de demostración es `Demo1234!`.

La base de datos garantiza la coherencia (migración `002_roles.sql`):

- `role` solo admite los 5 valores; `crew_position` (`CHOFER` o `AYUDANTE`) es obligatoria para `BUS` y prohibida para el resto.
- `COOP_ADMIN` y `BUS` deben tener cooperativa; `SUPERADMIN` y `CLIENT` no pueden tenerla.

## Matriz de permisos

| Acción | Cliente | Oficinista | Bus | Cooperativa | Administrador |
|---|:-:|:-:|:-:|:-:|:-:|
| Buscar viajes y comprar | ✅ | ✅ | — | — | — |
| Ver solo sus propias órdenes y boletos | ✅ | — | — | — | — |
| Vender en ventanilla | — | ✅ | — | ✅ | — |
| Aprobar o rechazar comprobantes | — | ✅ | — | ✅ | — |
| Escanear boletos (abordaje) y vender en ruta | — | — | ✅ | — | — |
| Iniciar y finalizar viajes | — | — | Solo chofer | — | — |
| Administrar flota, frecuencias y hojas de ruta | — | — | — | ✅ (su cooperativa) | — |
| Administrar cooperativas, usuarios y ajustes del sitio | — | — | — | — | ✅ |
| Consultar la bitácora de auditoría | — | — | — | Su cooperativa | ✅ |

## Reglas de seguridad relacionadas

- Una cooperativa **nunca** ve ni modifica los datos de otra (alcance por `coop_id`).
- Las contraseñas se guardan con *bcrypt*; la sesión usa JWT con caducidad.
- Los comprobantes de pago son archivos privados: solo los ve el dueño de la orden o el personal autorizado.
- Cada acción sensible (anular un boleto, cambiar un ajuste, restablecer una contraseña) queda en la bitácora de auditoría.
