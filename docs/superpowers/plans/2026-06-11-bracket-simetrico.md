# Bracket simétrico clásico — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Rediseñar "La ruta al título" como bracket clásico tipo llave: simétrico convergiendo a la final central (🏆) en escritorio, una media-llave por equipo en móvil, cajas con bandera + código de 3 letras.

**Architecture:** Una función pura nueva en `js/standings.js` (`bracketSide`) calcula a qué mitad pertenece cada partido KO siguiendo la cadena de ganadores hasta la semifinal 101 (izq) o 102 (der). `js/bracket.js` reescribe `render()` para el layout simétrico (escritorio) y media-llave (móvil), reutilizando `teamRoute`/`resolveSlot`/`routeClasses`/`syncScenario`. `styles.css` agrega el layout y las líneas conectoras. Cero cambios a datos/scoring/quiniela.

**Tech Stack:** Vanilla JS (WC namespace), node:test, CSS grid/flex.

**Spec:** `docs/superpowers/specs/2026-06-11-bracket-simetrico-design.md`
**Working dir (citar — espacios):** `/Users/josedasilva/Dropbox/Mi Mac (MacBook-Air-de-Jose.local)/Documents/Mundial 2026 app`

**Reglas transversales:**
- Solo tokens CSS existentes (`--ink`, `--ink-soft`, `--lime`, `--lime-deep`, `--paper`, `--line`, `--muted`, etc.). Branch `main`, commit; push en el último paso.
- Playwright cachea JS: verificación browser con puerto NUEVO de `python3 -m http.server`.
- Antes había 33 tests; este plan agrega los de `bracketSide`.
- Identificadores de partido (`m.num`) son numéricos en el modelo (`Number(MatchNumber)`); los placeholders `phA/phB` son strings tipo "W97".

## Estructura del cuadro (referencia, verificada en los datos)

- Final num 104 = W101 vs W102.
- SF 101 = W97 vs W98 (izquierda); SF 102 = W99 vs W100 (derecha).
- QF: 97=(W89,W90), 98=(W93,W94) izq · 99=(W91,W92), 100=(W95,W96) der.
- R16: 89=(W74,W77),90=(W73,W75),93=(W83,W84),94=(W81,W82) izq · 91=(W76,W78),92=(W79,W80),95=(W86,W88),96=(W85,W87) der.
- R32 izq: 73,74,75,77,81,82,83,84 · R32 der: 76,78,79,80,85,86,87,88.

---

### Task 1: `js/standings.js` — `bracketSide` (TDD)

**Files:**
- Modify: `js/standings.js`
- Modify: `tests/standings.test.js`

- [ ] **Step 1: Tests que fallan**

Agregar al final de `tests/standings.test.js`:

```js
test("bracketSide: sigue la cadena W## hasta la semi 101 (izq) o 102 (der)", () => {
  // mini-árbol fiel a la estructura real
  const ko = [
    ko_(73, "r32", "1A", "2B"), ko_(74, "r32", "1E", "3X"),
    ko_(89, "r16", "W74", "W77"), ko_(90, "r16", "W73", "W75"),
    ko_(97, "qf", "W89", "W90"), ko_(101, "sf", "W97", "W98"),
    ko_(76, "r32", "1F", "2C"), ko_(91, "r16", "W76", "W78"),
    ko_(99, "qf", "W91", "W92"), ko_(102, "sf", "W99", "W100"),
    ko_(104, "final", "W101", "W102")
  ];
  const byNum = {};
  ko.forEach(function (m) { byNum[m.num] = m; });
  assert.strictEqual(st.bracketSide(73, byNum), "left");
  assert.strictEqual(st.bracketSide(89, byNum), "left");
  assert.strictEqual(st.bracketSide(97, byNum), "left");
  assert.strictEqual(st.bracketSide(101, byNum), "left");
  assert.strictEqual(st.bracketSide(76, byNum), "right");
  assert.strictEqual(st.bracketSide(91, byNum), "right");
  assert.strictEqual(st.bracketSide(102, byNum), "right");
  assert.strictEqual(st.bracketSide(104, byNum), null);   // la final no tiene lado
  assert.strictEqual(st.bracketSide(999, byNum), null);   // desconocido
});
```

