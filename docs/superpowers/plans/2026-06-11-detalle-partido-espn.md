# Detalle de partidos finalizados (ESPN) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al tocar "Ver más" en la tarjeta de un partido finalizado, expandirla mostrando goleadores, tarjetas y 10 estadísticas (datos de la API pública de ESPN), con caché permanente en localStorage.

**Architecture:** Un script de generación produce un mapeo estático `id FIFA → id evento ESPN` (`js/espn-map.js`). Un módulo nuevo `js/match-detail.js` (patrón IIFE sobre `WC`, como `api.js`) hace un fetch al `summary` de ESPN, parsea/sanitiza un modelo compacto, lo cachea y lo renderiza dentro de la tarjeta. `app.js` solo agrega el botón y delega el click.

**Tech Stack:** Vanilla JS sin build, `node --test` para tests, API ESPN (`site.api.espn.com`, CORS `*`).

**Spec:** `docs/superpowers/specs/2026-06-11-detalle-partido-espn-design.md`

## Hechos verificados (11-JUN-2026, no re-investigar)

- Scoreboard rango completo: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200` → 200 OK, exactamente **104 eventos**.
- Summary: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=760415` (México 2-0 Sudáfrica) → `keyEvents` + `boxscore` con las 10 stats.
- CORS: `access-control-allow-origin: *` en ambos endpoints.
- Las abreviaturas ESPN de equipos reales coinciden 1:1 con los códigos FIFA del snapshot (MEX, RSA…). Solo difieren los placeholders de eliminatorias ("2A", "RD16 W1"), que no importan.
- Los 12 kickoffs con partidos simultáneos son todos de fase de grupos (equipos conocidos) → desempate por abreviaturas siempre posible. Eliminatorias: sin colisiones.
- Formato fecha ESPN: `"2026-06-11T19:00Z"`; snapshot FIFA: `"2026-06-11T19:00:00.000Z"`. Comparar con `Date.parse`.
- `keyEvents[]`: `type.text` (`"Goal"`, `"Yellow Card"`, `"Red Card"`…), `scoringPlay` (bool), `penaltyKick`/`ownGoal` (bool o null), `clock.displayValue` (`"9'"`, `"90'+2'"`), `team.id`, `participants[0].athlete.displayName` (goleador; `participants[1]` es el asistente — NO se usa).
- `boxscore.teams[]`: `homeAway` (`"home"`/`"away"`) y `statistics[]` con `{name, displayValue}`. Nombres exactos: `possessionPct`, `totalShots`, `shotsOnTarget`, `foulsCommitted`, `yellowCards`, `redCards`, `wonCorners`, `offsides`, `saves`, `accuratePasses`.
- `header.competitions[0].competitors[]`: `homeAway` + `team.id` → para mapear `team.id` de keyEvents a lado.
- CSP actual de `index.html` NO permite ESPN en `connect-src` — hay que agregarlo.
- `sw.js` no cachea assets (solo push) — no requiere cambios.
- Tema visual: claro (variables `--paper`, `--ink`, `--lime-deep`, `--blue`, `--line`, `--muted` en `:root` de `styles.css`).

---

### Task 1: Lógica de matching del generador (`buildEspnMap`)

