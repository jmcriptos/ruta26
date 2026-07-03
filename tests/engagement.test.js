const test = require("node:test");
const assert = require("node:assert");
const eng = require("../js/engagement.js");

/* ---------- base pura (Story 1.2) ---------- */

test("engagement: expone los 5 view models", () => {
  ["opportunity", "liveTension", "predictionGroups", "postMatchSummary", "whatsappShare"].forEach(function (k) {
    assert.strictEqual(typeof eng[k], "function", k);
  });
});

test("engagement: degrada seguro ante datos faltantes", () => {
  assert.strictEqual(eng.opportunity(null), null);
  assert.strictEqual(eng.opportunity({ meId: null }), null);
  assert.deepStrictEqual(eng.liveTension({}), { state: "fallback", message: null, me: null, rows: [] });
  assert.deepStrictEqual(eng.predictionGroups({}, "m1"), { state: "empty", matchId: "m1", groups: [] });
  assert.strictEqual(eng.postMatchSummary({}), null);
  assert.strictEqual(eng.whatsappShare(null, {}), null);
});

/* ---------- Oportunidad pre-partido (Story 1.3) ---------- */
const oppFixture = require("./fixtures/engagement/pre-match-opportunity.json");

test("opportunity: prioridad determinística (fixture pre-match-opportunity)", () => {
  oppFixture.cases.forEach(function (c) {
    const vm = eng.opportunity(c.snapshot);
    const e = c.expect;
    assert.strictEqual(vm.state, e.state, c.name + " · state");
    if (e.reason != null) assert.strictEqual(vm.reason, e.reason, c.name + " · reason");
    if (e.matchId != null) assert.strictEqual(vm.match && vm.match.id, e.matchId, c.name + " · matchId");
    if (e.actionLabel != null) assert.strictEqual(vm.primaryAction && vm.primaryAction.label, e.actionLabel, c.name + " · action");
    if (e.rivalUsername != null) assert.strictEqual(vm.rival && vm.rival.username, e.rivalUsername, c.name + " · rival");
  });
});

/* ---------- tensión live + pronósticos compactos (Story 1.4) ---------- */
const liveFixture = require("./fixtures/engagement/live-ranking-social.json");
const groupsFixture = require("./fixtures/engagement/post-lock-predictions.json");

test("liveTension: personal > grupal > fallback (fixture)", () => {
  liveFixture.cases.forEach(function (c) {
    const vm = eng.liveTension(c.snapshot);
    assert.strictEqual(vm.state, c.expect.state, c.name + " · state");
    if (c.expect.mePos != null) assert.strictEqual(vm.me && vm.me.pos, c.expect.mePos, c.name + " · mePos");
    if (c.expect.meDelta != null) assert.strictEqual(vm.me && vm.me.delta, c.expect.meDelta, c.name + " · meDelta");
    if (c.expect.state === "personal") assert.ok(vm.message && vm.message.length, c.name + " · message");
  });
});

test("predictionGroups: agrupa visibles, empty si no (fixture)", () => {
  groupsFixture.cases.forEach(function (c) {
    const vm = eng.predictionGroups(c.snapshot, c.matchId);
    assert.strictEqual(vm.state, c.expect.state, c.name + " · state");
    if (c.expect.groups) {
      assert.strictEqual(vm.groups.length, c.expect.groups.length, c.name + " · groups len");
      c.expect.groups.forEach(function (g, i) {
        assert.strictEqual(vm.groups[i].outcome, g.outcome, c.name + " · outcome " + i);
        assert.strictEqual(vm.groups[i].count, g.count, c.name + " · count " + i);
      });
    }
  });
});

/* ---------- resumen post-partido + share (Story 1.5) ---------- */
const postFixture = require("./fixtures/engagement/post-match-summary.json");
const shareFixture = require("./fixtures/engagement/share-model.json");

test("postMatchSummary: movimiento social y null si nada relevante (fixture)", () => {
  postFixture.cases.forEach(function (c) {
    const vm = eng.postMatchSummary(c.snapshot, c.before, c.after);
    if (c.expect.null) { assert.strictEqual(vm, null, c.name); return; }
    assert.strictEqual(vm.state, c.expect.state, c.name + " · state");
    assert.strictEqual(vm.movement, c.expect.movement, c.name + " · movement");
    assert.strictEqual(vm.posDelta, c.expect.posDelta, c.name + " · posDelta");
    if (c.expect.passedFirst) assert.strictEqual(vm.passed[0], c.expect.passedFirst, c.name + " · passed");
    if (c.expect.passedByFirst) assert.strictEqual(vm.passedBy[0], c.expect.passedByFirst, c.name + " · passedBy");
  });
});

