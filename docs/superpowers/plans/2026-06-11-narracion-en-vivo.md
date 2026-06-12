# Narración en vivo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarjetas de partidos en vivo con botón "Ver narración" que expande tabs Narración (jugada a jugada en español, goles resaltados) y Estadísticas (render existente), auto-refrescándose cada 60 s mientras está abierto.

**Architecture:** Todo dentro de `js/match-detail.js` (dueño del detalle), reusando `parseSummary`/`renderDetail`/`fetch` existentes. `app.js` solo agrega `data-live="1"` al botón de tarjetas en vivo. Sin CSP nuevo (mismo host ESPN) y sin caché para vivos.

**Tech Stack:** Vanilla JS sin build, node --test.

**Spec:** `docs/superpowers/specs/2026-06-11-narracion-en-vivo-design.md` (hechos verificados ahí; no re-investigar).

---

### Task 1: Parser de narración + eventos por type.id + fetch en español

**Files:**
- Modify: `js/match-detail.js`
- Test: `tests/match-detail.test.js`

- [ ] **Step 1: Tests que fallan.** Agregar al final de `tests/match-detail.test.js`:

```js
test("parseCommentary: ordena descendente, sanitiza y marca goles", () => {
  const c = detail.parseCommentary({
    commentary: [
      { sequence: 0, time: { displayValue: "" }, text: "Comienza el partido." },
      { sequence: 5, time: { displayValue: "9'" }, text: "¡Gooooool! México 1, Sudáfrica 0. Julián Quiñones remate con la derecha." },
      { sequence: 3, time: { displayValue: "3'" }, text: "Falta de Aubrey Modiba (Sudáfrica)." },
      null,
      { sequence: 7, time: { displayValue: "12'" }, text: "" }
    ]
  });
  assert.deepStrictEqual(c.map(e => e.seq), [5, 3, 0]);
  assert.strictEqual(c[0].isGoal, true);
  assert.strictEqual(c[0].minute, "9'");
  assert.strictEqual(c[1].isGoal, false);
  assert.strictEqual(c[2].minute, "");
});

test("parseCommentary: limpia HTML-control y tolera JSON sin commentary", () => {
  assert.deepStrictEqual(detail.parseCommentary({}), []);
  assert.deepStrictEqual(detail.parseCommentary(null), []);
  const c = detail.parseCommentary({ commentary: [{ sequence: 1, time: {}, text: "x".repeat(500) }] });
  assert.strictEqual(c[0].text.length, 300);
});

test("parseSummary: clasifica eventos por type.id con respuesta en español", () => {
  const f = fixture();
  f.keyEvents.forEach(ev => {
    if (ev.type.text === "Yellow Card") ev.type = { id: "94", text: "Tarjeta amarilla" };
    if (ev.type.text === "Red Card") ev.type = { id: "93", text: "Tarjeta roja" };
    if (ev.type.text === "Goal") ev.type = { id: "70", text: "Gol" };
  });
  const m = detail.parseSummary(f);
  assert.strictEqual(m.events.away[0].kind, "yellow");
  assert.strictEqual(m.events.away[1].kind, "red");
  assert.strictEqual(m.events.home[0].kind, "goal");
});
```

- [ ] **Step 2: Verificar que fallan.** `node --test tests/match-detail.test.js` → FAIL (`parseCommentary is not a function`).

- [ ] **Step 3: Implementar en `js/match-detail.js`:**

3a. `SUMMARY_URL` pasa a pedir español (los params van antes de `event=`, el resto del código no cambia):

```js
  const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?lang=es&region=mx&event=";
```

3b. `safeText` acepta tope opcional:

```js
  function safeText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max || 80) : "";
  }
```
(Escribir la regex con escapes `\u0000-\u001f\u007f` en ASCII — NUNCA bytes de control literales.)

3c. `eventKind` clasifica por `type.id` con fallback al texto en inglés:

```js
  function eventKind(ev) {
    if (ev.shootout === true) return null;
    if (ev.scoringPlay === true) {
      if (ev.ownGoal === true) return "og";
      if (ev.penaltyKick === true) return "pen";
      return "goal";
    }
    const type = ev.type || {};
    const typeId = type.id == null ? "" : String(type.id);
    if (typeId === "94" || type.text === "Yellow Card") return "yellow";
    if (typeId === "93" || type.text === "Red Card") return "red";
    return null;
  }
```

3d. Nuevo parser, después de `parseSummary`:

