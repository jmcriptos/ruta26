/* Puntos de la quiniela. Puro y dual-environment (browser + node:test). */
(function (root) {
  const POINTS = {
    group: { exact: 3, outcome: 1 },
    ko: { exact: 5, outcome: 2 },
    champion: 15
  };
  const CHAMPION_LOCK = "2026-06-28T19:00:00Z";

  function isKO(match) { return match.stage !== "group"; }

  function scoreMatch(pred, match) {
    if (!pred) return { points: 0, kind: "none" };
    if (match.status !== "played" || match.hs == null) return { points: 0, kind: "pending" };
    const tier = isKO(match) ? POINTS.ko : POINTS.group;
    if (pred.hg === match.hs && pred.ag === match.as) return { points: tier.exact, kind: "exact" };
    if (!isKO(match)) {
      if (Math.sign(pred.hg - pred.ag) === Math.sign(match.hs - match.as)) {
        return { points: tier.outcome, kind: "outcome" };
      }
      return { points: 0, kind: "miss" };
    }
    if (pred.hg === pred.ag) return { points: 0, kind: "miss" }; // inválida en eliminatorias
    const predWinner = pred.hg > pred.ag ? match.home : match.away;
    if (match.winner && predWinner === match.winner) return { points: tier.outcome, kind: "outcome" };
    return { points: 0, kind: "miss" };
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
      const row = { userId: p.id, username: p.username, points: 0, exact: 0, outcome: 0, bonus: 0, predicted: 0 };
      rowByUser[p.id] = row;
      return row;
    });
    predictions.forEach(function (pr) {
      const row = rowByUser[pr.user_id];
      const match = matchById[pr.match_id];
      if (!row || !match) return;
      row.predicted++;
      const s = scoreMatch({ hg: pr.hg, ag: pr.ag }, match);
      row.points += s.points;
      if (s.kind === "exact") row.exact++;
      if (s.kind === "outcome") row.outcome++;
    });
    picks.forEach(function (pk) {
      const row = rowByUser[pk.user_id];
      if (!row) return;
      const b = scoreChampion(pk, matches);
      row.points += b;
      row.bonus = b;
    });
    rows.sort(function (x, y) {
      return y.points - x.points || y.exact - x.exact || x.username.localeCompare(y.username, "es");
    });
    let pos = 0, lastPoints = null;
    rows.forEach(function (r, i) {
      if (lastPoints === null || r.points < lastPoints) { pos = i + 1; lastPoints = r.points; }
      r.pos = pos;
    });
    return rows;
  }

  const scoring = { POINTS: POINTS, CHAMPION_LOCK: CHAMPION_LOCK, scoreMatch: scoreMatch, scoreChampion: scoreChampion, buildLeaderboard: buildLeaderboard };
  root.WC = root.WC || {};
  root.WC.scoring = scoring;
  if (typeof module !== "undefined" && module.exports) module.exports = scoring;
})(typeof window !== "undefined" ? window : globalThis);
