/* View models de engagement. Puro y dual-environment (browser + node:test).
   Deriva de snapshots + outputs canónicos de scoring.js. NO lee DOM, Supabase,
   fetch, localStorage, sessionStorage, push ni Date.now() (la hora entra por
   snapshot.now). Ante datos faltantes devuelve null, [] o state:"fallback".
   Contrato: docs/architecture/engagement-contract.md */
(function (root) {
  // Las funciones reales se implementan en Story 1.3 (opportunity),
  // 1.4 (liveTension, predictionGroups) y 1.5 (postMatchSummary, whatsappShare).
  // Por ahora devuelven fallbacks seguros para no romper Ranking ni Pronósticos.

  function opportunity(snapshot) {
    if (!snapshot || !snapshot.meId) return null;
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
