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
  // tier = nivel de puntaje (1=oro, 2=plata, 3=bronce); caro 15, ana 3, beto 1 → tiers 1,2,3
  assert.strictEqual(rows[0].tier, 1);
  assert.strictEqual(rows[1].tier, 2);
  assert.strictEqual(rows[2].tier, 3);
  // decided = picks de partidos ya jugados (denominador del % de acierto)
  assert.strictEqual(rows.find(function (r) { return r.username === "ana"; }).decided, 2);
  assert.strictEqual(rows.find(function (r) { return r.username === "beto"; }).decided, 2);
  assert.strictEqual(rows.find(function (r) { return r.username === "caro"; }).decided, 0);
});

test("buildLeaderboard: tier agrupa empates y el 3er nivel recibe bronce", () => {
  // 1 con 3pts, dos con 1pt (empate), uno con 0 → tiers 1, 2, 2, 3
  const matches = [
    Object.assign(played("final", 1, 0, "X"), { id: "104" }),  // exacto → 3
    played("group", 2, 1, "H", { id: "g1" })                   // gana local → 1
  ];
  const profiles = [{ id: "u1", username: "a" }, { id: "u2", username: "b" }, { id: "u3", username: "c" }, { id: "u4", username: "d" }];
  const predictions = [
    { user_id: "u1", match_id: "104", hg: 1, ag: 0, pens: false }, // 3 pts
    { user_id: "u2", match_id: "g1", hg: 1, ag: 0, pens: false },  // 1 pt
    { user_id: "u3", match_id: "g1", hg: 2, ag: 0, pens: false },  // 1 pt (mismo nivel que u2)
    { user_id: "u4", match_id: "g1", hg: 0, ag: 1, pens: false }   // 0 pts
  ];
  const rows = sc.buildLeaderboard(profiles, predictions, [], matches);
  assert.deepStrictEqual(rows.map(function (r) { return r.points; }), [3, 1, 1, 0]);
  assert.deepStrictEqual(rows.map(function (r) { return r.tier; }), [1, 2, 2, 3]); // el grupo de 0 pts es bronce
});

test("buildLeaderboard: decided ignora picks de partidos no jugados", () => {
  const matches = [
    played("group", 2, 0, "H", { id: "g1" }),
    Object.assign(played("group", null, null, null, { id: "g2" }), { status: "scheduled" })
  ];
  const profiles = [{ id: "u1", username: "ana" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0, pens: false }, // jugado, acierta
    { user_id: "u1", match_id: "g2", hg: 1, ag: 0, pens: false }  // futuro → pending
  ];
  const rows = sc.buildLeaderboard(profiles, predictions, [], matches);
  assert.strictEqual(rows[0].predicted, 2);
  assert.strictEqual(rows[0].decided, 1);
  assert.strictEqual(rows[0].exact + rows[0].outcome, 1);
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

/* ---------- ranking en vivo (provisional) ---------- */

function live(stage, hs, as, extra) {
  return Object.assign({ id: "m1", stage: stage, status: "live", hs: hs, as: as, winner: null, home: "H", away: "A" }, extra || {});
}

test("freezeLive: grupos en vivo se congela como jugado con el marcador actual", () => {
  const f = sc.freezeLive(live("group", 2, 1));
  assert.strictEqual(f.status, "played");
  assert.strictEqual(f.hs, 2);
});

test("freezeLive: eliminatoria en vivo con líder → ganador provisional", () => {
  assert.strictEqual(sc.freezeLive(live("r16", 1, 0)).winner, "H");
  assert.strictEqual(sc.freezeLive(live("qf", 0, 2)).winner, "A");
});

test("freezeLive: eliminatoria empatada sin penales → sin ganador provisional", () => {
  assert.strictEqual(sc.freezeLive(live("r16", 1, 1)).winner, null);
});

test("freezeLive: empate con penales en curso → gana quien va arriba en la tanda", () => {
  assert.strictEqual(sc.freezeLive(live("sf", 1, 1, { hp: 3, ap: 2 })).winner, "H");
  assert.strictEqual(sc.freezeLive(live("sf", 1, 1, { hp: 2, ap: 2 })).winner, null);
});

test("freezeLive: no toca partidos programados ni jugados", () => {
  const sched = { id: "x", stage: "group", status: "scheduled", hs: null, as: null, winner: null, home: "H", away: "A" };
  assert.strictEqual(sc.freezeLive(sched), sched);
  const done = played("group", 1, 0);
  assert.strictEqual(sc.freezeLive(done), done);
});

test("buildLiveLeaderboard: suma provisional y delta de posición vs oficial", () => {
  const matches = [
    played("group", 2, 1, null, { id: "g1" }),   // ya jugado: gana local
    live("group", 0, 1, { id: "g2" })            // en vivo: va ganando visitante
  ];
  const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "beto" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0, pens: false }, // 1 pt oficial
    { user_id: "u2", match_id: "g2", hg: 0, ag: 1, pens: false }  // +1 provisional
  ];
  const rows = sc.buildLiveLeaderboard(profiles, predictions, [], matches);
  const ana = rows.find(function (r) { return r.username === "ana"; });
  const beto = rows.find(function (r) { return r.username === "beto"; });
  assert.strictEqual(ana.points, 1);
  assert.strictEqual(ana.livePoints, 0);
  assert.strictEqual(beto.points, 1);
  assert.strictEqual(beto.livePoints, 1);
  // oficial: ana pos 1 (1 pt), beto pos 2 (0). En vivo empatan a 1 → ambos pos 1.
  assert.strictEqual(beto.delta, 1);   // sube
  assert.strictEqual(ana.delta, 0);    // se queda
});