Agregar el helper `ko_` cerca de los otros builders del archivo (si no existe uno equivalente; el archivo ya tiene `ko(num, stage, phA, phB, extra)` en los tests de teamRoute — reutilízalo si está, renombrando la llamada a `ko(...)`. Si el nombre `ko` ya está tomado por el builder existente, usa ese y elimina `ko_`). El builder produce: `{ id:"m"+num, num, stage, group:null, date:"2026-07-01T19:00:00Z", city:"", stadium:"", home:null, away:null, phA, phB, hs:null, as:null, hp:null, ap:null, status:"scheduled", winner:null }`.

- [ ] **Step 2: Verificar que falla**

Run: `cd "<dir>" && node --test tests/`
Expected: FAIL — `st.bracketSide is not a function`

- [ ] **Step 3: Implementar en `js/standings.js`**

Agregar dentro del IIFE, antes de `const standings = ...`:

```js
  // Lado del cuadro al que pertenece un partido KO: sigue la cadena de ganadores
  // (W##) hasta la semifinal 101 (izquierda) o 102 (derecha). La final y los
  // partidos desconocidos devuelven null.
  function bracketSide(matchNum, matchesByNum) {
    let cur = matchesByNum[matchNum];
    const seen = {};
    while (cur && !seen[cur.num]) {
      if (cur.num === 101) return "left";
      if (cur.num === 102) return "right";
      seen[cur.num] = true;
      const next = Object.keys(matchesByNum).map(function (k) { return matchesByNum[k]; })
        .find(function (x) { return x.phA === "W" + cur.num || x.phB === "W" + cur.num; });
      cur = next || null;
    }
    return null;
  }
```

Agregar `bracketSide: bracketSide` al objeto `standings`.

- [ ] **Step 4: Verificar que pasa**

