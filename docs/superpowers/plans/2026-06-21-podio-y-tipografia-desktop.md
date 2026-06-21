# Podio + tipografía desktop + desempate por % — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranking definitivo con podio Top-3 + lista, tipografía más grande en PC, y desempate del ranking por % de aciertos.

**Architecture:** Tres cambios independientes de UI/lógica sobre un sitio estático. Feature 3 (desempate) es lógica pura en `scoring.js` (con test). Features 1 y 2 son render+CSS (verificación visual). Se hace primero el desempate porque el orden del podio depende de él.

**Tech Stack:** JS CommonJS (browser + `node:test`), CSS, GitHub Pages (deploy + versionado automático ya activos — NO hay que bumpear `?v=`).

**Spec:** `docs/superpowers/specs/2026-06-21-podio-y-tipografia-desktop-design.md`

**Rama:** trabajar en `feat/podio-ranking-tipografia` (no en main); merge al final.

---

## Estructura de archivos

- **Modify** `js/scoring.js` — `buildLeaderboard`: cambiar el comparador (añadir % como 2º criterio). `pos`/`tier` sin cambios.
- **Modify** `tests/scoring.test.js` — test del desempate.
- **Modify** `js/game.js` — nueva `podiumHtml(top3, uid)`; `rankingHtml()` parte top-3 / resto.
- **Modify** `styles.css` — CSS del podio + bloque `@media (min-width: 981px)` (tipografía desktop).
- **Modify** `stats.html` — bloque `@media (min-width: 981px)` (tipografía desktop del dashboard).

---

## Task 1: Desempate por % de aciertos (scoring.js)

**Files:**
- Modify: `js/scoring.js` (función `buildLeaderboard`, comparador del `sort`)
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `tests/scoring.test.js` (usa el helper `played()` ya existente en el archivo):

```js
test("buildLeaderboard: empate de puntos se ordena por % de aciertos (pos/tier por puntos)", () => {
  const matches = [
    played("group", 2, 1, null, { id: "g1" }),  // gana local
    played("group", 2, 1, null, { id: "g2" })   // gana local
  ];
  const profiles = [{ id: "u1", username: "zoe" }, { id: "u2", username: "ana" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0 },  // zoe: 1/1 = 100%, 1 pt
    { user_id: "u2", match_id: "g1", hg: 1, ag: 0 },  // ana: acierta g1
    { user_id: "u2", match_id: "g2", hg: 0, ag: 1 }   // ana: falla g2 → 1/2 = 50%, 1 pt
  ];
  const rows = sc.buildLeaderboard(profiles, predictions, [], matches);
  // mismo puntaje (1), pero zoe tiene mayor % → va primero, AUNQUE "ana" < "zoe" por nombre
  assert.strictEqual(rows[0].username, "zoe");
  assert.strictEqual(rows[1].username, "ana");
  // empate de puntos → misma posición y medalla (tier)
  assert.strictEqual(rows[0].pos, rows[1].pos);
  assert.strictEqual(rows[0].tier, rows[1].tier);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/scoring.test.js`
Expected: FAIL — con el comparador actual (puntos→exactos→nombre) gana "ana" por nombre, así que `rows[0].username` sería "ana", no "zoe".

- [ ] **Step 3: Cambiar el comparador en `buildLeaderboard`**

En `js/scoring.js`, localizar el `rows.sort(...)` dentro de `buildLeaderboard` (actualmente):

```js
    rows.sort(function (x, y) {
      return y.points - x.points || y.exact - x.exact || (x.username || "").localeCompare(y.username || "", "es");
    });
```

Reemplazarlo por (añade `accOf` como 2º criterio; deja `exact` y nombre como criterios posteriores):

```js
    function accOf(r) { return r.decided > 0 ? (r.exact + r.outcome) / r.decided : -1; }
    rows.sort(function (x, y) {
      return y.points - x.points || accOf(y) - accOf(x) || y.exact - x.exact || (x.username || "").localeCompare(y.username || "", "es");
    });
```

NO tocar el bucle que asigna `pos`/`tier` (sigue por caída de puntos). `decided` ya se calcula antes (es propiedad de cada row).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite (no romper nada)**

Run: `node --test tests/`
Expected: `fail 0`. (Si algún test viejo de `buildLeaderboard` asumía orden por nombre en un empate de puntos, revisar — no debería: los empates de los tests existentes difieren en puntos o usan nombres alineados con el %.)

- [ ] **Step 6: Commit**

