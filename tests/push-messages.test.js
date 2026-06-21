const test = require("node:test");
const assert = require("node:assert");
const pm = require("../tools/push-messages.js");

const TEAMS = {
  "43911": { id: "43911", code: "MEX", name: "México", flag: "🇲🇽" },
  "43883": { id: "43883", code: "RSA", name: "Sudáfrica", flag: "🇿🇦" },
  "43924": { id: "43924", code: "KOR", name: "Corea del Sur", flag: "🇰🇷" },
  "43950": { id: "43950", code: "CZE", name: "Chequia", flag: "🇨🇿" }
};
const M1 = { id: "m1", num: 1, date: "2026-06-12T19:00:00.000Z", home: "43911", away: "43883" };
const M2 = { id: "m2", num: 2, date: "2026-06-12T19:00:00.000Z", home: "43924", away: "43950" };

function preds(matchId, homeWins, draws, awayWins) {
  const out = [];
  for (let i = 0; i < homeWins; i++) out.push({ match_id: matchId, hg: 2, ag: 0 });
  for (let i = 0; i < draws; i++) out.push({ match_id: matchId, hg: 1, ag: 1 });
  for (let i = 0; i < awayWins; i++) out.push({ match_id: matchId, hg: 0, ag: 1 });
  return out;
}

test("tallyByMatch: cuenta local/empate/visitante por partido", () => {
  const t = pm.tallyByMatch(preds("m1", 8, 2, 1).concat(preds("m2", 1, 3, 2)));
  assert.deepStrictEqual(t.m1, { home: 8, draw: 2, away: 1, total: 11 });
  assert.deepStrictEqual(t.m2, { home: 1, draw: 3, away: 2, total: 6 });
});

test("tallyByMatch: ignora filas malformadas", () => {
  const t = pm.tallyByMatch([{ match_id: "m1", hg: 2, ag: 0 }, null, { match_id: "m1", hg: "x", ag: 0 }, { hg: 1, ag: 1 }]);
  assert.deepStrictEqual(t.m1, { home: 1, draw: 0, away: 0, total: 1 });
});

test("matchSummary: mayoría local con redondeo", () => {
  // 8 de 11 = 72.7 → 73
  const s = pm.matchSummary(M1, TEAMS, { home: 8, draw: 2, away: 1, total: 11 });
  assert.strictEqual(s, "El 73% de la quiniela espera que gane 🇲🇽 México");
});

test("matchSummary: mayoría empate y mayoría visitante", () => {
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 5, away: 2, total: 8 }),
    "El 63% de la quiniela espera empate");
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 2, away: 5, total: 8 }),
    "El 63% de la quiniela espera que gane 🇿🇦 Sudáfrica");
});

test("matchSummary: empate técnico gana orden local, empate, visitante", () => {
  assert.ok(pm.matchSummary(M1, TEAMS, { home: 3, draw: 3, away: 0, total: 6 }).includes("México"));
  assert.ok(pm.matchSummary(M1, TEAMS, { home: 1, draw: 3, away: 3, total: 7 }).includes("empate"));
});

test("matchSummary: menos de 3 picks", () => {
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 1, away: 0, total: 2 }),
    "¡Sé de los primeros en pronosticar!");
  assert.strictEqual(pm.matchSummary(M1, TEAMS, undefined),
    "¡Sé de los primeros en pronosticar!");
});

test("buildPush: un partido, sin pick faltante", () => {
  const p = pm.buildPush([M1], TEAMS, { m1: { home: 8, draw: 2, away: 1, total: 11 } }, false);
  assert.strictEqual(p.title, "⚽ México vs Sudáfrica · 3:00 p. m.");
  assert.strictEqual(p.body, "El 73% de la quiniela espera que gane 🇲🇽 México");
});

test("buildPush: línea extra cuando falta el pick", () => {
  const p = pm.buildPush([M1], TEAMS, { m1: { home: 8, draw: 2, away: 1, total: 11 } }, true);
  assert.ok(p.body.endsWith("\n👉 ¡Aún te falta tu pick!"));
});