test("whatsappShare: hechos visibles + enlace, null sin resumen (fixture)", () => {
  shareFixture.cases.forEach(function (c) {
    const text = eng.whatsappShare(c.summary, c.snapshot);
    if (c.expectNull) { assert.strictEqual(text, null, c.name); return; }
    c.expectContains.forEach(function (frag) {
      assert.ok(text.indexOf(frag) >= 0, c.name + " · contiene «" + frag + "»");
    });
  });
});

test("opportunity: ignora partidos sin equipos definidos (r32 con cruce por definir)", () => {
  const snapshot = {
    now: 0, meId: "u1",
    matches: [{ id: "r1", stage: "r32", status: "scheduled", kickoff_at: "2026-06-28T22:00:00Z", home: null, away: null }],
    myPredictions: {}, myCaptains: [],
    official: [{ userId: "u1", username: "ana", points: 5, pos: 1 }],
    teams: {}
  };
  // sin partido nombrable ni rival cercano → fallback (no nudge "el partido")
  assert.strictEqual(eng.opportunity(snapshot).state, "fallback");
});

/* ---------- enriquecimiento estilo broadcast (mockups) ---------- */

test("liveTension: nombra al rival vecino (pasas a / te pasa)", () => {
  // subo: el de justo debajo es a quien paso
  const up = eng.liveTension({ meId: "u1", matches: [{ id: "m1", status: "live" }], live: [
    { userId: "u1", username: "ana", pos: 2, delta: 1, livePoints: 3 },
    { userId: "u2", username: "beto", pos: 3, delta: -1, livePoints: 0 }
  ] });
  assert.strictEqual(up.state, "personal");
  assert.ok(up.rival && up.rival.username === "beto", "rival = vecino de abajo");
  assert.ok(up.message.indexOf("beto") >= 0 && up.message.indexOf("pasas") >= 0, "copy nombra al rival");
  // bajo: el de justo encima es quien me pasa
  const down = eng.liveTension({ meId: "u1", matches: [{ id: "m1", status: "live" }], live: [
    { userId: "u2", username: "beto", pos: 1, delta: 1, livePoints: 3 },
    { userId: "u1", username: "ana", pos: 2, delta: -1, livePoints: 0 }
  ] });
  assert.strictEqual(down.rival.username, "beto");
  assert.ok(down.message.indexOf("te pasa") >= 0, "copy de te pasa");
});

test("postMatchSummary: expone subtítulo, rival y puntos para la tarjeta", () => {
  const vm = eng.postMatchSummary(
    { meId: "u1" },
    [{ userId: "u0", username: "lider", pos: 1, points: 10 }, { userId: "u1", username: "ana", pos: 2, points: 5 }],
    [{ userId: "u1", username: "ana", pos: 1, points: 12 }, { userId: "u0", username: "lider", pos: 2, points: 10 }]
  );
  assert.strictEqual(vm.movement, "passed_friend");
  assert.strictEqual(vm.rival, "lider");
  assert.ok(vm.subtitle && vm.subtitle.length, "subtítulo presente");
  assert.strictEqual(vm.mePoints, 12);
  // ganó puntos sin moverse → subtítulo de "sigues sumando"
  const flat = eng.postMatchSummary(
    { meId: "u1" },
    [{ userId: "u1", username: "ana", pos: 1, points: 5 }, { userId: "u2", username: "b", pos: 2, points: 3 }],
    [{ userId: "u1", username: "ana", pos: 1, points: 8 }, { userId: "u2", username: "b", pos: 2, points: 3 }]
  );
  assert.strictEqual(flat.movement, "none");
  assert.strictEqual(flat.scope, "match");
  assert.ok(flat.social.indexOf("Sumaste puntos") >= 0, "titular humano antes del cálculo");
  assert.ok(flat.points.indexOf("este partido") >= 0, "evidencia de puntos habla del partido");
  assert.ok(flat.subtitle && flat.subtitle.length, "subtítulo en movement none");

  const matchday = eng.postMatchSummary(
    { meId: "u1", summaryScope: "matchday" },
    [{ userId: "u1", username: "ana", pos: 1, points: 5 }, { userId: "u2", username: "b", pos: 2, points: 3 }],
    [{ userId: "u1", username: "ana", pos: 1, points: 7 }, { userId: "u2", username: "b", pos: 2, points: 3 }]
  );
  assert.strictEqual(matchday.movement, "none");
  assert.strictEqual(matchday.scope, "matchday");
  assert.ok(matchday.social.indexOf("jornada") >= 0, "titular social de jornada");
  assert.ok(matchday.points.indexOf("esta jornada") >= 0, "jornada con varios partidos no se atribuye a un partido");
});

