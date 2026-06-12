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
