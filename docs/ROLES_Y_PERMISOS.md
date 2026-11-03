# Roles, permisos y cuentas de demostración

RutaEC tiene **siete roles**. El servidor valida el rol en **cada** petición (`requireRole`); el menú del navegador solo muestra lo que corresponde, pero esconder un botón nunca reemplaza la validación del servidor.

| Rol | Código | Cuenta de demostración | Qué puede hacer |
|---|---|---|---|
| Cliente | `CLIENT` | `cliente@rutaec.test` | Buscar viajes, elegir asientos, comprar, subir el comprobante, ver sus boletos con QR e historial, calificar viajes |
| Oficinista | `OFFICE` | `oficina.andina@rutaec.test` | Vender en ventanilla, validar comprobantes, cobrar reservas, anular boletos, abrir y cerrar caja, imprimir |
| Chofer | `DRIVER` | `chofer1.andina@rutaec.test` | Ver sus viajes, iniciar y finalizar, escanear boletos, vender en ruta, reportar incidencias |
| Ayudante | `ASSISTANT` | `ayudante1.andina@rutaec.test` | Escanear boletos y consultar el manifiesto (no inicia ni finaliza el viaje) |
| Administrador de cooperativa | `COOP_ADMIN` | `gerente.andina@rutaec.test` | Flota, asientos, frecuencias, hojas de ruta, viajes, personal y reportes **solo de su cooperativa** |
| Superadministrador | `SUPERADMIN` | `admin@rutaec.test` | Cooperativas, usuarios, ciudades y terminales, marca y reglas del sitio, temporadas, auditoría |
| Auditor | `AUDITOR` | `auditor@rutaec.test` | Solo lectura de la configuración, los reportes y la bitácora de auditoría |

La contraseña de todas las cuentas de demostración es `Demo1234!`.

## Matriz de permisos

| Acción | Cliente | Oficinista | Chofer / Ayudante | Admin. cooperativa | Superadmin | Auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Buscar viajes y comprar | ✅ | ✅ | — | — | — | — |
| Ver solo sus propias órdenes y boletos | ✅ | — | — | — | — | — |
| Vender en ventanilla y manejar caja | — | ✅ | — | ✅ | — | — |
| Aprobar o rechazar comprobantes | — | ✅ | — | ✅ | — | — |
| Escanear boletos (abordaje) | — | — | ✅ | — | — | — |
| Iniciar y finalizar viajes | — | — | Solo chofer | — | — | — |
| Administrar flota, frecuencias y hojas de ruta | — | — | — | ✅ (su cooperativa) | — | Lectura |
| Administrar cooperativas, usuarios y ajustes del sitio | — | — | — | — | ✅ | Lectura |
| Consultar la bitácora de auditoría | — | — | — | Su cooperativa | ✅ | ✅ |

## Reglas de seguridad relacionadas

- Una cooperativa **nunca** ve ni modifica los datos de otra (alcance por `coop_id`).
- Las contraseñas se guardan con *bcrypt*; la sesión usa JWT con caducidad.
- Los comprobantes de pago son archivos privados: solo los ve el dueño de la orden o el personal autorizado.
- Cada acción sensible (anular un boleto, cambiar un ajuste, restablecer una contraseña) queda en la bitácora de auditoría.
