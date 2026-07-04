# Bracket de La Ruta: rutas rectangulares — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bracket radial de "La Ruta" dibuja sus conexiones como rutas rectangulares (tramo radial + arco sobre el anillo padre), con halo dorado central, copa más grande y ruta del equipo seleccionado en blanco.

**Architecture:** La geometría nueva (`nodeAngleDeg`, `rectSegment`) vive como funciones puras en `js/radial-layout.js` (módulo dual browser/node ya testeado). `js/bracket.js` solo cambia `linesSvg()` para emitir `<path>` (M-L-A) en vez de `<line>`. La estética (halo, copa, blanco) es CSS puro.

**Tech Stack:** Vanilla JS (IIFE, sin build), SVG paths con arcos, `node --test tests/`, CSS plano.

**Spec:** `docs/superpowers/specs/2026-07-04-bracket-radial-estilo-referencia-design.md`

---

## Contexto para quien ejecuta

- `js/radial-layout.js` (62 líneas): módulo puro con `RINGS` (5 anillos, radio `r` como fracción del lado), `ROTATION_DEG = 90`, `nodePos(ringIdx, i, size=100)` (posición en % del lienzo), `parentIndex(i)`. Exporta `WC.radialLayout` + `module.exports`. Tests en `tests/radial-layout.test.js` (`const rl = require("../js/radial-layout.js")`).
- `js/bracket.js`: `linesSvg(litLines)` (~línea 119) arma el SVG de conexiones. `litLines` viene de `routeViz`: `{ a: [ring, i], b: [ring+1, parentIndex(i)], cls: "lit"|"maybe" }` con `a[0]` entre 0 y 3.
- `styles.css`: bloque "Bracket radial (La Ruta)" (~líneas 446–500). `.br-line` ya tiene `fill: none` (clave para que los `<path>` no se rellenen de negro).
- Los ángulos de `nodePos` crecen monótonos con `i` (no hay módulo 360), así que el delta hijo→padre siempre es pequeño; la normalización a (-180, 180] en `rectSegment` es defensa barata, no un caso que ocurra hoy.
- Tests: `node --test tests/`. OJO: `git push` a `main` despliega a producción — no hacer push sin aprobación explícita del usuario.

---

### Task 1: Geometría `nodeAngleDeg` + `rectSegment` en radial-layout.js

**Files:**
- Modify: `js/radial-layout.js`
- Test: `tests/radial-layout.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/radial-layout.test.js`:

```js
/* ---------- geometría rectangular ---------- */

test("nodeAngleDeg: ángulo del nodo con rotación del lienzo", () => {
  assert.strictEqual(rl.nodeAngleDeg(0, 0), 0.5 / 32 * 360 + 90);
  assert.strictEqual(rl.nodeAngleDeg(4, 1), 1.5 / 2 * 360 + 90);
});

test("rectSegment: a=hijo, b=padre, esquina en el radio del padre y ángulo del hijo", () => {
  const s = rl.rectSegment(0, 3);
  const child = rl.nodePos(0, 3), parent = rl.nodePos(1, 1);
  assert.ok(Math.abs(s.a.x - child.x) < 1e-9 && Math.abs(s.a.y - child.y) < 1e-9);
  assert.ok(Math.abs(s.b.x - parent.x) < 1e-9 && Math.abs(s.b.y - parent.y) < 1e-9);
  // esquina: a la distancia del anillo padre del centro…
  const dc = Math.hypot(s.c.x - 50, s.c.y - 50);
  assert.ok(Math.abs(dc - rl.RINGS[1].r * 100) < 1e-9);
  // …y colineal con centro→hijo (mismo ángulo)
  const da = Math.hypot(s.a.x - 50, s.a.y - 50);
  assert.ok(Math.abs((s.a.x - 50) / da - (s.c.x - 50) / dc) < 1e-9);
  assert.ok(Math.abs((s.a.y - 50) / da - (s.c.y - 50) / dc) < 1e-9);
  assert.strictEqual(s.r, rl.RINGS[1].r * 100);
});

test("rectSegment: sweep sigue el sentido del delta angular (par adelante, impar atrás)", () => {
  assert.strictEqual(rl.rectSegment(0, 2).sweep, 1);
  assert.strictEqual(rl.rectSegment(0, 3).sweep, 0);
  // extremos del anillo (cruce de las 12 del lienzo): mismo patrón
  assert.strictEqual(rl.rectSegment(0, 0).sweep, 1);
  assert.strictEqual(rl.rectSegment(0, 31).sweep, 0);
});

test("rectSegment: respeta size custom", () => {
  const s = rl.rectSegment(1, 4, 200);
  const parent = rl.nodePos(2, 2, 200);
  assert.ok(Math.abs(s.b.x - parent.x) < 1e-9 && Math.abs(s.b.y - parent.y) < 1e-9);
  assert.strictEqual(s.r, rl.RINGS[2].r * 200);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/radial-layout.test.js`
Expected: FAIL con `rl.nodeAngleDeg is not a function`.

- [ ] **Step 3: Implementación mínima**

En `js/radial-layout.js`, localizar:

