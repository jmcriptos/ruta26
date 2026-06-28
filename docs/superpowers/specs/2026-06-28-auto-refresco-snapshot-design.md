# Auto-refresco del snapshot embebido — diseño

**Fecha:** 2026-06-28
**Tipo:** automatización (GitHub Action)
**Relacionado:** [[fifa-api-datos-en-vivo]], incidente 28 jun (snapshot stale → fallback resultless)

## Problema

`js/data.js` es el **fallback** que sirve la app cuando el fetch en vivo a FIFA
falla y el usuario no tiene caché de `localStorage` (incógnito / primera visita /
red inestable). Si ese snapshot está viejo, esos usuarios ven eliminatorias sin
equipos resueltos y ranking en 0 pts (incidente del 28 jun: snapshot del 10 jun,
0 resultados). El refresco hoy es **manual** (`node tools/generate-data.js`), y se
olvida. Hay que automatizarlo para que el fallback nunca quede muy viejo.

## Objetivo

Un GitHub Action programado que regenere `js/data.js` con los resultados en vivo,
y solo cuando hay cambios lo commitee y redepliegue el sitio — manteniendo el
fallback fresco sin intervención manual.

## Restricción clave

Un push hecho con el `GITHUB_TOKEN` por defecto **no dispara** otros workflows
(prevención de recursión de GitHub). Por eso el workflow de deploy existente
(`deploy-pages.yml`, `on: push`) NO se dispararía con el push del Action. Solución:
el Action es **autocontenido** — regenera, commitea y **despliega él mismo**,
reusando los mismos pasos (`version-assets.js` + `upload-pages-artifact` +
`deploy-pages`). No se usa PAT.

## Componentes

### `.github/workflows/refresh-snapshot.yml` (nuevo)

**Disparadores:**
- `schedule`: cron cada 3 horas (`0 */3 * * *`).
- `workflow_dispatch: {}` (botón manual).

**Permisos:** `contents: write` (push), `pages: write`, `id-token: write` (deploy).

**Concurrency:** `group: pages`, `cancel-in-progress: false` — compartido con
`deploy-pages.yml` para que nunca corran dos deploys a Pages simultáneos.

**Job `build`:**
1. `actions/checkout@v5`.
2. `actions/setup-node@v5` con `node-version: 20`.
3. `node tools/generate-data.js` — reescribe `js/data.js` desde la API de FIFA.
   Si la API falla, el paso falla → el job falla → no commitea ni despliega
   (conserva el último snapshot bueno).
4. Detectar cambio: `git diff --quiet js/data.js` → setear output `changed`
   (`true` si difiere). Si no cambió, los pasos siguientes se saltan.
5. (si cambió) `node --test tests/` — gate; si falla, no despliega.
6. (si cambió) commit **solo `js/data.js`** con identidad de bot
   (`github-actions[bot]`), mensaje `chore(datos): refrescar snapshot (auto)`, y
   push a `main`.
7. (si cambió) `node tools/version-assets.js` — versiona `?v=` por hash en el
   working tree, **solo para el artifact** (no se commitea; idéntico a
   `deploy-pages.yml`).
8. (si cambió) `actions/configure-pages@v5` + `actions/upload-pages-artifact@v3`
   con `path: "."`.
   Output del job: `changed`.

**Job `deploy`:**
- `needs: build`, `if: needs.build.outputs.changed == 'true'`.
- `environment: github-pages`.
- `actions/deploy-pages@v4`.

## Comportamiento

- En horas sin partidos, `data.js` no cambia → el guard corta → sin commit ni
  deploy (cero ruido).
- Cuando hay resultados nuevos, regenera, commitea un único `js/data.js` y
  redepliega. El `?v=` por hash se aplica en el deploy (el repo mantiene su `?v=`
  manual, como hoy).
- Solo `js/data.js` se commitea; ningún otro archivo cambia en el repo.

## Manejo de errores

- API de FIFA caída → `generate-data.js` falla → job falla → no se despliega nada
  (último snapshot bueno intacto). GitHub envía email de Action fallida al dueño;
  blips transitorios pueden notificar, es aceptable (avisa si falla persistente).
- Tests rojos tras regenerar (p. ej. FIFA cambió el formato) → no despliega.

## Fuera de alcance (YAGNI)

- No se modifica `deploy-pages.yml` ni `tools/generate-data.js`.
- No se usa PAT ni se dispara deploy entre workflows.
- No se añade retry al fetch de FIFA (si hace falta, va aparte).

## Verificación

Tras crear el archivo: validar el YAML, hacer commit + push, y dispararlo a mano
(`workflow_dispatch`) para confirmar que corre y deja el sitio fresco (o sale
limpio sin cambios si no hay novedad). Confirmar en Actions que el job `deploy`
solo corre cuando `changed == true`.
