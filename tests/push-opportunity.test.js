const test = require("node:test");
const assert = require("node:assert");
const po = require("../tools/push-opportunity.js");

// Jornada (mismo día en Curaçao, UTC-4): A jugado 16:00Z(=12:00), B programado
// 22:00Z(=18:00) → ambos 2026-07-03. El batacazo es UNO POR JORNADA.
const A = { id: "A", stage: "r16", status: "played", date: "2026-07-03T16:00:00Z", home: "t1", away: "t2", winner: "t1" };
const B = { id: "B", stage: "r16", status: "scheduled", date: "2026-07-03T22:00:00Z", home: "t3", away: "t4", winner: null };
const teams = { t1: { name: "X" }, t2: { name: "Y" }, t3: { name: "Z" }, t4: { name: "W" } };
const official = [{ userId: "u1", username: "ana", points: 0, pos: 1 }];
const now = Date.parse("2026-07-03T19:00:00Z");
const preds = [{ user_id: "u1", match_id: "A", hg: 1, ag: 0 }, { user_id: "u1", match_id: "B", hg: 1, ag: 0 }];

test("push: NO reofrece batacazo si ya lo marcó ese día (en un partido fuera de la ventana)", () => {
  // soon = [B] (A ya se jugó / fuera de ventana), pero el batacazo está en A.
  const caps = [{ user_id: "u1", match_id: "A" }];
  const cand = po.userOpportunityCandidate("u1", [B], teams, official, preds, caps, now, [A, B]);
  assert.ok(!cand || cand.reason !== "captain", "no debe ofrecer batacazo: ya usó el de la jornada en A");
});

test("push: SÍ ofrece batacazo si no lo ha marcado ese día", () => {
  const cand = po.userOpportunityCandidate("u1", [B], teams, official, preds, [], now, [A, B]);
  assert.ok(cand && cand.reason === "captain", "debe ofrecer batacazo cuando no hay ninguno ese día");
});
