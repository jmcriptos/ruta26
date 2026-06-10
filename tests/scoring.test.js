const test = require("node:test");
const assert = require("node:assert");
const sc = require("../js/scoring.js");

function played(stage, hs, as, winner, extra) {
  return Object.assign({ id: "m1", stage: stage, status: "played", hs: hs, as: as, winner: winner || null, home: "H", away: "A" }, extra || {});
}

test("grupos: marcador exacto 3 pts", () => {
  const r = sc.scoreMatch({ hg: 2, ag: 1 }, played("group", 2, 1));
  assert.deepStrictEqual(r, { points: 3, kind: "exact" });
});

test("grupos: resultado acertado sin exacto 1 pt (incluye empates)", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 3, ag: 1 }, played("group", 1, 0)), { points: 1, kind: "outcome" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 0 }, played("group", 2, 2)), { points: 1, kind: "outcome" });
});

test("grupos: fallo 0 pts", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 2 }, played("group", 2, 0)), { points: 0, kind: "miss" });
});

test("eliminatorias: exacto 5 pts", () => {
  const m = played("qf", 2, 1, "H");
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, m), { points: 5, kind: "exact" });
});

test("eliminatorias: acertar quién avanza 2 pts (con penales)", () => {
  // real: 1-1, gana A por penales → predicción 0-2 acierta que avanza A
  const m = played("r16", 1, 1, "A");
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 2 }, m), { points: 2, kind: "outcome" });
  // predicción 2-0 (avanza H) falla
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 0 }, m), { points: 0, kind: "miss" });
});

test("eliminatorias: predicción empatada es inválida (0 pts) salvo exacto imposible", () => {
  const m = played("sf", 2, 0, "H");
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 1 }, m), { points: 0, kind: "miss" });
});

test("partido sin jugar: pending", () => {
  const m = { id: "m2", stage: "group", status: "scheduled", hs: null, as: null, winner: null, home: "H", away: "A" };
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, m), { points: 0, kind: "pending" });
});

test("sin predicción: none", () => {
  assert.deepStrictEqual(sc.scoreMatch(null, played("group", 1, 0)), { points: 0, kind: "none" });
});

test("campeón: 15 pts si acierta al ganador de la final", () => {
  const matches = [
    played("group", 1, 0, null, { id: "g1" }),
    Object.assign(played("final", 1, 1, "ARG"), { id: "104" })
  ];
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, matches), 15);
  assert.strictEqual(sc.scoreChampion({ team_id: "FRA" }, matches), 0);
  assert.strictEqual(sc.scoreChampion(null, matches), 0);
});

test("campeón: 0 si la final no se ha jugado", () => {
  const matches = [{ id: "104", stage: "final", status: "scheduled", hs: null, as: null, winner: null, home: null, away: null }];
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, matches), 0);
});

test("buildLeaderboard: agrega, desempata y posiciona", () => {
  const matches = [
    played("group", 2, 1, null, { id: "g1" }),
    played("group", 0, 0, null, { id: "g2" }),
    Object.assign(played("final", 1, 0, "X"), { id: "104" })
  ];
  const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "beto" }, { id: "u3", username: "caro" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 2, ag: 1 },   // exacto 3
    { user_id: "u1", match_id: "g2", hg: 1, ag: 1 },   // resultado 1
    { user_id: "u2", match_id: "g1", hg: 1, ag: 0 },   // resultado 1
    { user_id: "u2", match_id: "g2", hg: 0, ag: 0 },   // exacto 3
    { user_id: "u3", match_id: "g1", hg: 0, ag: 1 }    // miss 0
  ];
  const picks = [{ user_id: "u3", team_id: "X" }];      // bonus 15
  const rows = sc.buildLeaderboard(profiles, predictions, picks, matches);
  assert.strictEqual(rows[0].username, "caro");
  assert.strictEqual(rows[0].points, 15);
  assert.strictEqual(rows[0].pos, 1);
  // ana y beto: 4 pts cada uno → misma posición 2, orden por exactos iguales → alfabético
  assert.strictEqual(rows[1].points, 4);
  assert.strictEqual(rows[2].points, 4);
  assert.strictEqual(rows[1].pos, 2);
  assert.strictEqual(rows[2].pos, 2);
  assert.strictEqual(rows[1].exact, 1);
  assert.strictEqual(rows[1].username, "ana");
  assert.strictEqual(rows[0].bonus, 15);
});
