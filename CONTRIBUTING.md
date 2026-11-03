# Guía de contribución

¡Gracias por ayudar a mejorar RutaEC! Esta guía explica cómo trabajar en equipo con **Git + GitHub** sin pisarse entre compañeros y probando en cada computador.

## 1. Preparar tu computador

```bash
git clone https://github.com/ORGANIZACION/rutaec.git && cd rutaec
npm install          # instala dependencias y copia jsQR a public/vendor
cp .env.example .env # opcional
npm start            # primera vez: crea la base y carga datos de demostración
npm test             # 17+ pruebas automáticas deben pasar
```

Requisitos: **Node.js 22.13+**, Git. No hace falta instalar ninguna base de datos (SQLite incluido).

## 2. Ramas (Gitflow simplificado)

| Rama | Uso | Se crea desde | Se integra en |
|---|---|---|---|
| `main` | Versión estable y etiquetada (`v1.0.0`) | — | — |
| `develop` | Integración continua del equipo | `main` | `main` (release) |
| `feature/HU-12-descripcion-corta` | Una historia de usuario | `develop` | `develop` por PR |
| `bugfix/HU-13-descripcion` | Corrección no urgente | `develop` | `develop` por PR |
| `release/1.1.0` | Congelar y probar versión | `develop` | `main` y `develop` |
| `hotfix/HU-14-descripcion` | Error crítico en producción | `main` | `main` y `develop` |

`main` y `develop` están **protegidas**: no se hace push directo; todo entra por Pull Request con CI verde y al menos **1 aprobación**.

El código de la historia de usuario (`HU-12`) va **siempre** en el nombre de la rama y en el PR; el número del issue (`#12`) va en la descripción del PR con `Closes #12`, así GitHub enlaza solo los commits, la rama y el PR al issue y lo cierra al fusionar.

## 3. Flujo diario

```bash
git switch develop && git pull --ff-only
git switch -c feature/HU-12-mapa-asientos-doble-piso
# ...trabaja, prueba en tu PC...
npm test
git add -p
git commit -m "feat(asientos): soporte de doble piso en el mapa (HU-12)"
git push -u origin feature/HU-12-mapa-asientos-doble-piso
# abre el Pull Request hacia develop con la plantilla
```

Para probar la rama de un compañero en tu PC: `git fetch && git switch feature/HU-12-...` y `npm install && npm start`. La base de datos es local por computador (`data/`), así que cada quien prueba con sus propios datos; usa `npm run db:reset` para volver a los datos de demostración.

Mantén tu rama al día con `git fetch && git rebase origin/develop` (o `merge`) **antes** de abrir el PR y resuelve conflictos localmente.

## 4. Commits (Conventional Commits)

`tipo(alcance): descripción en imperativo (HU-12)`

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Alcances sugeridos: `auth`, `busqueda`, `asientos`, `pago`, `boleto`, `qr`, `impresion`, `oficina`, `chofer`, `coop`, `admin`, `db`, `ui`.

Ejemplos: `fix(pago): rechazar comprobante duplicado por hash (HU-8)` · `docs(readme): guía de impresión térmica (HU-12)`.

## 5. Pull Requests

1. Título con el código de la historia (`HU-n`) y descripción usando la plantilla (qué, por qué, cómo probar, capturas).
2. Enlaza el issue (`Closes #N`).
3. Checklist mínimo: pruebas añadidas/actualizadas, `npm test` verde, sin secretos, documentación actualizada (`docs/`, README) y sin romper el esquema (si cambia `schema.sql`, explica la migración).
4. El revisor prueba la rama (ver §3) y deja comentarios; se fusiona hacia `develop` con *Create a merge commit* (así se conserva el historial de commits de la rama).

## 6. Estilo de código

- JavaScript moderno (Node 22+), 2 espacios, comillas simples, punto y coma. Ver `.editorconfig`.
- Dinero **siempre en centavos enteros**; fechas locales de Ecuador como texto `YYYY-MM-DD HH:MM:SS` (ver `server/lib/util.js`).
- Nunca construyas SQL concatenando datos del usuario: usa parámetros `?`.
- Todo texto de interfaz en **español** claro. Escapa con la plantilla `html\`` del front-end.
- Cada regla de negocio nueva necesita una prueba en `tests/`.

## 7. Cómo reportar problemas y proponer mejoras

Usa las plantillas de **Issues** (error / mejora / historia). Para vulnerabilidades, lee [SECURITY.md](SECURITY.md). Flujo Git detallado: [docs/FLUJO_GIT.md](docs/FLUJO_GIT.md).

Al contribuir aceptas el [Código de Conducta](CODE_OF_CONDUCT.md) y que tu aporte se licencia bajo [MIT](LICENSE).
