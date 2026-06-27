const test = require("node:test");
const assert = require("node:assert");
const st = require("../js/standings.js");

// Builders de fixtures
function gm(num, group, home, away, hs, as) {
  return { id: "m" + num, num: num, stage: "group", group: group, date: "2026-06-11T19:00:00Z",
    city: "", stadium: "", home: home, away: away, phA: null, phB: null,
    hs: hs, as: as, hp: null, ap: null,
    status: hs == null ? "scheduled" : "played",
    winner: hs == null ? null : (hs > as ? home : (as > hs ? away : null)) };
}
function makeTeams(spec) { // spec: { A: ["t1","t2","t3","t4"], ... }
  const teams = {};
  Object.keys(spec).forEach(function (g) {
    spec[g].forEach(function (id) { teams[id] = { id: id, code: id.toUpperCase(), name: id, flag: "", group: g, host: false }; });
  });
  return teams;
}

test("computeGroups: puntos, orden y desempates", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const matches = [
    gm(1, "A", "a1", "a2", 2, 0),   // a1 gana
    gm(2, "A", "a3", "a4", 1, 1),   // empate
    gm(3, "A", "a1", "a3", 0, 0),   // empate
    gm(4, "A", "a2", "a4", 0, 3)    // a4 gana
  ];
  const tables = st.computeGroups(matches, teams);
  const ids = tables.A.map(function (r) { return r.teamId; });
  // a1: 4pts dg+2 | a4: 4pts dg+3 | a3: 2pts | a2: 0pts → a4 1º por DG
  assert.deepStrictEqual(ids, ["a4", "a1", "a3", "a2"]);
  assert.strictEqual(tables.A[0].pts, 4);
  assert.strictEqual(tables.A[0].dg, 3);
  assert.strictEqual(tables.A[1].pj, 2);
  // ganados/empatados/perdidos
  const a1 = tables.A.find(function (r) { return r.teamId === "a1"; }); // ganó 1, empató 1
  assert.deepStrictEqual({ pg: a1.pg, pe: a1.pe, pp: a1.pp }, { pg: 1, pe: 1, pp: 0 });
  const a2 = tables.A.find(function (r) { return r.teamId === "a2"; }); // perdió 2
  assert.deepStrictEqual({ pg: a2.pg, pe: a2.pe, pp: a2.pp }, { pg: 0, pe: 0, pp: 2 });
  const a3 = tables.A.find(function (r) { return r.teamId === "a3"; }); // empató 2
  assert.deepStrictEqual({ pg: a3.pg, pe: a3.pe, pp: a3.pp }, { pg: 0, pe: 2, pp: 0 });
  // pg+pe+pp === pj para todos
  assert.ok(tables.A.every(function (r) { return r.pg + r.pe + r.pp === r.pj; }));
});

test("computeGroups: ignora partidos no jugados y en vivo", () => {
  const teams = makeTeams({ B: ["b1", "b2", "b3", "b4"] });
  const live = gm(5, "B", "b1", "b2", 1, 0);
  live.status = "live";
  const tables = st.computeGroups([live, gm(6, "B", "b3", "b4", null, null)], teams);
  assert.strictEqual(tables.B.every(function (r) { return r.pts === 0 && r.pj === 0; }), true);
});

test("groupFinished", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const partial = st.computeGroups([gm(1, "A", "a1", "a2", 1, 0)], teams);
  assert.strictEqual(st.groupFinished("A", partial), false);
  const all = [
    gm(1, "A", "a1", "a2", 1, 0), gm(2, "A", "a3", "a4", 1, 0), gm(3, "A", "a1", "a3", 1, 0),
    gm(4, "A", "a2", "a4", 1, 0), gm(5, "A", "a1", "a4", 1, 0), gm(6, "A", "a2", "a3", 1, 0)
  ];
  assert.strictEqual(st.groupFinished("A", st.computeGroups(all, teams)), true);
});

function fullGroup(g, p) { // grupo terminado: p[0] 1º (9pts), p[1] 2º (6), p[2] 3º (3+dg variable), p[3] 4º (0)
  return [
    gm(p.base + 1, g, p.ids[0], p.ids[3], 3, 0), gm(p.base + 2, g, p.ids[0], p.ids[2], 2, 0),
    gm(p.base + 3, g, p.ids[0], p.ids[1], 1, 0), gm(p.base + 4, g, p.ids[1], p.ids[2], 2, 0),
    gm(p.base + 5, g, p.ids[1], p.ids[3], 1, 0), gm(p.base + 6, g, p.ids[2], p.ids[3], p.thirdGoals, 0)
  ];
}

