/* Lógica pura de los push pre-partido: conteo de resultados más votados y
   armado de título/cuerpo. Separada de send-push-reminders.js para testearla
   (ese script ejecuta main() al cargarse). */

const MIN_PICKS = 3;

// hora local de Curaçao, p. ej. "3:00 p. m."
function horaTxt(iso) {
  return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZone: "America/Curacao" })
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

function matchDisplayName(match, teams) {
  const home = teamName(teams || {}, match && match.home);
  const away = teamName(teams || {}, match && match.away);
  return home && away ? home.name + " vs " + away.name : "el partido";
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

/* ---------- Story 2.1: guardrails de push (puro, testeable) ---------- */
// Prioridad de "Oportunidad más fuerte" (PD3 / engagement-contract.md).
const REASON_PRIORITY = { pending_pick: 5, captain: 4, reachable_rival: 3, rival_threat: 2, win_matchday: 1 };

// Bloque horario (PD1): hora local Curaçao del kickoff → "YYYY-MM-DDTHH".
function blockHourKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Curacao", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d);
  const g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value || ""; };
  return g("year") + "-" + g("month") + "-" + g("day") + "T" + g("hour");
}
function matchDayKey(iso) { return blockHourKey(iso).slice(0, 10); }

function buildOpportunityCandidates(userIds, matches, predictions, captains, teams, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const hasPred = new Set((predictions || []).map(function (p) { return p.user_id + "|" + p.match_id; }));
  const hasCaptain = new Set((captains || []).map(function (c) { return c.user_id + "|" + c.match_id; }));
  const safeMatches = (matches || []).filter(function (m) {
    return m && m.id && m.status === "scheduled" && m.home && m.away && new Date(m.date).getTime() > now;
  });
  const out = [];
  (userIds || []).forEach(function (uid) {
    safeMatches.forEach(function (m) {
      const key = uid + "|" + m.id;
      let reason = null;
      if (!hasPred.has(key)) reason = "pending_pick";
      else if (m.stage !== "group" && !hasCaptain.has(key)) reason = "captain";
      if (!reason) return;
      out.push({
        userId: uid,
        matchId: m.id,
        reason: reason,
        kickoffAt: m.date,
        opp: {
          reason: reason,
          match: { id: m.id, name: matchDisplayName(m, teams), kickoffAt: m.date },
          rival: null
        }
      });
    });
  });
  return out;
}

// Aplica guardrails a candidatos de push de un proceso.
// candidates: [{userId, matchId, reason, kickoffAt, suppressed?}]
// opts: { alreadySent: Set("user|match|reason" enviados <24h), sentTodayCount: {userId:n} }
// Reglas: descarta suprimidos y ya-enviados; 1 por bloque horario (mayor prioridad);
// máximo 2 por jugador por día (contando los ya enviados hoy).
function applyGuardrails(candidates, opts) {
  opts = opts || {};
  const alreadySent = opts.alreadySent || new Set();
  const sentToday = opts.sentTodayCount || {};
  const DAILY_LIMIT = 2;
  const pri = function (r) { return REASON_PRIORITY[r] || 0; };
  const cands = (candidates || []).filter(function (c) {
    return c && !c.suppressed && !alreadySent.has(c.userId + "|" + c.matchId + "|" + c.reason);
  });
  // 1 por (usuario, bloque horario): el de mayor prioridad (empate → kickoff más cercano)
  const byBlock = {};
  cands.forEach(function (c) {
    const k = c.userId + "|" + blockHourKey(c.kickoffAt);
    const cur = byBlock[k];
    if (!cur || pri(c.reason) > pri(cur.reason) ||
      (pri(c.reason) === pri(cur.reason) && new Date(c.kickoffAt) < new Date(cur.kickoffAt))) byBlock[k] = c;
  });
  const winners = Object.keys(byBlock).map(function (k) { return byBlock[k]; });
  winners.sort(function (a, b) { return pri(b.reason) - pri(a.reason) || new Date(a.kickoffAt) - new Date(b.kickoffAt); });
  // límite diario por usuario
  const used = {}, out = [];
  winners.forEach(function (c) {
    const total = (sentToday[c.userId] || 0) + (used[c.userId] || 0);
    if (total >= DAILY_LIMIT) return; // suprimido por intensidad segura
    used[c.userId] = (used[c.userId] || 0) + 1;
    out.push(c);
  });
  return out;
}

/* ---------- Story 2.2: copy del push de Oportunidad (puro, testeable) ---------- */
// Lista cerrada de copy seguro (≤3 líneas, sin culpa/humillación). {x}=placeholder.
const OPP_PUSH_COPY = {
  pending_pick: "👉 Aún te falta tu pick de {match}",
  captain: "⭐ Elige tu Capitán para {match}",
  reachable_rival: "Estás a {gap} de {rival}",
  rival_threat: "{rival} te pisa los talones",
  win_matchday: "Hoy puedes ganar la jornada"
};
// opp: view model de WC.engagement.opportunity (reason, match{id,name}, rival{username,pointsGap}).
// Devuelve {title, body, data} con metadata allowlisted para atribución, o null.
function buildOpportunityPush(opp, hora) {
  if (!opp || !OPP_PUSH_COPY[opp.reason]) return null;
  const matchName = opp.match && opp.match.name
    ? opp.match.name
    : (opp.match && opp.match.homeName && opp.match.awayName ? opp.match.homeName + " vs " + opp.match.awayName : "el partido");
  const body = OPP_PUSH_COPY[opp.reason]
    .replace("{match}", matchName)
    .replace("{gap}", opp.rival ? opp.rival.pointsGap : "")
    .replace("{rival}", opp.rival ? opp.rival.username : "");
  return {
    title: "⚽ Tu quiniela" + (hora ? " · " + hora : ""),
    body: body,
    data: { reason: opp.reason, matchId: opp.match ? opp.match.id : "", blockHour: opp.match ? blockHourKey(opp.match.kickoffAt) : "", campaign: "opportunity" }
  };
}

module.exports = {
  tallyByMatch: tallyByMatch, matchSummary: matchSummary, matchLine: matchLine, buildPush: buildPush,
  horaTxt: horaTxt, MIN_PICKS: MIN_PICKS,
  REASON_PRIORITY: REASON_PRIORITY, blockHourKey: blockHourKey, matchDayKey: matchDayKey,
  buildOpportunityCandidates: buildOpportunityCandidates,
  applyGuardrails: applyGuardrails, buildOpportunityPush: buildOpportunityPush
};
