/* Geometría y orden del bracket radial. Puro y dual-environment. */
(function (root) {
  // Una casilla es HOJA (16avos) si ni phA ni phB apuntan a un ganador (W##);
  // sus placeholders son de grupo (1A / 2B / 3CDEF).
  function isLeaf(m) {
    return !/^W\d+$/.test(m.phA || "") && !/^W\d+$/.test(m.phB || "");
  }

  // Deriva el orden circular de las 32 casillas y las rondas ordenadas,
  // recorriendo el árbol KO en DFS in-order (phA antes que phB) desde la final.
  function bracketTree(matches) {
    const byNum = {};
    matches.forEach(function (m) { byNum[m.num] = m; });
    const root = matches.find(function (m) { return m.stage === "final"; });
    const order = [];
    const rounds = { r32: [], r16: [], qf: [], sf: [], final: [] };
    function childOf(ph) {
      const mm = /^W(\d+)$/.exec(ph || "");
      return mm ? byNum[Number(mm[1])] : null;
    }
    function walk(m) {
      if (!m) return;
      if (isLeaf(m)) {
        order.push({ matchNum: m.num, side: "home" });
        order.push({ matchNum: m.num, side: "away" });
        if (rounds[m.stage]) rounds[m.stage].push(m);
        return;
      }
      walk(childOf(m.phA));
      walk(childOf(m.phB));
      if (rounds[m.stage]) rounds[m.stage].push(m);
    }
    walk(root);
    return { order: order, rounds: rounds };
  }

  const layout = { bracketTree: bracketTree, isLeaf: isLeaf };
  root.WC = root.WC || {};
  root.WC.radialLayout = layout;
  if (typeof module !== "undefined" && module.exports) module.exports = layout;
})(typeof window !== "undefined" ? window : globalThis);