test("rankThirds: ordena terceros y marca los que clasifican", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
  const matches = fullGroup("A", { base: 0, ids: ["a1", "a2", "a3", "a4"], thirdGoals: 5 })
    .concat(fullGroup("B", { base: 10, ids: ["b1", "b2", "b3", "b4"], thirdGoals: 1 }));
  const tables = st.computeGroups(matches, teams);
  const thirds = st.rankThirds(tables);
  assert.strictEqual(thirds.length, 2);
  assert.strictEqual(thirds[0].teamId, "a3"); // mejor DG que b3
  assert.strictEqual(thirds[0].group, "A");
  assert.strictEqual(thirds[0].qualifies, true);
});

test("resolveSlot: 1A/2A con grupo terminado devuelve equipo", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const tables = st.computeGroups(fullGroup("A", { base: 0, ids: ["a1", "a2", "a3", "a4"], thirdGoals: 1 }), teams);
  const ctx = { tables: tables, matchesByNum: {}, teams: teams };
  assert.strictEqual(st.resolveSlot("1A", ctx).teamId, "a1");
  assert.strictEqual(st.resolveSlot("2A", ctx).teamId, "a2");
});

test("resolveSlot: grupo sin terminar devuelve etiqueta", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const tables = st.computeGroups([gm(1, "A", "a1", "a2", 1, 0)], teams);
  const slot = st.resolveSlot("1A", { tables: tables, matchesByNum: {}, teams: teams });
  assert.strictEqual(slot.teamId, null);
  assert.strictEqual(slot.label, "1º grupo A");
});

test("resolveSlot: provisional resuelve grupo en curso solo con opts", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  // a1 ganó 2-0 → va 1º; el resto 0 pts. Grupo NO terminado (1 partido).
  const tables = st.computeGroups([gm(1, "A", "a1", "a2", 2, 0)], teams);
  const ctx = { tables: tables, matchesByNum: {}, teams: teams };
  // sin opts: comportamiento actual (placeholder, sin teamId)
  assert.strictEqual(st.resolveSlot("1A", ctx).teamId, null);
  // con opts.provisional: devuelve el líder provisional marcado
  const prov = st.resolveSlot("1A", ctx, { provisional: true });
  assert.strictEqual(prov.teamId, "a1");
  assert.strictEqual(prov.provisional, true);
  assert.strictEqual(prov.label, "1º grupo A");
});

test("resolveSlot: provisional no aplica a grupo sin jugar", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const tables = st.computeGroups([], teams); // 0 partidos
  const slot = st.resolveSlot("2A", { tables: tables, matchesByNum: {}, teams: teams }, { provisional: true });
  assert.strictEqual(slot.teamId, null);
  assert.strictEqual(slot.provisional, false);
});

test("resolveSlot: grupo cerrado es definitivo, no provisional", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
  const tables = st.computeGroups(fullGroup("A", { base: 0, ids: ["a1", "a2", "a3", "a4"], thirdGoals: 1 }), teams);
  const slot = st.resolveSlot("1A", { tables: tables, matchesByNum: {}, teams: teams }, { provisional: true });
  assert.strictEqual(slot.teamId, "a1");
  assert.strictEqual(slot.provisional, false);
});

test("resolveSlot: terceros, ganador y perdedor", () => {
  const ctx = { tables: {}, teams: {}, matchesByNum: {
    74: { num: 74, home: "x", away: "y", status: "played", winner: "x" },
    101: { num: 101, home: "p", away: "q", status: "played", winner: "q" }
  } };
  assert.strictEqual(st.resolveSlot("3ABCDF", ctx).label, "Mejor 3º A/B/C/D/F");
  assert.strictEqual(st.resolveSlot("W74", ctx).teamId, "x");
  assert.strictEqual(st.resolveSlot("RU101", ctx).teamId, "p"); // perdedor de 101
  assert.strictEqual(st.resolveSlot("W99", ctx).teamId, null);
  assert.strictEqual(st.resolveSlot("W99", ctx).label, "Gana P99");
});

