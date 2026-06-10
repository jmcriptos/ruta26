const test = require("node:test");
const assert = require("node:assert");
const sc = require("../js/scoring.js");

function played(stage, hs, as, winner, extra) {
  return Object.assign({ id: "m1", stage: stage, status: "played", hs: hs, as: as, winner: winner || null, home: "H", away: "A" }, extra || {});
}

test("grupos: 1X2 acertado = 1 pt (gana local, empate, gana visitante)", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("group", 2, 1)), { points: 1, kind: "outcome" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 0 }, played("group", 1, 1)), { points: 1, kind: "outcome" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 1 }, played("group", 0, 2)), { points: 1, kind: "outcome" });
});

test("grupos: 1X2 fallado = 0", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("group", 0, 2)), { points: 0, kind: "miss" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 0 }, played("group", 2, 1)), { points: 0, kind: "miss" });
});

test("eliminatorias: acertar quién avanza = 1 pt", () => {
  // avanza local (1-0) y el ganador real es home
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("r16", 2, 1, "H")), { points: 1, kind: "outcome" });
  // avanza visitante (0-1) y el ganador real es away
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 1 }, played("qf", 0, 1, "A")), { points: 1, kind: "outcome" });
});

test("eliminatorias: fallar quién avanza = 0 (aunque marque penales)", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0, pens: true }, played("sf", 0, 1, "A")), { points: 0, kind: "miss" });
});

test("eliminatorias: penales acertado suma +1 (solo si acierta avanza)", () => {
  // real fue por penales (hp/ap presentes). Pred avanza local + pens → 2
  const m = played("r16", 1, 1, "H", { hp: 4, ap: 2 });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0, pens: true }, m), { points: 2, kind: "outcome" });
  // mismo partido, pred avanza local SIN pens → 1
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0, pens: false }, m), { points: 1, kind: "outcome" });
});

test("eliminatorias: marcar penales cuando NO hubo penales no penaliza (sigue 1)", () => {
  const m = played("qf", 2, 0, "H"); // sin hp/ap → no fue por penales
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0, pens: true }, m), { points: 1, kind: "outcome" });
});

test("final: marcador exacto = 3", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, played("final", 2, 1, "H")), { points: 3, kind: "exact" });
});

test("final: solo resultado 1X2 = 1", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 3, ag: 1 }, played("final", 2, 0, "H")), { points: 1, kind: "outcome" });
});

test("final: fallo = 0", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 2 }, played("final", 2, 0, "H")), { points: 0, kind: "miss" });
});

test("partido sin jugar: pending; sin predicción: none", () => {
  const m = { id: "m2", stage: "group", status: "scheduled", hs: null, as: null, winner: null, home: "H", away: "A" };
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, m), { points: 0, kind: "pending" });
  assert.deepStrictEqual(sc.scoreMatch(null, played("group", 1, 0)), { points: 0, kind: "none" });
});

test("buildLeaderboard: agrega 1X2, penales y bonus; posiciona", () => {
  const matches = [
    played("group", 2, 1, "H", { id: "g1" }),                 // gana local
    played("r16", 1, 1, "A", { id: "k1", hp: 5, ap: 4 }),      // avanza visitante por penales
    Object.assign(played("final", 1, 0, "X"), { id: "104" })
  ];
  const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "beto" }, { id: "u3", username: "caro" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0, pens: false },  // acierta gana local → 1
    { user_id: "u1", match_id: "k1", hg: 0, ag: 1, pens: true },   // avanza visitante + penales → 2
    { user_id: "u2", match_id: "g1", hg: 0, ag: 1, pens: false },  // falla → 0
    { user_id: "u2", match_id: "k1", hg: 0, ag: 1, pens: false }   // avanza visitante sin penales → 1
  ];
  const picks = [{ user_id: "u3", team_id: "X" }];                  // bonus 15
  const rows = sc.buildLeaderboard(profiles, predictions, picks, matches);
  assert.strictEqual(rows[0].username, "caro");
  assert.strictEqual(rows[0].points, 15);
  assert.strictEqual(rows[0].pos, 1);
  assert.strictEqual(rows[1].username, "ana");
  assert.strictEqual(rows[1].points, 3);
  assert.strictEqual(rows[1].pos, 2);
  assert.strictEqual(rows[2].username, "beto");
  assert.strictEqual(rows[2].points, 1);
  assert.strictEqual(rows[2].pos, 3);
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

test("3er puesto puntúa como eliminatoria; pred con goles null no puntúa", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("third", 1, 0, "H")), { points: 1, kind: "outcome" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: null, ag: 0 }, played("group", 1, 1)), { points: 0, kind: "none" });
});
