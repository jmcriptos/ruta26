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