function ko(num, stage, phA, phB, extra) {
  return Object.assign({ id: "m" + num, num: num, stage: stage, group: null, date: "2026-07-01T19:00:00Z",
    city: "", stadium: "", home: null, away: null, phA: phA, phB: phB,
    hs: null, as: null, hp: null, ap: null, status: "scheduled", winner: null }, extra || {});
}

// Mini-bracket: 73 (1A vs 2B) y 74 (3ABCD vs 2A) → 89 (W73 vs W74) → 97 (W89 vs W90)
const MINI_KO = [
  ko(73, "r32", "1A", "2B"), ko(74, "r32", "3ABCD", "2A"),
  ko(89, "r16", "W73", "W74"), ko(90, "r16", "W75", "W76"),
  ko(97, "qf", "W89", "W90")
];
const MINI_TEAMS = makeTeams({ A: ["a1", "a2", "a3", "a4"] });
const MINI_DATA = { matches: MINI_KO, teams: MINI_TEAMS, tables: {} };

test("teamRoute: escenario 1º — cadena determinista", () => {
  const r = st.teamRoute("a1", 1, MINI_DATA);
  assert.strictEqual(r.mode, "scenario");
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].certain, true);
  assert.deepStrictEqual(r.segments[0].matches.map(function (m) { return m.num; }), [73, 89, 97]);
});

test("teamRoute: escenario 2º — entra por el placeholder 2A", () => {
  const r = st.teamRoute("a1", 2, MINI_DATA);
  assert.deepStrictEqual(r.segments[0].matches.map(function (m) { return m.num; }), [74, 89, 97]);
});

test("teamRoute: escenario 3º — rutas posibles, no certeras", () => {
  const r = st.teamRoute("a1", 3, MINI_DATA);
  assert.strictEqual(r.segments.length, 1); // solo el 74 contiene 3ABCD con A
  assert.strictEqual(r.segments[0].certain, false);
  assert.deepStrictEqual(r.segments[0].matches.map(function (m) { return m.num; }), [74, 89, 97]);
});

test("teamRoute: presencia real en el bracket gana al escenario", () => {
  const matches = MINI_KO.map(function (m) { return Object.assign({}, m); });
  matches[0].home = "a1"; matches[0].away = "b2"; // a1 ya está en el 73
  const r = st.teamRoute("a1", 3, { matches: matches, teams: MINI_TEAMS, tables: {} });
  assert.strictEqual(r.mode, "real");
  assert.strictEqual(r.eliminated, false);
  assert.deepStrictEqual(r.segments[0].matches.map(function (m) { return m.num; }), [73, 89, 97]);
});

test("teamRoute: eliminado en eliminatorias", () => {
  const matches = MINI_KO.map(function (m) { return Object.assign({}, m); });
  matches[0].home = "a1"; matches[0].away = "b2";
  matches[0].status = "played"; matches[0].winner = "b2"; matches[0].hs = 0; matches[0].as = 1;
  const r = st.teamRoute("a1", 1, { matches: matches, teams: MINI_TEAMS, tables: {} });
  assert.strictEqual(r.mode, "real");
  assert.strictEqual(r.eliminated, true);
  assert.deepStrictEqual(r.segments[0].matches.map(function (m) { return m.num; }), [73]);
});

test("teamRoute: equipo desconocido y bracket con ciclo no revientan", () => {
  const r = st.teamRoute("nadie", 1, MINI_DATA);
  assert.deepStrictEqual(r, { mode: "scenario", eliminated: false, segments: [] });
  const cyclic = [ko(89, "r16", "W97", "1A"), ko(97, "qf", "W89", "W90")];
  const r2 = st.teamRoute("a1", 1, { matches: cyclic, teams: MINI_TEAMS, tables: {} });
  assert.deepStrictEqual(r2.segments[0].matches.map(function (m) { return m.num; }), [89, 97]);
});