**Files:**
- Create: `tools/generate-espn-map.js`
- Test: `tests/espn-map.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/espn-map.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { buildEspnMap } = require("../tools/generate-espn-map.js");

const TEAMS = {
  "43911": { id: "43911", code: "MEX" },
  "43883": { id: "43883", code: "RSA" },
  "43924": { id: "43924", code: "KOR" },
  "43950": { id: "43950", code: "CZE" }
};

function espnEvent(id, date, homeAbbr, awayAbbr) {
  return {
    id: id,
    date: date,
    competitions: [{
      competitors: [
        { homeAway: "home", team: { abbreviation: homeAbbr } },
        { homeAway: "away", team: { abbreviation: awayAbbr } }
      ]
    }]
  };
}

test("buildEspnMap: empareja por kickoff cuando es único", () => {
  const matches = [{ id: "400021443", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" }];
  const events = [espnEvent("760415", "2026-06-11T19:00Z", "MEX", "RSA")];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { "400021443": "760415" });
});

test("buildEspnMap: desempata partidos simultáneos por abreviaturas", () => {
  const matches = [
    { id: "f1", num: 53, date: "2026-06-25T01:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 54, date: "2026-06-25T01:00:00.000Z", home: "43924", away: "43950" }
  ];
  const events = [
    espnEvent("e2", "2026-06-25T01:00Z", "KOR", "CZE"),
    espnEvent("e1", "2026-06-25T01:00Z", "MEX", "RSA")
  ];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { f1: "e1", f2: "e2" });
});

test("buildEspnMap: eliminatoria sin equipos empareja por kickoff único", () => {
  const matches = [{ id: "f73", num: 73, date: "2026-06-28T19:00:00.000Z", home: null, away: null }];
  const events = [espnEvent("e73", "2026-06-28T19:00Z", "2A", "2B")];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { f73: "e73" });
});

test("buildEspnMap: lanza si un partido queda sin evento", () => {
  const matches = [{ id: "f1", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" }];
  assert.throws(() => buildEspnMap(matches, TEAMS, []), /sin evento ESPN/);
});

test("buildEspnMap: lanza si la colisión no se puede desempatar", () => {
  const matches = [
    { id: "f1", num: 53, date: "2026-06-25T01:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 54, date: "2026-06-25T01:00:00.000Z", home: "43924", away: "43950" }
  ];
  // dos eventos a la misma hora pero ninguno con MEX-RSA
  const events = [
    espnEvent("e1", "2026-06-25T01:00Z", "KOR", "CZE"),
    espnEvent("e2", "2026-06-25T01:00Z", "ARG", "BRA")
  ];
  assert.throws(() => buildEspnMap(matches, TEAMS, events), /no se pudo desempatar|sin evento ESPN/);
});

test("buildEspnMap: no reutiliza el mismo evento ESPN dos veces", () => {
  const matches = [
    { id: "f1", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 2, date: "2026-06-11T19:00:00.000Z", home: "43924", away: "43950" }
  ];
  const events = [espnEvent("e1", "2026-06-11T19:00Z", "MEX", "RSA")];
  assert.throws(() => buildEspnMap(matches, TEAMS, events));
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test tests/espn-map.test.js`
Expected: FAIL — `Cannot find module '../tools/generate-espn-map.js'`

- [ ] **Step 3: Implementar `tools/generate-espn-map.js`**