test("opportunity: arma chips (gap, rival, capitán) desde datos", () => {
  const snapshot = {
    now: 0, meId: "u1",
    matches: [
      { id: "m1", stage: "group", status: "scheduled", kickoff_at: "2026-06-28T22:00:00Z", home: "t1", away: "t2" },
      { id: "m2", stage: "group", status: "scheduled", kickoff_at: "2026-06-28T23:00:00Z", home: "t1", away: "t2" }
    ],
    myPredictions: { m1: { hg: 1, ag: 0 }, m2: { hg: 1, ag: 0 } }, myCaptains: [],
    matchPotentials: { m1: 1, m2: 1 },
    official: [{ userId: "u0", username: "lider", points: 7, pos: 1 }, { userId: "u1", username: "ana", points: 5, pos: 2 }],
    teams: { t1: { name: "Brasil", group: "A" }, t2: { name: "España", group: "B" } }
  };
  const vm = eng.opportunity(snapshot);
  assert.strictEqual(vm.state, "reachable_rival");
  assert.ok(Array.isArray(vm.chips) && vm.chips.length >= 2, "tiene chips");
  assert.ok(vm.chips.some(function (c) { return c.indexOf("lider") >= 0; }), "chip con rival");
});

test("opportunity: no promete pasar a un rival fuera del potencial de la jornada", () => {
  const snapshot = {
    now: 0, meId: "u1",
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2026-06-28T22:00:00Z", home: "t1", away: "t2" }],
    myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    matchPotentials: { m1: 1 },
    official: [{ userId: "u0", username: "lider", points: 8, pos: 1 }, { userId: "u1", username: "ana", points: 5, pos: 2 }],
    teams: { t1: { name: "Brasil" }, t2: { name: "España" } }
  };
  const vm = eng.opportunity(snapshot);
  assert.notStrictEqual(vm.state, "reachable_rival");
  assert.notStrictEqual(vm.copy && vm.copy.headline, "Hoy puedes pasar a lider");
});

test("opportunity: el batacazo es UNO POR JORNADA (día), no por partido", () => {
  // Dos KO el mismo día en Curaçao (UTC-4): 22:00Z=18:00 y 23:30Z=19:30 → 2026-07-03.
  const matches = [
    { id: "kA", stage: "r16", status: "scheduled", kickoff_at: "2026-07-03T22:00:00Z", home: "t1", away: "t2" },
    { id: "kB", stage: "r16", status: "scheduled", kickoff_at: "2026-07-03T23:30:00Z", home: "t1", away: "t2" }
  ];
  const teams = { t1: { name: "Brasil" }, t2: { name: "España" } };
  const base = {
    now: 0, meId: "u1", matches: matches, teams: teams,
    myPredictions: { kA: { hg: 1, ag: 0 }, kB: { hg: 1, ag: 0 } },
    official: [{ userId: "u1", username: "ana", points: 0, pos: 1 }]
  };
  // Sin batacazo ese día → SÍ hay oportunidad de batacazo.
  assert.strictEqual(eng.opportunity(Object.assign({}, base, { myCaptains: [] })).state, "captain");
  // Ya marcó su batacazo en kA (mismo día) → NO debe ofrecerlo en kB.
  const vm = eng.opportunity(Object.assign({}, base, { myCaptains: [{ match_id: "kA" }] }));
  assert.notStrictEqual(vm.state, "captain");
});

