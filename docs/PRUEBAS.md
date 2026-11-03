# Plan de pruebas

## Automáticas (`npm test`)

| Archivo | Cubre |
|---|---|
| `tests/unit.test.js` | Cédula/RUC/placa, fechas locales, precio (descuento solo sobre tarifa, recargo por tipo de asiento y temporada), **rotación de hoja de ruta** (caso 6 buses × 4 frecuencias), conflictos de descanso, tarifas proporcionales |
| `tests/api.test.js` | Configuración y catálogo públicos · login y **bloqueo por intentos** · registro con cédula · **flujo completo** (buscar → reservar → doble reserva rechazada → comprobante → aprobación en oficina → boleto → PDF/QR/impresión → verificación pública → escaneo válido/ya usado/otro viaje) · rechazo de comprobante con gracia · permisos por rol y aislamiento entre cooperativas · venta en mostrador con caja y cambio · crear frecuencia con tarifas, generar/guardar/publicar hoja de ruta · reportes, CSV y administración |

Las pruebas usan una base temporal y no tocan `data/`.

## Manuales (aceptación) — usa las cuentas del README

| # | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| M1 | Compra con comprobante | Cliente: Quito→Ambato (mañana+) → 2 asientos → pasajeros (uno *Menor*) → transferencia → subir comprobante | Total con descuento del menor; estado *En revisión*; reloj detenido |
| M2 | Aprobación | Oficina: Pagos por validar → Aprobar | Cliente recibe notificación; boleto con QR en *Mis boletos* |
| M3 | Rechazo | Oficina: Rechazar con motivo | Cliente ve motivo y 10 min para reenviar |
| M4 | Efectivo con reserva | Cliente: "Pagar en efectivo" → Oficina: Órdenes → Cobrar | Requiere caja abierta; emite boletos y calcula cambio |
| M5 | Venta en mostrador + impresión | Oficina: abrir caja → vender 2 asientos (uno *Tercera edad*) → imprimir | Ticket 58/80 mm con QR; reimpresión sale marcada |
| M6 | Doble venta | Dos navegadores eligen el mismo asiento | El segundo recibe "ya no está disponible" |
| M7 | Tramos | Vender Quito→Ambato y luego Ambato→Cuenca el mismo asiento | Permitido; Quito→Cuenca del mismo asiento: rechazado |
| M8 | Escaneo | Chofer: iniciar viaje → escanear QR del boleto de M2 dos veces | 1.º VÁLIDO (con alerta de documento si es menor); 2.º YA USADO |
| M9 | Sin conexión | Chofer: abrir viaje → DevTools → *Offline* → escanear código manual → volver *Online* | Se marca *pendiente* y se sincroniza solo |
| M10 | Venta en ruta | Chofer (viaje EN RUTA): vender asiento libre con precio fuera de 50–150 % | Rechazado; dentro del rango emite y marca abordado |
| M11 | Rotación | Coop: Hojas de ruta → generar (7 días) → editar una celda → publicar | Viajes creados; conflictos advertidos |
| M12 | Cancelar viaje | Coop: Viajes → Cancelar con motivo | Órdenes canceladas y clientes notificados |
| M13 | Permisos | Cliente abre `#/office`; gerente Andina intenta datos de Costa Azul | Acceso denegado / 404 |
| M14 | Caja | Cerrar caja contando menos efectivo | Diferencia negativa y reporte imprimible |
| M15 | Móvil | Abrir en celular: búsqueda, mapa de asientos, boleto a pantalla completa | Usable sin zoom horizontal |

## Criterios de salida de una versión

Pruebas automáticas verdes en Node 22 y 24 · M1–M15 aprobados · `npm audit` sin altas/críticas sin justificar · documentación actualizada.