```js
  // Narración jugada a jugada; lo más reciente primero. isGoal es solo presentación.
  function parseCommentary(json) {
    const list = Array.isArray(json && json.commentary) ? json.commentary : [];
    const out = [];
    list.forEach(function (e) {
      if (!e) return;
      const text = safeText(e.text, 300);
      if (!text) return;
      const seq = safeNum(e.sequence);
      out.push({
        seq: seq == null ? 0 : seq,
        minute: safeMinute((e.time || {}).displayValue) || "",
        text: text,
        isGoal: /^¡Go+l/.test(text)
      });
    });
    out.sort(function (a, b) { return b.seq - a.seq; });
    return out;
  }
```
Nota: `safeNum` tiene tope 2000 — suficiente para `sequence` (≤ ~300 por partido).

3e. Exportar: agregar `parseCommentary: parseCommentary` al objeto `api`.

- [ ] **Step 4: Verificar que pasan.** `node --test tests/match-detail.test.js` → PASS. Suite completa `node --test tests/` → 6 files pass.

- [ ] **Step 5: Commit.** `git add js/match-detail.js tests/match-detail.test.js && git commit -m "feat: parser de narración ESPN y eventos por type.id"`

---

### Task 2: Render de narración y panel vivo

**Files:**
- Modify: `js/match-detail.js`
- Test: `tests/match-detail.test.js`

- [ ] **Step 1: Tests que fallan.** Agregar:

```js
function liveState(over) {
  return Object.assign({
    tab: "narracion",
    showAll: false,
    model: { events: { home: [], away: [] }, stats: [] },
    commentary: [
      { seq: 9, minute: "67'", text: "¡Gooooool! México 2, Sudáfrica 0.", isGoal: true },
      { seq: 8, minute: "64'", text: "Cambio en México.", isGoal: false },
      { seq: 7, minute: "61'", text: "Remate parado.", isGoal: false },
      { seq: 6, minute: "58'", text: "Amonestado Sibisi.", isGoal: false },
      { seq: 5, minute: "55'", text: "Falta de Mokoena.", isGoal: false },
      { seq: 4, minute: "52'", text: "Córner de México.", isGoal: false }
    ]
  }, over);
}

test("renderLive: tabs, 5 jugadas, gol resaltado y botón de anteriores", () => {
  const html = detail.renderLive(liveState());
  assert.ok(html.includes("data-live-tab=\"narracion\""));
  assert.ok(html.includes("data-live-tab=\"stats\""));
  assert.ok(html.includes("live-goal"));
  assert.ok(html.includes("¡Gooooool!"));
  assert.ok(!html.includes("Córner de México."));
  assert.ok(html.includes("data-live-more"));
  assert.ok(html.includes("67'"));
  assert.ok(html.includes("Datos: ESPN"));
});

test("renderLive: showAll muestra todo y oculta el botón", () => {
  const html = detail.renderLive(liveState({ showAll: true }));
  assert.ok(html.includes("Córner de México."));
  assert.ok(!html.includes("data-live-more"));
});

test("renderLive: tab stats reusa el render del detalle", () => {
  const html = detail.renderLive(liveState({
    tab: "stats",
    model: { events: { home: [], away: [] }, stats: [{ key: "totalShots", label: "Tiros", home: 16, away: 3 }] }
  }));
  assert.ok(html.includes("Tiros"));
  assert.ok(!html.includes("¡Gooooool!"));
});

test("renderLive: narración vacía muestra mensaje y escapa HTML", () => {
  const vacio = detail.renderLive(liveState({ commentary: [] }));
  assert.ok(vacio.includes("Aún no hay narración"));
  const xss = detail.renderLive(liveState({
    commentary: [{ seq: 1, minute: "", text: "<img src=x onerror=alert(1)>", isGoal: false }]
  }));
  assert.ok(!xss.includes("<img"));
  assert.ok(xss.includes("&lt;img"));
});
```

- [ ] **Step 2: Verificar que fallan.** `node --test tests/match-detail.test.js` → FAIL.

- [ ] **Step 3: Implementar** (después de `renderDetail`):

