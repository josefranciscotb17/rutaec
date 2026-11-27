# Guía de estilo de textos e interfaz

Reglas cortas para que todas las pantallas y mensajes de RutaEC se lean igual. Se aplican en `public/js/*.js` y en los mensajes de error del servidor (`httpError`).

## Tono
- Tuteo en todo el sistema: «Ingresa tu cédula», no «Ingrese su cédula».
- Frases cortas y en positivo. Un mensaje de error dice qué pasó y qué hacer: «La placa PBA-1234 ya está registrada».

## Ortografía que más se repite
| Correcto | Incorrecto |
|---|---|
| cédula, contraseña, sesión, código, número | cedula, contrasena, sesion, codigo, numero |
| N.º de unidad | No. de unidad, Nro unidad |
| Revisión técnica | Revision tecnica |
| Pago aprobado | Pago Aprobado (sin mayúscula en la segunda palabra) |

## Botones y títulos
- Botones con verbo en infinitivo: «Guardar», «Validar boleto», «Iniciar viaje».
- Títulos con mayúscula solo en la primera palabra y nombres propios: «Hojas de ruta», «Rutas destacadas».

## Formatos
- Fechas: dd/mm/aaaa (24/11/2026). Horas: 24 h (13:00).
- Dinero: `$ 6,50` en pantalla; en la base siempre centavos enteros.
- Teléfono celular: 09XXXXXXXX. Placa: ABC-1234. RUC: 13 dígitos terminados en 001.

## Nombres de roles visibles
| Código | Se muestra como |
|---|---|
| SUPERADMIN | Administrador |
| COOP_ADMIN | Cooperativa |
| OFFICE | Oficinista |
| BUS (CHOFER / AYUDANTE) | Bus (chofer) / Bus (ayudante) |
| CLIENT | Cliente |

## Validación de formularios
- La regla vive en `server/lib/util.js`; el formulario repite la misma regla con `pattern` y `title` solo para ayudar al usuario.
- El error se muestra junto al campo, no solo en el aviso flotante.
