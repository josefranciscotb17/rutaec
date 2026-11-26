## Resumen
<!-- ¿Qué cambia y por qué? Enlaza el issue: Closes #N -->

## Tipo de cambio
- [ ] feat (nueva funcionalidad)
- [ ] fix (corrección)
- [ ] refactor / perf
- [ ] docs / ci / chore

## Control de cambios
- Solicitud de cambio: Closes #
- Tipo ITIL: Normal / Estándar / Emergencia
- Riesgo: Bajo / Medio / Alto
- Plan de reversión: `git revert -m 1 <fusión>` y, si hay migración, `npm run db:restore -- data/backups/<respaldo>.db`
- [ ] Cambio de esquema: incluye la migración `server/migrations/NNN_*.sql` y corrige en este mismo PR todos los archivos que usan esas tablas

## ¿Cómo probarlo?
<!-- Pasos para que el revisor lo pruebe en su PC: rama, comandos, cuentas de demo, resultado esperado -->
1.
2.

## Capturas / evidencia (si hay cambios de interfaz o impresión)

## Checklist
- [ ] El nombre de la rama y los commits incluyen el código de la historia (HU-n)
- [ ] `npm test` pasa en mi PC
- [ ] Agregué o actualicé pruebas para las reglas de negocio tocadas
- [ ] No incluyo secretos, `.env`, bases de datos ni archivos de `uploads/`
- [ ] Actualicé documentación (`README`, `docs/`) y, si cambia el esquema, expliqué la migración
- [ ] Probé en computador **y** en celular (si aplica)
- [ ] Revisé impacto en seguridad/LOPDP (datos personales, permisos por rol)
