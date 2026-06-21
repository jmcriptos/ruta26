# Versionado automático de assets en el deploy — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el `?v=` de cada asset se calcule solo (hash de contenido) en cada deploy vía GitHub Action, eliminando el bumpeo manual.

**Architecture:** Un script Node sin dependencias reescribe los `?v=` de los HTML con un hash md5 del contenido de cada archivo local. Una GitHub Action corre los tests, ejecuta el script y publica el sitio a Pages (modo "GitHub Actions"), sin commitear de vuelta al repo.

**Tech Stack:** Node (CommonJS, `node:test`), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-06-21-versionado-assets-deploy-design.md`

---

## Estructura de archivos

- **Crear** `tools/version-assets.js` — módulo CJS: `versionHtml(html, resolveHash)` (puro) + CLI que hashea archivos y reescribe los HTML in situ. Responsabilidad única: poner el hash en los `?v=`.
- **Crear** `tests/version-assets.test.js` — unit tests del módulo (sin tocar disco; resolver inyectado).
- **Crear** `.github/workflows/deploy-pages.yml` — workflow de build+deploy a Pages.
- **Modificar** `MEMORY.md` y memoria de proyecto — anotar el prerequisito manual (cambiar Source de Pages).

Nota de decisión: el spec mencionó `.mjs`, pero el resto del repo es CommonJS y todos los tests usan `require` + `node --test`. Para consistencia y para testear con `require`, el script es **`tools/version-assets.js` (CJS)**.

---

## Task 1: Script de versionado + tests (TDD)

**Files:**
- Create: `tools/version-assets.js`
- Test: `tests/version-assets.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/version-assets.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { versionHtml } = require("../tools/version-assets.js");

// resolver inyectado: ref local conocida → hash fijo; desconocida → null
const resolver = function (rel) {
  return {
    "js/app.js": "aaaa111122",
    "styles.css": "bbbb333344",
    "como-jugar.html": "cccc555566"
  }[rel] || null;
};

test("reemplaza un ?v= existente por el hash", () => {
  const out = versionHtml('<script src="js/app.js?v=20260101a"></script>', resolver);
  assert.ok(out.indexOf('js/app.js?v=aaaa111122') >= 0, out);
});

test("añade ?v= a un ref sin query", () => {
  const out = versionHtml('<link rel="stylesheet" href="styles.css">', resolver);
  assert.ok(out.indexOf('styles.css?v=bbbb333344') >= 0, out);
});

test("versiona también links .html", () => {
  const out = versionHtml('<a href="como-jugar.html?v=old">guía</a>', resolver);
  assert.ok(out.indexOf('como-jugar.html?v=cccc555566') >= 0, out);
});

test("ignora refs externas (https y protocol-relative)", () => {
  const cdn = '<script src="https://cdn.jsdelivr.net/x.js"></script>';
  const pr = '<script src="//cdn.x/y.js"></script>';
  assert.strictEqual(versionHtml(cdn, resolver), cdn);
  assert.strictEqual(versionHtml(pr, resolver), pr);
});

test("deja igual un ref a archivo desconocido", () => {
  const html = '<script src="js/missing.js?v=1"></script>';
  assert.strictEqual(versionHtml(html, resolver), html);
});

test("no toca refs que no sean .js/.css/.html", () => {
  const html = '<link rel="manifest" href="manifest.json"><img src="og.jpg">';
  assert.strictEqual(versionHtml(html, resolver), html);
});