test("buildPush: dos partidos simultáneos en un solo push", () => {
  const tallies = { m1: { home: 8, draw: 2, away: 1, total: 11 }, m2: { home: 1, draw: 3, away: 2, total: 6 } };
  const p = pm.buildPush([M1, M2], TEAMS, tallies, false);
  assert.strictEqual(p.title, "⚽ 2 partidos arrancan a las 3:00 p. m.");
  assert.ok(p.body.includes("México vs Sudáfrica: 73% con México"));
  assert.ok(p.body.includes("Corea del Sur vs Chequia: 50% empate"));
});

test("buildPush: partido sin equipos definidos usa texto genérico", () => {
  const ko = { id: "k1", num: 73, date: "2026-06-28T19:00:00.000Z", home: null, away: null };
  const p = pm.buildPush([ko], TEAMS, {}, false);
  assert.ok(p.title.includes("El partido"));
  assert.strictEqual(p.body, "¡Sé de los primeros en pronosticar!");
});

/* ---------- Epic 2: guardrails (Story 2.1) ---------- */

test("applyGuardrails: descarta opt-out/suprimidos y ya-enviados (match+reason)", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "pending_pick", kickoffAt: "2026-06-28T22:00:00Z" },
    { userId: "u1", matchId: "m2", reason: "captain", kickoffAt: "2026-06-29T22:00:00Z", suppressed: true },
    { userId: "u2", matchId: "m1", reason: "pending_pick", kickoffAt: "2026-06-28T22:00:00Z" }
  ];
  const out = pm.applyGuardrails(cands, { alreadySent: new Set(["u2|m1|opportunity"]) });
  const keys = out.map(function (c) { return c.userId + "|" + c.matchId; });
  assert.deepStrictEqual(keys, ["u1|m1"]); // u1/m2 suprimido, u2/m1 ya enviado
});

test("applyGuardrails: 1 por bloque horario, el de mayor prioridad", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "win_matchday", kickoffAt: "2026-06-28T22:00:00Z" },
    { userId: "u1", matchId: "m2", reason: "pending_pick", kickoffAt: "2026-06-28T22:20:00Z" }
  ];
  const out = pm.applyGuardrails(cands, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].reason, "pending_pick"); // mayor prioridad gana el bloque
});

test("applyGuardrails: máximo 5 por jugador por día", () => {
  const cands = [];
  for (let i = 1; i <= 6; i++) cands.push({ userId: "u1", matchId: "m" + i, reason: "summary", kind: "summary", kickoffAt: "2026-06-2" + i + "T22:00:00Z" });
  assert.strictEqual(pm.applyGuardrails(cands, {}).length, 5); // el sexto se suprime por límite diario
});

test("applyGuardrails: cuenta los ya enviados hoy contra el límite", () => {
  const cands = [{ userId: "u1", matchId: "m1", reason: "pending_pick", kickoffAt: "2026-06-28T22:00:00Z" }];
  assert.strictEqual(pm.applyGuardrails(cands, { sentTodayCount: { u1: 5 } }).length, 0);
  assert.strictEqual(pm.applyGuardrails(cands, { sentTodayCount: { u1: 4 } }).length, 1);
});

/* ---------- Epic 2: copy de Oportunidad (Story 2.2) ---------- */

test("buildOpportunityPush: pick pendiente, ≤ líneas y metadata allowlisted", () => {
  const opp = { reason: "pending_pick", match: { id: "m1", name: "México vs Corea", kickoffAt: "2026-06-28T22:00:00Z" } };
  const push = pm.buildOpportunityPush(opp, "6:00 p. m.");
  assert.ok(push.body.indexOf("México vs Corea") >= 0);
  assert.strictEqual(push.data.reason, "pending_pick");
  assert.strictEqual(push.data.matchId, "m1");
  assert.strictEqual(push.data.campaign, "opportunity");
  assert.ok(!/\n.*\n.*\n/.test(push.body)); // máximo pocas líneas
});

test("buildOpportunityPush: rival y null para razón desconocida", () => {
  const opp = { reason: "reachable_rival", match: { id: "m1", name: "X vs Y" }, rival: { username: "lider", pointsGap: 2 } };
  assert.ok(pm.buildOpportunityPush(opp).body.indexOf("lider") >= 0);
  assert.strictEqual(pm.buildOpportunityPush({ reason: "nada" }), null);
});

