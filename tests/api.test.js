const test = require("node:test");
const assert = require("node:assert");
const api = require("../js/api.js");

const SAMPLE = {
  IdMatch: "400235455", MatchNumber: "1", IdStage: "289273",
  GroupName: [{ Locale: "es-ES", Description: "Grupo A" }],
  Date: "2026-06-11T19:00:00Z",
  Stadium: { Name: [{ Description: "Estadio Ciudad de México" }], CityName: [{ Description: "Ciudad de México" }] },
  Home: { IdTeam: "43911", Abbreviation: "MEX", TeamName: [{ Description: "México" }] },
  Away: { IdTeam: "43883", Abbreviation: "RSA", TeamName: [{ Description: "Sudáfrica" }] },
  HomeTeamScore: null, AwayTeamScore: null, HomeTeamPenaltyScore: null, AwayTeamPenaltyScore: null,
  MatchStatus: 1, Winner: null
};

const SAMPLE_KO = {
  IdMatch: "400235527", MatchNumber: "73", IdStage: "289287", GroupName: [],
  Date: "2026-06-28T19:00:00Z",
  Stadium: { Name: [{ Description: "Estadio de Los Ángeles" }], CityName: [{ Description: "Los Ángeles" }] },
  Home: null, Away: null, PlaceHolderA: "2A", PlaceHolderB: "2B",
  HomeTeamScore: null, AwayTeamScore: null, HomeTeamPenaltyScore: null, AwayTeamPenaltyScore: null,
  MatchStatus: 1, Winner: null
};

test("normalize: partido de grupos", () => {
  const m = api.normalize(SAMPLE);
  assert.deepStrictEqual(m, {
    id: "400235455", num: 1, stage: "group", group: "A",
    date: "2026-06-11T19:00:00.000Z", city: "Ciudad de México", stadium: "Estadio Ciudad de México",
    home: "43911", away: "43883", phA: null, phB: null,
    hs: null, as: null, hp: null, ap: null, status: "scheduled", winner: null
  });
});

test("normalize: descarta placeholders de la API en partidos de grupos", () => {
  const withPh = Object.assign({}, SAMPLE, { PlaceHolderA: "A1", PlaceHolderB: "A2" });
  const m = api.normalize(withPh);
  assert.strictEqual(m.phA, null);
  assert.strictEqual(m.phB, null);
});

test("normalize: eliminatoria sin equipos definidos", () => {
  const m = api.normalize(SAMPLE_KO);
  assert.strictEqual(m.stage, "r32");
  assert.strictEqual(m.group, null);
  assert.strictEqual(m.home, null);
  assert.strictEqual(m.phA, "2A");
  assert.strictEqual(m.phB, "2B");
});

test("normalize: rechaza IDs, fechas, grupos, placeholders y marcadores manipulados", () => {
  const bad = Object.assign({}, SAMPLE_KO, {
    IdMatch: '400235527" onmouseover="alert(1)',
    MatchNumber: "73<script>",
    GroupName: [{ Description: "Grupo A<script>" }],
    Date: '2026-06-28T19:00:00Z" onmouseover="alert(1)',
    Home: { IdTeam: '43911" autofocus onfocus="alert(1)' },
    PlaceHolderA: 'W73" onmouseover="alert(1)',
    HomeTeamScore: "<img src=x onerror=alert(1)>",
    Winner: "43911<script>"
  });
  const m = api.normalize(bad);
  assert.strictEqual(m.id, null);
  assert.strictEqual(m.num, null);
  assert.strictEqual(m.date, null);
  assert.strictEqual(m.group, null);
  assert.strictEqual(m.home, null);
  assert.strictEqual(m.phA, null);
  assert.strictEqual(m.hs, null);
  assert.strictEqual(m.winner, null);
});

test("mapStatus", () => {
  assert.strictEqual(api.mapStatus(0), "played");
  assert.strictEqual(api.mapStatus(3), "live");
  assert.strictEqual(api.mapStatus(12), "live");
  assert.strictEqual(api.mapStatus(1), "scheduled");
  assert.strictEqual(api.mapStatus(2), "scheduled");
});

test("merge: lo vivo pisa al snapshot por id, conserva orden", () => {
  const snap = [{ id: "a", num: 1, hs: null, status: "scheduled" }, { id: "b", num: 2, hs: null, status: "scheduled" }];
  const live = [{ id: "b", num: 2, hs: 2, as: 0, status: "played" }];
  const out = api.merge(snap, live);
  assert.strictEqual(out[0].id, "a");
  assert.strictEqual(out[0].status, "scheduled");
  assert.strictEqual(out[1].hs, 2);
  assert.strictEqual(out[1].status, "played");
});
