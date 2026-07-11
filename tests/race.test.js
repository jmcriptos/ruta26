const test = require("node:test");
const assert = require("node:assert");
const race = require("../js/race.js");
const scoring = require("../js/scoring.js");

const profiles = [{ id: "u1", username: "ana" }, { id: "u2", username: "leo" }];
// m1 (11 jun, grupos): gana local 2-0. m2 (12 jun, grupos): empate 1-1.
const matches = [
  { id: "1", stage: "group", status: "played", date: "2026-06-11T19:00:00.000Z", home: "H", away: "A", hs: 2, as: 0, winner: "H" },
  { id: "2", stage: "group", status: "played", date: "2026-06-12T19:00:00.000Z", home: "H2", away: "A2", hs: 1, as: 1, winner: null }
];
const preds = [
  { user_id: "u1", match_id: "1", hg: 1, ag: 0 }, // acierta (gana local)
  { user_id: "u1", match_id: "2", hg: 0, ag: 0 }, // acierta (empate)
  { user_id: "u2", match_id: "1", hg: 0, ag: 1 }, // falla
  { user_id: "u2", match_id: "2", hg: 2, ag: 2 }  // acierta (empate)
];

test("buildDailySeries: un fotograma por día jugado, con puntaje acumulado", () => {
  const { frames } = race.buildDailySeries(profiles, preds, [], matches, [], scoring);
  assert.strictEqual(frames.length, 2);

  // Día 1: solo m1 cuenta → u1 = 1, u2 = 0
  assert.strictEqual(frames[0].day, "2026-06-11");
  assert.strictEqual(frames[0].rows[0].userId, "u1");
  assert.strictEqual(frames[0].rows[0].points, 1);
  assert.strictEqual(frames[0].rows[1].points, 0);

  // Día 2: acumulado m1+m2 → u1 = 2, u2 = 1
  assert.strictEqual(frames[1].day, "2026-06-12");
  assert.strictEqual(frames[1].rows.find((r) => r.userId === "u1").points, 2);
  assert.strictEqual(frames[1].rows.find((r) => r.userId === "u2").points, 1);
});

test("buildDailySeries: etiqueta y subtítulo del día", () => {
  const { frames } = race.buildDailySeries(profiles, preds, [], matches, [], scoring);
  assert.ok(frames[0].label && frames[0].label.length > 0);
  assert.ok(frames[0].subtitle.indexOf("Fase de grupos") >= 0);
  assert.ok(frames[0].subtitle.indexOf("1 partido") >= 0);
});

test("buildDailySeries: los partidos no jugados no generan fotograma", () => {
  const withFuture = matches.concat([{ id: "3", stage: "qf", status: "scheduled", date: "2026-07-12T01:00:00.000Z", home: "X", away: "Y", hs: null, as: null }]);
  const { frames } = race.buildDailySeries(profiles, preds, [], withFuture, [], scoring);
  assert.strictEqual(frames.length, 2); // sigue siendo 2, el cuartos futuro no cuenta
});

test("curacaoDay: convierte a día calendario Curaçao (UTC-4)", () => {
  // 2026-06-12T02:00:00Z = 11 jun 22:00 en Curaçao
  assert.strictEqual(race.curacaoDay("2026-06-12T02:00:00.000Z"), "2026-06-11");
  assert.strictEqual(race.curacaoDay("2026-06-12T19:00:00.000Z"), "2026-06-12");
});