test("bracketSide: sigue la cadena W## hasta la semi 101 (izq) o 102 (der)", () => {
  // mini-árbol fiel a la estructura real
  const bsMatches = [
    ko(73, "r32", "1A", "2B"), ko(74, "r32", "1E", "3X"),
    ko(89, "r16", "W74", "W77"), ko(90, "r16", "W73", "W75"),
    ko(97, "qf", "W89", "W90"), ko(101, "sf", "W97", "W98"),
    ko(76, "r32", "1F", "2C"), ko(91, "r16", "W76", "W78"),
    ko(99, "qf", "W91", "W92"), ko(102, "sf", "W99", "W100"),
    ko(104, "final", "W101", "W102")
  ];
  const byNum = {};
  bsMatches.forEach(function (m) { byNum[m.num] = m; });
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

test("bracketSide: datos en vivo con ciclo no cuelgan (devuelve null)", () => {
  const cyc = {};
  [ko(89, "r16", "W97", "1A"), ko(97, "qf", "W89", "W90")].forEach(function (m) { cyc[m.num] = m; });
  assert.strictEqual(st.bracketSide(89, cyc), null);
});

test("groupStageEliminated: 4º con grupo cerrado, 3º no clasificado, y casos no eliminados", () => {
  const teams = makeTeams({ A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] });
  const matches = fullGroup("A", { base: 0, ids: ["a1", "a2", "a3", "a4"], thirdGoals: 5 })
    .concat(fullGroup("B", { base: 10, ids: ["b1", "b2", "b3", "b4"], thirdGoals: 1 }));
  const tables = st.computeGroups(matches, teams);
  const thirds = st.rankThirds(tables);
  const data = { matches: matches, teams: teams, tables: tables, thirds: thirds };
  assert.strictEqual(st.groupStageEliminated("a4", data), true);  // 4º, grupo cerrado
  assert.strictEqual(st.groupStageEliminated("a1", data), false); // 1º
  assert.strictEqual(st.groupStageEliminated("a3", data), false); // 3º que clasifica (top 8)
  // 3º que NO clasifica (thirds inyectado a mano)
  const data2 = { matches: matches, teams: teams, tables: tables, thirds: [{ teamId: "a3", qualifies: false }] };
  assert.strictEqual(st.groupStageEliminated("a3", data2), true);
  // grupo sin cerrar → nunca eliminado
  const partial = st.computeGroups(matches.slice(0, 3), teams);
  assert.strictEqual(st.groupStageEliminated("a4", { matches: matches.slice(0, 3), teams: teams, tables: partial, thirds: [] }), false);
  // presencia real en eliminatorias gana a todo
  const withKO = matches.concat([ko(73, "r32", "1A", "2B", { home: "a4", away: "b1" })]);
  assert.strictEqual(st.groupStageEliminated("a4", { matches: withKO, teams: teams, tables: tables, thirds: thirds }), false);
});

test("resolveThird: asigna el tercero correcto según la tabla", () => {
  const groups = ["A", "B", "D", "E", "G", "I", "K", "L"];
  const thirds = groups.map(function (g) { return { teamId: "third_" + g, group: g, qualifies: true }; })
    .concat(["C", "F", "H", "J"].map(function (g) { return { teamId: "third_" + g, group: g, qualifies: false }; }));
  // stub identidad: clave ABDEGIKL → cada ganador recibe el tercero de su propio grupo
  const allocation = { "ABDEGIKL": { A: "A", B: "B", D: "D", E: "E", G: "G", I: "I", K: "K", L: "L" } };
  const tables = {};
  groups.forEach(function (g) { tables[g] = [{ teamId: "x" }, { teamId: "y" }, { teamId: "third_" + g }]; });
  assert.strictEqual(st.resolveThird("E", thirds, tables, allocation), "third_E");
  assert.strictEqual(st.resolveThird("A", thirds, tables, allocation), "third_A");
});

test("resolveThird: null si no hay exactamente 8 terceros que clasifican", () => {
  const seven = ["A", "B", "D", "E", "G", "I", "K"].map(function (g) { return { teamId: "t" + g, group: g, qualifies: true }; });
  assert.strictEqual(st.resolveThird("A", seven, {}, {}), null);
});

test("resolveThird: null si la clave o el ganador no están en la tabla", () => {
  const thirds = ["A", "B", "D", "E", "G", "I", "K", "L"].map(function (g) { return { teamId: "t" + g, group: g, qualifies: true }; });
  assert.strictEqual(st.resolveThird("A", thirds, {}, {}), null); // clave ausente
  const allocation = { "ABDEGIKL": { A: "A" } };
  const tables = { A: [{}, {}, { teamId: "tA" }] };
  assert.strictEqual(st.resolveThird("B", thirds, tables, allocation), null); // ganador ausente en la fila
});