test("es idempotente", () => {
  const once = versionHtml('<script src="js/app.js"></script>', resolver);
  const twice = versionHtml(once, resolver);
  assert.strictEqual(twice, once);
});
```

- [ ] **Step 2: Correr el test y verque falla**

Run: `node --test tests/version-assets.test.js`
Expected: FAIL — `Cannot find module '../tools/version-assets.js'`.

- [ ] **Step 3: Implementar el módulo**

Crear `tools/version-assets.js`:

```js
/* Versiona assets locales en HTML: reescribe ?v= con un hash de contenido.
   Puro y testeable: versionHtml(html, resolveHash). El CLI hashea desde disco. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HTML_FILES = ["index.html", "stats.html", "como-jugar.html"];

// Reescribe src/href locales a .js/.css/.html poniendo ?v=<hash>.
// resolveHash(relPath) → string | null (null = externa/desconocida → sin cambios).
function versionHtml(html, resolveHash) {
  return String(html).replace(/\b(src|href)="([^"]+)"/g, function (full, attr, url) {
    if (/^(https?:)?\/\//i.test(url)) return full;            // externa o //cdn
    const q = url.indexOf("?");
    const file = q < 0 ? url : url.slice(0, q);
    const query = q < 0 ? "" : url.slice(q + 1);
    if (!/\.(js|css|html)$/i.test(file)) return full;          // solo assets versionables
    const hash = resolveHash(file);
    if (!hash) return full;
    const params = new URLSearchParams(query);
    params.set("v", hash);
    return attr + '="' + file + "?" + params.toString() + '"';
  });
}

function hashFile(absPath) {
  return crypto.createHash("md5").update(fs.readFileSync(absPath)).digest("hex").slice(0, 10);
}

function run(root) {
  root = root || process.cwd();
  HTML_FILES.forEach(function (name) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) return;
    const html = fs.readFileSync(p, "utf8");
    const out = versionHtml(html, function (rel) {
      const target = path.join(root, rel);
      if (!fs.existsSync(target)) {
        console.warn("[version-assets] " + name + ": ref no encontrada → " + rel + " (sin cambios)");
        return null;
      }
      return hashFile(target);
    });
    if (out !== html) {
      fs.writeFileSync(p, out);
      console.log("[version-assets] " + name + ": versionado");
    } else {
      console.log("[version-assets] " + name + ": sin cambios");
    }
  });
}

module.exports = { versionHtml: versionHtml, hashFile: hashFile, run: run };

if (require.main === module) run();
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/version-assets.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Verificar que toda la suite sigue verde**

Run: `node --test tests/`
Expected: todos los archivos `pass`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add tools/version-assets.js tests/version-assets.test.js
git commit -m "feat(deploy): script de versionado de assets por hash de contenido"
```

---

## Task 2: Sanity-check del script sobre los HTML reales (sin commitear)

**Files:** ninguno nuevo (se ejecuta y se revierte).

- [ ] **Step 1: Correr el script en seco sobre el repo**

Run: `node tools/version-assets.js`
Expected: logs `index.html: versionado`, `stats.html: versionado`, `como-jugar.html: sin cambios` (no tiene assets versionables).

- [ ] **Step 2: Inspeccionar el resultado**

Run: `git --no-pager diff index.html | grep -E '\?v=' | head`
Expected: los `?v=` ahora son hashes de 10 hex (p. ej. `js/app.js?v=ab12cd34ef`); las refs a CDN (`https://...`) y `manifest.json` quedan intactas.

- [ ] **Step 3: Revertir (el versionado real lo hace la Action al desplegar, no el repo)**

Run: `git checkout -- index.html stats.html como-jugar.html`
Expected: working tree limpio en esos archivos.

(No hay commit en esta task — es solo verificación.)

---

## Task 3: Workflow de deploy a Pages

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Crear el workflow**

```yaml
name: Deploy a GitHub Pages

# Versiona los assets (hash de contenido) y publica el sitio. Reemplaza el
# "deploy from branch": requiere Settings → Pages → Source = GitHub Actions.

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 20
      - name: Tests (gate antes de desplegar)
        run: node --test tests/
      - name: Versionar assets (?v= por hash de contenido)
        run: node tools/version-assets.js
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "."

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validar el YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-pages.yml')); print('YAML OK')"`
Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "feat(deploy): workflow de Pages con versionado automático + gate de tests"
```

---

## Task 4: Documentar el prerequisito manual (cambio de Source de Pages)

**Files:**
- Create: `docs/DEPLOY.md` (en el repo, versionable)
- (Aparte) memoria del asistente `sitio-en-vivo-github-pages.md` — vive FUERA del repo, se actualiza con la herramienta de memoria, NO con git.

- [ ] **Step 1: Crear `docs/DEPLOY.md`**

```markdown
# Deploy

El sitio se publica con GitHub Actions (workflow `.github/workflows/deploy-pages.yml`)
en cada push a `main`: corre los tests, versiona los assets (pone un hash de
contenido en cada `?v=`) y publica a GitHub Pages. No hay que tocar los `?v=` a mano.

## Prerequisito (una sola vez)
En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Sin esto sigue el "Deploy from branch" viejo y el workflow no publica.

## Rollback
Volver **Settings → Pages → Source: Deploy from branch (main)** → queda como antes.
El workflow nunca escribe en el repo (solo en el artifact de deploy).
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): prerequisito de Pages Source y rollback"
```

- [ ] **Step 3: (Fuera de git) actualizar la memoria del asistente**

Actualizar `sitio-en-vivo-github-pages.md` (memoria del asistente, fuera del repo)
para registrar el nuevo flujo de deploy por Action + el prerequisito de Source.

---

## Verificación final (post-merge, requiere acción de JM)

Esto NO se puede automatizar — lo hace JM una vez:

- [ ] JM cambia en el repo: **Settings → Pages → Source: GitHub Actions**.
- [ ] Hacer un push a `main` (o `workflow_dispatch`) y confirmar que el workflow "Deploy a GitHub Pages" corre verde (tests → versionar → deploy).
- [ ] Verificar el sitio publicado:

```bash
curl -s "https://jmcriptos.github.io/ruta26/index.html?cb=$(date +%s)" | grep -oE 'js/app.js\?v=[a-z0-9]+'
```

Expected: el `?v=` es un hash de 10 hex (no una fecha tipo `20260621d`).

- [ ] Abrir la app y confirmar que carga sin errores de consola.

---

## Self-review (cobertura del spec)

- Script de hash de contenido, ignora externas, versiona .js/.css/.html, idempotente, warning en ref faltante → **Task 1** (tests cubren cada caso del spec).
- Reescribe en build, no commit-back → **Task 2** (verifica + revierte) y **Task 3** (la Action versiona sobre el checkout).
- Workflow on push + gate de tests + Pages artifact → **Task 3**.
- Paso manual (Source de Pages) + rollback documentados → **Task 4** y Verificación final.
- "Lo que no cambia" (push a main, checkVersion CSS) → sin tareas porque no se toca.
