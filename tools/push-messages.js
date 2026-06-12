/* Lógica pura de los push pre-partido: conteo de resultados más votados y
   armado de título/cuerpo. Separada de send-push-reminders.js para testearla
   (ese script ejecuta main() al cargarse). */

const MIN_PICKS = 3;

// hora local de Curaçao, p. ej. "3:00 p. m."
function horaTxt(iso) {
  return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Curacao" })
    .format(new Date(iso)).replace(/\s/g, " ");
}

// predictions crudas → { matchId: {home, draw, away, total} }
function tallyByMatch(preds) {
  const out = {};
  (Array.isArray(preds) ? preds : []).forEach(function (p) {
    if (!p || p.match_id == null) return;
    const hg = Number(p.hg), ag = Number(p.ag);
    if (!Number.isInteger(hg) || !Number.isInteger(ag)) return;
    const t = out[p.match_id] = out[p.match_id] || { home: 0, draw: 0, away: 0, total: 0 };
    if (hg > ag) t.home++; else if (hg < ag) t.away++; else t.draw++;
    t.total++;
  });
  return out;
}

function teamName(teams, id) {
  const t = id != null ? teams[id] : null;
  return t ? { name: t.name, flag: t.flag || "" } : null;
}

// resultado más votado; empate técnico → orden local, empate, visitante
function topOutcome(tally) {
  if (tally.home >= tally.draw && tally.home >= tally.away) return { key: "home", n: tally.home };
  if (tally.draw >= tally.away) return { key: "draw", n: tally.draw };
  return { key: "away", n: tally.away };
}

// frase del % para un partido (cuerpo de push de un solo partido)
function matchSummary(match, teams, tally) {
  if (!tally || tally.total < MIN_PICKS) return "¡Sé de los primeros en pronosticar!";
  const top = topOutcome(tally);
  const pct = Math.round((top.n / tally.total) * 100);
  if (top.key === "draw") return "El " + pct + "% de la quiniela espera empate";
  const team = teamName(teams, top.key === "home" ? match.home : match.away);
  if (!team) return "¡Sé de los primeros en pronosticar!";
  return "El " + pct + "% de la quiniela espera que gane " + (team.flag ? team.flag + " " : "") + team.name;
}

// línea corta por partido (cuerpo de push con varios partidos)
function matchLine(match, teams, tally) {
  const home = teamName(teams, match.home);
  const away = teamName(teams, match.away);
  const vs = home && away ? home.name + " vs " + away.name : "Partido " + match.num;
  if (!tally || tally.total < MIN_PICKS) return vs + ": aún sin picks";
  const top = topOutcome(tally);
  const pct = Math.round((top.n / tally.total) * 100);
  if (top.key === "draw") return vs + ": " + pct + "% empate";
  const team = top.key === "home" ? home : away;
  return team ? vs + ": " + pct + "% con " + team.name : vs + ": aún sin picks";
}

// push completo {title, body} para 1..n partidos simultáneos
function buildPush(matches, teams, tallies, missingPick) {
  const hora = horaTxt(matches[0].date);
  let title, body;
  if (matches.length === 1) {
    const m = matches[0];
    const home = teamName(teams, m.home);
    const away = teamName(teams, m.away);
    title = "⚽ " + (home && away ? home.name + " vs " + away.name : "El partido") + " · " + hora;
    body = matchSummary(m, teams, tallies[m.id]);
  } else {
    title = "⚽ " + matches.length + " partidos arrancan a las " + hora;
    body = matches.map(function (m) { return matchLine(m, teams, tallies[m.id]); }).join("\n");
  }
  if (missingPick) body += "\n👉 ¡Aún te falta tu pick!";
  return { title: title, body: body };
}

module.exports = { tallyByMatch: tallyByMatch, matchSummary: matchSummary, matchLine: matchLine, buildPush: buildPush, horaTxt: horaTxt, MIN_PICKS: MIN_PICKS };
