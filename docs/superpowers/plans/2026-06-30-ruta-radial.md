# La Ruta — bracket radial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el render de la sección "La Ruta" por un bracket radial (32 selecciones en círculo → copa al centro), idéntico en PC y móvil, fiel a la imagen de referencia.

**Architecture:** Se conserva intacta toda la capa de datos (standings.js, thirds-allocation.js, teamRoute). Se extraen dos módulos puros y testeables — `js/flags.js` (mapa de banderas redondas) y `js/radial-layout.js` (orden del cuadro por DFS + geometría de anillos) — y se reescribe la capa de render de `js/bracket.js` para dibujar anillos concéntricos con banderas SVG posicionadas en %, líneas en un SVG con `viewBox` 0..100 (escala sin JS), y la ruta iluminada al tocar un equipo.

**Tech Stack:** JavaScript vanilla (patrón dual-environment: `module.exports` para `node:test` + `WC.*` en browser), SVG, CSS con `aspect-ratio`, banderas SVG de circle-flags (MIT) vendorizadas en `assets/flags/`.

Spec: [docs/superpowers/specs/2026-06-30-ruta-radial-design.md](../specs/2026-06-30-ruta-radial-design.md)

---

## File Structure

- **Create** `js/flags.js` — mapa código-equipo → archivo de bandera + `flagSrc(team)`. Dual-env.
- **Create** `js/radial-layout.js` — `bracketTree(matches)` (orden por DFS) + geometría `nodePos`, `parentIndex`, `RINGS`. Dual-env.
- **Create** `assets/flags/*.svg` — 48 banderas redondas.
- **Create** `tests/flags.test.js`, `tests/radial-layout.test.js`.
- **Modify** `js/bracket.js` — reescritura del render (radial). Conserva selector, escenarios, `routeClasses`, API `WC.bracket`.
- **Modify** `index.html` — quita `#bracketSide`, cambia el contenedor, agrega `<script>` de los módulos nuevos, sube versiones `?v=`.
- **Modify** `styles.css` — estilos radiales; limpia CSS obsoleto de columnas/lados.

Comandos de test: `node --test tests/<archivo>.test.js`.

---

## Task 1: Módulo de banderas (`js/flags.js`)

**Files:**
- Create: `js/flags.js`
- Test: `tests/flags.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/flags.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const flags = require("../js/flags.js");

test("flags: mapea los 48 equipos", () => {
  assert.strictEqual(Object.keys(flags.FLAG_CODE).length, 48);
});

test("flags: casos especiales de código", () => {
  assert.strictEqual(flags.flagFile("ENG"), "gb-eng");
  assert.strictEqual(flags.flagFile("SCO"), "gb-sct");
  assert.strictEqual(flags.flagFile("CUW"), "cw");
  assert.strictEqual(flags.flagFile("GER"), "de");
});

test("flags: flagSrc arma la ruta del asset", () => {
  assert.strictEqual(flags.flagSrc({ code: "FRA" }), "assets/flags/fr.svg");
  assert.strictEqual(flags.flagSrc({ code: "ENG" }), "assets/flags/gb-eng.svg");
});

test("flags: código desconocido devuelve null (degrada seguro)", () => {
  assert.strictEqual(flags.flagFile("ZZZ"), null);
  assert.strictEqual(flags.flagSrc({ code: "ZZZ" }), null);
  assert.strictEqual(flags.flagSrc(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flags.test.js`