```bash
git add js/scoring.js tests/scoring.test.js
git commit -m "feat(scoring): desempate del ranking por % de aciertos (pos/tier por puntos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Podio + lista en el ranking definitivo (game.js + CSS)

**Files:**
- Modify: `js/game.js` (nueva `podiumHtml`; reescribir `rankingHtml`)
- Modify: `styles.css` (CSS del podio)

- [ ] **Step 1: Añadir `podiumHtml` y reescribir `rankingHtml`**

En `js/game.js`, ANTES de `function rankingHtml()`, añadir:

```js
  // Podio del Top 3 (centro #1, izquierda #2, derecha #3). Pura presentación de
  // filas de buildLeaderboard. Empates: cada uno muestra su medalla real por tier.
  function podiumHtml(top3, uid) {
    if (!top3.length) return "";
    const step = function (r, cls) {
      if (!r) return "";
      const medal = r.tier === 1 ? "🥇" : r.tier === 2 ? "🥈" : r.tier === 3 ? "🥉" : "";
      const me = r.userId === uid ? " pod-me" : "";
      return '<div class="pod-step ' + cls + me + '">' +
        '<div class="pod-medal">' + medal + "</div>" +
        '<div class="pod-flag">' + champFlagFor(r.userId) + "</div>" +
        '<div class="pod-name">' + esc(r.username) + "</div>" +
        '<div class="pod-pts">' + r.points + " pts</div>" +
        '<div class="pod-block">' + r.pos + "</div>" +
        "</div>";
    };
    return '<div class="podium">' + step(top3[1], "second") + step(top3[0], "first") + step(top3[2], "third") + "</div>";
  }
```

Reemplazar la función `rankingHtml()` completa por:

```js
  function rankingHtml() {
    const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    const uid = session ? session.user.id : null;
    if (rows.length === 0) {
      return '<div class="game-card"><h3>Ranking</h3><p class="rank-empty">Aún no hay jugadores. ¡Sé el primero!</p></div>';
    }
    // El podio SIEMPRE por puntos (rows); la lista respeta el sort elegido (view).
    const top3 = rows.slice(0, 3);
    const top3Ids = {};
    top3.forEach(function (r) { top3Ids[r.userId] = true; });
    const view = rankSort === "acc"
      ? rows.slice().sort(function (x, y) { return accValue(y) - accValue(x) || y.points - x.points; })
      : rows;
    const rest = view.filter(function (r) { return !top3Ids[r.userId]; });
    const arrow = function (key) { return rankSort === key ? ' <span class="sort-ar">▼</span>' : ""; };
    const accTh = '<th class="col-acc sortable' + (rankSort === "acc" ? " sort-active" : "") + '" data-rank-sort="acc">% Acierto' + arrow("acc") + "</th>";
    const ptsTh = '<th class="sortable' + (rankSort === "pts" ? " sort-active" : "") + '" data-rank-sort="pts">Pts' + arrow("pts") + "</th>";
    const tableHtml = rest.length === 0 ? "" :
      '<table class="rank-table"><tr><th>#</th><th></th><th>Jugador</th><th class="col-x">Exactos</th><th class="col-x">Resultados</th>' + accTh + '<th class="col-x">Bonus</th>' + ptsTh + "</tr>" +
        rest.map(function (r) {
          const medal = r.tier === 1 ? "🥇" : r.tier === 2 ? "🥈" : r.tier === 3 ? "🥉" : '<span class="num">' + r.pos + "</span>";
          const acc = r.decided > 0 ? Math.round((r.exact + r.outcome) / r.decided * 100) + "%" : "—";
          return "<tr" + (r.userId === uid ? ' class="me"' : "") + '><td class="pos">' + medal + '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + '</td><td class="col-x">' +
            r.exact + '</td><td class="col-x">' + r.outcome + '</td><td class="col-acc">' + acc + '</td><td class="col-x">' + (r.bonus || 0) + '</td><td class="pts">' + r.points + "</td></tr>";
        }).join("") + "</table>";
    return '<div class="game-card"><h3>Ranking</h3>' +
      podiumHtml(top3, uid) +
      tableHtml +
      (uid && rows.some(function (r) { return r.userId === uid; })
        ? '<div class="game-actions game-share" style="margin-top:14px"><button class="game-btn secondary" id="gShare">Compartir mi posición</button></div>'
        : "") +
      "</div>";
  }