Run: `node --test tests/`
Expected: PASS (33 previos + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add js/standings.js tests/standings.test.js
git commit -m "feat: bracketSide — calcula la mitad (izq/der) de cada partido del cuadro"
```

---

### Task 2: `index.html` — toggle de lado móvil

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Reemplazar el `#roundTabs` por el toggle de lado**

Buscar en `index.html`:

```html
        <div class="round-tabs" id="roundTabs" role="tablist" aria-label="Elegir ronda"></div>
```

y reemplazar por:

```html
        <div class="bracket-side" id="bracketSide" role="tablist" aria-label="Elegir lado del cuadro" hidden>
          <button type="button" data-side="left" class="active">◀ Izquierda</button>
          <button type="button" data-side="right">Derecha ▶</button>
        </div>
```

- [ ] **Step 2: Verificación**

Run: `node --check js/bracket.js` (sigue válido aunque `roundTabs` ya no exista en el DOM — la Task 3 ajusta el JS; por ahora `document.getElementById("roundTabs")` será null y el render actual lo referencia, así que esta verificación se completa junto con Task 3). Por ahora solo confirmar que el HTML quedó bien formado abriendo la página (la sección puede verse rota hasta Task 3 — aceptable, commit conjunto recomendado: hacer Task 2 y 3 seguidas).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: toggle de lado del cuadro en el bracket (reemplaza pestañas de ronda)"
```

---

### Task 3: `js/bracket.js` — render simétrico + media-llave

**Files:**
- Modify: `js/bracket.js` (reescritura del render y helpers; se conservan fillSelect, selectTeam, syncScenario, routeClasses, los listeners de select y toggle de escenario)

- [ ] **Step 1: Reemplazar el archivo `js/bracket.js` por:**

```js
/* Bracket simétrico. Depende de: app.js (WC.state, WC.fmt, WC.slotCtx), standings.js */
(function () {
  const grid = document.getElementById("bracketGrid");
  const select = document.getElementById("bracketTeam");
  const toggle = document.getElementById("scenarioToggle");
  const sideTabs = document.getElementById("bracketSide");

  // rondas de fuera hacia el centro
  const ORDER = ["r32", "r16", "qf", "sf"];
  const ROUND_LABEL = { r32: "16avos", r16: "8vos", qf: "4tos", sf: "Semis" };

  let selectedTeam = "";
  let scenario = 1;
  let scenarioManual = false;
  let groupEliminated = false;
  let mobileSide = "left";

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

  // etiqueta corta para un slot sin equipo definido
  function shortLabel(label) {
    if (!label) return "—";
    if (/^Mejor 3º/.test(label)) return "3º";
    const m = label.match(/^([12])º grupo ([A-L])$/);
    if (m) return m[1] + m[2];
    const w = label.match(/^Gana P?(\d+)$/);
    if (w) return "G" + w[1];
    return label.length > 6 ? label.slice(0, 6) : label;
  }

  // una caja de equipo (bandera + código 3 letras) o placeholder corto
  function teamBox(m, side, ctx, classes) {
    const id = side === "home" ? m.home : m.away;
    const score = side === "home" ? m.hs : m.as;
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, ctx);
    const resolved = id || slot.teamId;
    if (resolved) {
      const t = WC.state.teams[resolved] || { code: "?", flag: "🏳️" };
      const winner = m.status === "played" && m.winner === resolved;
      return '<div class="b-team' + (winner ? " b-winner" : "") + '"><span class="b-flag">' + (t.flag || "🏳️") +
        '</span><span class="b-code">' + esc(t.code || "?") + "</span>" +
        (m.status !== "scheduled" && score != null ? '<span class="b-score">' + score + "</span>" : "") + "</div>";
    }
    return '<div class="b-team b-tbd"><span class="b-code">' + esc(shortLabel(slot.label)) + "</span></div>";
  }

  function matchBox(m, ctx, classes, sideClass) {
    const cls = (classes[m.num] || "") + (sideClass ? " " + sideClass : "");
    return '<div class="b-match ' + cls + '" data-num="' + m.num + '">' +
      teamBox(m, "home", ctx, classes) + teamBox(m, "away", ctx, classes) + "</div>";
  }

  // columna de una ronda y un lado, ordenada por num
  function columnHtml(stage, side, ctx, classes, byNum) {
    const ms = WC.state.matches.filter(function (m) {
      return m.stage === stage && WC.standings.bracketSide(m.num, byNum) === side;
    }).sort(function (a, b) { return a.num - b.num; });
    return '<div class="b-col" data-stage="' + stage + '" data-side="' + side + '">' +
      '<p class="b-col-title">' + ROUND_LABEL[stage] + "</p>" +
      ms.map(function (m) { return matchBox(m, ctx, classes, ""); }).join("") + "</div>";
  }

  function finalColumnHtml(ctx, classes) {
    const final = WC.state.matches.find(function (m) { return m.stage === "final"; });
    const third = WC.state.matches.find(function (m) { return m.stage === "third"; });
    if (!final) return "";
    return '<div class="b-final-col">' +
      '<div class="b-trophy">🏆</div><p class="b-col-title final">Final · 19 JUL</p>' +
      matchBox(final, ctx, classes, "final-match") +
      '<div class="b-final-meta">' + WC.fmt.dayLocal(final.date) + " · " + esc(final.city) + "</div>" +
      (third ? '<p class="b-third-note">3er puesto</p>' + matchBox(third, ctx, classes, "third-match") : "") +
      "</div>";
  }

  function sideStackHtml(side, ctx, classes, byNum) {
    return '<div class="b-side b-side-' + side + '">' +
      ORDER.map(function (st) { return columnHtml(st, side, ctx, classes, byNum); }).join("") + "</div>";
  }

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

  // lado donde está el camino del equipo (para la vista móvil)
  function routeSide(byNum) {
    if (!selectedTeam) return mobileSide;
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    for (let s = 0; s < route.segments.length; s++) {
      const ms = route.segments[s].matches;
      for (let i = 0; i < ms.length; i++) {
        const side = WC.standings.bracketSide(ms[i].num, byNum);
        if (side) return side;
      }
    }
    return mobileSide;
  }

  function updateToggle() {
    if (!selectedTeam || groupEliminated) { toggle.hidden = true; return; }
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    toggle.hidden = route.mode === "real";
    toggle.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.pos) === scenario);
    });
  }

  function render() {
    const ctx = WC.slotCtx();
    const classes = routeClasses();
    const byNum = matchesByNum();
    grid.classList.toggle("has-selection", Boolean(selectedTeam));

    // el lado que se muestra en móvil
    const shownSide = selectedTeam ? routeSide(byNum) : mobileSide;
    grid.dataset.mobileSide = shownSide;

    grid.innerHTML =
      sideStackHtml("left", ctx, classes, byNum) +
      finalColumnHtml(ctx, classes) +
      sideStackHtml("right", ctx, classes, byNum);

    // toggle de lado: visible en móvil solo cuando NO hay equipo (sin equipo se elige el lado a mano)
    if (sideTabs) {
      sideTabs.hidden = Boolean(selectedTeam);
      sideTabs.querySelectorAll("[data-side]").forEach(function (b) {
        b.classList.toggle("active", b.dataset.side === shownSide);
      });
    }
    updateToggle();
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
  if (sideTabs) {
    sideTabs.addEventListener("click", function (event) {
      const b = event.target.closest("[data-side]");
      if (!b) return;
      mobileSide = b.dataset.side;
      render();
    });
  }
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

- [ ] **Step 2: Verificación estática**

Run: `node --check js/bracket.js` → limpio. `node --test tests/` → todos verdes.

- [ ] **Step 3: Commit**

```bash
git add js/bracket.js
git commit -m "feat: render del bracket simétrico (escritorio) y media-llave por lado (móvil)"
```

---

### Task 4: `styles.css` — layout simétrico, cajas y líneas conectoras

**Files:**
- Modify: `styles.css` (reemplazar el bloque de estilos del bracket actual y agregar los nuevos)

- [ ] **Step 1: Localizar y reemplazar el bloque del bracket**

Buscar el bloque que empieza con `.bracket-section {` (y sus reglas `.bracket`, `.b-col`, `.b-match`, `.b-team`, `.b-meta`, `.round-tabs`, etc.) y la regla móvil del bracket. Reemplazar TODAS esas reglas del bracket por el bloque de abajo. Conservar el resto del archivo intacto. (Si hay dudas de límites, las reglas del bracket son las que usan selectores `.bracket`, `.b-col`, `.b-match`, `.b-team`, `.b-tbd`, `.b-meta`, `.b-score`, `.b-winner`, `.bracket-scroll`, `.bracket-controls`, `.scenario-toggle`, `.round-tabs`, `.b-col-title`, `.final-match`, `.bracket-note`.)

Pegar:

```css
/* ===== Bracket simétrico ===== */
.bracket-section { margin: 90px 0; padding: 70px 0 60px; background: var(--ink); color: var(--paper-bright); }
.bracket-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.bracket-controls select { padding: 11px 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: var(--ink-soft); color: var(--paper-bright); font-weight: 600; cursor: pointer; }
.scenario-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(243,242,235,.6); }
.scenario-toggle button { padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: none; color: var(--paper-bright); font-weight: 700; font-size: 12px; cursor: pointer; }
.scenario-toggle button.active { background: var(--lime); border-color: var(--lime); color: var(--ink); }

.bracket-side { display: none; }

.bracket-scroll { overflow-x: auto; padding: 26px 4px 10px; }
.bracket { display: flex; align-items: stretch; justify-content: center; gap: 10px; min-width: 1000px; }
.b-side { display: flex; gap: 10px; }
.b-side-right { flex-direction: row-reverse; }
.b-col { display: flex; flex-direction: column; justify-content: space-around; gap: 8px; min-width: 116px; }
.b-col-title { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(243,242,235,.55); text-align: center; margin: 0 0 6px; }
.b-col-title.final { color: var(--lime); }

.b-match { border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 5px; background: var(--ink-soft); transition: opacity .2s ease, border-color .2s ease; }
.b-team { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 4px; }
.b-team .b-flag { font-size: 15px; }
.b-team .b-code { letter-spacing: .5px; }
.b-team .b-score { margin-left: auto; font-weight: 700; }
.b-team.b-winner { color: var(--lime); }
.b-team.b-tbd { color: rgba(243,242,235,.45); font-weight: 500; }

.b-final-col { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 6px; }
.b-trophy { font-size: 30px; line-height: 1; }
.b-final-col .b-match { margin-top: 6px; border-color: rgba(215,255,67,.5); min-width: 120px; }
.b-final-meta { margin-top: 6px; font-size: 10px; color: rgba(243,242,235,.5); text-align: center; }
.b-third-note { margin: 12px 0 4px; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: rgba(243,242,235,.4); }

.bracket.has-selection .b-match { opacity: .26; }
.bracket.has-selection .b-match.lit { opacity: 1; border-color: var(--lime); box-shadow: 0 0 0 1px var(--lime); }
.bracket.has-selection .b-match.maybe { opacity: .7; border-style: dashed; border-color: var(--lime-deep); }
.bracket-note { margin: 18px 0 0; font-size: 12px; color: rgba(243,242,235,.5); }

@media (max-width: 680px) {
  .bracket-controls { width: 100%; }
  .bracket-controls select { width: 100%; min-height: 48px; }
  .scenario-toggle { width: 100%; }
  .scenario-toggle button { flex: 1; min-height: 44px; }
  .bracket-side { display: flex; gap: 8px; margin: 12px 0 0; }
  .bracket-side button { flex: 1; min-height: 44px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: none; color: var(--paper-bright); font-weight: 700; font-size: 12px; cursor: pointer; }
  .bracket-side button.active { background: var(--lime); border-color: var(--lime); color: var(--ink); }

  /* media-llave: solo el lado que corresponde, en una columna por ronda apilada */
  .bracket-scroll { overflow-x: hidden; }
  .bracket { display: block; min-width: 0; }
  .b-final-col { margin: 14px auto 0; }
  .b-side { display: none; flex-direction: column; gap: 14px; }
  .bracket[data-mobile-side="left"] .b-side-left,
  .bracket[data-mobile-side="right"] .b-side-right { display: flex; }
  .b-side .b-col { min-width: 0; }
  .b-col-title { text-align: left; }
}
```

- [ ] **Step 2: Verificación browser (puerto nuevo)**

`python3 -m http.server 8840` → `http://localhost:8840/#ruta`.
- **Escritorio (1280px):** dos mitades simétricas con la Final + 🏆 al centro; 16avos en los extremos, semis junto al centro; la mitad derecha en espejo. Cajas con bandera + código (los placeholders muestran "1A", "3º", "G74"). Scroll horizontal solo si excede.
- Elegir un equipo (p.ej. España): su camino se ilumina en lima en su mitad hacia la final; el resto atenuado. Toggle 1º/2º/3º cambia el camino.
- **Móvil (375px):** sin equipo, se ve una mitad + el toggle "◀ Izquierda · Derecha ▶"; al tocar Derecha cambia de mitad. Al elegir un equipo, salta a su mitad con el camino resaltado y el toggle de lado se oculta. Sin overflow horizontal.
- Consola sin errores. `node --test tests/` verde.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: estilos del bracket simétrico con final central y media-llave móvil"
```

---

### Task 5: deploy y verificación en producción

**Files:** ninguno (push + verificación).

- [ ] **Step 1: Tests + push**

```bash
node --test tests/   # verde
git push
```

- [ ] **Step 2: Verificación en producción**

Esperar el deploy (~1 min; `js/bracket.js` en vivo contiene `b-final-col`). En `https://jmcriptos.github.io/ruta26/#ruta`: escritorio simétrico con final central; elegir equipo ilumina su camino; móvil media-llave con toggle de lado; sin overflow.

---

## Riesgos conocidos

- **Antes de que existan los cruces reales:** los partidos KO no tienen `home/away` aún; `bracketSide` funciona igual porque opera sobre los `phA/phB` (`W##`), que sí están desde el snapshot. Las cajas muestran las etiquetas cortas.
- **Equipos reales entrando al bracket:** cuando la API define `home/away`, `teamBox` los prefiere sobre el placeholder (ya lo hace). El lado no cambia (depende de la estructura, no de quién juegue).
- **Móvil sin selección:** muestra el lado izquierdo por defecto; el toggle permite ver el derecho. Con selección, el toggle se oculta y manda el lado del equipo.
- **`bracketSide` O(n) por partido:** se llama por cada caja en cada render; con 32 partidos KO y cadena corta es trivial. Si se notara, se puede memoizar por render, pero YAGNI.
