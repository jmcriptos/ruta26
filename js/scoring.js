/* Puntos de la quiniela. Puro y dual-environment (browser + node:test). */
(function (root) {
  const POINTS = {
    match: 1,        // grupos y eliminatorias: acertar resultado/quién avanza
    pens: 1,         // eliminatorias: extra por acertar "por penales"
    finalExact: 3,   // final: marcador exacto
    finalOutcome: 1, // final: solo resultado
    champion: 15
  };
  const CHAMPION_LOCK = "2026-06-28T19:00:00Z";

  function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }

  // pred = {hg, ag, pens}. Codificación: grupos/final marcador real o canónico
  // (1-0 local, 0-0 empate, 0-1 visitante); eliminatorias 1-0 avanza local / 0-1 avanza visitante.
  // kind: "exact" (solo final) | "outcome" | "miss" | "pending" | "none".
  function scoreMatch(pred, match) {
    if (!pred || pred.hg == null || pred.ag == null || !isFinite(pred.hg) || !isFinite(pred.ag)) return { points: 0, kind: "none" };
    if (match.status !== "played" || match.hs == null) return { points: 0, kind: "pending" };

    if (match.stage === "final") {
      if (pred.hg === match.hs && pred.ag === match.as) return { points: POINTS.finalExact, kind: "exact" };
      if (sign(pred.hg - pred.ag) === sign(match.hs - match.as)) return { points: POINTS.finalOutcome, kind: "outcome" };
      return { points: 0, kind: "miss" };
    }

    if (match.stage === "group") {
      if (sign(pred.hg - pred.ag) === sign(match.hs - match.as)) return { points: POINTS.match, kind: "outcome" };
      return { points: 0, kind: "miss" };
    }

    // eliminatorias: quién avanza (+ penales). La UI solo escribe (1,0) local o (0,1) visitante; 0-0 no es pick válido aquí.
    const predWinner = pred.hg > pred.ag ? match.home : match.away;
    if (!match.winner || predWinner !== match.winner) return { points: 0, kind: "miss" };
    let points = POINTS.match;
    if (pred.pens && match.hp != null) points += POINTS.pens; // hubo tanda de penales
    return { points: points, kind: "outcome" };
  }

  function scoreChampion(pick, matches) {
    if (!pick) return 0;
    const final = matches.find(function (m) { return m.stage === "final"; });
    if (!final || final.status !== "played" || !final.winner) return 0;
    return pick.team_id === final.winner ? POINTS.champion : 0;
  }

  function buildLeaderboard(profiles, predictions, picks, matches) {
    const matchById = {};
    matches.forEach(function (m) { matchById[m.id] = m; });
    const rowByUser = {};
    const rows = profiles.map(function (p) {
      const row = { userId: p.id, username: p.username, points: 0, exact: 0, outcome: 0, bonus: 0, predicted: 0, decided: 0 };
      rowByUser[p.id] = row;
      return row;
    });
    predictions.forEach(function (pr) {
      const row = rowByUser[pr.user_id];
      const match = matchById[pr.match_id];
      if (!row || !match) return;
      row.predicted++;
      const s = scoreMatch({ hg: pr.hg, ag: pr.ag, pens: pr.pens }, match);
      row.points += s.points;
      if (s.kind === "exact") row.exact++;
      if (s.kind === "outcome") row.outcome++;
      // decided = picks de partidos ya resueltos (acierto o fallo); excluye pendientes/sin pick
      if (s.kind === "exact" || s.kind === "outcome" || s.kind === "miss") row.decided++;
    });
    picks.forEach(function (pk) {
      const row = rowByUser[pk.user_id];
      if (!row) return;
      const b = scoreChampion(pk, matches);
      row.points += b;
      row.bonus = b;
    });
    rows.sort(function (x, y) {
      return y.points - x.points || y.exact - x.exact || (x.username || "").localeCompare(y.username || "", "es");
    });
    let pos = 0, lastPoints = null;
    rows.forEach(function (r, i) {
      if (lastPoints === null || r.points < lastPoints) { pos = i + 1; lastPoints = r.points; }
      r.pos = pos;
    });
    return rows;
  }

  // Partido en vivo "congelado" como si el marcador actual fuera el final.
  // Eliminatorias empatadas sin tanda definida no tienen ganador provisional (nadie suma).
  function freezeLive(m) {
    if (m.status !== "live" || m.hs == null) return m;
    let winner = m.winner;
    if (!winner && m.stage !== "group") {
      if (m.hs > m.as) winner = m.home;
      else if (m.hs < m.as) winner = m.away;
      else if (m.hp != null && m.ap != null && m.hp !== m.ap) winner = m.hp > m.ap ? m.home : m.away;
    }
    return Object.assign({}, m, { status: "played", winner: winner });
  }

  // Ranking provisional: igual que el oficial pero con los partidos en vivo congelados.
  // Cada fila trae además livePoints (puntos que ganaría hoy) y delta (posiciones que sube/baja).
  function buildLiveLeaderboard(profiles, predictions, picks, matches) {
    const official = buildLeaderboard(profiles, predictions, picks, matches);
    const rows = buildLeaderboard(profiles, predictions, picks, matches.map(freezeLive));
    const offByUser = {};
    official.forEach(function (r) { offByUser[r.userId] = r; });
    rows.forEach(function (r) {
      const o = offByUser[r.userId];
      r.livePoints = o ? r.points - o.points : 0;
      r.delta = o ? o.pos - r.pos : 0;
    });
    return rows;
  }

  const scoring = { POINTS: POINTS, CHAMPION_LOCK: CHAMPION_LOCK, scoreMatch: scoreMatch, scoreChampion: scoreChampion, buildLeaderboard: buildLeaderboard, freezeLive: freezeLive, buildLiveLeaderboard: buildLiveLeaderboard };
  root.WC = root.WC || {};
  root.WC.scoring = scoring;
  if (typeof module !== "undefined" && module.exports) module.exports = scoring;
})(typeof window !== "undefined" ? window : globalThis);
