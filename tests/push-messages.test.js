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

test("applyGuardrails: máximo 10 por jugador por día", () => {
  const cands = [];
  for (let i = 1; i <= 11; i++) cands.push({ userId: "u1", matchId: "m" + i, reason: "summary", kind: "summary", kickoffAt: "2026-06-" + (10 + i) + "T22:00:00Z" });
  assert.strictEqual(pm.applyGuardrails(cands, {}).length, 10); // el onceavo se suprime por límite diario
});

test("applyGuardrails: cuenta los ya enviados hoy contra el límite", () => {
  const cands = [{ userId: "u1", matchId: "m1", reason: "pending_pick", kickoffAt: "2026-06-28T22:00:00Z" }];
  assert.strictEqual(pm.applyGuardrails(cands, { sentTodayCount: { u1: 10 } }).length, 0);
  assert.strictEqual(pm.applyGuardrails(cands, { sentTodayCount: { u1: 9 } }).length, 1);
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

/* ---------- promo especial: batacazo Cabo Verde (+50) ---------- */
const CV_MATCH = { id: "400021521", num: 86, date: "2026-07-03T22:00:00.000Z", home: "43922", away: "43850", status: "scheduled" };
const CV_TEAMS = { "43922": { id: "43922", name: "Argentina", flag: "🇦🇷" }, "43850": { id: "43850", name: "Cabo Verde", flag: "🇨🇻" } };

test("buildSpecialCandidates: un candidato por usuario si el cruce especial está en la ventana", () => {
  const cands = pm.buildSpecialCandidates(["u1", "u2"], [M1, CV_MATCH], "400021521");
  assert.strictEqual(cands.length, 2);
  assert.strictEqual(cands[0].reason, "special_batacazo");
  assert.strictEqual(cands[0].kind, "special");
  assert.strictEqual(cands[0].matchId, "400021521");
  assert.strictEqual(cands[0].match.id, "400021521");
});

test("buildSpecialCandidates: nada si el cruce especial no está en la ventana", () => {
  assert.strictEqual(pm.buildSpecialCandidates(["u1"], [M1, M2], "400021521").length, 0);
});

test("buildSpecialPush: copy con el underdog, +50 y metadata allowlisted", () => {
  const push = pm.buildSpecialPush(CV_MATCH, CV_TEAMS, "6:00 p. m.", "43850");
  assert.ok(push.title.indexOf("Batacazo ESPECIAL") >= 0);
  assert.ok(push.body.indexOf("🇨🇻 Cabo Verde") >= 0);
  assert.ok(push.body.indexOf("+50") >= 0);
  assert.strictEqual(push.data.reason, "special_batacazo");
  assert.strictEqual(push.data.matchId, "400021521");
  assert.strictEqual(push.data.campaign, "special_batacazo");
});

test("applyGuardrails: el push especial gana el bloque sobre el % (summary)", () => {
  const cands = [
    { userId: "u1", matchId: "400021521", reason: "summary", kind: "summary", kickoffAt: "2026-07-03T22:00:00Z" },
    { userId: "u1", matchId: "400021521", reason: "special_batacazo", kind: "special", kickoffAt: "2026-07-03T22:00:00Z" }
  ];
  const out = pm.applyGuardrails(cands, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kind, "special");
});

test("applyGuardrails: el especial dedupe por su propio kind", () => {
  const cands = [{ userId: "u1", matchId: "400021521", reason: "special_batacazo", kind: "special", kickoffAt: "2026-07-03T22:00:00Z" }];
  assert.strictEqual(pm.applyGuardrails(cands, { alreadySent: new Set(["u1|400021521|special"]) }).length, 0);
  assert.strictEqual(pm.applyGuardrails(cands, { alreadySent: new Set(["u1|400021521|summary"]) }).length, 1);
});

/* ---------- promo "Atrévete a Suiza" (+25/+50) ---------- */
const SUI_PROMO = { matchId: "400021537", teamId: "43971", exact: 50, outcome: 25 };
const SUI_MATCH = { id: "400021537", num: 90, date: "2026-07-12T01:00:00.000Z", home: "43922", away: "43971", status: "scheduled" };
const SUI_TEAMS = { "43922": { id: "43922", name: "Argentina", flag: "🇦🇷" }, "43971": { id: "43971", name: "Suiza", flag: "🇨🇭" } };

test("buildSuizaSpecialCandidates: broadcast a todos si el cruce está en la ventana", () => {
  const now = new Date("2026-07-11T22:30:00Z").getTime(); // 150 min antes → kind estándar
  const cands = pm.buildSuizaSpecialCandidates(["u1", "u2"], [M1, SUI_MATCH], SUI_PROMO, now);
  assert.strictEqual(cands.length, 2);
  assert.strictEqual(cands[0].reason, "special_suiza");
  assert.strictEqual(cands[0].kind, "special_suiza");
  assert.strictEqual(cands[0].matchId, "400021537");
  assert.strictEqual(cands[0].teamId, "43971");
});

test("buildSuizaSpecialCandidates: dos pulsos con kind distinto (pre vs estándar)", () => {
  const early = new Date("2026-07-11T19:00:00Z").getTime(); // 360 min antes → adelantado
  const late = new Date("2026-07-11T22:30:00Z").getTime(); // 150 min antes → estándar
  assert.strictEqual(pm.buildSuizaSpecialCandidates(["u1"], [SUI_MATCH], SUI_PROMO, early)[0].kind, "special_suiza_pre");
  assert.strictEqual(pm.buildSuizaSpecialCandidates(["u1"], [SUI_MATCH], SUI_PROMO, late)[0].kind, "special_suiza");
});

test("buildSuizaSpecialCandidates: nada si el cruce no está en la ventana o sin promo", () => {
  assert.strictEqual(pm.buildSuizaSpecialCandidates(["u1"], [M1, M2], SUI_PROMO, Date.now()).length, 0);
  assert.strictEqual(pm.buildSuizaSpecialCandidates(["u1"], [SUI_MATCH], null, Date.now()).length, 0);
});

test("buildSuizaSpecialPush: copy con +25/+50 y metadata allowlisted", () => {
  const push = pm.buildSuizaSpecialPush(SUI_MATCH, SUI_TEAMS, "9:00 p. m.", "43971");
  assert.ok(push.title.indexOf("Atrévete con Suiza") >= 0);
  assert.ok(push.body.indexOf("🇨🇭 Suiza") >= 0);
  assert.ok(push.body.indexOf("+25") >= 0 && push.body.indexOf("+50") >= 0);
  assert.strictEqual(push.data.reason, "special_suiza");
  assert.strictEqual(push.data.matchId, "400021537");
  assert.strictEqual(push.data.campaign, "special_suiza");
});

test("applyGuardrails: los dos pulsos de Suiza son buckets de dedupe distintos", () => {
  const pre = [{ userId: "u1", matchId: "400021537", reason: "special_suiza", kind: "special_suiza_pre", kickoffAt: "2026-07-12T01:00:00Z" }];
  const std = [{ userId: "u1", matchId: "400021537", reason: "special_suiza", kind: "special_suiza", kickoffAt: "2026-07-12T01:00:00Z" }];
  // ya enviado el "pre" NO bloquea el estándar (repetición 3 h antes)
  assert.strictEqual(pm.applyGuardrails(std, { alreadySent: new Set(["u1|400021537|special_suiza_pre"]) }).length, 1);
  assert.strictEqual(pm.applyGuardrails(pre, { alreadySent: new Set(["u1|400021537|special_suiza_pre"]) }).length, 0);
});

test("applyGuardrails: la promo de Suiza gana el bloque sobre el % (prioridad 7)", () => {
  const cands = [
    { userId: "u1", matchId: "400021537", reason: "summary", kind: "summary", kickoffAt: "2026-07-12T01:00:00Z" },
    { userId: "u1", matchId: "400021537", reason: "special_suiza", kind: "special_suiza", kickoffAt: "2026-07-12T01:00:00Z" }
  ];
  const out = pm.applyGuardrails(cands, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kind, "special_suiza");
});

/* ---------- promo especial: batacazo de 15 simétrico (semi 15 jul) ---------- */
const SF_MATCH = { id: "400021540", num: 102, date: "2026-07-15T19:00:00.000Z", home: "43942", away: "43922", status: "scheduled" };
const SF_TEAMS = { "43942": { id: "43942", name: "Inglaterra", flag: "🏴" }, "43922": { id: "43922", name: "Argentina", flag: "🇦🇷" } };
const SF_PROMO = { matchId: "400021540", teamId: null, bonus: 15 };

test("buildBat15Candidates: broadcast a todos si el cruce está en la ventana", () => {
  const now = new Date("2026-07-15T17:00:00Z").getTime();   // faltan 120 min
  const cands = pm.buildBat15Candidates(["u1", "u2"], [M1, SF_MATCH], SF_PROMO, now);
  assert.strictEqual(cands.length, 2);
  assert.strictEqual(cands[0].reason, "special_bat15");
  assert.strictEqual(cands[0].kind, "special_bat15");
  assert.strictEqual(cands[0].matchId, "400021540");
  assert.strictEqual(cands[0].bonus, 15);
});

test("buildBat15Candidates: doble pulso — kind _pre cuando faltan más de 185 min", () => {
  const now = new Date("2026-07-15T10:30:00Z").getTime();   // faltan 510 min
  const cands = pm.buildBat15Candidates(["u1"], [SF_MATCH], SF_PROMO, now);
  assert.strictEqual(cands[0].kind, "special_bat15_pre");
});

test("buildBat15Candidates: nada si el cruce no está en la ventana o no hay promo", () => {
  const now = new Date("2026-07-15T17:00:00Z").getTime();
  assert.strictEqual(pm.buildBat15Candidates(["u1"], [M1, M2], SF_PROMO, now).length, 0);
  assert.strictEqual(pm.buildBat15Candidates(["u1"], [SF_MATCH], null, now).length, 0);
});

test("buildBat15Push: copy simétrico con los dos equipos, +15 y metadata allowlisted", () => {
  const push = pm.buildBat15Push(SF_MATCH, SF_TEAMS, "3:00 p. m.", 15);
  assert.ok(push.title.indexOf("Batacazo de 15") >= 0);
  assert.ok(push.body.indexOf("Inglaterra") >= 0);
  assert.ok(push.body.indexOf("Argentina") >= 0);
  assert.ok(push.body.indexOf("+15") >= 0);
  assert.strictEqual(push.data.reason, "special_bat15");
  assert.strictEqual(push.data.matchId, "400021540");
  assert.strictEqual(push.data.campaign, "special_bat15");
});

test("applyGuardrails: el batacazo de 15 gana el bloque sobre el % (summary)", () => {
  const cands = [
    { userId: "u1", matchId: "400021540", reason: "summary", kind: "summary", kickoffAt: SF_MATCH.date },
    { userId: "u1", matchId: "400021540", reason: "special_bat15", kind: "special_bat15", kickoffAt: SF_MATCH.date }
  ];
  const winners = pm.applyGuardrails(cands, {});
  assert.strictEqual(winners.length, 1);
  assert.strictEqual(winners[0].reason, "special_bat15");
});
