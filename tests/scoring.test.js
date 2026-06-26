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

test("KO: marcador exacto + avance = 3 + 1 = 4 (ronda con avance)", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, played("r16", 2, 1, "H")), { points: 4, kind: "exact" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 0, ag: 2 }, played("qf", 0, 2, "A")), { points: 4, kind: "exact" });
});

test("KO: solo el resultado (signo) + avance = 1 + 1 = 2", () => {
  // signo correcto (gana local) pero marcador distinto, y avanza el local
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 0 }, played("r16", 1, 0, "H")), { points: 2, kind: "outcome" });
});

test("KO: empate predicho con adv, definido por penales", () => {
  // exacto 1-1 y adv local acierta el que pasa por penales → 3 + 1 = 4
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 1, adv: "home" }, played("r16", 1, 1, "H", { hp: 4, ap: 2 })), { points: 4, kind: "exact" });
  // empate acertado (signo) pero pasa el otro → 1 (sin avance)
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 1, adv: "home" }, played("sf", 0, 0, "A")), { points: 1, kind: "outcome" });
});

test("KO: acertar solo el avance aunque falle el signo = 1 (kind outcome)", () => {
  // predijo empate→local por penales; el local ganó en 90' (signo fallado) pero avanzó
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 1, adv: "home" }, played("qf", 2, 1, "H")), { points: 1, kind: "outcome" });
});

test("KO: fallar marcador y avance = 0", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("sf", 0, 1, "A")), { points: 0, kind: "miss" });
});

test("KO terminal (3er, final): marcador sin punto de avance", () => {
  // exacto en la final = 3 (no hay +1 de avance)
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, played("final", 2, 1, "H")), { points: 3, kind: "exact" });
  // exacto en 3er puesto = 3 (terminal)
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, played("third", 2, 1, "H")), { points: 3, kind: "exact" });
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

test("buildLeaderboard: agrega 1X2, marcador KO, avance y bonus; posiciona", () => {
  const matches = [
    played("group", 2, 1, "H", { id: "g1" }),                 // gana local
    played("r16", 1, 1, "A", { id: "k1", hp: 5, ap: 4 }),      // empate 1-1, avanza visitante por penales
    Object.assign(played("final", 1, 0, "X"), { id: "104" })
  ];
  const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "beto" }, { id: "u3", username: "caro" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0 },                    // acierta gana local → 1
    { user_id: "u1", match_id: "k1", hg: 1, ag: 1, adv: "away" },       // exacto 1-1 + avance visitante → 3+1 = 4
    { user_id: "u2", match_id: "g1", hg: 0, ag: 1 },                    // falla → 0
    { user_id: "u2", match_id: "k1", hg: 0, ag: 1 }                     // signo falla pero acierta avance visitante → 1
  ];
  const picks = [{ user_id: "u3", team_id: "X" }];                  // bonus 15
  const rows = sc.buildLeaderboard(profiles, predictions, picks, matches);
  assert.strictEqual(rows[0].username, "caro");
  assert.strictEqual(rows[0].points, 15);
  assert.strictEqual(rows[0].pos, 1);
  assert.strictEqual(rows[1].username, "ana");
  assert.strictEqual(rows[1].points, 5);   // 1 (g1) + 4 (k1 exacto+avance)
  assert.strictEqual(rows[1].pos, 2);
  assert.strictEqual(rows[2].username, "beto");
  assert.strictEqual(rows[2].points, 1);   // solo el avance de k1
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

test("campeón graduado: paga por la ronda más profunda que GANÓ el equipo (4/8/11/15)", () => {
  // ARG va ganando rondas: cada win sube el tier al máximo confirmado
  const r32 = played("r32", 2, 0, "ARG", { id: "k32" });
  const r16 = played("r16", 1, 0, "ARG", { id: "k16" });
  const qf = played("qf", 2, 1, "ARG", { id: "kqf" });
  const sf = played("sf", 1, 0, "ARG", { id: "ksf" });
  const finalWin = Object.assign(played("final", 2, 1, "ARG"), { id: "104" });
  // ganó solo R32 → llegó a 8vos = 4
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32]), 4);
  // ganó hasta 8vos → 4tos = 8
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32, r16]), 8);
  // ganó hasta 4tos → semis = 11
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32, r16, qf]), 11);
  // ganó la semi (llegó a la final) pero la final aún no se juega → 13 (subcampeón potencial)
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32, r16, qf, sf]), 13);
  // ganó la final → campeón = 15
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32, r16, qf, sf, finalWin]), 15);
});

