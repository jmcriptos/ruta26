// Uso: node tools/generate-espn-map.js
// Descarga el calendario del Mundial 2026 de ESPN y escribe js/espn-map.js
// (mapeo id partido FIFA -> id evento ESPN, para el detalle de finalizados).
const fs = require("fs");
const path = require("path");

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";

function eventTeams(ev) {
  const comps = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || [];
  const out = { home: null, away: null };
  comps.forEach(function (c) {
    if (c && (c.homeAway === "home" || c.homeAway === "away") && c.team) {
      out[c.homeAway] = c.team.abbreviation || null;
    }
  });
  return out;
}

// matches/teams: snapshot FIFA (js/data.js); events: scoreboard ESPN.
// Devuelve { idFifa: idEspn } o lanza si algo no cuadra.
function buildEspnMap(matches, teams, events) {
  const byKick = {};
  events.forEach(function (ev) {
    const ms = Date.parse(ev.date);
    if (!Number.isFinite(ms)) throw new Error("Evento ESPN " + ev.id + " sin fecha válida");
    (byKick[ms] = byKick[ms] || []).push(ev);
  });

  const used = {};
  const map = {};
  matches.forEach(function (m) {
    const candidates = (byKick[Date.parse(m.date)] || []).filter(function (ev) { return !used[ev.id]; });
    let pick = null;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else if (candidates.length > 1) {
      const homeCode = m.home && teams[m.home] ? teams[m.home].code : null;
      const awayCode = m.away && teams[m.away] ? teams[m.away].code : null;
      const matched = candidates.filter(function (ev) {
        const t = eventTeams(ev);
        return homeCode && awayCode && t.home === homeCode && t.away === awayCode;
      });
      if (matched.length !== 1) {
        throw new Error("Partido " + m.num + ": no se pudo desempatar entre " + candidates.length + " eventos ESPN simultáneos");
      }
      pick = matched[0];
    }
    if (!pick) throw new Error("Partido " + m.num + " (" + m.date + ") sin evento ESPN");
    used[pick.id] = true;
    map[m.id] = String(pick.id);
  });
  return map;
}

async function main() {
  // js/data.js es un script de navegador; extraer el JSON del snapshot.
  const dataJs = fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8");
  const snap = JSON.parse(dataJs.match(/WC\.SNAPSHOT = (.*);\n$/s)[1]);

  const res = await fetch(SCOREBOARD);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const events = (await res.json()).events || [];

  const map = buildEspnMap(snap.matches, snap.teams, events);
  const n = Object.keys(map).length;
  if (n !== 104) throw new Error("Esperaba 104 mapeos, hay " + n);

  const out = "// Generado por tools/generate-espn-map.js el " + new Date().toISOString() + " — no editar a mano.\n" +
    "window.WC = window.WC || {};\n" +
    "WC.ESPN_MAP = " + JSON.stringify(map) + ";\n";
  fs.writeFileSync(path.join(__dirname, "..", "js", "espn-map.js"), out);
  console.log("OK: " + n + " partidos mapeados → js/espn-map.js");
}

module.exports = { buildEspnMap: buildEspnMap, eventTeams: eventTeams };
if (require.main === module) main();
