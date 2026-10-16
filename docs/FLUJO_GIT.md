# Flujo Git paso a paso (para probar en cada PC)

## Primera vez

```bash
git clone https://github.com/ORGANIZACION/rutaec.git
cd rutaec
git switch develop
npm install
npm start     # http://localhost:3000  (carga datos de demostración)
```

## Crear la rama de una historia de usuario

```bash
git switch develop && git pull --ff-only
git switch -c feature/HU-12-descripcion
```

## Guardar y subir

```bash
git status
git add -p                      # revisa lo que subes
git commit -m "feat(asientos): ... (HU-12)"
git push -u origin feature/HU-12-descripcion
```

Abre el **Pull Request → develop**. El CI (`.github/workflows/ci.yml`) corre `npm test` en Node 22 y 24 y verifica que el servidor arranca.

## Probar la rama de otro compañero en tu PC

```bash
git fetch origin
git switch feature/HU-20-reportes     # o: git switch --track origin/feature/HU-20-reportes
npm install                              # por si cambiaron dependencias
npm run db:reset                         # si cambió schema.sql o el seed
npm start
```

Cuando termines: `git switch develop`. Tus datos locales (`data/`) **no se versionan**.

## Mantener tu rama al día

```bash
git fetch origin
git rebase origin/develop      # o: git merge origin/develop
# resuelve conflictos, luego:
npm test && git push --force-with-lease     # solo si hiciste rebase de tu propia rama
```

## Release y hotfix

```bash
# Release
git switch develop && git switch -c release/1.1.0
# solo correcciones; luego PR a main:
git switch main && git merge --no-ff release/1.1.0 && git tag -a v1.1.0 -m "RutaEC 1.1.0"
git push origin main --tags && git switch develop && git merge --no-ff release/1.1.0

# Hotfix
git switch main && git switch -c hotfix/HU-14-descripcion
# corrige, PR a main, etiqueta v1.0.1 y fusiona también en develop
```

## Protección de ramas recomendada (GitHub → Settings → Branches)

`main` y `develop`: requerir PR, 1 aprobación, CI verde (`test (22)`, `test (24)`), conversaciones resueltas, historial lineal opcional, sin *force-push*.

## Seguimiento con issues y tablero

Cada historia de usuario es un *issue* con código `HU-n` en el título. El tablero (GitHub Projects) tiene las columnas **Por hacer → En progreso → En revisión → Hecho**. Al abrir el Pull Request escribe `Closes #N` en la descripción: GitHub enlaza el issue con la rama y los commits, y lo pasa a *Hecho* cuando se fusiona.