```js
// Uso: node tools/generate-espn-map.js
// Descarga el calendario del Mundial 2026 de ESPN y escribe js/espn-map.js
// (mapeo id partido FIFA -> id evento ESPN, para el detalle de finalizados).
const fs = require("fs");
const path = require("path");

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";

function eventTeams(ev) {
  const comps = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || [];
  const out = { home: null, away: null };
  comps.forEach(function (c) {
    if (c && (c.homeAway === "home" || c.homeAway === "away") && c.team) {
      out[c.homeAway] = c.team.abbreviation || null;
    }
  });
  return out;
}

// matches/teams: snapshot FIFA (js/data.js); events: scoreboard ESPN.
// Devuelve { idFifa: idEspn } o lanza si algo no cuadra.
function buildEspnMap(matches, teams, events) {
  const byKick = {};
  events.forEach(function (ev) {
    const ms = Date.parse(ev.date);
    if (!Number.isFinite(ms)) throw new Error("Evento ESPN " + ev.id + " sin fecha válida");
    (byKick[ms] = byKick[ms] || []).push(ev);
  });

  const used = {};
  const map = {};
  matches.forEach(function (m) {
    const candidates = (byKick[Date.parse(m.date)] || []).filter(function (ev) { return !used[ev.id]; });
    let pick = null;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else if (candidates.length > 1) {
      const homeCode = m.home && teams[m.home] ? teams[m.home].code : null;
      const awayCode = m.away && teams[m.away] ? teams[m.away].code : null;
      const matched = candidates.filter(function (ev) {
        const t = eventTeams(ev);
        return homeCode && awayCode && t.home === homeCode && t.away === awayCode;
      });
      if (matched.length !== 1) {
        throw new Error("Partido " + m.num + ": no se pudo desempatar entre " + candidates.length + " eventos ESPN simultáneos");
      }
      pick = matched[0];
    }
    if (!pick) throw new Error("Partido " + m.num + " (" + m.date + ") sin evento ESPN");
    used[pick.id] = true;
    map[m.id] = String(pick.id);
  });
  return map;
}

async function main() {
  // js/data.js es un script de navegador; extraer el JSON del snapshot.
  const dataJs = fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8");
  const snap = JSON.parse(dataJs.match(/WC\.SNAPSHOT = (.*);\n$/s)[1]);

  const res = await fetch(SCOREBOARD);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const events = (await res.json()).events || [];

  const map = buildEspnMap(snap.matches, snap.teams, events);
  const n = Object.keys(map).length;
  if (n !== 104) throw new Error("Esperaba 104 mapeos, hay " + n);

  const out = "// Generado por tools/generate-espn-map.js el " + new Date().toISOString() + " — no editar a mano.\n" +
    "window.WC = window.WC || {};\n" +
    "WC.ESPN_MAP = " + JSON.stringify(map) + ";\n";
  fs.writeFileSync(path.join(__dirname, "..", "js", "espn-map.js"), out);
  console.log("OK: " + n + " partidos mapeados → js/espn-map.js");
}

module.exports = { buildEspnMap: buildEspnMap, eventTeams: eventTeams };
if (require.main === module) main();
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test tests/espn-map.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Correr toda la suite**

Run: `node --test tests/`
Expected: PASS (19 existentes + 6 nuevos)

- [ ] **Step 6: Commit**

```bash
git add tools/generate-espn-map.js tests/espn-map.test.js
git commit -m "feat: generador de mapeo FIFA -> ESPN para detalle de partidos"
```

---

### Task 2: Generar `js/espn-map.js`

**Files:**
- Create: `js/espn-map.js` (generado)

- [ ] **Step 1: Ejecutar el generador**

Run: `node tools/generate-espn-map.js`
Expected: `OK: 104 partidos mapeados → js/espn-map.js`

- [ ] **Step 2: Verificación rápida del contenido**

Run: `node -e "const s=require('fs').readFileSync('js/espn-map.js','utf8'); const m=JSON.parse(s.match(/WC\.ESPN_MAP = (.*);\n$/s)[1]); console.log(Object.keys(m).length, m['400021443']);"`
Expected: `104 760415` (el id ESPN del México vs Sudáfrica)

- [ ] **Step 3: Commit**

```bash
git add js/espn-map.js
git commit -m "feat: mapeo estático de partidos FIFA a eventos ESPN"
```

---

### Task 3: Parser del summary (`parseSummary` en `js/match-detail.js`)

**Files:**
- Create: `js/match-detail.js`
- Test: `tests/match-detail.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/match-detail.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const detail = require("../js/match-detail.js");

// Fixture recortado del summary real de ESPN (evento 760415, MEX 2-0 RSA).
function fixture() {
  return {
    header: {
      competitions: [{
        competitors: [
          { homeAway: "home", team: { id: "203", abbreviation: "MEX" } },
          { homeAway: "away", team: { id: "467", abbreviation: "RSA" } }
        ]
      }]
    },
    keyEvents: [
      { type: { id: "129", text: "Kickoff" }, clock: { displayValue: "" }, team: {}, participants: [], scoringPlay: false },
      {
        type: { id: "70", text: "Goal" }, clock: { displayValue: "9'" }, team: { id: "203" },
        participants: [{ athlete: { displayName: "Julián Quiñones" } }, { athlete: { displayName: "Érik Lira" } }],
        scoringPlay: true, penaltyKick: null, ownGoal: null
      },
      {
        type: { id: "94", text: "Yellow Card" }, clock: { displayValue: "17'" }, team: { id: "467" },
        participants: [{ athlete: { displayName: "Teboho Mokoena" } }], scoringPlay: false
      },
      {
        type: { id: "93", text: "Red Card" }, clock: { displayValue: "49'" }, team: { id: "467" },
        participants: [{ athlete: { displayName: "Sphephelo Sithole" } }], scoringPlay: false
      },
      { // sustitución: se ignora
        type: { id: "76", text: "Substitution" }, clock: { displayValue: "56'" }, team: { id: "467" },
        participants: [{ athlete: { displayName: "Thalente Mbatha" } }], scoringPlay: false
      },
      {
        type: { id: "70", text: "Goal" }, clock: { displayValue: "90'+2'" }, team: { id: "203" },
        participants: [{ athlete: { displayName: "Raúl Jiménez" } }],
        scoringPlay: true, penaltyKick: true, ownGoal: null
      }
    ],
    boxscore: {
      teams: [
        {
          homeAway: "home", team: { id: "203" },
          statistics: [
            { name: "possessionPct", displayValue: "60.5" },
            { name: "totalShots", displayValue: "16" },
            { name: "shotsOnTarget", displayValue: "4" },
            { name: "foulsCommitted", displayValue: "12" },
            { name: "accuratePasses", displayValue: "467" }
          ]
        },
        {
          homeAway: "away", team: { id: "467" },
          statistics: [
            { name: "possessionPct", displayValue: "39.5" },
            { name: "totalShots", displayValue: "3" },
            { name: "shotsOnTarget", displayValue: "2" },
            { name: "foulsCommitted", displayValue: "11" },
            { name: "accuratePasses", displayValue: "272" }
          ]
        }
      ]
    }
  };
}

