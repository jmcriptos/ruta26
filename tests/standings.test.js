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