test("buildLiveLeaderboard: sin partidos en vivo replica el oficial (livePoints 0, delta 0)", () => {
  const matches = [played("group", 2, 1, null, { id: "g1" })];
  const profiles = [{ id: "u1", username: "ana" }];
  const predictions = [{ user_id: "u1", match_id: "g1", hg: 1, ag: 0, pens: false }];
  const rows = sc.buildLiveLeaderboard(profiles, predictions, [], matches);
  assert.strictEqual(rows[0].livePoints, 0);
  assert.strictEqual(rows[0].delta, 0);
});

test("buildLiveLeaderboard: final en vivo reparte campeón provisional", () => {
  const matches = [Object.assign(live("final", 1, 0), { id: "104", home: "ARG", away: "FRA" })];
  const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "beto" }];
  const picks = [{ user_id: "u1", team_id: "ARG" }, { user_id: "u2", team_id: "FRA" }];
  const rows = sc.buildLiveLeaderboard(profiles, [], picks, matches);
  const ana = rows.find(function (r) { return r.username === "ana"; });
  const beto = rows.find(function (r) { return r.username === "beto"; });
  assert.strictEqual(ana.livePoints, 15);
  assert.strictEqual(beto.livePoints, 0);
});

/* ---------- capitán contracorriente (aditivo) ---------- */

test("capitán: octavos→final suma bono fijo +2", () => {
  assert.strictEqual(sc.captainBonus(played("r16", 0, 0, "H"), 0.5), 2);
  assert.strictEqual(sc.captainBonus(played("qf", 0, 0, "H"), 0.1), 2);
  assert.strictEqual(sc.captainBonus(played("sf", 0, 0, "H"), 0.9), 2);
  assert.strictEqual(sc.captainBonus(played("final", 0, 0, "H"), 0.5), 2);
  assert.strictEqual(sc.captainBonus(played("third", 0, 0, "H"), 0.5), 2);
});

test("capitán: r32 por escalón de rareza (pCorrect) y fronteras", () => {
  const m = played("r32", 2, 1, "H");
  assert.strictEqual(sc.captainBonus(m, 0.10), 4); // batacazo
  assert.strictEqual(sc.captainBonus(m, 0.25), 3);
  assert.strictEqual(sc.captainBonus(m, 0.50), 2);
  assert.strictEqual(sc.captainBonus(m, 0.80), 1); // obvio
  assert.strictEqual(sc.captainBonus(m, 0.20), 3); // <0.20→4, [0.20,0.35)→3
  assert.strictEqual(sc.captainBonus(m, 0.35), 2);
  assert.strictEqual(sc.captainBonus(m, 0.60), 1);
});

test("capitán: grupos sin bono", () => {
  assert.strictEqual(sc.captainBonus(played("group", 2, 1), 0.1), 0);
});

test("captainTotal: suma el bono al acierto (octavos +2; final exacto +2; r32 batacazo +4)", () => {
  const m16 = played("r16", 2, 1, "H");
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 1, ag: 0 }, m16), m16, 0.5), 3); // 1+2
  const mf = played("final", 2, 1, "H");
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 2, ag: 1 }, mf), mf, 0.5), 5); // 3+2 exacto
  const m32 = played("r32", 2, 1, "H");
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 1, ag: 0 }, m32), m32, 0.10), 5); // 1+4
});

