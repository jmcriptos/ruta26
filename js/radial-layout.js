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

  // Anillos de afuera (16avos) hacia adentro (final). r = fracción del lado.
  const RINGS = [
    { stage: "r32", n: 32, r: 0.455 },
    { stage: "r16", n: 16, r: 0.365 },
    { stage: "qf", n: 8, r: 0.275 },
    { stage: "sf", n: 4, r: 0.185 },
    { stage: "final", n: 2, r: 0.105 }
  ];
  const ROTATION_DEG = 90; // rota para que los finalistas caigan a las 9 y 3 en punto

  // Posición del nodo i del anillo ringIdx en un lienzo de lado `size` (default 100 → %).
  function nodePos(ringIdx, i, size) {
    size = size || 100;
    const ring = RINGS[ringIdx];
    const c = size / 2;
    const deg = (i + 0.5) / ring.n * 360 + ROTATION_DEG;
    const th = deg * Math.PI / 180;
    return { x: c + ring.r * size * Math.cos(th), y: c + ring.r * size * Math.sin(th) };
  }
  function parentIndex(i) { return Math.floor(i / 2); }

  const layout = { bracketTree: bracketTree, isLeaf: isLeaf, RINGS: RINGS, ROTATION_DEG: ROTATION_DEG, nodePos: nodePos, parentIndex: parentIndex };
  root.WC = root.WC || {};
  root.WC.radialLayout = layout;
  if (typeof module !== "undefined" && module.exports) module.exports = layout;
})(typeof window !== "undefined" ? window : globalThis);
