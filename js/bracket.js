/* Bracket interactivo. Depende de: app.js (WC.state, WC.fmt, WC.slotCtx), standings.js */
(function () {
  const grid = document.getElementById("bracketGrid");
  const select = document.getElementById("bracketTeam");
  const toggle = document.getElementById("scenarioToggle");
  const ROUNDS = [["r32", "Dieciseisavos"], ["r16", "Octavos"], ["qf", "Cuartos"], ["sf", "Semifinales"], ["final", "Final · 19 JUL"]];

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

  function slotHtml(m, side, ctx) {
    const id = side === "home" ? m.home : m.away;
    const score = side === "home" ? m.hs : m.as;
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, ctx);
    const resolved = id || slot.teamId;
    if (resolved) {
      const t = WC.state.teams[resolved];
      const winner = m.status === "played" && m.winner === resolved;
      return '<div class="b-team' + (winner ? " b-winner" : "") + '"><span>' + t.flag + "</span>" + t.name +
        (m.status !== "scheduled" && score != null ? '<span class="b-score">' + score + "</span>" : "") + "</div>";
    }
    return '<div class="b-team b-tbd">' + esc(slot.label) + "</div>";
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
    grid.classList.toggle("has-selection", Boolean(selectedTeam));
    grid.innerHTML = ROUNDS.map(function (round) {
      const stage = round[0];
      const ms = WC.state.matches.filter(function (m) { return m.stage === stage; })
        .sort(function (a, b) { return a.num - b.num; });
      const extra = stage === "final"
        ? WC.state.matches.filter(function (m) { return m.stage === "third"; })
        : [];
      return '<div><p class="b-col-title">' + round[1] + '</p><div class="b-col">' +
        ms.concat(extra).map(function (m) {
          const cls = (classes[m.num] || "") + (m.stage === "final" ? " final-match" : "");
          return '<div class="b-match ' + cls + '">' +
            slotHtml(m, "home", ctx) + slotHtml(m, "away", ctx) +
            '<div class="b-meta">' + (m.stage === "third" ? "3er puesto · " : "") +
            WC.fmt.dayLocal(m.date) + " · " + WC.fmt.timeLocal(m.date) + " · " + esc(m.city) + "</div></div>";
        }).join("") + "</div></div>";
    }).join("");
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
      groupEliminated = idx === 3 && WC.standings.groupFinished(t.group, WC.state.tables);
      scenario = idx >= 0 && rows[idx].pj > 0 ? Math.min(idx + 1, 3) : 1;
    }
    select.value = selectedTeam;
    render();
  }

  select.addEventListener("change", function () { selectTeam(select.value); });
  toggle.addEventListener("click", function (event) {
    const b = event.target.closest("[data-pos]");
    if (!b) return;
    scenarioManual = true;
    scenario = Number(b.dataset.pos);
    render();
  });

  function syncScenario() {
    if (!selectedTeam || scenarioManual) return;
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
