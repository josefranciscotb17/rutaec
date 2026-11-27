# Gobernanza y control de cambios de RutaEC

Este documento define quién aprueba los cambios del sistema, cómo se solicitan y cómo se trazan desde la solicitud hasta la versión publicada. Aplica a todo cambio que llegue a `develop` o `main` desde la versión 0.6.0.

## 1. Comité de cambios (CAB)

| Función | Integrante | Usuario de GitHub |
|---|---|---|
| Integrante 1 del comité | Michael Steve Rosillo Córdova | `michaelrosillo787-alt` |
| Integrante 2 del comité | Britthany Korayma Pico Coello | `Korayma25` |
| Suplente | Paola Alexandra Taipe Tixilema | `paotaipe501-hub` |

Regla del equipo: **nadie aprueba su propio cambio**. Si el autor es Michael, aprueban Korayma y Paola; si es Korayma, aprueban Michael y Paola.

Responsabilidades del comité:
- Revisar el análisis de impacto de cada solicitud de cambio Normal o de Emergencia.
- Dar las **2 aprobaciones** obligatorias en los Pull Requests hacia `main` (release y hotfix).
- Poner la etiqueta `cambio-aprobado` en el issue cuando la solicitud está aprobada.
- Hacer la revisión posterior de los cambios de Emergencia (máximo 24 horas después de fusionar).

GitHub no cuenta la aprobación del autor del PR: si un integrante del comité abre el PR, la segunda aprobación la da el suplente.

## 2. Tipos de cambio (ITIL)

| Tipo | Cuándo se aplica en RutaEC | Rama | Aprobaciones |
|---|---|---|---|
| **Emergencia** | Falla que bloquea un flujo crítico o expone datos o permisos (seguridad, CRUD roto) | `hotfix/HU-n-*` desde `main` → `main` y luego `develop` | 2 (comité) + revisión posterior |
| **Estándar** | Cambio repetible, de bajo riesgo y preaprobado: textos, plantillas, documentación, configuración del repositorio | `docs/HU-n-*` o `chore/HU-n-*` desde `develop` → `develop` | 1 |
| **Normal** | Cambio de esquema, lógica de negocio o flujo nuevo con impacto evaluable | `feature/HU-n-*` desde `develop` → `develop` → `release/x.y.z` | 2 (comité) |

### Catálogo de cambios estándar (preaprobados)
- Corrección de textos, ortografía y estilos sin cambio de lógica.
- Documentación en `docs/`, `README.md`, `CONTRIBUTING.md` y plantillas de `.github/`.
- Actualizaciones de dependencias de parche (`x.y.Z`) con CI en verde.

## 3. Proceso formal en 5 pasos

1. **Solicitud.** Se abre un issue con la plantilla *Solicitud de cambio* (`.github/ISSUE_TEMPLATE/change_request.yml`). Queda con las etiquetas `solicitud-de-cambio` y `pendiente-comite`.
2. **Análisis de impacto.** El responsable completa módulos y tablas afectadas, riesgo (Bajo, Medio o Alto), plan de pruebas y plan de reversión. Si cambia la base de datos, nombra la migración (`server/migrations/NNN_*.sql`).
3. **Aprobación.** El comité revisa el análisis y comenta su decisión. Si aprueba, cambia `pendiente-comite` por `cambio-aprobado`. Sin esa etiqueta no se abre rama (salvo Emergencia, que se aprueba en el mismo PR).
4. **Implementación.** Rama según el tipo de cambio y Pull Request con la plantilla del repositorio, que enlaza el issue (`Closes #N`) y completa la sección *Control de cambios*. Se fusiona con *Create a merge commit*.
5. **Cierre.** El cambio se registra en `CHANGELOG.md` (sección `[Sin publicar]` y luego en la versión) y se etiqueta la versión (`vX.Y.Z`) en `main`. En Emergencia, el comité deja la revisión posterior como comentario en el issue.

## 4. Reglas del repositorio

- `main`: PR obligatorio, **2 aprobaciones**, se descartan las aprobaciones al subir commits nuevos, CI obligatorio, sin push directo, sin force-push y sin excepciones para administradores.
- `develop`: PR obligatorio, 1 aprobación como mínimo (2 en cambios Normales), CI obligatorio.
- Las migraciones de base de datos ya fusionadas no se editan: un error se corrige con una migración nueva.
- Ningún cambio se fusiona con pruebas en rojo ni deshabilitando pruebas.

## 5. Reversión

- Código: `git revert -m 1 <commit de fusión>` en una rama `revert/HU-n-*` y PR con las mismas aprobaciones que el cambio original.
- Datos: detener el servidor y `npm run db:restore -- data/backups/<respaldo>.db` (el ejecutor de migraciones respalda la base antes de migrar).

## 6. Estados de una solicitud y etiquetas

Cada issue de solicitud de cambio tiene **una** etiqueta de estado. La plataforma de control de cambios del equipo lee estas etiquetas desde GitHub para mostrar el tablero y la trazabilidad.

| Estado ITIL | Etiqueta | Quién la pone | Cuándo |
|---|---|---|---|
| Registrada | `pendiente-comite` | Quien crea el issue | Al abrir la solicitud |
| Aprobada | `cambio-aprobado` | Comité | Después de revisar el análisis de impacto |
| En implementación | `en-implementacion` | Responsable | Al crear la rama |
| En revisión | `en-revision` | Responsable | Al abrir el PR |
| Implementada | `implementado` | Quien fusiona | Al fusionar el PR (el issue se cierra con `Closes #N`) |
| Rechazada | `rechazado` | Comité | La solicitud no se hace; el issue se cierra como *not planned* |
| Diferida | `diferido` | Comité | Queda para una versión posterior; el issue se cierra como *not planned* |

La decisión del comité se deja como comentario en el issue (quién aprobó, cuándo y por qué). Las actas de cada reunión se guardan en la plataforma del equipo con el enlace a los issues tratados.
