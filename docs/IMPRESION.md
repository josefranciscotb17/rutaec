# Impresión de boletos, notas de venta y documentos

RutaEC no necesita *drivers* especiales: genera documentos que se imprimen con **la impresora que el oficinista tenga instalada** (térmica de tickets, láser o inyección) usando el diálogo de impresión del navegador.

| Documento | Formato | Cómo se obtiene | Registro |
|---|---|---|---|
| Boleto / nota de venta térmico | HTML de **58 mm o 80 mm** con QR | Tras vender, botón **🖨️ Imprimir boletos** (se abre solo si la oficina tiene *impresión automática*), o en Órdenes → Ver → 🖨️ | Cada impresión crea un `print_jobs` (copia n.º, usuario, motivo); la 2.ª copia sale marcada **REIMPRESIÓN** |
| Boleto en PDF | **A5** con QR (también lo descarga el cliente) | `GET /api/tickets/:id/pdf` · `GET /api/orders/:id/pdf` | — |
| Manifiesto de pasajeros | A4 | Salidas y manifiestos / consola del chofer | — |
| Cierre de caja | A4 | Caja → Imprimir | — |
| Hoja de ruta | A4 | Hojas de ruta → Imprimir | — |

## Configurar la impresora térmica (Windows / macOS / Linux)

1. Instala el *driver* del fabricante (o *Generic / Text Only*) y ponla como impresora predeterminada o elígela en el diálogo.
2. En **Coop → Oficinas e impresoras** define el ancho de papel (58 u 80 mm) y si se abre la impresión automáticamente.
3. En el diálogo de impresión de Chrome/Edge: **Márgenes: Ninguno**, **Escala: 100 %**, desmarca *Encabezados y pies de página*. La vista previa muestra "Vista previa 80 mm" con botones **Imprimir / Cerrar**.
4. Para impresión directa sin diálogo (opcional): inicia Chrome con `--kiosk-printing` en el puesto del oficinista.
5. Si el navegador bloquea la ventana emergente, permite *pop-ups* para el sitio.

## Contenido del boleto térmico

Razón social y RUC de la cooperativa · terminal · N.º de boleto `COOP-OFICINA-SECUENCIA` · ruta · fecha y hora de salida · bus, placa y andén · asiento y tipo · pasajero y cédula (enmascarada) · desglose (pasaje, tasa de terminal, total) · forma de pago y vendedor · **QR** + código manual de 10 caracteres · fecha de impresión · leyenda configurable (Superadmin → Sitio y reglas).

> **Nota tributaria:** el documento es un comprobante de venta/boleto de uso interno. La **factura electrónica del SRI** no está integrada en esta versión (ver `docs/ALCANCE.md`).

# QR y verificación

- Formato: `BASE_URL/v/<public_id (26 caracteres Crockford)><etiqueta HMAC-SHA256 (8)>`. Cualquier cámara de celular lo abre; la página pública muestra *BOLETO VÁLIDO / NO VÁLIDO*, ruta, salida, asiento y estado, **sin** marcar el abordaje.
- El **abordaje** solo lo registra el personal en la consola del chofer (`POST /api/driver/scan`): primer escaneo → `VALIDO`; después → `YA_USADO`.
- Resultados posibles: `VALIDO`, `YA_USADO`, `OTRO_VIAJE`, `ANULADO`, `NO_PAGADO`, `INVALIDO`.
- Si el celular del cliente no tiene datos o el QR no se lee, el chofer escribe el **código manual de 10 caracteres**.
- **Modo sin conexión:** la consola descarga el manifiesto (boletos del viaje con su estado), valida localmente (incluye el código manual) y guarda los escaneos en una cola local; al recuperar internet se envían en lote y el servidor resuelve conflictos (gana el escaneo más antiguo).
- La **cámara requiere HTTPS o `localhost`**. En pruebas con celular use un túnel HTTPS (ver README).