```js
  // Lista de jugadas, lo más nuevo arriba; con showAll=false solo las últimas 5.
  function renderNarration(entries, showAll) {
    if (!entries.length) return '<p class="detail-empty">Aún no hay narración disponible.</p>';
    const shown = showAll ? entries : entries.slice(0, 5);
    let html = '<ul class="live-feed">' + shown.map(function (e) {
      const minute = safeMinute(e.minute) || "";
      return '<li' + (e.isGoal ? ' class="live-goal"' : "") + '><span class="ev-min">' + minute + "</span><span>" + esc(e.text) + "</span></li>";
    }).join("") + "</ul>";
    if (!showAll && entries.length > 5) {
      html += '<button type="button" class="detail-toggle live-more" data-live-more>Ver jugadas anteriores</button>';
    }
    return html;
  }

  // Panel completo de partido en vivo: tabs + cuerpo + pie.
  function renderLive(state) {
    const statsTab = state.tab === "stats";
    const tabs = '<div class="live-tabs">' +
      '<button type="button" class="live-tab' + (statsTab ? "" : " active") + '" data-live-tab="narracion">Narración</button>' +
      '<button type="button" class="live-tab' + (statsTab ? " active" : "") + '" data-live-tab="stats">Estadísticas</button></div>';
    const body = statsTab ? renderDetail(state.model) : renderNarration(state.commentary, state.showAll);
    const latest = state.commentary.find(function (e) { return e.minute; });
    const minute = latest ? safeMinute(latest.minute) : null;
    return tabs + '<div class="live-body">' + body + "</div>" +
      '<div class="live-foot"><span data-live-updated>Actualizado hace 0 s</span><span>' +
      (minute ? minute + " · " : "") + "Datos: ESPN</span></div>";
  }
```

Exportar `renderNarration` y `renderLive` en `api`.

- [ ] **Step 4: Verificar.** `node --test tests/match-detail.test.js` → PASS; `node --test tests/` → 6 files pass.

- [ ] **Step 5: Commit.** `git add js/match-detail.js tests/match-detail.test.js && git commit -m "feat: render de narración en vivo con tabs"`

---

### Task 3: Runtime vivo (intervalos, toggle, app.js, CSS)

**Files:**
- Modify: `js/match-detail.js`
- Modify: `js/app.js` (matchCard, ~línea 108)
- Modify: `index.html` (bumps de versión)
- Modify: `styles.css`

- [ ] **Step 1: Refactor del fetch.** En `js/match-detail.js`, reemplazar `fetchDetail` por `fetchSummary` (devuelve el JSON crudo) y ajustar `loadInto`:

```js
  // Descarga el summary de ESPN (JSON crudo); aborta tras 10 s.
  async function fetchSummary(espnId) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      const res = await fetch(SUMMARY_URL + encodeURIComponent(espnId), { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }
```

En `loadInto`, cambiar `const model = await fetchDetail(espnId);` por `const model = parseSummary(await fetchSummary(espnId));`.

- [ ] **Step 2: Sesión en vivo.** Agregar después de `loadInto`:

```js
  const LIVE_REFRESH_MS = 60000;

  function onLiveClick(event) {
    const panel = event.currentTarget;
    const session = panel._live;
    if (!session) return;
    const tabBtn = event.target.closest("[data-live-tab]");
    if (tabBtn) { session.tab = tabBtn.dataset.liveTab; panel.innerHTML = renderLive(session); return; }
    if (event.target.closest("[data-live-more]")) { session.showAll = true; panel.innerHTML = renderLive(session); }
  }

  async function refreshLive(matchId, panel) {
    const session = panel._live;
    const espnId = (root.WC.ESPN_MAP || {})[matchId];
    if (!session || !espnId) return;
    try {
      const json = await fetchSummary(espnId);
      if (panel._live !== session) return; // se cerró durante el fetch
      session.model = parseSummary(json);
      session.commentary = parseCommentary(json);
      session.updatedAt = Date.now();
      panel.innerHTML = renderLive(session);
    } catch (e) {
      if (panel._live === session && !session.updatedAt) {
        panel.innerHTML = '<p class="detail-empty">No se pudo cargar la narración. Se reintentará en 1 min.</p>';
      }
    }
  }

  // Abre el panel vivo: fetch inmediato + refresco cada 60 s + contador "hace X s".
  function startLive(matchId, panel) {
    stopLive(panel);
    const session = { tab: "narracion", showAll: false, model: { events: { home: [], away: [] }, stats: [] }, commentary: [], updatedAt: null, timer: null, tick: null };
    panel._live = session;
    panel.addEventListener("click", onLiveClick);
    panel.innerHTML = '<p class="detail-empty">Cargando…</p>';
    refreshLive(matchId, panel);
    session.timer = setInterval(function () {
      if (!panel.isConnected || panel.hidden) { stopLive(panel); return; }
      refreshLive(matchId, panel);
    }, LIVE_REFRESH_MS);
    session.tick = setInterval(function () {
      if (!panel.isConnected) { stopLive(panel); return; }
      const el = panel.querySelector("[data-live-updated]");
      if (el && session.updatedAt) {
        el.textContent = "Actualizado hace " + Math.max(0, Math.round((Date.now() - session.updatedAt) / 1000)) + " s";
      }
    }, 1000);
  }

  // Detiene los intervalos y limpia la sesión del panel.
  function stopLive(panel) {
    const session = panel._live;
    if (!session) return;
    clearInterval(session.timer);
    clearInterval(session.tick);
    panel.removeEventListener("click", onLiveClick);
    delete panel._live;
  }
```