test("parseSummary: extrae goles y tarjetas por lado, ignora sustituciones y kickoff", () => {
  const m = detail.parseSummary(fixture());
  assert.deepStrictEqual(m.events.home, [
    { minute: "9'", name: "Julián Quiñones", kind: "goal" },
    { minute: "90'+2'", name: "Raúl Jiménez", kind: "pen" }
  ]);
  assert.deepStrictEqual(m.events.away, [
    { minute: "17'", name: "Teboho Mokoena", kind: "yellow" },
    { minute: "49'", name: "Sphephelo Sithole", kind: "red" }
  ]);
});

test("parseSummary: autogol se marca como og", () => {
  const f = fixture();
  f.keyEvents[1].ownGoal = true;
  f.keyEvents[1].penaltyKick = null;
  const m = detail.parseSummary(f);
  assert.strictEqual(m.events.home[0].kind, "og");
});

test("parseSummary: ignora eventos de tanda de penales (shootout)", () => {
  const f = fixture();
  f.keyEvents[1].shootout = true;
  const m = detail.parseSummary(f);
  assert.strictEqual(m.events.home.length, 1); // solo queda el gol del 90'+2'
});

test("parseSummary: stats en orden fijo, solo filas con ambos lados", () => {
  const m = detail.parseSummary(fixture());
  assert.deepStrictEqual(m.stats.map(s => s.key), [
    "possessionPct", "totalShots", "shotsOnTarget", "foulsCommitted", "accuratePasses"
  ]);
  const shots = m.stats.find(s => s.key === "totalShots");
  assert.deepStrictEqual(shots, { key: "totalShots", label: "Tiros", home: 16, away: 3 });
  const poss = m.stats.find(s => s.key === "possessionPct");
  assert.strictEqual(poss.home, 60.5);
  assert.strictEqual(poss.away, 39.5);
});

test("parseSummary: omite stat si falta en un lado", () => {
  const f = fixture();
  f.boxscore.teams[1].statistics = f.boxscore.teams[1].statistics.filter(s => s.name !== "totalShots");
  const m = detail.parseSummary(f);
  assert.strictEqual(m.stats.find(s => s.key === "totalShots"), undefined);
});

test("parseSummary: sanitiza minutos y nombres maliciosos, descarta inválidos", () => {
  const f = fixture();
  f.keyEvents[1].clock.displayValue = "9' onmouseover=alert(1)";
  f.keyEvents[2].participants[0].athlete.displayName = "Mokoena \u0000<script>";
  const m = detail.parseSummary(f);
  assert.strictEqual(m.events.home.length, 1); // gol con minuto inválido descartado
  assert.strictEqual(m.events.away[0].name, "Mokoena <script>"); // solo quita control chars; el escape HTML es del render
});

