/* Puntos de la quiniela. Puro y dual-environment (browser + node:test). */
(function (root) {
  const POINTS = {
    match: 1,        // grupos: acertar el 1X2 (gana/empata/pierde)
    finalExact: 3,   // KO (incl. final): marcador exacto
    finalOutcome: 1, // KO (incl. final): solo el resultado (signo)
    koAdvance: 1,    // KO con avance (r32-sf): acertar quién avanza
    champion: 15
  };
  const CHAMPION_LOCK = "2026-06-28T19:00:00Z";

  // Batacazo (antes "capitán"). Bono aditivo a lo ganado en un partido de
  // eliminatorias, solo si se acierta (puntos > 0); nunca resta. Premia ir
  // contracorriente: cuanto menos acompañado estuvo el acierto (pCorrect =
  // fracción de la liga que acertó el avance), más suma. La MISMA escala aplica
  // en todas las rondas KO (R32 → final, incl. 3er lugar): no se aplana al final.
  // Techo +3; el favorito obvio (≥65% lo tenía) paga 0: ir con la masa no es
  // batacazo. Grupos no se batacazean.
  const CAPTAIN_TIERS = [
    { maxP: 0.25, bonus: 3 },    // casi nadie lo tenía
    { maxP: 0.45, bonus: 2 },
    { maxP: 0.65, bonus: 1 },
    { maxP: Infinity, bonus: 0 } // favorito obvio
  ];

  // Promo de una jornada (viernes 3 jul 2026): quien marque el cruce
  // Argentina–Cabo Verde (R32, id 400021521) como batacazo APOSTANDO por Cabo
  // Verde (predijo que Cabo Verde avanza) cobra un premio fijo de +50 —encima de
  // lo que gane el pick, en lugar de la escala de rareza— si Cabo Verde avanza.
  // Si el pick va con Argentina, o Cabo Verde no avanza, no aplica (rige la
  // escala normal). Amarrado por match_id + team_id para que sea un evento único.
  const SPECIAL_BATACAZO = { matchId: "400021521", teamId: "43850", bonus: 50 };

  // Bono aditivo del batacazo para un partido (0 en grupos). pCorrect (0..1) es
  // la fracción de la liga que acertó el avance; sin dato válido se asume 1
  // (favorito obvio → 0).
  function captainBonus(match, pCorrect) {
    if (!match || match.stage === "group") return 0;
    const p = (typeof pCorrect === "number" && pCorrect >= 0) ? pCorrect : 1;
    for (let i = 0; i < CAPTAIN_TIERS.length; i++) {
      if (p < CAPTAIN_TIERS[i].maxP) return CAPTAIN_TIERS[i].bonus;
    }
    return 0;
  }

  // ¿La apuesta ya resuelta cae en la promo especial? (batacazo sobre el cruce
  // marcado, el pick va con Cabo Verde y Cabo Verde avanzó). pred = {hg,ag,adv}.
  function specialBatacazoApplies(match, pred) {
    return !!match && !!pred && match.id === SPECIAL_BATACAZO.matchId &&
      match.winner === SPECIAL_BATACAZO.teamId &&
      predWinner(pred, match) === SPECIAL_BATACAZO.teamId;
  }

  // Bono efectivo del batacazo: el premio especial si aplica, si no la escala de
  // rareza. Única fuente de verdad para scoring y para el display del bono.
  function effectiveBatacazoBonus(match, pCorrect, pred) {
    if (specialBatacazoApplies(match, pred)) return SPECIAL_BATACAZO.bonus;
    return captainBonus(match, pCorrect);
  }

  // Total de un partido con batacazo: lo ganado + el bono (solo si acertó).
  function captainTotal(s, match, pCorrect, pred) {
    if (!s || s.points <= 0 || match.stage === "group") return s ? s.points : 0;
    return s.points + effectiveBatacazoBonus(match, pCorrect, pred);
  }

  function maxCaptainBonus(match) {
    if (!match || match.stage === "group") return 0;
    return CAPTAIN_TIERS.reduce(function (max, tier) {
      return Math.max(max, tier.bonus);
    }, 0);
  }

  // Potencial máximo de puntos para un partido, usado por engagement para saber
  // si una meta cercana es realmente alcanzable sin duplicar reglas de scoring.
  function maxMatchPoints(match, opts) {
    if (!match) return 0;
    let base;
    if (match.stage === "group") base = POINTS.match;
    else base = POINTS.finalExact + (isAdvancingRound(match.stage) ? POINTS.koAdvance : 0);
    return base + (opts && opts.captain ? maxCaptainBonus(match) : 0);
  }

  function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }

  // Rondas KO donde alguien pasa de ronda (el +1 de "quién avanza" aplica).
  // Terminal (3er puesto, final): no hay avance, solo marcador.
  function isAdvancingRound(stage) {
    return stage === "r32" || stage === "r16" || stage === "qf" || stage === "sf";
  }

  // Quién cree el jugador que gana/avanza: por el signo del marcador, o por adv
  // cuando predijo empate (el partido se define por penales).
  function predWinner(pred, match) {
    if (pred.hg > pred.ag) return match.home;
    if (pred.hg < pred.ag) return match.away;
    return pred.adv === "home" ? match.home : (pred.adv === "away" ? match.away : null);
  }

  // pred = {hg, ag, adv}. Grupos: 1X2 (1 pt). KO (incl. 3er y final): marcador
  // exacto = 3, solo el resultado (signo) = 1; en rondas con avance, +1 extra
  // por acertar quién avanza (en empates lo define pred.adv).
  // kind refleja la calidad del marcador: "exact" | "outcome" | "miss" | "pending" | "none".
  function scoreMatch(pred, match) {
    if (!pred || pred.hg == null || pred.ag == null || !isFinite(pred.hg) || !isFinite(pred.ag)) return { points: 0, kind: "none" };
    if (match.status !== "played" || match.hs == null) return { points: 0, kind: "pending" };

    if (match.stage === "group") {
      if (sign(pred.hg - pred.ag) === sign(match.hs - match.as)) return { points: POINTS.match, kind: "outcome" };
      return { points: 0, kind: "miss" };
    }

    // KO: marcador (exacto/resultado) + avance (solo rondas con avance).
    let points = 0, kind;
    if (pred.hg === match.hs && pred.ag === match.as) { points = POINTS.finalExact; kind = "exact"; }
    else if (sign(pred.hg - pred.ag) === sign(match.hs - match.as)) { points = POINTS.finalOutcome; kind = "outcome"; }
    else kind = "miss";

    if (isAdvancingRound(match.stage) && match.winner && predWinner(pred, match) === match.winner) {
      points += POINTS.koAdvance;
    }
    // si sumó por avance aunque el signo falló, no es "miss" del todo
    if (points > 0 && kind === "miss") kind = "outcome";
    return { points: points, kind: kind };
  }

  // Campeón graduado (front-loaded): paga por la ronda KO más profunda que el
  // equipo elegido GANÓ, no solo por levantar la copa. Rescata valor temprano
  // para que un campeón eliminado no caiga a cero y mantenga viva la apuesta.
  // Solo cuenta lo confirmado (partidos jugados); sube solo conforme avanza.
  //   ganó R32 → llegó a 8vos = 4 ; ganó 8vos → 4tos = 8 ; ganó 4tos → semis = 11 ;
  //   ganó semis → llegó a la final = 13 ; ganó la final → campeón = 15.
  const CHAMPION_TIERS = { r32: 4, r16: 8, qf: 11, sf: 13, final: POINTS.champion };
  function scoreChampion(pick, matches) {
    if (!pick) return 0;
    let best = 0;
    matches.forEach(function (m) {
      if (m.status !== "played" || m.winner !== pick.team_id) return;
      const tier = CHAMPION_TIERS[m.stage];
      if (tier && tier > best) best = tier;
    });
    return best;
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
      if (match.winner && predWinner(pr, match) === match.winner) t.correct++;
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
      const pred = { hg: pr.hg, ag: pr.ag, adv: pr.adv };
      const s = scoreMatch(pred, match);
      const isCap = captainSet[pr.user_id + "|" + pr.match_id];
      row.points += isCap ? captainTotal(s, match, pCorrectFor(pr.match_id), pred) : s.points;
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
    function accOf(r) { return r.decided > 0 ? (r.exact + r.outcome) / r.decided : -1; }
    rows.sort(function (x, y) {
      return y.points - x.points || accOf(y) - accOf(x) || y.exact - x.exact || (x.username || "").localeCompare(y.username || "", "es");
    });
    // pos/tier: el % de aciertos ROMPE los empates de puntos → posiciones distintas.
    // Solo comparten quienes empatan en puntos Y en % (empate real). Así el podio y
    // la narración concuerdan (nadie es "1º" y a la vez aparece en el escalón 2º).
    let pos = 0, tier = 0, lastPts = null, lastAcc = null;
    rows.forEach(function (r, i) {
      const a = accOf(r);
      if (lastPts === null || r.points !== lastPts || a !== lastAcc) {
        pos = i + 1; tier++; lastPts = r.points; lastAcc = a;
      }
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

  const scoring = { POINTS: POINTS, CAPTAIN_TIERS: CAPTAIN_TIERS, SPECIAL_BATACAZO: SPECIAL_BATACAZO, CHAMPION_TIERS: CHAMPION_TIERS, CHAMPION_LOCK: CHAMPION_LOCK, scoreMatch: scoreMatch, captainBonus: captainBonus, captainTotal: captainTotal, specialBatacazoApplies: specialBatacazoApplies, effectiveBatacazoBonus: effectiveBatacazoBonus, maxCaptainBonus: maxCaptainBonus, maxMatchPoints: maxMatchPoints, scoreChampion: scoreChampion, buildLeaderboard: buildLeaderboard, freezeLive: freezeLive, buildLiveLeaderboard: buildLiveLeaderboard };
  root.WC = root.WC || {};
  root.WC.scoring = scoring;
  if (typeof module !== "undefined" && module.exports) module.exports = scoring;
})(typeof window !== "undefined" ? window : globalThis);