test("opportunity: sin partidos decididos no dispara rival_threat/reachable_rival", () => {
  const official = [
    { userId: "me", username: "yo", points: 0, decided: 0, exact: 0, pos: 1 },
    { userId: "ot", username: "otro", points: 0, decided: 0, exact: 0, pos: 1 }
  ];
  const snap = {
    now: 0, meId: "me", official: official, live: [],
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2999-01-01T00:00:00Z", home: "1", away: "2" }],
    matchPotentials: { m1: 3 }, myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    visiblePredictions: [], teams: { "1": { name: "A" }, "2": { name: "B" } }
  };
  const opp = eng.opportunity(snap);
  assert.ok(opp.reason !== "rival_threat" && opp.reason !== "reachable_rival");
});

test("opportunity: con partidos decididos y gap chico sí dispara rival_threat", () => {
  const official = [
    { userId: "me", username: "yo", points: 5, decided: 4, exact: 1, pos: 1 },
    { userId: "ot", username: "otro", points: 3, decided: 4, exact: 0, pos: 2 }
  ];
  const snap = {
    now: 0, meId: "me", official: official, live: [],
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2999-01-01T00:00:00Z", home: "1", away: "2" }],
    matchPotentials: { m1: 3 }, myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    visiblePredictions: [], teams: { "1": { name: "A" }, "2": { name: "B" } }
  };
  const opp = eng.opportunity(snap);
  assert.strictEqual(opp.reason, "rival_threat");
  assert.strictEqual(opp.rival.username, "otro");
});

test("opportunity: empatado con el de arriba → reachable_rival (perseguir), no amenaza", () => {
  // yo (pos 2) empatado con el líder arriba y con un perseguidor 1 pt abajo:
  // debe ganar la OPORTUNIDAD (hoy puedes pasar al líder), no la amenaza.
  const official = [
    { userId: "a", username: "lider", points: 5, decided: 4, exact: 1, pos: 1 },
    { userId: "me", username: "yo", points: 5, decided: 4, exact: 1, pos: 1 },
    { userId: "b", username: "perseguidor", points: 4, decided: 4, exact: 0, pos: 3 }
  ];
  const snap = {
    now: 0, meId: "me", official: official, live: [],
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2999-01-01T00:00:00Z", home: "1", away: "2" }],
    matchPotentials: { m1: 3 }, myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    visiblePredictions: [], teams: { "1": { name: "A" }, "2": { name: "B" } }
  };
  const opp = eng.opportunity(snap);
  assert.strictEqual(opp.reason, "reachable_rival");
  assert.strictEqual(opp.rival.username, "lider");
  assert.strictEqual(opp.rival.pointsGap, 0);
});

/* ---------- livePickView ---------- */

test("livePickView: sin pick o pick incompleto → null", () => {
  assert.strictEqual(eng.livePickView(null, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView(undefined, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView({ hg: null, ag: 1 }, { stage: "r16" }), null);
  assert.strictEqual(eng.livePickView({ hg: 2, ag: null }, { stage: "group" }), null);
});

test("livePickView: KO con ganador en el marcador → advSide del ganador", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 2, ag: 1, adv: null }, { stage: "r16" }),
    { score: "2-1", advSide: "home" });
  assert.deepStrictEqual(eng.livePickView({ hg: 0, ag: 3, adv: null }, { stage: "qf" }),
    { score: "0-3", advSide: "away" });
});

test("livePickView: empate KO con avance elegido → advSide", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "away" }, { stage: "r16" }),
    { score: "1-1", advSide: "away" });
  assert.deepStrictEqual(eng.livePickView({ hg: 0, ag: 0, adv: "home" }, { stage: "final" }),
    { score: "0-0", advSide: "home" });
});

test("livePickView: con ganador en el marcador manda el marcador, no adv", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 2, ag: 0, adv: "away" }, { stage: "qf" }),
    { score: "2-0", advSide: "home" });
});

test("livePickView: sin lado de avance en grupos o con adv basura", () => {
  assert.deepStrictEqual(eng.livePickView({ hg: 2, ag: 1, adv: null }, { stage: "group" }),
    { score: "2-1", advSide: null });
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "home" }, { stage: "group" }),
    { score: "1-1", advSide: null });
  assert.deepStrictEqual(eng.livePickView({ hg: 1, ag: 1, adv: "banana" }, { stage: "r16" }),
    { score: "1-1", advSide: null });
});