test("parseSummary: JSON vacío o malformado no lanza", () => {
  assert.deepStrictEqual(detail.parseSummary({}), { events: { home: [], away: [] }, stats: [] });
  assert.deepStrictEqual(detail.parseSummary(null), { events: { home: [], away: [] }, stats: [] });
  const sinHeader = { keyEvents: fixture().keyEvents, boxscore: fixture().boxscore };
  // sin header no hay lados: eventos vacíos, stats sí (vienen de boxscore.homeAway)
  const m = detail.parseSummary(sinHeader);
  assert.deepStrictEqual(m.events, { home: [], away: [] });
  assert.strictEqual(m.stats.length, 5);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test tests/match-detail.test.js`
Expected: FAIL — `Cannot find module '../js/match-detail.js'`

- [ ] **Step 3: Implementar el parser en `js/match-detail.js`**

```js
(function (root) {
  const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";
  const CACHE_PREFIX = "wc26-detail-v1:";
  // [clave ESPN, etiqueta] en orden de render; posesión se dibuja como barra.
  const STATS = [
    ["possessionPct", "Posesión"],
    ["totalShots", "Tiros"],
    ["shotsOnTarget", "Al arco"],
    ["foulsCommitted", "Faltas"],
    ["yellowCards", "Amarillas"],
    ["redCards", "Rojas"],
    ["wonCorners", "Córners"],
    ["offsides", "Offsides"],
    ["saves", "Atajadas"],
    ["accuratePasses", "Pases buenos"]
  ];

  function safeText(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) : "";
  }

  function safeMinute(value) {
    const v = typeof value === "string" ? value : "";
    return /^[0-9]{1,3}'(?:\+[0-9]{1,2}')?$/.test(v) ? v : null;
  }

  function safeNum(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : null;
  }

  function sideByTeamId(json) {
    const out = {};
    const comps = (((json.header || {}).competitions || [])[0] || {}).competitors || [];
    comps.forEach(function (c) {
      if (c && (c.homeAway === "home" || c.homeAway === "away") && c.team && c.team.id != null) {
        out[String(c.team.id)] = c.homeAway;
      }
    });
    return out;
  }

  function eventKind(ev) {
    if (ev.shootout === true) return null;
    if (ev.scoringPlay === true) {
      if (ev.ownGoal === true) return "og";
      if (ev.penaltyKick === true) return "pen";
      return "goal";
    }
    const text = (ev.type || {}).text || "";
    if (text === "Yellow Card") return "yellow";
    if (text === "Red Card") return "red";
    return null;
  }

  function parseEvents(json, sides) {
    const events = { home: [], away: [] };
    const list = Array.isArray(json.keyEvents) ? json.keyEvents : [];
    list.forEach(function (ev) {
      if (!ev) return;
      const side = sides[String((ev.team || {}).id)];
      if (!side) return;
      const kind = eventKind(ev);
      if (!kind) return;
      const minute = safeMinute((ev.clock || {}).displayValue);
      const first = (Array.isArray(ev.participants) ? ev.participants : [])[0];
      const name = safeText(first && first.athlete && first.athlete.displayName);
      if (!minute || !name) return;
      events[side].push({ minute: minute, name: name, kind: kind });
    });
    return events;
  }

  function parseStats(json) {
    const teams = ((json.boxscore || {}).teams) || [];
    const bySide = {};
    teams.forEach(function (t) {
      if (!t || (t.homeAway !== "home" && t.homeAway !== "away")) return;
      const vals = {};
      (Array.isArray(t.statistics) ? t.statistics : []).forEach(function (s) {
        if (s && typeof s.name === "string") vals[s.name] = safeNum(s.displayValue);
      });
      bySide[t.homeAway] = vals;
    });
    if (!bySide.home || !bySide.away) return [];
    const rows = [];
    STATS.forEach(function (def) {
      const home = bySide.home[def[0]];
      const away = bySide.away[def[0]];
      if (home == null || away == null) return;
      rows.push({ key: def[0], label: def[1], home: home, away: away });
    });
    return rows;
  }

  function parseSummary(json) {
    json = json && typeof json === "object" ? json : {};
    return { events: parseEvents(json, sideByTeamId(json)), stats: parseStats(json) };
  }

  const api = { parseSummary: parseSummary, STATS: STATS };
  root.WC = root.WC || {};
  root.WC.matchDetail = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test tests/match-detail.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add js/match-detail.js tests/match-detail.test.js
git commit -m "feat: parser del summary ESPN (eventos y stats del partido)"
```

---

### Task 4: Render, fetch y caché en `js/match-detail.js`

**Files:**
- Modify: `js/match-detail.js`
- Test: `tests/match-detail.test.js`

- [ ] **Step 1: Escribir los tests del render que fallan**

Agregar al final de `tests/match-detail.test.js`:

```js
test("renderDetail: eventos con icono, posesión como barra y filas de stats", () => {
  const html = detail.renderDetail({
    events: {
      home: [{ minute: "9'", name: "Julián Quiñones", kind: "goal" }],
      away: [{ minute: "49'", name: "Sphephelo Sithole", kind: "red" }]
    },
    stats: [
      { key: "possessionPct", label: "Posesión", home: 60.5, away: 39.5 },
      { key: "totalShots", label: "Tiros", home: 16, away: 3 }
    ]
  });
  assert.ok(html.includes("9'"));
  assert.ok(html.includes("Julián Quiñones"));
  assert.ok(html.includes("⚽"));
  assert.ok(html.includes("🟥"));
  assert.ok(html.includes("60.5%"));
  assert.ok(html.includes('width:60.5%'));
  assert.ok(html.includes("Tiros"));
  assert.ok(!html.includes("possessionPct")); // la posesión va como barra, no como fila
});

test("renderDetail: escapa HTML en nombres", () => {
  const html = detail.renderDetail({
    events: { home: [{ minute: "9'", name: '<img src=x onerror=alert(1)>', kind: "goal" }], away: [] },
    stats: []
  });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("renderDetail: goles de penal y autogol llevan sufijo", () => {
  const html = detail.renderDetail({
    events: {
      home: [{ minute: "10'", name: "A", kind: "pen" }],
      away: [{ minute: "20'", name: "B", kind: "og" }]
    },
    stats: []
  });
  assert.ok(html.includes("(P)"));
  assert.ok(html.includes("(AG)"));
});

test("renderDetail: modelo vacío produce mensaje de sin datos", () => {
  const html = detail.renderDetail({ events: { home: [], away: [] }, stats: [] });
  assert.ok(html.includes("Sin detalle disponible"));
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/match-detail.test.js`
Expected: FAIL — `detail.renderDetail is not a function`

- [ ] **Step 3: Implementar render + fetch + caché + toggle**

En `js/match-detail.js`, agregar después de `parseSummary` (y antes de `const api = ...`):

```js
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  const ICONS = { goal: "⚽", pen: "⚽", og: "⚽", yellow: "🟨", red: "🟥" };
  const SUFFIX = { pen: " (P)", og: " (AG)" };

  function eventLine(ev) {
    return '<li><span class="ev-min">' + esc(ev.minute) + "</span> " + ICONS[ev.kind] + " " +
      esc(ev.name) + (SUFFIX[ev.kind] || "") + "</li>";
  }

  function renderDetail(model) {
    const hasEvents = model.events.home.length || model.events.away.length;
    if (!hasEvents && !model.stats.length) {
      return '<p class="detail-empty">Sin detalle disponible para este partido.</p>';
    }
    let html = "";
    if (hasEvents) {
      html += '<div class="detail-events">' +
        '<ul class="detail-col">' + model.events.home.map(eventLine).join("") + "</ul>" +
        '<ul class="detail-col away">' + model.events.away.map(eventLine).join("") + "</ul>" +
        "</div>";
    }
    const poss = model.stats.find(function (s) { return s.key === "possessionPct"; });
    if (poss) {
      html += '<div class="detail-row poss"><b>' + esc(poss.home) + '%</b><span>Posesión</span><b>' + esc(poss.away) + "%</b></div>" +
        '<div class="poss-bar"><i style="width:' + esc(poss.home) + '%"></i></div>';
    }
    html += model.stats.filter(function (s) { return s.key !== "possessionPct"; }).map(function (s) {
      return '<div class="detail-row"><b>' + esc(s.home) + "</b><span>" + esc(s.label) + "</span><b>" + esc(s.away) + "</b></div>";
    }).join("");
    return html;
  }

  function readCache(matchId) {
    try {
      const model = JSON.parse(localStorage.getItem(CACHE_PREFIX + matchId));
      return model && model.events && Array.isArray(model.stats) ? model : null;
    } catch (e) { return null; }
  }

  function writeCache(matchId, model) {
    try { localStorage.setItem(CACHE_PREFIX + matchId, JSON.stringify(model)); } catch (e) { /* Safari privado */ }
  }

  async function fetchDetail(espnId) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      const res = await fetch(SUMMARY_URL + encodeURIComponent(espnId), { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return parseSummary(await res.json());
    } finally { clearTimeout(t); }
  }

  async function loadInto(matchId, panel) {
    const espnId = (root.WC.ESPN_MAP || {})[matchId];
    if (!espnId) { panel.innerHTML = '<p class="detail-empty">Sin detalle disponible para este partido.</p>'; return; }
    const cached = readCache(matchId);
    if (cached) { panel.innerHTML = renderDetail(cached); return; }
    panel.innerHTML = '<p class="detail-empty">Cargando…</p>';
    try {
      const model = await fetchDetail(espnId);
      writeCache(matchId, model);
      panel.innerHTML = renderDetail(model);
    } catch (e) {
      panel.innerHTML = '<p class="detail-empty">No se pudo cargar el detalle. ' +
        '<button type="button" class="detail-retry" data-detail-retry="' + esc(matchId) + '">Reintentar</button></p>';
    }
  }

  // btn: el botón "Ver más" dentro de la tarjeta; el panel es su hermano siguiente.
  function toggle(matchId, btn) {
    const panel = btn.nextElementSibling;
    if (!panel || !panel.classList.contains("match-detail")) return;
    const open = !panel.hidden;
    panel.hidden = open;
    btn.textContent = open ? "Ver más" : "Ver menos";
    if (!open) loadInto(matchId, panel);
  }

  function retry(matchId, retryBtn) {
    loadInto(matchId, retryBtn.closest(".match-detail"));
  }
```

Y reemplazar la línea `const api = ...` por:

```js
  const api = { parseSummary: parseSummary, renderDetail: renderDetail, toggle: toggle, retry: retry, STATS: STATS };
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test tests/match-detail.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Correr toda la suite**

Run: `node --test tests/`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add js/match-detail.js tests/match-detail.test.js
git commit -m "feat: render, fetch y caché del detalle de partido"
```

---

### Task 5: Integración — `app.js`, `index.html` (CSP + scripts), `styles.css`

**Files:**
- Modify: `js/app.js` (función `matchCard` ~línea 104 y listeners ~línea 300)
- Modify: `index.html` (CSP línea 6, scripts líneas 345-350)
- Modify: `styles.css` (después del bloque `.match-bottom`, ~línea 196)

- [ ] **Step 1: Botón y panel en `matchCard` (js/app.js)**

En `matchCard(m)`, reemplazar el `return` actual:

```js
    return '<article class="match-card ' + m.status + '">' +
      '<div class="match-meta"><span>' + dayLocal(m.date) + " · " + stageLabel(m) + '</span><span>' + timeLocal(m.date) + " tu hora</span></div>" +
      teamRowHtml(m, "home") + teamRowHtml(m, "away") +
      '<div class="match-bottom"><strong>' + pens + esc(m.city) + '</strong><span class="status-' + m.status + '">' + statusTxt + "</span></div></article>";
```

por:

```js
    const hasDetail = m.status === "played" && WC.ESPN_MAP && WC.ESPN_MAP[m.id];
    const detailHtml = hasDetail
      ? '<button type="button" class="detail-toggle" data-detail="' + esc(m.id) + '">Ver más</button><div class="match-detail" hidden></div>'
      : "";
    return '<article class="match-card ' + m.status + '">' +
      '<div class="match-meta"><span>' + dayLocal(m.date) + " · " + stageLabel(m) + '</span><span>' + timeLocal(m.date) + " tu hora</span></div>" +
      teamRowHtml(m, "home") + teamRowHtml(m, "away") +
      '<div class="match-bottom"><strong>' + pens + esc(m.city) + '</strong><span class="status-' + m.status + '">' + statusTxt + "</span></div>" +
      detailHtml + "</article>";
```

- [ ] **Step 2: Delegación de clicks en la grilla (js/app.js)**

Junto a los listeners existentes (cerca del de `.match-tabs`, ~línea 300), agregar:

```js
  matchesGrid.addEventListener("click", function (event) {
    const retryBtn = event.target.closest("[data-detail-retry]");
    if (retryBtn) { WC.matchDetail.retry(retryBtn.dataset.detailRetry, retryBtn); return; }
    const btn = event.target.closest("[data-detail]");
    if (btn) WC.matchDetail.toggle(btn.dataset.detail, btn);
  });
```

- [ ] **Step 3: CSP y scripts (index.html)**

En la línea 6, dentro de `connect-src`, agregar ESPN:

```
connect-src 'self' https://api.fifa.com https://site.api.espn.com https://wwzgpifvfmogjttwstxy.supabase.co;
```

En el bloque de scripts, después de `js/api.js` agregar (y bump de versión en `js/app.js`):

```html
  <script src="js/espn-map.js?v=20260611m"></script>
  <script src="js/match-detail.js?v=20260611m"></script>
```

y cambiar `js/app.js?v=20260611k` → `js/app.js?v=20260611m` y
`styles.css?v=20260611k` (línea 28) → `styles.css?v=20260611m`.

- [ ] **Step 4: Estilos (styles.css)**

Después del bloque `.match-bottom span` (~línea 196), agregar:

```css
.detail-toggle { margin-top: 12px; width: 100%; border: 1px solid var(--line); background: var(--paper-bright); color: var(--ink); font: inherit; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; padding: 7px 0; border-radius: 8px; cursor: pointer; }
.detail-toggle:hover { border-color: var(--lime-deep); }
.match-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; }
.detail-events { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.detail-col { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.detail-col.away { text-align: right; }
.detail-col .ev-min { color: var(--muted); font-weight: 800; font-size: 10px; }
.detail-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line); }
.detail-row:last-child { border-bottom: 0; }
.detail-row b:first-child { text-align: left; }
.detail-row span { color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; }
.detail-row b:last-child { text-align: right; }
.detail-row.poss { border-bottom: 0; padding-bottom: 2px; }
.poss-bar { height: 6px; border-radius: 3px; background: var(--blue); overflow: hidden; margin-bottom: 10px; }
.poss-bar i { display: block; height: 100%; background: var(--lime-deep); }
.detail-empty { color: var(--muted); margin: 0; }
.detail-retry { border: 0; background: none; color: var(--ink); font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; }
```

- [ ] **Step 5: Correr toda la suite (smoke de que nada se rompió)**

Run: `node --test tests/`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add js/app.js index.html styles.css
git commit -m "feat: detalle expandible en tarjetas de partidos finalizados"
```

---

### Task 6: Verificación manual en navegador

**Files:** ninguno (verificación)

- [ ] **Step 1: Levantar servidor en puerto NUEVO**

El navegador de Playwright cachea JS agresivamente — usar siempre un puerto que no se haya usado antes en la sesión.

Run: `python3 -m http.server 8744 --directory . &`

- [ ] **Step 2: Verificar con el navegador (Playwright/preview)**

1. Abrir `http://localhost:8744`.
2. En la sección de partidos, filtro "Resultados" → debe verse la tarjeta México 2-0 Sudáfrica con botón "Ver más".
3. Click en "Ver más" → aparece el detalle: Quiñones 9' ⚽, Jiménez 67' ⚽ (lado México); Mokoena 17' 🟨, Sithole 49' 🟥, Sibisi 74' 🟨, Zwane 84' 🟥 (lado Sudáfrica); Gutiérrez 23' 🟨 y Montes 90'+2' 🟥 (México); barra de posesión 60.5/39.5 y filas: Tiros 16-3, Al arco 4-2, Faltas 12-11, Amarillas 1-2, Rojas 1-2, Córners 3-1, Offsides 1-1, Atajadas 2-2, Pases buenos 467-272.
4. Sin errores de CSP ni de red en consola.
5. Click "Ver menos" → colapsa. Reabrir → instantáneo (caché, sin nuevo request).
6. Tarjetas programadas (p. ej. Corea del Sur vs República Checa) NO muestran "Ver más".
7. Screenshot del detalle abierto para el usuario.

- [ ] **Step 3: Matar el servidor**

Run: `kill %1`

---

## Notas para el ejecutor

- NO tocar `js/api.js`, `js/data.js` ni el flujo FIFA existente.
- El módulo sigue el patrón IIFE + `module.exports` condicional de `js/api.js` para ser testeable en node sin DOM.
- `localStorage` solo se toca dentro de `readCache`/`writeCache` con try/catch (Safari privado).
- Si `node tools/generate-espn-map.js` fallara (ESPN cambió algo), el feature degrada solo: sin entrada en `ESPN_MAP` no se muestra el botón.
