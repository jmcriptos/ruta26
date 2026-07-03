# Picks por jugador en el ranking en vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la tabla del "Ranking en vivo" de la quiniela, una columna por partido en vivo con el pick de cada jugador (marcador pronosticado), coloreada con semáforo según cómo va con el marcador actual.

**Architecture:** Un view model puro `livePickView(pred, match)` en `js/engagement.js` (módulo dual browser/node ya testeado) formatea el pick; `liveRankingHtml()` en `js/game.js` lo renderiza como columnas extra usando `WC.scoring.scoreMatch(pred, freezeLive(m))` — la misma lógica de puntaje que ya usa el ranking provisional — para el semáforo. Sin cambios en Supabase ni en scoring.

**Tech Stack:** Vanilla JS (IIFE por módulo, sin build), `node --test tests/`, CSS plano en `styles.css`.

**Spec:** `docs/superpowers/specs/2026-07-03-picks-en-ranking-vivo-design.md`

---

## Contexto para quien ejecuta

- `js/game.js` es la UI de la quiniela (IIFE, no testeable en node: toca DOM/Supabase). El ranking en vivo se arma en `liveRankingHtml()` (~línea 671).
- `js/engagement.js` es el módulo de view models **puros** (browser + node), testeado en `tests/engagement.test.js`. Contrato en `docs/architecture/engagement-contract.md`.
- `data.predictions` (`{user_id, match_id, hg, ag, adv}`) y `data.captains` (`{user_id, match_id}`) ya se cargan completos para todos los jugadores en `game.js`.
- `WC.scoring.scoreMatch(pred, match)` → `{points, kind}` con `kind: exact|outcome|miss|pending|none`. `WC.scoring.freezeLive(m)` congela un partido en vivo como si el marcador actual fuera final. Ambos ya testeados en `tests/scoring.test.js`.
- `adv` solo aplica en picks de empate en KO: `"home" | "away"`.
- Los tests corren con `node --test tests/` (igual que CI en `.github/workflows/deploy-pages.yml`).
- OJO: `git push` a `main` despliega a producción (GitHub Pages). No hacer push hasta la aprobación final del usuario.

---

### Task 1: View model `livePickView` en engagement.js

**Files:**
- Modify: `js/engagement.js` (añadir función + export)
- Modify: `docs/architecture/engagement-contract.md` (documentar el vm)
- Test: `tests/engagement.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/engagement.test.js`:

```js
/* ---------- livePickView ---------- */

test("livePickView: sin pick o pick incompleto → null", () => {
  assert.strictEqual(eng.livePickView(null, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView(undefined, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView({ hg: null, ag: 1 }, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView({ hg: 2, ag: null }, { stage: "group" }), null);
});

test("livePickView: marcador simple, sin lado de avance", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 2, ag: 1, adv: null }, { stage: "group" }),
    { score: "2-1", advSide: null });
  assert.deepStrictEqual(eng.livePickView({ hg: 0, ag: 3, adv: null }, { stage: "qf" }),
    { score: "0-3", advSide: null });
});

test("livePickView: empate KO con avance elegido → advSide", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "away" }, { stage: "r16" }),
    { score: "1-1", advSide: "away" });
  assert.deepStrictEqual(eng.livePickView({ hg: 0, ag: 0, adv: "home" }, { stage: "final" }),
    { score: "0-0", advSide: "home" });
});

test("livePickView: adv se ignora si no hay empate, es grupos, o es basura", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 2, ag: 0, adv: "away" }, { stage: "qf" }),
    { score: "2-0", advSide: null });
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "home" }, { stage: "group" }),
    { score: "1-1", advSide: null });
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "banana" }, { stage: "r16" }),
    { score: "1-1", advSide: null });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test tests/engagement.test.js`
Expected: FAIL con `eng.livePickView is not a function`.

- [ ] **Step 3: Implementación mínima**

En `js/engagement.js`, antes de `const engagement = {`:

```js
  // Pick de un jugador para la celda del ranking en vivo. Puro: no calcula
  // puntos ni semáforo (eso es scoring.scoreMatch); solo formatea el pick.
  // Sin pick válido → null. advSide solo en empate KO con avance elegido.
  function livePickView(pred, match) {
    if (!pred || pred.hg == null || pred.ag == null || !isFinite(pred.hg) || !isFinite(pred.ag)) return null;
    const advSide = match.stage !== "group" && pred.hg === pred.ag &&
      (pred.adv === "home" || pred.adv === "away") ? pred.adv : null;
    return { score: pred.hg + "-" + pred.ag, advSide: advSide };
  }
```

Y en el objeto de export, añadir la entrada:

```js
  const engagement = {
    opportunity: opportunity,
    liveTension: liveTension,
    predictionGroups: predictionGroups,
    postMatchSummary: postMatchSummary,
    whatsappShare: whatsappShare,
    livePickView: livePickView
  };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test tests/engagement.test.js`
Expected: PASS (todos, incluidos los 4 nuevos).

- [ ] **Step 5: Documentar en el contrato**

En `docs/architecture/engagement-contract.md`, añadir una sección nueva al final de la lista de view models (después de la última sección numerada, respetando la numeración existente):

```markdown
## 6. `livePickView(pred, match)` → vm | null

```js
{ score: "2-1", advSide: "home"|"away"|null }
```

- Formatea el pick de un jugador para la columna de picks del ranking en vivo.
- No recibe snapshot: entrada mínima (`{hg, ag, adv}` + partido). Puro, sin puntos
  ni semáforo — el color de la celda sale de `scoring.scoreMatch(pred, freezeLive(m))`.
- Pick ausente/incompleto → `null` (la celda pinta "–").
- `advSide` solo en empate KO con `adv` válido; en grupos o sin empate → `null`.
```

Nota: si la última sección existente no es la 5, ajustar el número para continuar la secuencia.

- [ ] **Step 6: Commit**

```bash
git add js/engagement.js tests/engagement.test.js docs/architecture/engagement-contract.md
git commit -m "feat(quiniela): view model livePickView para picks en el ranking en vivo"
```

---

### Task 2: Columnas de picks en la tabla del ranking en vivo

**Files:**
- Modify: `js/game.js` (`liveRankingHtml()`, ~líneas 682–721)
- Modify: `styles.css` (junto al bloque `.lr-plus`, ~línea 1054)

No hay test unitario: `game.js` es presentación DOM (no carga en node). La lógica nueva vive en Task 1 (testeada) y en scoring (ya testeado). La verificación funcional es Task 3.

- [ ] **Step 1: Índices de picks/capitanes y helper de celda**

En `js/game.js`, dentro de `liveRankingHtml()`, localizar:

```js
    const uid = session ? session.user.id : null;
    const table = rows.map(function (r) {
```

y reemplazar por:

```js
    const uid = session ? session.user.id : null;
    // Picks por jugador de los partidos en vivo (bloqueados al kickoff: mostrarlos es fair play)
    const predByKey = {};
    data.predictions.forEach(function (pr) { predByKey[pr.user_id + "|" + pr.match_id] = pr; });
    const capByKey = {};
    data.captains.forEach(function (c) { capByKey[c.user_id + "|" + c.match_id] = true; });
    function pickCell(userId, m) {
      const pr = predByKey[userId + "|" + m.id];
      const view = WC.engagement ? WC.engagement.livePickView(pr, m) : null;
      if (!view) return '<td class="lr-pick none">–</td>';
      const s = WC.scoring.scoreMatch({ hg: pr.hg, ag: pr.ag, adv: pr.adv }, WC.scoring.freezeLive(m));
      const adv = view.advSide ? " " + teamFlag(view.advSide === "home" ? m.home : m.away) : "";
      const cap = capByKey[userId + "|" + m.id] ? ' <span class="lr-pick-cap">Ⓒ</span>' : "";
      return '<td class="lr-pick ' + s.kind + '">' + esc(view.score) + adv + cap + "</td>";
    }
    const table = rows.map(function (r) {
```

- [ ] **Step 2: Celdas de pick en cada fila**

En la misma función, localizar (dentro del `rows.map`):

```js
        '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + plus +
        '</td><td class="pts">' + r.points + "</td></tr>";
```

