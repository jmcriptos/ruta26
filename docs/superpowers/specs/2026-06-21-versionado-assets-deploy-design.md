# Versionado automático de assets en el deploy

**Fecha:** 2026-06-21
**Estado:** Aprobado (diseño)

## Problema

El sitio es estático puro (sin build) y se despliega con `git push` a `main`
(GitHub Pages "Deploy from branch"). Los assets se cachean con un parámetro
`?v=...` puesto **a mano** en los HTML (`index.html` ~16 refs, `stats.html` 3).

Al editar un `.js`/`.css` hay que acordarse de bumpear su `?v=` en el HTML; si se
olvida, los navegadores (y sobre todo la PWA en iOS) sirven el archivo viejo en
caché. Esto ya causó bugs reales esta semana (game.js/app.js viejos en caché).

**Meta:** que el `?v=` se actualice solo, sin pasos manuales, en cada deploy.

## Enfoque elegido

GitHub Action en cada push que calcula un **hash de contenido** por archivo y
reescribe los `?v=` en los HTML **al momento de desplegar** (no commitea de vuelta
al repo). El `?v=` cambia si —y solo si— el contenido del archivo cambió.

Descartado: comando local manual (sigue dependiendo de recordar correrlo) y
pre-commit hook (requiere instalación por dispositivo, reescribe archivos en mitad
del commit). El usuario eligió la Action por ser 100% automática.

## Componentes

### 1. `tools/version-assets.mjs` (Node, sin dependencias)

Función pura de reescritura de HTML. Responsabilidad única: poner el hash de
contenido en cada referencia local versionable.

- **Entrada:** lista de archivos HTML a procesar (por defecto `index.html`,
  `stats.html`, `como-jugar.html`).
- **Para cada HTML:** busca atributos `src="…"` / `href="…"` que apunten a un
  archivo **local** terminado en `.js`, `.css` o `.html`.
  - Ignora refs externas: empiezan con `http:`, `https:` o `//`.
  - Resuelve la ruta relativa a la raíz del repo (donde viven los HTML).
  - Calcula `crypto.createHash("md5").update(fileBuffer).digest("hex").slice(0,10)`.
  - Reemplaza el `?v=<loquesea>` existente por `?v=<hash>`, o lo **añade** si no
    tenía query. Conserva cualquier otro query param que no sea `v` (no se esperan,
    pero no se rompen).
  - Si el archivo referido no existe en disco: lo deja igual y escribe un warning
    a stderr (no falla el build por un ref roto preexistente).
- **Salida:** reescribe el HTML in situ y registra en stdout cada ref cambiada
  (`archivo.html: js/app.js?v=ab12cd34ef`).
- **Idempotente:** correrlo dos veces sobre el mismo contenido da el mismo `?v=`.
- **No toca:** `sw.js` (se registra desde JS, tiene su propio ciclo de update),
  `manifest.json`, imágenes, ni refs a CDN (supabase, fonts).

Nota: el script corre sobre el **checkout de CI** (solo archivos committeados). Las
carpetas locales sin trackear (`_bmad*`, `.agents`) no existen en CI, así que no se
procesan ni se publican.

### 2. `.github/workflows/deploy-pages.yml`

```
name: Deploy a GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch: {}
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    - actions/checkout@v5
    - actions/setup-node@v5 (node 20)
    - node --test tests/        # gate: si fallan los tests, NO se despliega
    - node tools/version-assets.mjs    # reescribe los ?v= con hashes
    - actions/configure-pages@v5
    - actions/upload-pages-artifact@v4 (path: ".")   # raíz del repo
  deploy:
    needs: build
    environment: github-pages
    - actions/deploy-pages@v4
```

- El artifact se arma desde la raíz del repo (igual que hoy "deploy from branch"
  publica la raíz). Incluye `tools/`, `tests/`, `docs/` igual que hoy — no es
  exposición nueva; no están enlazados.
- Las versiones de actions se fijan a las últimas mayores (node 24) para evitar el
  warning de deprecación de Node 20.

### 3. Paso manual único (lo hace JM, una vez)

En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Hasta hacerlo, sigue el deploy-from-branch actual y la Action no publica nada
(o falla en `deploy-pages` por falta de permiso de entorno). Documentar esto en el
plan como prerequisito antes de mergear.

## Lo que NO cambia

- Se sigue desplegando con `git push` a `main`.
- Los `?v=` del código fuente quedan como están; el build los sobreescribe al
  desplegar. En desarrollo local / preview se usan los del fuente (estáticos), que
  sirven igual.
- `checkVersion()` (compara ETag de `styles.css`, sin query) sigue funcionando y
  forzando recarga en la PWA cuando cambia el CSS.

## Riesgos y rollback

- **Action con bug → deploy roto:** mitigado por el gate de tests y porque el
  script es simple y testeable. Rollback inmediato: volver Pages a "Deploy from
  branch" → queda exactamente como hoy. La Action nunca escribe en el repo, así que
  no hay que revertir commits.
- **Limitación preexistente (fuera de alcance):** si la PWA en iOS retiene un
  `index.html` viejo y solo cambió un JS (no el CSS), `checkVersion` no lo detecta.
  El hashing no empeora esto; mejorarlo sería otro trabajo.

## Testing

- **Unit del script:** `tests/version-assets.test.js` con `node:test`. Casos:
  - reemplaza un `?v=` existente por el hash correcto;
  - añade `?v=` a un ref sin query;
  - ignora refs `http(s)://` y `//cdn`;
  - deja igual un ref a archivo inexistente (+ warning);
  - idempotencia (correrlo dos veces no cambia el resultado);
  - no toca refs que no sean `.js/.css/.html`.
  - Se ejecuta sobre HTML de fixture en un tmpdir, no sobre los reales.
- **Gate en CI:** el workflow corre toda la suite (`node --test tests/`) antes de
  versionar/desplegar.
- **Verificación de deploy:** tras el primer push con Pages en modo Actions,
  confirmar que el `index.html` publicado trae `?v=<hash>` (no las fechas) y que la
  app carga sin errores.

## Decisiones

- **Hash de contenido**, no fecha: el `?v=` solo cambia si el archivo cambió.
- **Reescribe en build, no commit-back**: sin commits de ruido ni bucles de CI.
- **Versiona también links `.html`** (p. ej. `como-jugar.html`): bustea su caché al
  actualizarlos.
- **Gate de tests** antes de desplegar: seguro de vida barato.