test("campeón graduado: subcampeón vale 13 (ganó la semi, perdió la final)", () => {
  const qf = played("qf", 2, 1, "ARG", { id: "kqf" });
  const sf = played("sf", 1, 0, "ARG", { id: "ksf" }); // ganó la semi (llegó a la final)
  const finalLost = Object.assign(played("final", 0, 1, "FRA"), { id: "104" }); // pierde la final
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [qf, sf, finalLost]), 13);
  assert.strictEqual(sc.scoreChampion({ team_id: "FRA" }, [qf, sf, finalLost]), 15); // FRA campeón
});

test("campeón graduado: solo cuenta rondas jugadas; partido pendiente no proyecta", () => {
  const r32won = played("r32", 2, 0, "ARG", { id: "k32" });
  const r16pending = { id: "k16", stage: "r16", status: "scheduled", hs: null, as: null, winner: null, home: "ARG", away: "X" };
  // está en 8vos pero aún no lo ganó → paga por lo confirmado (ganó R32) = 4, no proyecta
  assert.strictEqual(sc.scoreChampion({ team_id: "ARG" }, [r32won, r16pending]), 4);
});

test("3er puesto: marcador como terminal (exacto 3, sin avance); pred con goles null no puntúa", () => {
  assert.deepStrictEqual(sc.scoreMatch({ hg: 1, ag: 0 }, played("third", 1, 0, "H")), { points: 3, kind: "exact" });
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

test("batacazo: misma escala de rareza en TODAS las rondas KO (no se aplana al final)", () => {
  // pCorrect bajo (raro) → +3 en cualquier ronda; alto (obvio) → 0
  ["r32", "r16", "qf", "sf", "third", "final"].forEach(function (stage) {
    const m = played(stage, 2, 1, "H");
    assert.strictEqual(sc.captainBonus(m, 0.10), 3, stage + " batacazo");
    assert.strictEqual(sc.captainBonus(m, 0.50), 1, stage + " mitad");
    assert.strictEqual(sc.captainBonus(m, 0.90), 0, stage + " obvio");
  });
});

test("batacazo: escalones por rareza (pCorrect) y fronteras", () => {
  const m = played("r32", 2, 1, "H");
  assert.strictEqual(sc.captainBonus(m, 0.10), 3); // casi nadie lo tenía
  assert.strictEqual(sc.captainBonus(m, 0.25), 2); // <0.25→3, [0.25,0.45)→2
  assert.strictEqual(sc.captainBonus(m, 0.45), 1); // [0.45,0.65)→1
  assert.strictEqual(sc.captainBonus(m, 0.65), 0); // ≥0.65 obvio → 0
  assert.strictEqual(sc.captainBonus(m, 0.80), 0);
});

test("batacazo: grupos sin bono", () => {
  assert.strictEqual(sc.captainBonus(played("group", 2, 1), 0.1), 0);
});

test("captainTotal: suma el bono del batacazo a lo ganado (resultado+avance / exacto / exacto+avance)", () => {
  const m16 = played("r16", 2, 1, "H"); // resultado+avance (2) + batacazo rareza media (1) = 3
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 1, ag: 0 }, m16), m16, 0.5), 3);
  const mf = played("final", 2, 1, "H"); // exacto terminal (3) + batacazo (1) = 4
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 2, ag: 1 }, mf), mf, 0.5), 4);
  const m32 = played("r32", 2, 1, "H"); // exacto+avance (4) + batacazo raro (3) = 7
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 2, ag: 1 }, m32), m32, 0.10), 7);
});

test("captainTotal: el favorito obvio (pCorrect alto) no suma bono", () => {
  const m16 = played("r16", 2, 1, "H");
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 1, ag: 0 }, m16), m16, 0.9), 2); // resultado+avance (2) + 0
});

test("captainTotal: marcador exacto + avance + batacazo se suman (empate por penales)", () => {
  const m = played("r16", 1, 1, "H", { hp: 4, ap: 2 }); // empate, avanza local por penales
  const s = sc.scoreMatch({ hg: 1, ag: 1, adv: "home" }, m); // exacto 1-1 (3) + avance (1) = 4
  assert.strictEqual(s.points, 4);
  assert.strictEqual(sc.captainTotal(s, m, 0.10), 7); // 4 + 3 batacazo
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
  assert.strictEqual(sc.maxMatchPoints(played("r16", 1, 1, "H")), 4); // exacto 3 + avance 1
  assert.strictEqual(sc.maxMatchPoints(played("final", 2, 1, "H")), 3); // terminal: solo exacto 3
  assert.strictEqual(sc.maxMatchPoints(played("r16", 1, 1, "H"), { captain: true }), 7); // base 4 + batacazo máx 3
  assert.strictEqual(sc.maxMatchPoints(played("r32", 1, 1, "H"), { captain: true }), 7); // base 4 + batacazo máx 3
  assert.strictEqual(sc.maxMatchPoints(played("group", 2, 1), { captain: true }), 1);
});

