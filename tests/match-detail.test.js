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

test("renderDetail: caché manipulada no inyecta HTML por minute ni por posesión", () => {
  const html = detail.renderDetail({
    events: { home: [{ minute: "9'<img src=x onerror=alert(1)>", name: "A", kind: "goal" }], away: [] },
    stats: [{ key: "possessionPct", label: "Posesión", home: '60"><script>alert(1)</script>', away: 39.5 }]
  });
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
});

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
