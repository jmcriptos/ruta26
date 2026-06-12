const test = require("node:test");
const assert = require("node:assert");
const { buildEspnMap } = require("../tools/generate-espn-map.js");

const TEAMS = {
  "43911": { id: "43911", code: "MEX" },
  "43883": { id: "43883", code: "RSA" },
  "43924": { id: "43924", code: "KOR" },
  "43950": { id: "43950", code: "CZE" }
};

function espnEvent(id, date, homeAbbr, awayAbbr) {
  return {
    id: id,
    date: date,
    competitions: [{
      competitors: [
        { homeAway: "home", team: { abbreviation: homeAbbr } },
        { homeAway: "away", team: { abbreviation: awayAbbr } }
      ]
    }]
  };
}

test("buildEspnMap: empareja por kickoff cuando es único", () => {
  const matches = [{ id: "400021443", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" }];
  const events = [espnEvent("760415", "2026-06-11T19:00Z", "MEX", "RSA")];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { "400021443": "760415" });
});

test("buildEspnMap: desempata partidos simultáneos por abreviaturas", () => {
  const matches = [
    { id: "f1", num: 53, date: "2026-06-25T01:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 54, date: "2026-06-25T01:00:00.000Z", home: "43924", away: "43950" }
  ];
  const events = [
    espnEvent("e2", "2026-06-25T01:00Z", "KOR", "CZE"),
    espnEvent("e1", "2026-06-25T01:00Z", "MEX", "RSA")
  ];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { f1: "e1", f2: "e2" });
});

test("buildEspnMap: eliminatoria sin equipos empareja por kickoff único", () => {
  const matches = [{ id: "f73", num: 73, date: "2026-06-28T19:00:00.000Z", home: null, away: null }];
  const events = [espnEvent("e73", "2026-06-28T19:00Z", "2A", "2B")];
  assert.deepStrictEqual(buildEspnMap(matches, TEAMS, events), { f73: "e73" });
});

test("buildEspnMap: lanza si un partido queda sin evento", () => {
  const matches = [{ id: "f1", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" }];
  assert.throws(() => buildEspnMap(matches, TEAMS, []), /sin evento ESPN/);
});

test("buildEspnMap: lanza si la colisión no se puede desempatar", () => {
  const matches = [
    { id: "f1", num: 53, date: "2026-06-25T01:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 54, date: "2026-06-25T01:00:00.000Z", home: "43924", away: "43950" }
  ];
  // dos eventos a la misma hora pero ninguno con MEX-RSA
  const events = [
    espnEvent("e1", "2026-06-25T01:00Z", "KOR", "CZE"),
    espnEvent("e2", "2026-06-25T01:00Z", "ARG", "BRA")
  ];
  assert.throws(() => buildEspnMap(matches, TEAMS, events), /no se pudo desempatar|sin evento ESPN/);
});

test("buildEspnMap: no reutiliza el mismo evento ESPN dos veces", () => {
  const matches = [
    { id: "f1", num: 1, date: "2026-06-11T19:00:00.000Z", home: "43911", away: "43883" },
    { id: "f2", num: 2, date: "2026-06-11T19:00:00.000Z", home: "43924", away: "43950" }
  ];
  const events = [espnEvent("e1", "2026-06-11T19:00Z", "MEX", "RSA")];
  assert.throws(() => buildEspnMap(matches, TEAMS, events));
});