test("buildOpportunityPush: acepta match con homeName/awayName del contrato engagement", () => {
  const opp = { reason: "pending_pick", match: { id: "m1", homeName: "México", awayName: "Corea", kickoffAt: "2026-06-28T22:00:00Z" } };
  assert.ok(pm.buildOpportunityPush(opp).body.indexOf("México vs Corea") >= 0);
});

test("buildOpportunityCandidates: genera solo oportunidades accionables", () => {
  const matches = [
    Object.assign({}, M1, { status: "scheduled", stage: "group", date: "2026-06-28T22:00:00Z" }),
    Object.assign({}, M2, { status: "scheduled", stage: "r16", date: "2026-06-28T23:00:00Z" }),
    { id: "m3", status: "played", stage: "group", date: "2026-06-28T20:00:00Z", home: "43911", away: "43883" },
    { id: "m4", status: "scheduled", stage: "r32", date: "2026-06-28T23:30:00Z", home: null, away: null }
  ];
  const cands = pm.buildOpportunityCandidates(
    ["u1", "u2"],
    matches,
    [{ user_id: "u1", match_id: "m1" }, { user_id: "u1", match_id: "m2" }, { user_id: "u2", match_id: "m2" }],
    [{ user_id: "u2", match_id: "m2" }],
    TEAMS,
    new Date("2026-06-28T18:00:00Z").getTime()
  );
  assert.deepStrictEqual(cands.map(function (c) { return c.userId + "|" + c.matchId + "|" + c.reason; }), [
    "u1|m2|captain",
    "u2|m1|pending_pick"
  ]);
  assert.ok(cands.every(function (c) { return c.opp && c.opp.match && c.opp.match.name !== "el partido"; }));
});

test("horaTxt: mediodía y medianoche no se imprimen como 0", () => {
  assert.strictEqual(pm.horaTxt("2026-06-21T16:00:00Z"), "12:00 p. m."); // 16:00Z = mediodía Curaçao
  assert.strictEqual(pm.horaTxt("2026-06-21T04:00:00Z"), "12:00 a. m."); // 04:00Z = medianoche Curaçao
  assert.strictEqual(pm.horaTxt("2026-06-11T19:00:00Z"), "3:00 p. m.");  // sin cambios
});

test("buildSummaryCandidates: un candidato por usuario y bloque, con missingPick", () => {
  const soon = [M1, M2]; // mismo bloque horario (19:00Z)
  const hasPred = new Set(["u1|m1", "u1|m2"]); // u1 tiene ambos; u2 ninguno
  const cands = pm.buildSummaryCandidates(["u1", "u2"], soon, hasPred);
  assert.strictEqual(cands.length, 2); // 1 por usuario (un solo bloque)
  const u1 = cands.find(function (c) { return c.userId === "u1"; });
  const u2 = cands.find(function (c) { return c.userId === "u2"; });
  assert.strictEqual(u1.reason, "summary");
  assert.strictEqual(u1.kind, "summary");
  assert.strictEqual(u1.missingPick, false);
  assert.strictEqual(u2.missingPick, true);
  assert.strictEqual(u1.blockMatches.length, 2);
});

test("applyGuardrails: summary gana el bloque sobre la oportunidad", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "rival_threat", kind: "opportunity", kickoffAt: "2026-06-28T22:00:00Z" },
    { userId: "u1", matchId: "m1", reason: "summary", kind: "summary", kickoffAt: "2026-06-28T22:00:00Z" }
  ];
  const out = pm.applyGuardrails(cands, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kind, "summary");
});

test("applyGuardrails: dedupe por kind (summary y opportunity no se pisan)", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "summary", kind: "summary", kickoffAt: "2026-06-28T22:00:00Z" }
  ];
  assert.strictEqual(pm.applyGuardrails(cands, { alreadySent: new Set(["u1|m1|summary"]) }).length, 0);
  const opp = [{ userId: "u1", matchId: "m1", reason: "rival_threat", kind: "opportunity", kickoffAt: "2026-06-29T22:00:00Z" }];
  assert.strictEqual(pm.applyGuardrails(opp, { alreadySent: new Set(["u1|m1|summary"]) }).length, 1);
});
