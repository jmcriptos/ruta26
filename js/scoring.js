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

  // Capitán contracorriente (aditivo). El capitán SUMA un bono a lo ganado en el
  // partido, solo si acierta (puntos > 0); nunca resta. En dieciseisavos (r32) el
  // bono premia ir contracorriente según qué tan acompañado estuvo el acierto
  // (pCorrect = fracción de la liga que acertó el avance). De octavos en adelante
  // (incl. 3er lugar) es un bono fijo. Grupos no se capitanean.
  const CAPTAIN_FIXED_BONUS = 2;
  // Escalones r32: pCorrect < maxP → bono. Ordenados del más raro al más común.
  const CAPTAIN_R32_TIERS = [
    { maxP: 0.20, bonus: 4 },
    { maxP: 0.35, bonus: 3 },
    { maxP: 0.60, bonus: 2 },
    { maxP: Infinity, bonus: 1 }
  ];

  // Bono aditivo del capitán para un partido (0 en grupos). pCorrect (0..1) solo
  // se usa en r32; sin dato válido se asume el escalón más común.
  function captainBonus(match, pCorrect) {
    if (!match || match.stage === "group") return 0;
    if (match.stage !== "r32") return CAPTAIN_FIXED_BONUS;
    const p = (typeof pCorrect === "number" && pCorrect >= 0) ? pCorrect : 1;
    for (let i = 0; i < CAPTAIN_R32_TIERS.length; i++) {
      if (p < CAPTAIN_R32_TIERS[i].maxP) return CAPTAIN_R32_TIERS[i].bonus;
    }
    return 1;
  }

  // Total de un partido capitaneado: lo ganado + el bono (solo si acertó).
  function captainTotal(s, match, pCorrect) {
    if (!s || s.points <= 0 || match.stage === "group") return s ? s.points : 0;
    return s.points + captainBonus(match, pCorrect);
  }

  function maxCaptainBonus(match) {
    if (!match || match.stage === "group") return 0;
    if (match.stage === "r32") return CAPTAIN_R32_TIERS.reduce(function (max, tier) {
      return Math.max(max, tier.bonus);
    }, 0);
    return CAPTAIN_FIXED_BONUS;
  }

  // Potencial máximo de puntos para un partido, usado por engagement para saber
  // si una meta cercana es realmente alcanzable sin duplicar reglas de scoring.
  function maxMatchPoints(match, opts) {
    if (!match) return 0;
    let base;
    if (match.stage === "final") base = POINTS.finalExact;
    else if (match.stage === "group") base = POINTS.match;
    else base = POINTS.match + POINTS.pens;
    return base + (opts && opts.captain ? maxCaptainBonus(match) : 0);
  }

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

  function buildLeaderboard(profiles, predictions, picks, matches, captains) {
    const matchById = {};
    matches.forEach(function (m) { matchById[m.id] = m; });
    const captainSet = {};
    (captains || []).forEach(function (c) { captainSet[c.user_id + "|" + c.match_id] = true; });
    // Tally del avance por partido: pCorrect = % de la liga que acertó quién avanzó
    // (insumo del bono contracorriente del capitán en r32).
    const tallyByMatch = {};
    predictions.forEach(function (pr) {
      const match = matchById[pr.match_id];
      if (!match) return;
      const t = tallyByMatch[pr.match_id] || (tallyByMatch[pr.match_id] = { total: 0, correct: 0 });
      t.total++;
      if (match.winner && (pr.hg > pr.ag ? match.home : match.away) === match.winner) t.correct++;
    });
    function pCorrectFor(matchId) {
      const t = tallyByMatch[matchId];
      return t && t.total > 0 ? t.correct / t.total : 1;
    }
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
      const isCap = captainSet[pr.user_id + "|" + pr.match_id];
      row.points += isCap ? captainTotal(s, match, pCorrectFor(pr.match_id)) : s.points;
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
    // pos = posición con saltos por empate; tier = nivel de puntaje distinto
    // (1 = puntaje más alto, 2 = siguiente…). Las medallas usan tier (1-3).
    let pos = 0, lastPoints = null, tier = 0;
    rows.forEach(function (r, i) {
      if (lastPoints === null || r.points < lastPoints) { pos = i + 1; lastPoints = r.points; tier++; }
      r.pos = pos;
      r.tier = tier;
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
  function buildLiveLeaderboard(profiles, predictions, picks, matches, captains) {
    const official = buildLeaderboard(profiles, predictions, picks, matches, captains);
    const rows = buildLeaderboard(profiles, predictions, picks, matches.map(freezeLive), captains);
    const offByUser = {};
    official.forEach(function (r) { offByUser[r.userId] = r; });
    rows.forEach(function (r) {
      const o = offByUser[r.userId];
      r.livePoints = o ? r.points - o.points : 0;
      r.delta = o ? o.pos - r.pos : 0;
    });
    return rows;
  }

  const scoring = { POINTS: POINTS, CAPTAIN_FIXED_BONUS: CAPTAIN_FIXED_BONUS, CAPTAIN_R32_TIERS: CAPTAIN_R32_TIERS, CHAMPION_LOCK: CHAMPION_LOCK, scoreMatch: scoreMatch, captainBonus: captainBonus, captainTotal: captainTotal, maxCaptainBonus: maxCaptainBonus, maxMatchPoints: maxMatchPoints, scoreChampion: scoreChampion, buildLeaderboard: buildLeaderboard, freezeLive: freezeLive, buildLiveLeaderboard: buildLiveLeaderboard };
  root.WC = root.WC || {};
  root.WC.scoring = scoring;
  if (typeof module !== "undefined" && module.exports) module.exports = scoring;
})(typeof window !== "undefined" ? window : globalThis);