y reemplazar por:

```js
        '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + plus + "</td>" +
        liveMs.map(function (m) { return pickCell(r.userId, m); }).join("") +
        '<td class="pts">' + r.points + "</td></tr>";
```

- [ ] **Step 3: Encabezado con banderas + contenedor con scroll horizontal**

En la misma función, localizar el return final:

```js
      '<table class="rank-table"><tr><th>#</th><th></th><th></th><th>Jugador</th><th>Pts</th></tr>' + table + "</table>" +
```

y reemplazar por:

```js
      '<div class="lr-scroll"><table class="rank-table"><tr><th>#</th><th></th><th></th><th>Jugador</th>' +
      liveMs.map(function (m) { return '<th class="lr-pick-th">' + teamFlag(m.home) + " " + teamFlag(m.away) + "</th>"; }).join("") +
      "<th>Pts</th></tr>" + table + "</table></div>" +
```

- [ ] **Step 4: Estilos del semáforo**

En `styles.css`, después del bloque `.lr-plus.bump { ... }` (~línea 1058), añadir:

```css
/* Picks por jugador en el ranking en vivo: una columna por partido en vivo */
.lr-scroll { overflow-x: auto; }
.lr-pick { white-space: nowrap; font-weight: 700; font-size: 13px; }
.lr-pick.exact { color: var(--success); }
.lr-pick.outcome { color: var(--orange); }
.lr-pick.miss, .lr-pick.pending { color: var(--muted); opacity: .75; }
.lr-pick.none { color: var(--muted); font-weight: 400; }
.lr-pick-cap { font-size: 11px; color: var(--muted); }
.lr-pick-th { white-space: nowrap; }
```

- [ ] **Step 5: Suite completa**

Run: `node --test tests/`
Expected: PASS (sin regresiones).

- [ ] **Step 6: Commit**

```bash
git add js/game.js styles.css
git commit -m "feat(quiniela): pick de cada jugador con semáforo en el ranking en vivo"
```

---

### Task 3: Verificación funcional en el preview

**Files:** ninguno nuevo (solo `.claude/launch.json` si no existe).

El sitio es estático. Si no existe `.claude/launch.json`, crearlo:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "ruta26", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "4173"], "port": 4173 }
  ]
}
```

- [ ] **Step 1: Levantar el preview** con `preview_start` (config `ruta26`) y abrir la página.

- [ ] **Step 2: Simular un partido en vivo** (si no hay ninguno en vivo de verdad) con `preview_eval`:

```js
(function () {
  const m = WC.state.matches.filter(function (x) { return x.status !== "played" && x.home && x.away; })[0];
  m.status = "live"; m.hs = 1; m.as = 0;
  WC.game.onDataUpdate();
  return m.id;
})()
```

- [ ] **Step 3: Verificar con `preview_snapshot` + `preview_inspect`:**
  - La card "Ranking en vivo" muestra una columna extra con las banderas del partido en el header.
  - Cada fila muestra el pick (`2-1`) o `–` si el jugador no tiene pick.
  - `preview_inspect` sobre una celda `.lr-pick.outcome` → `color` es `rgb(255, 124, 66)` (naranja); `.lr-pick.exact` → `rgb(46, 158, 91)` (verde); `.lr-pick.miss` → gris.
  - Jugadores capitanes de ese partido muestran Ⓒ.
  - Empate KO con `adv`: la celda muestra la banderita del equipo elegido (probar cambiando `m.hs = m.as = 1` y re-evaluando `WC.game.onDataUpdate()`).
  - `preview_console_logs` sin errores.

- [ ] **Step 4: Responsive** — `preview_resize` a mobile (375px) y confirmar que la tabla no rompe el layout (con 2 columnas de pick cabe; si no, hace scroll dentro de `.lr-scroll`).

- [ ] **Step 5: Screenshot final** con `preview_screenshot` como evidencia para el usuario.

- [ ] **Step 6: Cierre** — commitear `.claude/launch.json` solo si se creó y es útil conservarlo; preguntar al usuario antes de `git push` (push a `main` = deploy a producción en GitHub Pages).
