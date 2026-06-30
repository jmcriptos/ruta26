/* Candidato de oportunidad para el push (batacazo / rival cercano). Puro y
   testeable: reusa la lógica única de engagement.opportunity. Vive aparte del
   sender para poder testearse sin disparar el envío. */
const scoring = require("../js/scoring.js");
const engagement = require("../js/engagement.js");

// Adapta un partido del snapshot/FIFA a la forma que espera engagement.
function engagementMatch(m) {
  return { id: m.id, stage: m.stage, status: m.status, kickoff_at: m.date, home: m.home, away: m.away, winner: m.winner };
}

// Decide si un usuario tiene una oportunidad accionable para los partidos de la
// ventana (`soon`). `allMatches` es la lista COMPLETA: se necesita para incluir
// los partidos donde el usuario YA marcó su batacazo aunque estén fuera de la
// ventana o ya jugados — si no, engagement no puede resolver el día de ese
// batacazo y reofrece el batacazo en otro partido de la misma jornada (el push
// se reenviaba aunque el jugador ya lo había marcado). El batacazo es uno por
// jornada (día), no por partido.
function userOpportunityCandidate(uid, soon, teams, official, allPreds, caps, now, allMatches) {
  const myPredictions = {};
  allPreds.forEach(function (p) {
    if (p.user_id === uid) myPredictions[p.match_id] = { hg: p.hg, ag: p.ag, pens: !!p.pens };
  });
  const myCaptains = (caps || []).filter(function (c) { return c.user_id === uid; });

  const soonIds = {};
  soon.forEach(function (m) { soonIds[m.id] = true; });
  const capMatches = (allMatches || []).filter(function (m) {
    return !soonIds[m.id] && myCaptains.some(function (c) { return c.match_id === m.id; });
  });

  const matchPotentials = {};
  soon.forEach(function (m) {
    const isCap = myCaptains.some(function (c) { return c.match_id === m.id; });
    matchPotentials[m.id] = scoring.maxMatchPoints(m, { captain: isCap });
  });

  const opp = engagement.opportunity({
    now: now,
    meId: uid,
    official: official,
    live: [],
    matches: soon.concat(capMatches).map(engagementMatch),
    matchPotentials: matchPotentials,
    myPredictions: myPredictions,
    myCaptains: myCaptains,
    visiblePredictions: [],
    teams: teams
  });
  if (!opp || !opp.match || ["captain", "reachable_rival", "rival_threat"].indexOf(opp.reason) === -1) return null;
  return {
    userId: uid,
    matchId: opp.match.id,
    reason: opp.reason,
    kind: "opportunity",
    kickoffAt: opp.match.kickoffAt,
    opp: opp
  };
}

module.exports = { engagementMatch: engagementMatch, userOpportunityCandidate: userOpportunityCandidate };
