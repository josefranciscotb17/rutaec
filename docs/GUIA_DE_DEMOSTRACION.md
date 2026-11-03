# Guion de demostración (defensa)

Duración sugerida: **12 minutos**. Todas las cuentas usan la contraseña `Demo1234!`. Antes de empezar: `npm run db:reset` y `npm start`, y abre el sitio en el computador y en el celular (el escáner del chofer necesita HTTPS o `localhost`).

## Lista de verificación previa

- [ ] `git switch main && git pull` y `npm install` terminan sin errores.
- [ ] `npm test` muestra todas las pruebas en verde.
- [ ] El sitio abre en `http://localhost:3000` y el celular entra con la dirección de la red (o el túnel HTTPS).
- [ ] Hay un boleto comprado con anterioridad para mostrar el escaneo.

## Recorrido por rol

1. **Cliente** (`cliente@rutaec.test`): buscar *Quito → Cuenca* con un filtro, elegir dos asientos en el mapa, registrar los pasajeros (una cédula con descuento), subir un comprobante y ver el temporizador detenido.
2. **Oficinista** (`oficina.andina@rutaec.test`): abrir la caja, aprobar el comprobante del cliente, vender un boleto en efectivo y mandarlo a imprimir.
3. **Cliente otra vez**: abrir *Mis boletos* y mostrar el QR en pantalla completa.
4. **Chofer** (`chofer1.andina@rutaec.test`, en el celular): iniciar el viaje, escanear el QR del boleto, escanear de nuevo para mostrar que se rechaza el duplicado, y reportar una incidencia.
5. **Administrador de cooperativa** (`gerente.andina@rutaec.test`): mostrar una hoja de ruta con días de parada y el reporte de ventas.
6. **Superadministrador** (`admin@rutaec.test`): cambiar el color de marca y mostrar la bitácora de auditoría con las acciones anteriores.
7. **Auditor** (`auditor@rutaec.test`): mostrar que puede ver pero no modificar.

## Si algo falla

- Sin internet: usa `localhost` en el computador y muestra el celular con capturas.
- Base de datos desordenada: `npm run db:reset` la deja como el primer día.
- El escáner no abre la cámara: confirma que la dirección empiece con `https://` o `http://localhost`.