test("captainTotal: el bono de penales se conserva y el del capitán se suma aparte", () => {
  const m = played("r16", 1, 1, "H", { hp: 4, ap: 2 });
  const s = sc.scoreMatch({ hg: 1, ag: 0, pens: true }, m); // 1 avance + 1 penales = 2
  assert.strictEqual(s.points, 2);
  assert.strictEqual(sc.captainTotal(s, m, 0.5), 4); // 2 + 2 fijo
});

test("captainTotal: fallar no suma ni resta (0)", () => {
  const m = played("qf", 0, 1, "A");
  const s = sc.scoreMatch({ hg: 1, ag: 0 }, m); // pred avanza local pero ganó visitante → falla
  assert.strictEqual(sc.captainTotal(s, m, 0.1), 0);
});

test("captainTotal: en grupos no aplica (queda igual a la base)", () => {
  const m = played("group", 2, 1);
  const s = sc.scoreMatch({ hg: 1, ag: 0 }, m);
  assert.strictEqual(sc.captainTotal(s, m, 0.1), 1);
});

test("maxMatchPoints: expone potencial máximo por partido desde scoring", () => {
  assert.strictEqual(sc.maxMatchPoints(played("group", 2, 1)), 1);
  assert.strictEqual(sc.maxMatchPoints(played("r16", 1, 1, "H")), 2);
  assert.strictEqual(sc.maxMatchPoints(played("final", 2, 1, "H")), 3);
  assert.strictEqual(sc.maxMatchPoints(played("r16", 1, 1, "H"), { captain: true }), 4);
  assert.strictEqual(sc.maxMatchPoints(played("r32", 1, 1, "H"), { captain: true }), 6);
  assert.strictEqual(sc.maxMatchPoints(played("group", 2, 1), { captain: true }), 1);
});

test("ranking: capitán en octavos suma +2 al partido elegido (1 → 3)", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("r16", 2, 1, "H")]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0, pens: false }];
  assert.strictEqual(sc.buildLeaderboard(profiles, preds, [], matches, [])[0].points, 1);
  const conCap = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(conCap[0].points, 3);
});

test("ranking: capitán en r32 con batacazo suma +4 (pCorrect bajo)", () => {
  // 6 jugadores predicen el mismo r32; solo u1 (capitán) acierta → pCorrect = 1/6 ≈ 0.17 → +4
  const profiles = [1, 2, 3, 4, 5, 6].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r32", 2, 1, "H")]; // id "m1", avanza local (H)
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }]
    .concat([2, 3, 4, 5, 6].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 0, ag: 1 }; }));
  const rows = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows.find(function (r) { return r.userId === "u1"; }).points, 5); // 1 + 4
});

test("ranking: capitán en r32 con favorito obvio suma +1 (pCorrect alto)", () => {
  // 5 jugadores; 4 aciertan → pCorrect = 4/5 = 0.8 → +1
  const profiles = [1, 2, 3, 4, 5].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r32", 2, 1, "H")];
  const preds = [1, 2, 3, 4].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 1, ag: 0 }; })
    .concat([{ user_id: "u5", match_id: "m1", hg: 0, ag: 1 }]);
  const rows = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows.find(function (r) { return r.userId === "u1"; }).points, 2); // 1 + 1
});

test("ranking: un capitán en grupos no cambia el acumulado", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("group", 2, 1)]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }];
  const r = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(r[0].points, 1);
});

test("ranking en vivo: respeta el bono del capitán", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("r16", 2, 1, "H")]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }];
  const rows = sc.buildLiveLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows[0].points, 3); // 1 + 2
});

/* ---------- contrato de Capitán (fixture, Story 1.1) ---------- */
const capitanContract = require("./fixtures/scoring/capitan-contract.json");

test("fixture capitan-contract: scoreMatch cumple el contrato", () => {
  capitanContract.scoreMatch.forEach(function (c) {
    assert.deepStrictEqual(sc.scoreMatch(c.pred, c.match), c.expect, c.name);
  });
});

test("fixture capitan-contract: captainBonus cumple el contrato", () => {
  capitanContract.captainBonus.forEach(function (c) {
    assert.strictEqual(sc.captainBonus(c.match, c.pCorrect), c.expect, c.name);
  });
});

test("fixture capitan-contract: captainTotal cumple el contrato", () => {
  capitanContract.captainTotal.forEach(function (c) {
    assert.strictEqual(sc.captainTotal(c.s, c.match, c.pCorrect), c.expect, c.name);
  });
});

test("fixture capitan-contract: tie-break de ranking por username", () => {
  const t = capitanContract.leaderboardTieBreak;
  const rows = sc.buildLeaderboard(t.profiles, t.predictions, [], t.matches, []);
  assert.deepStrictEqual(rows.map(function (r) { return r.username; }), t.expectOrderUsernames);
});

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