- [ ] **Step 3: `toggle` enruta por `data-live`:**

```js
  // btn: el botón dentro de la tarjeta; el panel es su hermano siguiente.
  function toggle(matchId, btn) {
    const panel = btn.nextElementSibling;
    if (!panel || !panel.classList.contains("match-detail")) return;
    const live = btn.dataset.live === "1";
    const open = !panel.hidden;
    panel.hidden = open;
    btn.textContent = open ? (live ? "Ver narración" : "Ver más") : "Ver menos";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    if (open) { if (live) stopLive(panel); return; }
    if (live) startLive(matchId, panel); else loadInto(matchId, panel);
  }
```

- [ ] **Step 4: `matchCard` en `js/app.js`.** Reemplazar el bloque `hasDetail`/`detailHtml` por:

```js
    const canDetail = (m.status === "played" || m.status === "live") && WC.ESPN_MAP && WC.ESPN_MAP[m.id];
    const isLive = m.status === "live";
    const detailHtml = canDetail
      ? '<button type="button" class="detail-toggle" aria-expanded="false" data-detail="' + esc(m.id) + '"' +
        (isLive ? ' data-live="1"' : "") + ">" + (isLive ? "Ver narración" : "Ver más") +
        '</button><div class="match-detail" hidden></div>'
      : "";
```
(El resto de `matchCard` y la delegación de clicks no cambian.)

- [ ] **Step 5: CSS.** Agregar después del bloque `.detail-retry` en `styles.css`:

```css
.live-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.live-tab { flex: 1; border: 1px solid var(--line); background: var(--paper-bright); color: var(--muted); font: inherit; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; padding: 8px 0; border-radius: 8px; cursor: pointer; }
.live-tab.active { background: var(--lime); border-color: var(--ink); color: var(--ink); }
.live-feed { list-style: none; margin: 0; padding: 0; }
.live-feed li { display: flex; gap: 10px; padding: 7px 10px; border-top: 1px solid var(--line); font-size: 12.5px; line-height: 1.5; }
.live-feed li:first-child { border-top: 0; }
.live-feed .ev-min { min-width: 30px; }
.live-feed li.live-goal { background: #f1f8d8; border: 1px solid var(--lime-deep); border-radius: 8px; margin-bottom: 6px; }
.live-more { margin-top: 10px; }
.live-foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 10px; color: var(--muted); }
```

- [ ] **Step 6: Bumps en `index.html`:** `js/match-detail.js`, `js/app.js` y `styles.css` pasan a `?v=20260612a`.

- [ ] **Step 7: Suite.** `node --test tests/` → 6 files pass.

- [ ] **Step 8: Commit.** `git add js/match-detail.js js/app.js index.html styles.css && git commit -m "feat: narración en vivo con tabs y auto-refresco en tarjetas live"`

---

### Task 4: Verificación en navegador

No hay partido en vivo a esta hora; se verifica el flujo vivo inyectando una tarjeta live con el id real del MEX-RSA (ESPN devuelve commentary completo para finalizados, así que el fetch y el render son reales).

- [ ] **Step 1:** Servidor en puerto NUEVO (agregar config a `.claude/launch.json` si hace falta) y abrir la app.
- [ ] **Step 2:** Con `preview_eval`, inyectar al inicio de `#matchesGrid` una tarjeta live mínima:

```js
document.getElementById('matchesGrid').insertAdjacentHTML('afterbegin',
  '<article class="match-card live"><div class="match-meta"><span>SIMULADO</span></div>' +
  '<button type="button" class="detail-toggle" aria-expanded="false" data-detail="400021443" data-live="1">Ver narración</button>' +
  '<div class="match-detail" hidden></div></article>');
```

- [ ] **Step 3:** Click al botón → verificar: tabs Narración/Estadísticas, jugadas en español lo más nuevo arriba, gol del 67' resaltado, botón "Ver jugadas anteriores" funciona, tab Estadísticas muestra eventos + stats, pie "Actualizado hace X s" cuenta, request a ESPN con `lang=es`.
- [ ] **Step 4:** "Ver menos" → colapsa y los intervalos se detienen (verificar `panel._live === undefined` vía eval).
- [ ] **Step 5:** Verificar que el flujo de finalizados sigue intacto (tarjeta real MEX-RSA con "Ver más"; nota: su caché previa puede servir el modelo viejo en inglés — válido).
- [ ] **Step 6:** Sin errores de consola/CSP. Screenshot desktop y móvil del panel de narración.