test("ranking: batacazo en octavos suma por rareza al partido elegido (2 → 5)", () => {
  // 6 jugadores en el mismo r16; solo u1 (batacazo) acierta el avance → pCorrect = 1/6 ≈ 0.17 → +3
  const profiles = [1, 2, 3, 4, 5, 6].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r16", 2, 1, "H")]; // id "m1", gana/avanza local (H)
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }] // resultado+avance = 2
    .concat([2, 3, 4, 5, 6].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 0, ag: 1 }; }));
  assert.strictEqual(sc.buildLeaderboard(profiles, preds, [], matches, [])[0].points, 2);
  const conCap = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(conCap.find(function (r) { return r.userId === "u1"; }).points, 5); // 2 + 3
});

test("ranking: batacazo en r32 con acierto raro suma +3 (pCorrect bajo)", () => {
  // 6 jugadores predicen el mismo r32; solo u1 (batacazo) acierta el avance → pCorrect = 1/6 → +3
  const profiles = [1, 2, 3, 4, 5, 6].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r32", 2, 1, "H")]; // id "m1", gana/avanza local (H)
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }]
    .concat([2, 3, 4, 5, 6].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 0, ag: 1 }; }));
  const rows = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows.find(function (r) { return r.userId === "u1"; }).points, 5); // 2 + 3
});

test("ranking: batacazo en r32 con favorito obvio no suma (pCorrect alto → 0)", () => {
  // 5 jugadores; 4 aciertan el avance → pCorrect = 4/5 = 0.8 ≥ 0.65 → 0
  const profiles = [1, 2, 3, 4, 5].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r32", 2, 1, "H")];
  const preds = [1, 2, 3, 4].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 1, ag: 0 }; })
    .concat([{ user_id: "u5", match_id: "m1", hg: 0, ag: 1 }]);
  const rows = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows.find(function (r) { return r.userId === "u1"; }).points, 2); // 2 + 0
});

test("ranking: un capitán en grupos no cambia el acumulado", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("group", 2, 1)]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }];
  const r = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(r[0].points, 1);
});

test("ranking en vivo: respeta el bono del batacazo", () => {
  // 6 jugadores en r16 jugado; solo u1 (batacazo) acierta el avance → pCorrect 1/6 → +3
  const profiles = [1, 2, 3, 4, 5, 6].map(function (n) { return { id: "u" + n, username: "j" + n }; });
  const matches = [played("r16", 2, 1, "H")]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }]
    .concat([2, 3, 4, 5, 6].map(function (n) { return { user_id: "u" + n, match_id: "m1", hg: 0, ag: 1 }; }));
  const rows = sc.buildLiveLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows.find(function (r) { return r.userId === "u1"; }).points, 5); // 2 + 3
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

test("buildLeaderboard: el % de aciertos rompe el empate de puntos → posiciones distintas", () => {
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
  // mismo puntaje (1), pero zoe tiene mayor % → va primero (aunque "ana" < "zoe" por nombre)
  assert.strictEqual(rows[0].username, "zoe");
  assert.strictEqual(rows[1].username, "ana");
  // el % rompe el empate → posiciones y tiers DISTINTOS
  assert.strictEqual(rows[0].pos, 1);
  assert.strictEqual(rows[1].pos, 2);
  assert.ok(rows[0].tier < rows[1].tier);
});

test("buildLeaderboard: empate REAL (mismos puntos y mismo %) comparte posición", () => {
  const matches = [played("group", 2, 1, null, { id: "g1" })];
  const profiles = [{ id: "u1", username: "uno" }, { id: "u2", username: "dos" }];
  const predictions = [
    { user_id: "u1", match_id: "g1", hg: 1, ag: 0 },  // 1/1 = 100%, 1 pt
    { user_id: "u2", match_id: "g1", hg: 2, ag: 0 }   // 1/1 = 100%, 1 pt (idéntico)
  ];
  const rows = sc.buildLeaderboard(profiles, predictions, [], matches);
  assert.strictEqual(rows[0].pos, rows[1].pos);   // empate real → misma posición
  assert.strictEqual(rows[0].tier, rows[1].tier);
});