```js
  // Posición del nodo i del anillo ringIdx en un lienzo de lado `size` (default 100 → %).
  function nodePos(ringIdx, i, size) {
    size = size || 100;
    const ring = RINGS[ringIdx];
    const c = size / 2;
    const deg = (i + 0.5) / ring.n * 360 + ROTATION_DEG;
    const th = deg * Math.PI / 180;
    return { x: c + ring.r * size * Math.cos(th), y: c + ring.r * size * Math.sin(th) };
  }
  function parentIndex(i) { return Math.floor(i / 2); }
```

y reemplazar por:

```js
  // Ángulo (grados) del nodo i del anillo ringIdx, con la rotación del lienzo.
  function nodeAngleDeg(ringIdx, i) {
    return (i + 0.5) / RINGS[ringIdx].n * 360 + ROTATION_DEG;
  }

  // Posición del nodo i del anillo ringIdx en un lienzo de lado `size` (default 100 → %).
  function nodePos(ringIdx, i, size) {
    size = size || 100;
    const c = size / 2;
    const th = nodeAngleDeg(ringIdx, i) * Math.PI / 180;
    return { x: c + RINGS[ringIdx].r * size * Math.cos(th), y: c + RINGS[ringIdx].r * size * Math.sin(th) };
  }
  function parentIndex(i) { return Math.floor(i / 2); }

  // Ruta rectangular hijo→padre: tramo RADIAL (ángulo del hijo, hasta el radio
  // del anillo padre) + tramo de ARCO sobre el anillo padre hasta el padre.
  // a = nodo hijo, c = esquina, b = nodo padre, r = radio del arco (unidades
  // del lienzo), sweep = sentido del arco para el path SVG.
  function rectSegment(ringIdx, i, size) {
    size = size || 100;
    const c0 = size / 2;
    const degC = nodeAngleDeg(ringIdx, i);
    const degP = nodeAngleDeg(ringIdx + 1, parentIndex(i));
    const rP = RINGS[ringIdx + 1].r * size;
    function pt(r, d) {
      const th = d * Math.PI / 180;
      return { x: c0 + r * Math.cos(th), y: c0 + r * Math.sin(th) };
    }
    let dd = degP - degC;
    while (dd > 180) dd -= 360;
    while (dd < -180) dd += 360;
    return { a: pt(RINGS[ringIdx].r * size, degC), c: pt(rP, degC), b: pt(rP, degP), r: rP, sweep: dd > 0 ? 1 : 0 };
  }
```

y en el objeto exportado, localizar:

```js
  const layout = { bracketTree: bracketTree, isLeaf: isLeaf, RINGS: RINGS, ROTATION_DEG: ROTATION_DEG, nodePos: nodePos, parentIndex: parentIndex };
```

reemplazar por:

```js
  const layout = { bracketTree: bracketTree, isLeaf: isLeaf, RINGS: RINGS, ROTATION_DEG: ROTATION_DEG, nodePos: nodePos, nodeAngleDeg: nodeAngleDeg, rectSegment: rectSegment, parentIndex: parentIndex };
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test tests/radial-layout.test.js`
Expected: PASS (todos, incluidos los 4 nuevos). Luego `node --test tests/` completo sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add js/radial-layout.js tests/radial-layout.test.js
git commit -m "feat(ruta): geometría de rutas rectangulares (nodeAngleDeg + rectSegment) en radial-layout"
```

---

### Task 2: `linesSvg` con paths rectangulares + estética CSS

**Files:**
- Modify: `js/bracket.js` (función `linesSvg`, ~línea 119)
- Modify: `styles.css` (bloque "Bracket radial", ~líneas 446–500)

Sin test unitario nuevo: `linesSvg` es render DOM (la geometría quedó testeada en Task 1). Verificación visual en Task 3.

- [ ] **Step 1: Reemplazar `linesSvg` en js/bracket.js**

Localizar la función completa:

```js
  function linesSvg(litLines) {
    let s = '<svg class="br-lines" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">';
    function seg(a, b, cls) {
      return '<line class="' + cls + '" x1="' + a.x.toFixed(2) + '" y1="' + a.y.toFixed(2) +
        '" x2="' + b.x.toFixed(2) + '" y2="' + b.y.toFixed(2) + '"/>';
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < RL.RINGS[k].n; i++) {
        s += seg(RL.nodePos(k, i), RL.nodePos(k + 1, RL.parentIndex(i)), "br-line");
      }
    }
    for (let i = 0; i < 2; i++) s += seg(RL.nodePos(4, i), { x: 50, y: 50 }, "br-line");
    litLines.forEach(function (L) {
      const a = RL.nodePos(L.a[0], L.a[1]);
      const b = L.b[0] >= 5 ? { x: 50, y: 50 } : RL.nodePos(L.b[0], L.b[1]);
      s += seg(a, b, "br-line br-line-" + L.cls);
    });
    return s + "</svg>";
  }
