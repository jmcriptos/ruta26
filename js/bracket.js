/* Bracket radial. Depende de: app.js (WC.state, WC.slotCtx), standings.js,
   radial-layout.js, flags.js, team-panel.js. */
(function () {
  const grid = document.getElementById("bracketGrid");
  const select = document.getElementById("bracketTeam");
  const toggle = document.getElementById("scenarioToggle");
  const RL = WC.radialLayout;
  const FEED = ["r32", "r16", "qf", "sf", "final"]; // etapa que alimenta cada anillo interno

  let selectedTeam = "";
  let scenario = 1;
  let scenarioManual = false;
  let groupEliminated = false;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  let selectPopulated = false;
  function fillSelect() {
    if (selectPopulated) return;
    selectPopulated = true;
    const opts = Object.values(WC.state.teams)
      .sort(function (a, b) { return a.name.localeCompare(b.name, "es"); })
      .map(function (t) { return '<option value="' + t.id + '">' + t.flag + " " + t.name + "</option>"; });
    select.innerHTML = '<option value="">Todo el cuadro</option>' + opts.join("");
    select.value = selectedTeam;
  }

  function matchesByNum() {
    const map = {};
    WC.state.matches.forEach(function (m) { map[m.num] = m; });
    return map;
  }

  // Resuelve el equipo (fijo o provisional) de una casilla de 16avos, igual que
  // el render anterior: equipo fijo, o slot resuelto, o el tercero asignado.
  function resolveSlotTeam(m, side, ctx) {
    const id = side === "home" ? m.home : m.away;
    const ph = side === "home" ? m.phA : m.phB;
    let slot = WC.standings.resolveSlot(ph, ctx, { provisional: true });
    if (!id && !slot.teamId && /^3[A-L]+$/.test(ph)) {
      const sib = side === "home" ? m.phB : m.phA;
      const wm = /^1([A-L])$/.exec(sib || "");
      const tid = wm && WC.thirdsAllocation
        ? WC.standings.resolveThird(wm[1], ctx.thirds, ctx.tables, WC.thirdsAllocation)
        : null;
      if (tid) slot = { teamId: tid, label: "", provisional: true };
    }
    const resolved = id || slot.teamId;
    return { teamId: resolved || null, provisional: Boolean(!id && slot.provisional) };
  }

  // Equipo que ocupa un nodo. Anillo 0 = casilla de 16avos; anillos internos =
  // ganador del partido que los alimenta (o null → punto gris).
  function teamAtNode(ringIdx, i, tree, ctx, byNum) {
    if (ringIdx === 0) {
      const slot = tree.order[i];
      const m = byNum[slot.matchNum];
      return m ? resolveSlotTeam(m, slot.side, ctx) : { teamId: null, provisional: false };
    }
    const m = tree.rounds[FEED[ringIdx - 1]][i];
    if (m && m.status === "played" && m.winner) return { teamId: m.winner, provisional: false };
    return { teamId: null, provisional: false };
  }

  // Eliminado = fuera en grupos, o perdió un partido KO ya jugado.
  function teamEliminated(teamId) {
    if (WC.standings.groupStageEliminated(teamId, WC.state)) return true;
    return WC.state.matches.some(function (m) {
      return m.stage !== "group" && m.status === "played" && m.winner &&
        (m.home === teamId || m.away === teamId) && m.winner !== teamId;
    });
  }

  function championTeam(tree) {
    const f = tree.rounds.final[0];
    return f && f.status === "played" && f.winner ? f.winner : null;
  }

  // clases de ruta por num de partido (lit / maybe), como antes.
  function routeClasses() {
    const classes = {};
    if (!selectedTeam || groupEliminated) return classes;
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    route.segments.forEach(function (seg) {
      seg.matches.forEach(function (m) {
        classes[m.num] = seg.certain ? "lit" : (classes[m.num] === "lit" ? "lit" : "maybe");
      });
    });
    return classes;
  }

  // Nodos y líneas iluminados: ubica al equipo en su casilla de 16avos y sube
  // hacia el centro por floor(i/2); frena si ya perdió.
  function routeViz(tree, classes, ctx, byNum) {
    const nodes = {}, lines = [];
    if (!selectedTeam || groupEliminated) return { nodes: nodes, lines: lines };
    let i = -1;
    for (let p = 0; p < 32; p++) {
      const info = teamAtNode(0, p, tree, ctx, byNum);
      if (info.teamId === selectedTeam) { i = p; break; }
    }
    if (i < 0) return { nodes: nodes, lines: lines };
    nodes["0|" + i] = "lit";
    let cur = i;
    for (let k = 1; k <= 4; k++) {
      const parent = RL.parentIndex(cur);
      const m = tree.rounds[FEED[k - 1]][parent];
      if (m && m.status === "played" && m.winner && m.winner !== selectedTeam) break;
      const won = m && m.status === "played" && m.winner === selectedTeam;
      const cls = won ? "lit" : (m && classes[m.num] === "lit" ? "lit" : "maybe");
      nodes[k + "|" + parent] = cls;
      lines.push({ a: [k - 1, cur], b: [k, parent], cls: cls });
      cur = parent;
    }
    return { nodes: nodes, lines: lines };
  }

  function linesSvg(litLines) {
    let s = '<svg class="br-lines" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">';
    // Ruta rectangular hijo→padre: tramo radial + arco sobre el anillo padre.
    function rectPath(k, i, cls) {
      const g = RL.rectSegment(k, i);
      return '<path class="' + cls + '" d="M ' + g.a.x.toFixed(2) + ' ' + g.a.y.toFixed(2) +
        ' L ' + g.c.x.toFixed(2) + ' ' + g.c.y.toFixed(2) +
        ' A ' + g.r.toFixed(2) + ' ' + g.r.toFixed(2) + ' 0 0 ' + g.sweep +
        ' ' + g.b.x.toFixed(2) + ' ' + g.b.y.toFixed(2) + '"/>';
    }
    // Finalistas → copa: tramo radial directo al centro.
    function centerSeg(i, cls) {
      const p = RL.nodePos(4, i);
      return '<path class="' + cls + '" d="M ' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' L 50 50"/>';
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < RL.RINGS[k].n; i++) s += rectPath(k, i, "br-line");
    }
    for (let i = 0; i < 2; i++) s += centerSeg(i, "br-line");
    litLines.forEach(function (L) {
      s += rectPath(L.a[0], L.a[1], "br-line br-line-" + L.cls);
    });
    return s + "</svg>";
  }

  function nodeHtml(ringIdx, i, tree, ctx, byNum, viz) {
    const pos = RL.nodePos(ringIdx, i);
    const style = "left:" + pos.x + "%;top:" + pos.y + "%";
    const info = teamAtNode(ringIdx, i, tree, ctx, byNum);
    const rc = "br-r" + ringIdx;
    if (!info.teamId) return '<div class="br-node ' + rc + ' br-dot" style="' + style + '"></div>';
    const t = WC.state.teams[info.teamId];
    const src = t && WC.flags.flagSrc(t);
    const lit = viz.nodes[ringIdx + "|" + i];
    const cls = ["br-node", rc];
    if (lit) cls.push("br-lit");
    if (info.provisional) cls.push("br-prov");
    if (!lit && teamEliminated(info.teamId)) cls.push("br-dead");
    if (src) {
      return '<img class="' + cls.join(" ") + '" style="' + style + '" src="' + src +
        '" alt="' + esc(t ? t.name : "") + '" data-team="' + info.teamId + '">';
    }
    return '<div class="' + cls.join(" ") + ' br-dot" style="' + style + '" data-team="' + info.teamId + '"></div>';
  }

  function render() {
    const ctx = WC.slotCtx();
    const classes = routeClasses();
    const byNum = matchesByNum();
    const tree = RL.bracketTree(WC.state.matches);
    grid.classList.toggle("has-selection", Boolean(selectedTeam));
    const viz = routeViz(tree, classes, ctx, byNum);

    let html = linesSvg(viz.lines);
    for (let p = 0; p < 32; p++) html += nodeHtml(0, p, tree, ctx, byNum, viz);
    for (let k = 1; k <= 4; k++) {
      for (let i = 0; i < RL.RINGS[k].n; i++) html += nodeHtml(k, i, tree, ctx, byNum, viz);
    }
    const champ = championTeam(tree);
    const champT = champ && WC.state.teams[champ];
    const champSrc = champT && WC.flags.flagSrc(champT);
    html += '<div class="br-trophy' + (champ ? " br-has-champ" : "") + '" style="left:50%;top:50%">' +
      (champSrc ? '<img src="' + champSrc + '" alt="' + esc(champT.name) + '">' : "") +
      '<span class="br-cup">🏆</span></div>';
    grid.innerHTML = html;
    updateToggle();
  }

  function updateToggle() {
    if (!selectedTeam || groupEliminated) { toggle.hidden = true; return; }
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    toggle.hidden = route.mode === "real";
    toggle.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.pos) === scenario);
    });
  }

  function selectTeam(teamId) {
    scenarioManual = false;
    selectedTeam = teamId || "";
    groupEliminated = false;
    if (selectedTeam) {
      const t = WC.state.teams[selectedTeam];
      const rows = WC.state.tables[t.group] || [];
      const idx = rows.findIndex(function (r) { return r.teamId === selectedTeam; });
      groupEliminated = WC.standings.groupStageEliminated(selectedTeam, WC.state);
      scenario = idx >= 0 && rows[idx].pj > 0 ? Math.min(idx + 1, 3) : 1;
    }
    select.value = selectedTeam;
    render();
  }

  select.addEventListener("change", function () { selectTeam(select.value); });

  // Tocar una bandera → seleccionar equipo (ilumina ruta) + abrir panel.
  grid.addEventListener("click", function (event) {
    const node = event.target.closest("[data-team]");
    if (!node) { if (event.target === grid || event.target.closest(".br-trophy")) selectTeam(""); return; }
    const teamId = node.dataset.team;
    selectTeam(teamId);
    if (WC.teamPanel && WC.teamPanel.open) WC.teamPanel.open(teamId);
  });

  toggle.addEventListener("click", function (event) {
    const b = event.target.closest("[data-pos]");
    if (!b) return;
    scenarioManual = true;
    scenario = Number(b.dataset.pos);
    render();
  });

  function syncScenario() {
    if (!selectedTeam) return;
    groupEliminated = WC.standings.groupStageEliminated(selectedTeam, WC.state);
    if (scenarioManual) return;
    const t = WC.state.teams[selectedTeam];
    const rows = WC.state.tables[t.group] || [];
    const idx = rows.findIndex(function (r) { return r.teamId === selectedTeam; });
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    if (route.mode === "scenario" && idx >= 0 && rows[idx].pj > 0) {
      scenario = Math.min(idx + 1, 3);
    }
  }

  WC.bracket = {
    render: function () { fillSelect(); syncScenario(); render(); },
    select: selectTeam
  };
})();