Expected: FAIL — `Cannot find module '../js/flags.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `js/flags.js`:

```js
/* Banderas redondas (circle-flags). Dual-environment (browser + node:test). */
(function (root) {
  // código de equipo (3 letras, campo team.code) → archivo de bandera redonda
  // (ISO 3166-1 alpha-2 en minúscula, con casos especiales gb-eng / gb-sct).
  const FLAG_CODE = {
    GER: "de", KSA: "sa", ALG: "dz", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BIH: "ba",
    BRA: "br", CPV: "cv", CAN: "ca", QAT: "qa", CZE: "cz", COL: "co", KOR: "kr", CIV: "ci",
    CRO: "hr", CUW: "cw", ECU: "ec", EGY: "eg", SCO: "gb-sct", ESP: "es", USA: "us", FRA: "fr",
    GHA: "gh", HAI: "ht", ENG: "gb-eng", IRQ: "iq", IRN: "ir", JPN: "jp", JOR: "jo", MAR: "ma",
    MEX: "mx", NOR: "no", NZL: "nz", NED: "nl", PAN: "pa", PAR: "py", POR: "pt", COD: "cd",
    SEN: "sn", RSA: "za", SWE: "se", SUI: "ch", TUN: "tn", TUR: "tr", URU: "uy", UZB: "uz"
  };
  function flagFile(code) { return FLAG_CODE[code] || null; }
  function flagSrc(team) {
    const f = team && flagFile(team.code);
    return f ? "assets/flags/" + f + ".svg" : null;
  }
  const flags = { FLAG_CODE: FLAG_CODE, flagFile: flagFile, flagSrc: flagSrc };
  root.WC = root.WC || {};
  root.WC.flags = flags;
  if (typeof module !== "undefined" && module.exports) module.exports = flags;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flags.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/flags.js tests/flags.test.js
git commit -m "feat(ruta): módulo de banderas redondas (mapa 48 equipos)"
```

---

## Task 2: Descargar las 48 banderas redondas

**Files:**
- Create: `assets/flags/<code>.svg` (48 archivos)

- [ ] **Step 1: Descargar los SVG desde circle-flags (MIT)**

Run:

```bash
mkdir -p "assets/flags"
codes="de sa dz ar au at be ba br cv ca qa cz co kr ci hr cw ec eg gb-sct es us fr gh ht gb-eng iq ir jp jo ma mx no nz nl pa py pt cd sn za se ch tn tr uy uz"
for c in $codes; do
  curl -fsSL "https://raw.githubusercontent.com/HatScripts/circle-flags/master/flags/$c.svg" -o "assets/flags/$c.svg" || echo "FALLÓ: $c"
done
```

Expected: sin líneas "FALLÓ".

- [ ] **Step 2: Verificar que están los 48 y no vacíos**

Run:

```bash
ls assets/flags/*.svg | wc -l
find assets/flags -name '*.svg' -size -100c
```

Expected: `48` y ninguna salida en el segundo comando (todos >100 bytes).

- [ ] **Step 3: Commit**

```bash
git add assets/flags
git commit -m "chore(ruta): vendorizar 48 banderas redondas (circle-flags, MIT)"
```

---

## Task 3: Orden del cuadro por DFS (`js/radial-layout.js` — parte 1)

**Files:**
- Create: `js/radial-layout.js`
- Test: `tests/radial-layout.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/radial-layout.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const rl = require("../js/radial-layout.js");

// Árbol chico de 2 niveles: final(1) -> 2 hojas r32 (2,3)
const TREE_2 = [
  { num: 1, stage: "final", phA: "W2", phB: "W3" },
  { num: 2, stage: "r32", phA: "1A", phB: "2B", home: "t1", away: "t2" },
  { num: 3, stage: "r32", phA: "1C", phB: "2D", home: "t3", away: "t4" }
];

test("bracketTree: hojas emiten home y away en orden", () => {
  const { order } = rl.bracketTree(TREE_2);
  assert.deepStrictEqual(order, [
    { matchNum: 2, side: "home" }, { matchNum: 2, side: "away" },
    { matchNum: 3, side: "home" }, { matchNum: 3, side: "away" }
  ]);
});

test("bracketTree: rounds agrupa por etapa", () => {
  const { rounds } = rl.bracketTree(TREE_2);
  assert.deepStrictEqual(rounds.r32.map(m => m.num), [2, 3]);
  assert.deepStrictEqual(rounds.final.map(m => m.num), [1]);
});

// Árbol de 3 niveles: final(1) -> r16(2,3) -> r32(4,5,6,7)
const TREE_3 = [
  { num: 1, stage: "final", phA: "W2", phB: "W3" },
  { num: 2, stage: "r16", phA: "W4", phB: "W5" },
  { num: 3, stage: "r16", phA: "W6", phB: "W7" },
  { num: 4, stage: "r32", phA: "1A", phB: "2B", home: "a", away: "b" },
  { num: 5, stage: "r32", phA: "1C", phB: "2D", home: "c", away: "d" },
  { num: 6, stage: "r32", phA: "1E", phB: "2F", home: "e", away: "f" },
  { num: 7, stage: "r32", phA: "1G", phB: "2H", home: "g", away: "h" }
];

test("bracketTree: anida izquierda antes que derecha", () => {
  const { order, rounds } = rl.bracketTree(TREE_3);
  assert.deepStrictEqual(order.map(s => s.matchNum), [4, 4, 5, 5, 6, 6, 7, 7]);
  // rounds.r16[0] (m2) es padre de rounds.r32[0,1] (m4,m5)
  assert.deepStrictEqual(rounds.r32.map(m => m.num), [4, 5, 6, 7]);
  assert.deepStrictEqual(rounds.r16.map(m => m.num), [2, 3]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/radial-layout.test.js`
Expected: FAIL — `Cannot find module '../js/radial-layout.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `js/radial-layout.js`:

```js
/* Geometría y orden del bracket radial. Puro y dual-environment. */
(function (root) {
  // Una casilla es HOJA (16avos) si ni phA ni phB apuntan a un ganador (W##);
  // sus placeholders son de grupo (1A / 2B / 3CDEF).
  function isLeaf(m) {
    return !/^W\d+$/.test(m.phA || "") && !/^W\d+$/.test(m.phB || "");
  }

  // Deriva el orden circular de las 32 casillas y las rondas ordenadas,
  // recorriendo el árbol KO en DFS in-order (phA antes que phB) desde la final.
  function bracketTree(matches) {
    const byNum = {};
    matches.forEach(function (m) { byNum[m.num] = m; });
    const root = matches.find(function (m) { return m.stage === "final"; });
    const order = [];
    const rounds = { r32: [], r16: [], qf: [], sf: [], final: [] };
    function childOf(ph) {
      const mm = /^W(\d+)$/.exec(ph || "");
      return mm ? byNum[Number(mm[1])] : null;
    }
    function walk(m) {
      if (!m) return;
      if (isLeaf(m)) {
        order.push({ matchNum: m.num, side: "home" });
        order.push({ matchNum: m.num, side: "away" });
        if (rounds[m.stage]) rounds[m.stage].push(m);
        return;
      }
      walk(childOf(m.phA));
      walk(childOf(m.phB));
      if (rounds[m.stage]) rounds[m.stage].push(m);
    }
    walk(root);
    return { order: order, rounds: rounds };
  }

  const layout = { bracketTree: bracketTree, isLeaf: isLeaf };
  root.WC = root.WC || {};
  root.WC.radialLayout = layout;
  if (typeof module !== "undefined" && module.exports) module.exports = layout;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/radial-layout.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/radial-layout.js tests/radial-layout.test.js
git commit -m "feat(ruta): orden del cuadro radial por DFS del árbol KO"
```

---

## Task 4: Geometría de anillos (`js/radial-layout.js` — parte 2)

**Files:**
- Modify: `js/radial-layout.js`
- Modify: `tests/radial-layout.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/radial-layout.test.js`:

```js
test("geometría: RINGS de afuera hacia adentro", () => {
  assert.strictEqual(rl.RINGS.length, 5);
  assert.strictEqual(rl.RINGS[0].n, 32);
  assert.strictEqual(rl.RINGS[4].n, 2);
});

test("geometría: padre = floor(i/2)", () => {
  assert.strictEqual(rl.parentIndex(0), 0);
  assert.strictEqual(rl.parentIndex(7), 3);
});

test("geometría: finalistas a las 9 y 3 en punto", () => {
  const a = rl.nodePos(4, 0, 100); // ring final, nodo 0
  const b = rl.nodePos(4, 1, 100); // ring final, nodo 1
  assert.ok(a.x < 50, "nodo 0 a la izquierda");
  assert.ok(b.x > 50, "nodo 1 a la derecha");
  assert.ok(Math.abs(a.y - 50) < 0.001, "nodo 0 centrado en vertical");
  assert.ok(Math.abs(b.y - 50) < 0.001, "nodo 1 centrado en vertical");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/radial-layout.test.js`
Expected: FAIL — `rl.RINGS is undefined` / `rl.nodePos is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `js/radial-layout.js`, add before `const layout = ...`:

```js
  // Anillos de afuera (16avos) hacia adentro (final). r = fracción del lado.
  const RINGS = [
    { stage: "r32", n: 32, r: 0.455 },
    { stage: "r16", n: 16, r: 0.365 },
    { stage: "qf", n: 8, r: 0.275 },
    { stage: "sf", n: 4, r: 0.185 },
    { stage: "final", n: 2, r: 0.105 }
  ];
  const ROTATION_DEG = 90; // rota para que los finalistas caigan a las 9 y 3 en punto

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

And extend the exported object:

```js
  const layout = { bracketTree: bracketTree, isLeaf: isLeaf, RINGS: RINGS, ROTATION_DEG: ROTATION_DEG, nodePos: nodePos, parentIndex: parentIndex };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/radial-layout.test.js`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/radial-layout.js tests/radial-layout.test.js
git commit -m "feat(ruta): geometría de anillos del bracket radial"
```

---

## Task 5: HTML — contenedor radial y scripts (`index.html`)

**Files:**
- Modify: `index.html` (bloque `#ruta` ~217-244; scripts ~347-357)

- [ ] **Step 1: Quitar el toggle de lados y cambiar el contenedor**

En `index.html`, reemplazar este bloque:

```html
        <div class="bracket-side" id="bracketSide" role="tablist" aria-label="Elegir lado del cuadro" hidden>
          <button type="button" data-side="left" class="active">◀ Izquierda</button>
          <button type="button" data-side="right">Derecha ▶</button>
        </div>
        <div class="bracket-scroll">
          <div class="bracket" id="bracketGrid"></div>
        </div>
```

por:

```html
        <div class="bracket-radial" id="bracketGrid"></div>
```

- [ ] **Step 2: Agregar los scripts de los módulos nuevos y subir versión de bracket.js**

En el bloque de `<script>`, agregar `flags.js` y `radial-layout.js` **antes** de `bracket.js`, y subir su `?v=`. Reemplazar:

```html
  <script src="js/standings.js?v=20260627a"></script>
  <script src="js/thirds-view.js?v=20260626b"></script>
  <script src="js/team-panel.js?v=20260611k"></script>
  <script src="js/bracket.js?v=20260627a"></script>
```

por:

```html
  <script src="js/standings.js?v=20260627a"></script>
  <script src="js/thirds-view.js?v=20260626b"></script>
  <script src="js/team-panel.js?v=20260611k"></script>
  <script src="js/flags.js?v=20260630a"></script>
  <script src="js/radial-layout.js?v=20260630a"></script>
  <script src="js/bracket.js?v=20260630a"></script>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ruta): contenedor radial + scripts de flags y radial-layout"
```

---

## Task 6: CSS — estilos del bracket radial (`styles.css`)

**Files:**
- Modify: `styles.css` (reglas `.b-*` ~450-475 y móvil ~583-588)

- [ ] **Step 1: Agregar los estilos radiales**

Agregar al final de `styles.css`:

```css
/* ===== Bracket radial (La Ruta) ===== */
.bracket-radial {
  position: relative;
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
  background: radial-gradient(circle at 50% 50%, rgba(120, 90, 20, .28) 0%, rgba(60, 45, 12, .12) 30%, transparent 62%);
}
.br-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.br-line { stroke: rgba(255, 255, 255, .16); stroke-width: .22; fill: none; }
.br-line-maybe { stroke: var(--lime-deep); stroke-width: .32; stroke-dasharray: 1 .8; }
.br-line-lit { stroke: var(--lime); stroke-width: .45; }

.br-node {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .5);
  box-sizing: border-box;
  transition: opacity .2s ease, filter .2s ease;
}
img.br-node { object-fit: cover; background: #f3f2eb; cursor: pointer; }
.br-dot { background: rgba(255, 255, 255, .12); box-shadow: none; }
/* diámetros por anillo (% del lado del lienzo) */
.br-r0 { width: 7.2%; height: 7.2%; }
.br-r1 { width: 6.2%; height: 6.2%; }
.br-r2 { width: 6.6%; height: 6.6%; }
.br-r3 { width: 7.4%; height: 7.4%; }
.br-r4 { width: 8.6%; height: 8.6%; }

/* eliminado: apagado */
.br-node.br-dead { filter: grayscale(1) brightness(.6); opacity: .5; }
/* clasificado provisional (grupo sin cerrar): atenuado */
.br-node.br-prov { opacity: .62; }

/* ruta iluminada */
.br-node.br-lit { box-shadow: 0 0 0 2px var(--lime), 0 0 10px rgba(215, 255, 67, .7); filter: none; opacity: 1; }
.bracket-radial.has-selection .br-node:not(.br-lit) { opacity: .3; }
.bracket-radial.has-selection img.br-node.br-lit { outline: none; }

/* copa central */
.br-trophy {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 13%;
  height: 13%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.br-cup { font-size: min(9vw, 54px); line-height: 1; filter: drop-shadow(0 0 12px rgba(215, 255, 67, .55)); }
.br-trophy.br-has-champ .br-cup { filter: drop-shadow(0 0 16px rgba(215, 255, 67, .9)); }
.br-trophy img { position: absolute; width: 46%; height: 46%; border-radius: 50%; bottom: -6%; right: -6%; box-shadow: 0 0 0 2px var(--lime); }
```

- [ ] **Step 2: Quitar reglas obsoletas de la vista de columnas/lados**

En `styles.css`, eliminar las reglas de la vista horizontal que ya no se usan (líneas ~450-475): `.b-side`, `.b-side-right`, `.b-col`, `.b-col-body`, `.b-col-title`, `.b-col-title.final`, `.b-match`, `.b-team` y variantes (`.b-flag`, `.b-code`, `.b-score`, `.b-winner`, `.b-tbd`, `.b-prov`), `.b-final-col`, `.b-trophy`, `.b-final-col .b-match`, `.b-final-meta`, `.b-third-note`, `.bracket.has-selection .b-match` y variantes; y el bloque móvil ~583-588 (`.b-final-col`, `.b-side`, `.bracket[data-mobile-side=...]`, `.b-side .b-col`, `.b-col-title`) y las reglas de color ~952-955 (`.b-col-title`, `.b-team.b-tbd`, `.b-final-meta`, `.b-third-note`).

Nota: si alguna clase `.bracket-scroll` o `.bracket-side` queda sin uso, quitar también sus reglas.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(ruta): estilos del bracket radial; limpia CSS de columnas"
```

---

## Task 7: Reescribir el render de `js/bracket.js` (radial)

**Files:**
- Modify: `js/bracket.js` (reescritura completa)

- [ ] **Step 1: Reemplazar el contenido de `js/bracket.js`**

Reemplazar TODO el archivo por:

```js
/* Bracket radial. Depende de: app.js (WC.state, WC.slotCtx), standings.js,
   radial-layout.js, flags.js, team-panel.js. */
(function () {
  const grid = document.getElementById("bracketGrid");
  const select = document.getElementById("bracketTeam");
  const toggle = document.getElementById("scenarioToggle");
  const RL = WC.radialLayout;
  const FEED = ["r32", "r16", "qf", "sf", "final"]; // etapa que alimenta cada anillo interno

  let selectedTeam = "";
  let scenario = 1;
  let scenarioManual = false;
  let groupEliminated = false;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  let selectPopulated = false;
  function fillSelect() {
    if (selectPopulated) return;
    selectPopulated = true;
    const opts = Object.values(WC.state.teams)
      .sort(function (a, b) { return a.name.localeCompare(b.name, "es"); })
      .map(function (t) { return '<option value="' + t.id + '">' + t.flag + " " + t.name + "</option>"; });
    select.innerHTML = '<option value="">Todo el cuadro</option>' + opts.join("");
    select.value = selectedTeam;
  }

  function matchesByNum() {
    const map = {};
    WC.state.matches.forEach(function (m) { map[m.num] = m; });
    return map;
  }

  // Resuelve el equipo (fijo o provisional) de una casilla de 16avos, igual que
  // el render anterior: equipo fijo, o slot resuelto, o el tercero asignado.
  function resolveSlotTeam(m, side, ctx) {
    const id = side === "home" ? m.home : m.away;
    const ph = side === "home" ? m.phA : m.phB;
    let slot = WC.standings.resolveSlot(ph, ctx, { provisional: true });
    if (!id && !slot.teamId && /^3[A-L]+$/.test(ph)) {
      const sib = side === "home" ? m.phB : m.phA;
      const wm = /^1([A-L])$/.exec(sib || "");
      const tid = wm && WC.thirdsAllocation
        ? WC.standings.resolveThird(wm[1], ctx.thirds, ctx.tables, WC.thirdsAllocation)
        : null;
      if (tid) slot = { teamId: tid, label: "", provisional: true };
    }
    const resolved = id || slot.teamId;
    return { teamId: resolved || null, provisional: Boolean(!id && slot.provisional) };
  }

  // Equipo que ocupa un nodo. Anillo 0 = casilla de 16avos; anillos internos =
  // ganador del partido que los alimenta (o null → punto gris).
  function teamAtNode(ringIdx, i, tree, ctx, byNum) {
    if (ringIdx === 0) {
      const slot = tree.order[i];
      const m = byNum[slot.matchNum];
      return m ? resolveSlotTeam(m, slot.side, ctx) : { teamId: null, provisional: false };
    }
    const m = tree.rounds[FEED[ringIdx - 1]][i];
    if (m && m.status === "played" && m.winner) return { teamId: m.winner, provisional: false };
    return { teamId: null, provisional: false };
  }

  // Eliminado = fuera en grupos, o perdió un partido KO ya jugado.
  function teamEliminated(teamId) {
    if (WC.standings.groupStageEliminated(teamId, WC.state)) return true;
    return WC.state.matches.some(function (m) {
      return m.stage !== "group" && m.status === "played" && m.winner &&
        (m.home === teamId || m.away === teamId) && m.winner !== teamId;
    });
  }

  function championTeam(tree) {
    const f = tree.rounds.final[0];
    return f && f.status === "played" && f.winner ? f.winner : null;
  }

  // clases de ruta por num de partido (lit / maybe), como antes.
  function routeClasses() {
    const classes = {};
    if (!selectedTeam || groupEliminated) return classes;
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    route.segments.forEach(function (seg) {
      seg.matches.forEach(function (m) {
        classes[m.num] = seg.certain ? "lit" : (classes[m.num] === "lit" ? "lit" : "maybe");
      });
    });
    return classes;
  }

  // Nodos y líneas iluminados: ubica al equipo en su casilla de 16avos y sube
  // hacia el centro por floor(i/2); frena si ya perdió.
  function routeViz(tree, classes, ctx, byNum) {
    const nodes = {}, lines = [];
    if (!selectedTeam || groupEliminated) return { nodes: nodes, lines: lines };
    let i = -1;
    for (let p = 0; p < 32; p++) {
      const info = teamAtNode(0, p, tree, ctx, byNum);
      if (info.teamId === selectedTeam) { i = p; break; }
    }
    if (i < 0) return { nodes: nodes, lines: lines };
    nodes["0|" + i] = "lit";
    let cur = i;
    for (let k = 1; k <= 4; k++) {
      const parent = RL.parentIndex(cur);
      const m = tree.rounds[FEED[k - 1]][parent];
      if (m && m.status === "played" && m.winner && m.winner !== selectedTeam) break;
      const won = m && m.status === "played" && m.winner === selectedTeam;
      const cls = won ? "lit" : (m && classes[m.num] === "lit" ? "lit" : "maybe");
      nodes[k + "|" + parent] = cls;
      lines.push({ a: [k - 1, cur], b: [k, parent], cls: cls });
      cur = parent;
    }
    return { nodes: nodes, lines: lines };
  }

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

  function nodeHtml(ringIdx, i, tree, ctx, byNum, viz) {
    const pos = RL.nodePos(ringIdx, i);
    const style = "left:" + pos.x + "%;top:" + pos.y + "%";
    const info = teamAtNode(ringIdx, i, tree, ctx, byNum);
    const rc = "br-r" + ringIdx;
    if (!info.teamId) return '<div class="br-node ' + rc + ' br-dot" style="' + style + '"></div>';
    const t = WC.state.teams[info.teamId];
    const src = t && WC.flags.flagSrc(t);
    const lit = viz.nodes[ringIdx + "|" + i];
    const cls = ["br-node", rc];
    if (lit) cls.push("br-lit");
    if (info.provisional) cls.push("br-prov");
    if (!lit && teamEliminated(info.teamId)) cls.push("br-dead");
    if (src) {
      return '<img class="' + cls.join(" ") + '" style="' + style + '" src="' + src +
        '" alt="' + esc(t ? t.name : "") + '" data-team="' + info.teamId + '">';
    }
    return '<div class="' + cls.join(" ") + ' br-dot" style="' + style + '" data-team="' + info.teamId + '"></div>';
  }

  function render() {
    const ctx = WC.slotCtx();
    const classes = routeClasses();
    const byNum = matchesByNum();
    const tree = RL.bracketTree(WC.state.matches);
    grid.classList.toggle("has-selection", Boolean(selectedTeam));
    const viz = routeViz(tree, classes, ctx, byNum);

    let html = linesSvg(viz.lines);
    for (let p = 0; p < 32; p++) html += nodeHtml(0, p, tree, ctx, byNum, viz);
    for (let k = 1; k <= 4; k++) {
      for (let i = 0; i < RL.RINGS[k].n; i++) html += nodeHtml(k, i, tree, ctx, byNum, viz);
    }
    const champ = championTeam(tree);
    const champT = champ && WC.state.teams[champ];
    const champSrc = champT && WC.flags.flagSrc(champT);
    html += '<div class="br-trophy' + (champ ? " br-has-champ" : "") + '" style="left:50%;top:50%">' +
      (champSrc ? '<img src="' + champSrc + '" alt="' + esc(champT.name) + '">' : "") +
      '<span class="br-cup">🏆</span></div>';
    grid.innerHTML = html;
    updateToggle();
  }

  function updateToggle() {
    if (!selectedTeam || groupEliminated) { toggle.hidden = true; return; }
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    toggle.hidden = route.mode === "real";
    toggle.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.pos) === scenario);
    });
  }

  function selectTeam(teamId) {
    scenarioManual = false;
    selectedTeam = teamId || "";
    groupEliminated = false;
    if (selectedTeam) {
      const t = WC.state.teams[selectedTeam];
      const rows = WC.state.tables[t.group] || [];
      const idx = rows.findIndex(function (r) { return r.teamId === selectedTeam; });
      groupEliminated = WC.standings.groupStageEliminated(selectedTeam, WC.state);
      scenario = idx >= 0 && rows[idx].pj > 0 ? Math.min(idx + 1, 3) : 1;
    }
    select.value = selectedTeam;
    render();
  }

  select.addEventListener("change", function () { selectTeam(select.value); });

  // Tocar una bandera → seleccionar equipo (ilumina ruta) + abrir panel.
  grid.addEventListener("click", function (event) {
    const node = event.target.closest("[data-team]");
    if (!node) { if (event.target === grid || event.target.closest(".br-trophy")) selectTeam(""); return; }
    const teamId = node.dataset.team;
    selectTeam(teamId);
    if (WC.teamPanel && WC.teamPanel.open) WC.teamPanel.open(teamId);
  });

  toggle.addEventListener("click", function (event) {
    const b = event.target.closest("[data-pos]");
    if (!b) return;
    scenarioManual = true;
    scenario = Number(b.dataset.pos);
    render();
  });

  function syncScenario() {
    if (!selectedTeam) return;
    groupEliminated = WC.standings.groupStageEliminated(selectedTeam, WC.state);
    if (scenarioManual) return;
    const t = WC.state.teams[selectedTeam];
    const rows = WC.state.tables[t.group] || [];
    const idx = rows.findIndex(function (r) { return r.teamId === selectedTeam; });
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    if (route.mode === "scenario" && idx >= 0 && rows[idx].pj > 0) {
      scenario = Math.min(idx + 1, 3);
    }
  }

  WC.bracket = {
    render: function () { fillSelect(); syncScenario(); render(); },
    select: selectTeam
  };
})();
```

- [ ] **Step 2: Verificar que la suite completa sigue verde**

Run: `node --test tests/`
Expected: PASS — sin regresiones (incluye standings, scoring, flags, radial-layout, etc.).

- [ ] **Step 3: Commit**

```bash
git add js/bracket.js
git commit -m "feat(ruta): render radial (anillos, banderas, ruta iluminada, copa)"
```

---

## Task 8: Verificación en navegador (PC + móvil + interacción)

**Files:** ninguno (verificación). Usar las herramientas `preview_*`.

- [ ] **Step 1: Levantar el preview**

Usar `preview_start` sobre el proyecto (sitio estático) y navegar a `#ruta`.

- [ ] **Step 2: Chequear errores de consola y red**

`preview_console_logs` y `preview_network`: sin errores JS; las banderas de `assets/flags/*.svg` responden 200.

- [ ] **Step 3: Verificar el layout de escritorio**

`preview_snapshot` + `preview_screenshot` de `#ruta`. Confirmar: círculo con 32 banderas en el anillo exterior, anillos internos cerrando al centro, líneas convergiendo a la copa, se ve como la imagen de referencia. Anillos internos aún sin decidir = puntos grises.

- [ ] **Step 4: Verificar interacción**

`preview_click` sobre una bandera del anillo exterior (p. ej. Francia). Confirmar con `preview_snapshot`: se ilumina la ruta (nodos + líneas en lima), el resto se atenúa, y se abre el panel de equipo. Click en la copa/fondo limpia la selección.

- [ ] **Step 5: Verificar móvil**

`preview_resize` a 380px de ancho. `preview_screenshot`. Confirmar: el círculo completo entra en pantalla (sin scroll lateral), idéntico en estructura al de escritorio, banderas tocables.

- [ ] **Step 6: Bump de versión de assets si aplica**

Si el proyecto usa [tools/version-assets.js](../../../tools/version-assets.js) para sellar versiones, correrlo; si no, confirmar que los `?v=` de Task 5 quedaron actualizados. Commit si hubo cambios:

```bash
git add -A
git commit -m "chore(ruta): bump de versiones de assets del bracket radial"
```

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec:** layout radial (Tasks 4,6,7) ✓; solo reescribe render, datos intactos (Task 7 reusa `resolveSlot`/`resolveThird`/`teamRoute`) ✓; banderas redondas locales (Tasks 1,2) ✓; interacción minimalista con panel (Task 7 `grid` click) ✓; eliminados apagados / anillos internos como puntos grises (Task 7 `teamEliminated`/`teamAtNode`) ✓; 3er puesto fuera (no se dibuja; sin columna de tercero) ✓; toggle móvil y marcadores fuera (Tasks 5,6) ✓; orden circular por DFS (Task 3) ✓; mapeo de 48 banderas (Task 1) ✓; escenarios de terceros conservados (Task 7 `updateToggle`/`syncScenario`) ✓; identidad PC/móvil por % + `viewBox` (Tasks 6,7, verificado en Task 8) ✓.
- **Consistencia de tipos:** `WC.radialLayout` expone `bracketTree`, `RINGS`, `nodePos`, `parentIndex` (Tasks 3-4) y así se consumen en `bracket.js` (Task 7). `WC.flags.flagSrc` (Task 1) usado en Task 7. `tree.rounds[FEED[k-1]]` usa las claves `r32/r16/qf/sf/final` definidas en `bracketTree`.
- **Sin placeholders:** revisado; el código de cada task es completo y pegable tal cual.
```
