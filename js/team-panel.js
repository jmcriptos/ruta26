/* Panel de equipo. Depende de: app.js (WC.state, WC.fmt, WC.slotName, WC.stageLabel), standings.js */
(function () {
  const overlay = document.getElementById("teamPanelOverlay");
  const panel = document.getElementById("teamPanel");
  let currentTeamId = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function positionInfo(teamId) {
    const t = WC.state.teams[teamId];
    const rows = WC.state.tables[t.group] || [];
    const idx = rows.findIndex(function (r) { return r.teamId === teamId; });
    const row = rows[idx];
    if (!row || row.pj === 0) return { pos: null, text: "Grupo " + t.group };
    const finished = WC.standings.groupFinished(t.group, WC.state.tables);
    return { pos: idx + 1, text: (idx + 1) + "º del grupo " + t.group + " · " + row.pts + " pts" + (finished ? " · grupo cerrado" : "") };
  }

  function matchLine(m, teamId) {
    const isHome = m.home === teamId;
    const rivalName = WC.slotName(m, isHome ? "away" : "home");
    const when = WC.fmt.dayLocal(m.date) + " · " + WC.fmt.timeLocal(m.date) + " · " + m.city;
    let score;
    if (m.status === "played") {
      const own = isHome ? m.hs : m.as, other = isHome ? m.as : m.hs;
      score = '<span class="pm-score">' + own + " – " + other + "</span>";
    } else if (m.status === "live") {
      score = '<span class="pm-score live">● ' + (m.hs != null ? (isHome ? m.hs : m.as) + " – " + (isHome ? m.as : m.hs) : "EN VIVO") + "</span>";
    } else {
      score = '<span class="pm-score next">Próximo</span>';
    }
    return '<div class="panel-match"><div class="pm-info"><strong>vs ' + esc(rivalName) + "</strong><small>" +
      WC.stageLabel(m) + " · " + esc(when) + "</small></div>" + score + "</div>";
  }

  function routeSummary(teamId, pos) {
    const scenario = pos || 1;
    const route = WC.standings.teamRoute(teamId, scenario, WC.state);
    if (route.eliminated) {
      const third = WC.state.matches.find(function (m) {
        return m.stage === "third" && (m.home === teamId || m.away === teamId);
      });
      if (third && third.status !== "played") {
        return "<b>Va por el 3er puesto:</b> " + WC.fmt.dayLocal(third.date) + " · " + WC.fmt.timeLocal(third.date) + " · " + esc(third.city);
      }
      return "<b>Eliminado.</b> Su mundial terminó en " + WC.stageLabel(route.segments[0].matches[route.segments[0].matches.length - 1]) + ".";
    }
    if (!route.segments.length) return "Sin ruta calculable todavía.";
    const seg = route.segments[0];
    const intro = route.mode === "real" ? "<b>Ruta confirmada:</b> " :
      scenario === 3 ? "<b>Una de sus rutas como mejor 3º:</b> " :
      "<b>Si queda " + scenario + "º:</b> ";
    return intro + seg.matches.map(function (m) {
      return WC.stageLabel(m) + " · " + WC.fmt.dayLocal(m.date) + " · " + esc(m.city);
    }).join(" → ");
  }

  function open(teamId) {
    const t = WC.state.teams[teamId];
    if (!t) return;
    currentTeamId = teamId;
    const info = positionInfo(teamId);
    const games = WC.state.matches.filter(function (m) { return m.home === teamId || m.away === teamId; });
    panel.innerHTML =
      '<button class="panel-close" aria-label="Cerrar">×</button>' +
      '<div class="panel-head"><span class="panel-flag">' + t.flag + "</span><div><h3>" + esc(t.name) + "</h3>" +
      "<small>Grupo " + t.group + (t.host ? " · país anfitrión" : "") + "</small></div></div>" +
      '<span class="panel-pos">' + info.text + "</span>" +
      '<p class="panel-kicker">Sus partidos</p>' +
      games.map(function (m) { return matchLine(m, teamId); }).join("") +
      '<p class="panel-kicker">Su ruta</p>' +
      '<div class="panel-route">' + routeSummary(teamId, info.pos) + "</div>" +
      '<button class="panel-cta" data-bracket-team="' + t.id + '">Ver su ruta en el bracket →</button>';
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const closeBtn = panel.querySelector(".panel-close");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    currentTeamId = null;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  overlay.addEventListener("click", function (event) {
    if (event.target === overlay || event.target.closest(".panel-close")) close();
    const cta = event.target.closest("[data-bracket-team]");
    if (cta) {
      close();
      WC.bracket.select(cta.dataset.bracketTeam);
      document.getElementById("ruta").scrollIntoView({ behavior: "smooth" });
    }
  });

  WC.teamPanel = {
    open: open,
    close: close,
    refresh: function () { if (currentTeamId) open(currentTeamId); }
  };
})();