```

- [ ] **Step 2: Añadir el CSS del podio en `styles.css`**

Añadir cerca del bloque del ranking (p. ej. después de `.rank-empty`/reglas de `.rank-table`):

```css
/* Podio del ranking definitivo (Top 3, estilo broadcast) */
.podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; background: var(--ink-soft); border-radius: 12px; padding: 16px 12px 0; margin-bottom: 16px; }
.pod-step { flex: 1; min-width: 0; max-width: 116px; display: flex; flex-direction: column; align-items: center; text-align: center; color: var(--white); }
.pod-medal { font-size: 20px; line-height: 1; height: 22px; }
.pod-flag { font-size: 26px; line-height: 1; margin: 2px 0; }
.pod-name { max-width: 100%; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pod-pts { font-size: 12px; font-weight: 800; color: var(--lime); margin-bottom: 6px; }
.pod-block { width: 100%; display: grid; place-items: center; border-radius: 6px 6px 0 0; font: 800 22px/1 "League Spartan", sans-serif; color: var(--ink); }
.pod-step.first .pod-block { height: 60px; background: var(--lime); }
.pod-step.second .pod-block { height: 44px; background: #c9ccc4; }
.pod-step.third .pod-block { height: 32px; background: #d8a56b; }
.pod-step.pod-me .pod-name { color: var(--lime); }
.pod-step.pod-me .pod-block { box-shadow: inset 0 0 0 2px var(--ink); }
```

- [ ] **Step 3: Verificar sintaxis JS**

Run: `node -c js/game.js`
Expected: sin salida (OK).

- [ ] **Step 4: Verificar visualmente en navegador (móvil y desktop)**

Levantar un servidor de preview NUEVO (primera carga = CSS fresco; el `?v=` del fuente es estático y solo lo versiona la Action al desplegar):
- `preview_start` → navegar a `http://localhost:8791/index.html` (la pestaña suele estar logueada como jmcriptos_26, con 28 jugadores reales → hay podio + lista).
- Ir a la sección Quiniela → tarjeta "Ranking".
- A 375px (móvil): confirmar podio de 3 (centro más alto), nombres con ellipsis sin desbordar, lista del 4º para abajo, resaltado "yo" si aplica.
- A 1280px (desktop): confirmar que entra bien.
- `preview_console_logs` nivel error → sin errores.
- Tomar screenshot como evidencia.

Expected: podio Top-3 + tabla del resto, sin duplicados, sin errores de consola.

- [ ] **Step 5: Commit**

```bash
git add js/game.js styles.css
git commit -m "feat(ranking): podio Top-3 + lista en el ranking definitivo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Tipografía más grande en PC (styles.css + stats.html)

**Files:**
- Modify: `styles.css` (bloque `@media (min-width: 981px)`)
- Modify: `stats.html` (bloque `@media (min-width: 981px)` en su `<style>`)

- [ ] **Step 1: Añadir el breakpoint de desktop en `styles.css`**

Añadir al final de `styles.css` (no tocar las reglas `max-width` existentes):

```css
/* ===== Tipografía de desktop (no afecta móvil/tablet ≤980px) ===== */
@media (min-width: 981px) {
  .gt-head > span { font-size: 12px; }
  .gt-row > span { font-size: 14px; }
  .gt-team em { font-size: 14px; }
  .rank-table { font-size: 15px; }
  .rank-table th { font-size: 12px; }
  .rank-table td.num { font-size: 17px; }
  .pod-name, .pod-pts { font-size: 13px; }
  .game-card > p, .rank-empty, .lr-note { font-size: 14px; }
}
```

- [ ] **Step 2: Añadir el breakpoint de desktop en `stats.html`**

En el `<style>` de `stats.html`, añadir (al final del bloque de estilos, antes de `</style>`):

```css
    @media (min-width: 981px) {
      .dz-kpi small { font-size: 12px; }
      .dz-kpi .sub, .dz-delta, .dz-card-head .aside, .dz-updated, .dz-kicker, .dz-donut-legend .pct { font-size: 12px; }
      .dz-bar-row, .dz-funnel-legend { font-size: 14px; }
      .dz-note { font-size: 13px; }
    }
```

- [ ] **Step 3: Verificar visualmente (desktop sube, móvil igual)**

Con un preview NUEVO:
- `index.html` a 1280px: grupos, ranking (con podio) y partidos se leen más grandes/cómodos.
- `index.html` a 375px: SIN cambios respecto a hoy (las reglas ≤980px mandan).
- `stats.html` a 1280px: KPIs, etiquetas y leyendas más grandes; a 375px sin cambios.
- Confirmar que las columnas de grupos/ranking no se desbordan con el texto mayor (revisar "PTS"/"PJ" y números de 2 dígitos). Screenshot de evidencia.

Expected: desktop más legible, móvil idéntico, sin desbordes.

- [ ] **Step 4: Commit**

```bash
git add styles.css stats.html
git commit -m "fix(ui): tipografía más grande en desktop (≥981px), móvil intacto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final

- [ ] `node --test tests/` → `fail 0`.
- [ ] Preview a 375px y 1280px sin errores de consola; podio correcto y desktop legible.
- [ ] Merge a `main` con superpowers:finishing-a-development-branch (el push dispara la Action que versiona y despliega solo).

---

## Self-review (cobertura del spec)

- Feature 3 (desempate por %, pos/tier por puntos) → **Task 1** (test cubre orden por % + medalla compartida).
- Feature 1 (podio Top-3 por puntos; lista del resto excluyendo el podio; empates con medalla por tier; "yo"; casos 0/1-3/4+; share) → **Task 2** (`top3Ids` evita duplicar/saltar al ordenar por %; `rest.length===0` → sin tabla; `rows.length===0` → mensaje).
- Feature 2 (breakpoint desktop ≥981px en styles.css y stats.html; móvil intacto) → **Task 3**.
- Alcance: ranking en vivo sin cambios (solo se tocó `rankingHtml`, no `liveRankingHtml`); el desempata aplica a ambos vía `buildLeaderboard` (deseado).
