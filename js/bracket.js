/* Bracket simétrico. Depende de: app.js (WC.state, WC.fmt, WC.slotCtx), standings.js */
(function () {
  const grid = document.getElementById("bracketGrid");
  const select = document.getElementById("bracketTeam");
  const toggle = document.getElementById("scenarioToggle");
  const sideTabs = document.getElementById("bracketSide");

  // rondas de fuera hacia el centro
  const ORDER = ["r32", "r16", "qf", "sf"];
  const ROUND_LABEL = { r32: "16avos", r16: "8vos", qf: "4tos", sf: "Semis" };

  let selectedTeam = "";
  let scenario = 1;
  let scenarioManual = false;
  let groupEliminated = false;
  let mobileSide = "left";

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

  // etiqueta corta para un slot sin equipo definido
  function shortLabel(label) {
    if (!label) return "—";
    if (/^Mejor 3º/.test(label)) return "3º";
    const m = label.match(/^([12])º grupo ([A-L])$/);
    if (m) return m[1] + m[2];
    const w = label.match(/^Gana P?(\d+)$/);
    if (w) return "G" + w[1];
    return label.length > 6 ? label.slice(0, 6) : label;
  }

  // una caja de equipo (bandera + código 3 letras) o placeholder corto
  function teamBox(m, side, ctx, classes) {
    const id = side === "home" ? m.home : m.away;
    const score = side === "home" ? m.hs : m.as;
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, ctx);
    const resolved = id || slot.teamId;
    if (resolved) {
      const t = WC.state.teams[resolved] || { code: "?", flag: "🏳️" };
      const winner = m.status === "played" && m.winner === resolved;
      return '<div class="b-team' + (winner ? " b-winner" : "") + '"><span class="b-flag">' + (t.flag || "🏳️") +
        '</span><span class="b-code">' + esc(t.code || "?") + "</span>" +
        (m.status !== "scheduled" && score != null ? '<span class="b-score">' + score + "</span>" : "") + "</div>";
    }
    return '<div class="b-team b-tbd"><span class="b-code">' + esc(shortLabel(slot.label)) + "</span></div>";
  }

  function matchBox(m, ctx, classes, sideClass) {
    const cls = (classes[m.num] || "") + (sideClass ? " " + sideClass : "");
    return '<div class="b-match ' + cls + '" data-num="' + m.num + '">' +
      teamBox(m, "home", ctx, classes) + teamBox(m, "away", ctx, classes) + "</div>";
  }

  // columna de una ronda y un lado, ordenada por num
  function columnHtml(stage, side, ctx, classes, byNum) {
    const ms = WC.state.matches.filter(function (m) {
      return m.stage === stage && WC.standings.bracketSide(m.num, byNum) === side;
    }).sort(function (a, b) { return a.num - b.num; });
    return '<div class="b-col" data-stage="' + stage + '" data-side="' + side + '">' +
      '<p class="b-col-title">' + ROUND_LABEL[stage] + "</p>" +
      '<div class="b-col-body">' + ms.map(function (m) { return matchBox(m, ctx, classes, ""); }).join("") + "</div></div>";
  }

  function finalColumnHtml(ctx, classes) {
    const final = WC.state.matches.find(function (m) { return m.stage === "final"; });
    const third = WC.state.matches.find(function (m) { return m.stage === "third"; });
    if (!final) return "";
    return '<div class="b-final-col">' +
      '<div class="b-trophy">🏆</div><p class="b-col-title final">Final · 19 JUL</p>' +
      matchBox(final, ctx, classes, "final-match") +
      '<div class="b-final-meta">' + WC.fmt.dayLocal(final.date) + " · " + esc(final.city) + "</div>" +
      (third ? '<p class="b-third-note">3er puesto</p>' + matchBox(third, ctx, classes, "third-match") : "") +
      "</div>";
  }

  function sideStackHtml(side, ctx, classes, byNum) {
    return '<div class="b-side b-side-' + side + '">' +
      ORDER.map(function (st) { return columnHtml(st, side, ctx, classes, byNum); }).join("") + "</div>";
  }

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

  // lado donde está el camino del equipo (para la vista móvil)
  function routeSide(byNum) {
    if (!selectedTeam) return mobileSide;
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    for (let s = 0; s < route.segments.length; s++) {
      const ms = route.segments[s].matches;
      for (let i = 0; i < ms.length; i++) {
        const side = WC.standings.bracketSide(ms[i].num, byNum);
        if (side) return side;
      }
    }
    return mobileSide;
  }

  function updateToggle() {
    if (!selectedTeam || groupEliminated) { toggle.hidden = true; return; }
    const route = WC.standings.teamRoute(selectedTeam, scenario, WC.state);
    toggle.hidden = route.mode === "real";
    toggle.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.pos) === scenario);
    });
  }

  function render() {
    const ctx = WC.slotCtx();
    const classes = routeClasses();
    const byNum = matchesByNum();
    grid.classList.toggle("has-selection", Boolean(selectedTeam));

    // el lado que se muestra en móvil
    const shownSide = selectedTeam ? routeSide(byNum) : mobileSide;
    grid.dataset.mobileSide = shownSide;

    grid.innerHTML =
      sideStackHtml("left", ctx, classes, byNum) +
      finalColumnHtml(ctx, classes) +
      sideStackHtml("right", ctx, classes, byNum);

    // toggle de lado: visible en móvil solo cuando NO hay equipo (sin equipo se elige el lado a mano)
    if (sideTabs) {
      sideTabs.hidden = Boolean(selectedTeam);
      sideTabs.querySelectorAll("[data-side]").forEach(function (b) {
        b.classList.toggle("active", b.dataset.side === shownSide);
      });
    }
    updateToggle();
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
  if (sideTabs) {
    sideTabs.addEventListener("click", function (event) {
      const b = event.target.closest("[data-side]");
      if (!b) return;
      mobileSide = b.dataset.side;
      render();
    });
  }
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
