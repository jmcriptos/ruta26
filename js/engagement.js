/* View models de engagement. Puro y dual-environment (browser + node:test).
   Deriva de snapshots + outputs canónicos de scoring.js. NO lee DOM, Supabase,
   fetch, localStorage, sessionStorage, push ni Date.now() (la hora entra por
   snapshot.now). Ante datos faltantes devuelve null, [] o state:"fallback".
   Contrato: docs/architecture/engagement-contract.md */
(function (root) {
  // Copy allowlist (ver engagement-contract.md). {x} = placeholder con hechos
  // visibles; el render escapa los nombres antes de interpolar.
  const COPY = {
    opp_pending_pick: "Aún te falta tu pick de {match}",
    opp_pending_cta: "Pronosticar ahora",
    opp_captain: "Elige tu Capitán para {match}",
    opp_captain_cta: "Marcar Capitán",
    opp_reachable_rival: "Estás a {gap} de {rival}",
    opp_rival_threat: "{rival} te pisa los talones",
    opp_win_matchday: "Hoy puedes ganar la jornada",
    opp_ready: "Listo: tu pick quedó guardado",
    opp_closed: "Este partido ya cerró",
    live_personal_up: "Vas subiendo: #{pos} (+{delta})",
    live_personal_down: "Cuidado: bajas a #{pos}",
    live_group: "La tabla se mueve en vivo",
    post_up: "Subiste {n} puesto(s) 🔺",
    post_down: "Bajaste {n}, hay revancha 🔁",
    post_passed: "Pasaste a {rival}",
    post_passed_by: "{rival} te pasó",
    post_points: "+{pts} pts en este partido",
    share_text: "Voy #{pos} en la quiniela del Mundial ⚽ {move}"
  };
  const STAGE_LABEL = { group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos", sf: "Semis", final: "Final", third: "3er lugar" };
  // Brecha (pts) considerada alcanzable/amenaza con los partidos del día. Afinable.
  const REACHABLE_GAP = 3, THREAT_GAP = 3;

  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ""; });
  }
  function kickoffMs(m) { const t = m && m.kickoff_at ? new Date(m.kickoff_at).getTime() : NaN; return isFinite(t) ? t : Infinity; }
  function teamName(teams, id) { const t = teams && id != null ? teams[id] : null; return t && t.name ? t.name : null; }
  function matchName(m, teams) {
    const h = teamName(teams, m.home), a = teamName(teams, m.away);
    return h && a ? h + " vs " + a : "el partido";
  }
  function matchView(m, teams) {
    return { id: m.id, homeName: teamName(teams, m.home), awayName: teamName(teams, m.away), kickoffAt: m.kickoff_at || null, stageLabel: STAGE_LABEL[m.stage] || "" };
  }

  // Story 1.3 — Oportunidad pre-partido. Prioridad determinística (ver contrato).
  function opportunity(snapshot) {
    if (!snapshot || !snapshot.meId) return null;
    const now = typeof snapshot.now === "number" ? snapshot.now : 0;
    const matches = snapshot.matches || [];
    const myPreds = snapshot.myPredictions || {};
    const myCaps = snapshot.myCaptains || [];
    const official = snapshot.official || [];
    const teams = snapshot.teams || {};

    const upcoming = matches
      .filter(function (m) { return m.status !== "played" && kickoffMs(m) > now; })
      .sort(function (a, b) { return kickoffMs(a) - kickoffMs(b) || String(a.id).localeCompare(String(b.id)); });

    function vm(state, match, rival, ctaKey, headlineKey, vars) {
      return {
        state: state, reason: state,
        match: match ? matchView(match, teams) : null,
        rival: rival,
        primaryAction: ctaKey && match ? { label: COPY[ctaKey], targetMatchId: match.id } : null,
        copy: { headline: fill(COPY[headlineKey], vars), sub: match ? matchName(match, teams) : "" }
      };
    }

    // 1) pending_pick
    const noPick = upcoming.find(function (m) { return !myPreds[m.id]; });
    if (noPick) return vm("pending_pick", noPick, null, "opp_pending_cta", "opp_pending_pick", { match: matchName(noPick, teams) });

    // 2) captain (eliminatoria con pick y sin capitán en ese partido)
    const capMatch = upcoming.find(function (m) {
      return m.stage !== "group" && myPreds[m.id] && !myCaps.some(function (c) { return c.match_id === m.id; });
    });
    if (capMatch) return vm("captain", capMatch, null, "opp_captain_cta", "opp_captain", { match: matchName(capMatch, teams) });

    // 3/4) rival cercano por ranking oficial
    const meIdx = official.findIndex(function (r) { return r.userId === snapshot.meId; });
    const nextMatch = upcoming[0] || null;
    if (meIdx >= 0) {
      const me = official[meIdx], above = official[meIdx - 1], below = official[meIdx + 1];
      if (above && (above.points - me.points) <= REACHABLE_GAP) {
        const gap = above.points - me.points;
        return vm("reachable_rival", nextMatch, { username: above.username, pos: above.pos, pointsGap: gap }, null, "opp_reachable_rival", { gap: gap, rival: above.username });
      }
      if (below && (me.points - below.points) <= THREAT_GAP) {
        return vm("rival_threat", nextMatch, { username: below.username, pos: below.pos, pointsGap: me.points - below.points }, null, "opp_rival_threat", { rival: below.username });
      }
    }

    // 5) win_matchday (si quedan partidos) o fallback
    if (nextMatch) return vm("win_matchday", nextMatch, null, null, "opp_win_matchday", {});
    return { state: "fallback", reason: null, match: null, rival: null, primaryAction: null, copy: null };
  }

  function liveTension(snapshot) {
    return { state: "fallback", message: null, me: null, rows: [] };
  }

  function predictionGroups(snapshot, matchId) {
    return { state: "empty", matchId: matchId || null, groups: [] };
  }

  function postMatchSummary(snapshot, beforeRows, afterRows) {
    return null;
  }

  function whatsappShare(summaryVm, snapshot) {
    return null;
  }

  const engagement = {
    opportunity: opportunity,
    liveTension: liveTension,
    predictionGroups: predictionGroups,
    postMatchSummary: postMatchSummary,
    whatsappShare: whatsappShare
  };
  root.WC = root.WC || {};
  root.WC.engagement = engagement;
  if (typeof module !== "undefined" && module.exports) module.exports = engagement;
})(typeof window !== "undefined" ? window : globalThis);