```

y reemplazar por:

```js
  function linesSvg(litLines) {
    let s = '<svg class="br-lines" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">';
    // Ruta rectangular hijo→padre: tramo radial + arco sobre el anillo padre.
    function rectPath(k, i, cls) {
      const g = RL.rectSegment(k, i);
      return '<path class="' + cls + '" d="M ' + g.a.x.toFixed(2) + ' ' + g.a.y.toFixed(2) +
        ' L ' + g.c.x.toFixed(2) + ' ' + g.c.y.toFixed(2) +
        ' A ' + g.r.toFixed(2) + ' ' + g.r.toFixed(2) + ' 0 0 ' + g.sweep +
        ' ' + g.b.x.toFixed(2) + ' ' + g.b.y.toFixed(2) + '"/>';
    }
    // Finalistas → copa: tramo radial directo al centro.
    function centerSeg(i, cls) {
      const p = RL.nodePos(4, i);
      return '<path class="' + cls + '" d="M ' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' L 50 50"/>';
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < RL.RINGS[k].n; i++) s += rectPath(k, i, "br-line");
    }
    for (let i = 0; i < 2; i++) s += centerSeg(i, "br-line");
    litLines.forEach(function (L) {
      s += rectPath(L.a[0], L.a[1], "br-line br-line-" + L.cls);
    });
    return s + "</svg>";
  }
```

(Nota: `litLines` siempre trae `a[0]` entre 0 y 3 — `routeViz` recorre k=1..4 con `a: [k-1, cur]` — así que `rectPath` cubre todos los casos; la rama `b[0] >= 5` del código viejo era inalcanzable.)

- [ ] **Step 2: Estética CSS**

En `styles.css`, dentro del bloque "Bracket radial (La Ruta)":

Localizar:

```css
  background: radial-gradient(circle at 50% 50%, rgba(120, 90, 20, .28) 0%, rgba(60, 45, 12, .12) 30%, transparent 62%);
```

reemplazar por:

```css
  background: radial-gradient(circle at 50% 50%, rgba(216, 164, 64, .45) 0%, rgba(140, 100, 30, .18) 34%, transparent 62%);
```

Localizar:

```css
.br-line-maybe { stroke: var(--lime-deep); stroke-width: .32; stroke-dasharray: 1 .8; }
.br-line-lit { stroke: var(--lime); stroke-width: .45; }
```

reemplazar por:

```css
.br-line-maybe { stroke: rgba(255, 255, 255, .75); stroke-width: .32; stroke-dasharray: 1 .8; }
.br-line-lit { stroke: #fff; stroke-width: .45; }
```

Localizar:

```css
.br-cup { font-size: min(9vw, 54px); line-height: 1; filter: drop-shadow(0 0 12px rgba(215, 255, 67, .55)); }
.br-trophy.br-has-champ .br-cup { filter: drop-shadow(0 0 16px rgba(215, 255, 67, .9)); }
```

reemplazar por:

```css
.br-cup { font-size: min(13vw, 84px); line-height: 1; filter: drop-shadow(0 0 26px rgba(255, 190, 60, .9)) drop-shadow(0 0 60px rgba(255, 170, 40, .5)); }
.br-trophy.br-has-champ .br-cup { filter: drop-shadow(0 0 30px rgba(255, 205, 80, 1)) drop-shadow(0 0 70px rgba(255, 175, 45, .7)); }
```

- [ ] **Step 3: Chequeos**

Run: `node --check js/bracket.js && node --test tests/`
Expected: parse limpio, 0 fallos.

- [ ] **Step 4: Commit**

```bash
git add js/bracket.js styles.css
git commit -m "feat(ruta): rutas rectangulares, halo dorado, copa protagonista y ruta blanca en el bracket"
```

---

### Task 3: Verificación visual en preview

**Files:** ninguno (el preview `mundial-app` en `.claude/launch.json` ya existe).

- [ ] **Step 1:** `preview_start` (config `mundial-app`), forzar recarga sin caché de `js/radial-layout.js?v=...`, `js/bracket.js?v=...` y `styles.css?v=...` (fetch con `{cache:"reload"}` + `location.reload()` — el servidor local no manda headers de caché).

- [ ] **Step 2: Desktop (1280px), sin selección** — con `preview_eval` scroll a `#ruta` y verificar en el DOM: `document.querySelectorAll(".br-lines path").length >= 62` (60 conexiones + 2 al centro) y `document.querySelectorAll(".br-lines line").length === 0`. Screenshot del bracket.

- [ ] **Step 3: Con equipo seleccionado** — elegir un equipo con victoria KO ya jugada en `#bracketTeam` (dispatch `change`), verificar que existen `.br-line-lit` (blanco sólido) y `.br-line-maybe` (punteado) como `<path>`, y `preview_inspect` de `.br-line-lit` → `stroke: rgb(255, 255, 255)`. Screenshot.

- [ ] **Step 4: Móvil (375px)** — verificar que el lienzo no desborda (`document.documentElement.scrollWidth <= clientWidth`) y screenshot.

- [ ] **Step 5:** `preview_console_logs` sin errores nuevos.

- [ ] **Step 6:** Abrir las capturas al usuario (guardarlas vía Playwright a archivo y `open`) para su visto bueno ANTES de cualquier push. El push a `main` despliega a producción — requiere aprobación explícita.
