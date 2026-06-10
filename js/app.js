/* Estado global y render principal. Depende de: data.js, api.js, standings.js */
(function () {
  const state = {
    teams: WC.SNAPSHOT.teams,
    matches: WC.SNAPSHOT.matches,
    tables: {},
    thirds: [],
    source: "snapshot",
    updatedAt: null
  };
  WC.state = state;

  /* Proyecciones de mercado (estáticas, del 5 JUN 2026) */
  const rankings = [
    ["Francia", "16.2%"], ["Inglaterra", "10.5%"], ["Portugal", "9.3%"], ["Argentina", "9.2%"],
    ["Brasil", "8.1%"], ["Alemania", "6.0%"], ["Países Bajos", "4.4%"], ["Noruega", "2.6%"],
    ["Bélgica", "2.2%"], ["Colombia", "1.9%"], ["México", "1.7%"], ["Estados Unidos", "1.7%"],
    ["Japón", "1.5%"], ["Marruecos", "1.5%"]
  ];

  const STAGE_LABEL = { r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos", sf: "Semifinal", third: "3er puesto", final: "La final" };
  const GROUP_IDS = "ABCDEFGHIJKL".split("");

  /* ---------- helpers ---------- */
  function team(id) { return state.teams[id]; }
  function teamByName(name) {
    return Object.values(state.teams).find(function (t) { return t.name === name; }) || null;
  }
  let matchesByNumCache = null;
  function matchesByNum() {
    if (!matchesByNumCache) {
      matchesByNumCache = {};
      state.matches.forEach(function (m) { matchesByNumCache[m.num] = m; });
    }
    return matchesByNumCache;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function slotCtx() { return { tables: state.tables, matchesByNum: matchesByNum(), teams: state.teams }; }
  WC.slotCtx = slotCtx;

  const fmtTime = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
  const fmtDay = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short" });
  function timeLocal(iso) { return fmtTime.format(new Date(iso)); }
  function dayLocal(iso) { return fmtDay.format(new Date(iso)).toUpperCase().replace(/\./g, ""); }
  function dateKey(iso) {
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  WC.fmt = { timeLocal: timeLocal, dayLocal: dayLocal };

  function slotName(m, side) {
    const id = side === "home" ? m.home : m.away;
    if (id) return team(id).name;
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, slotCtx());
    return slot.teamId ? team(slot.teamId).name : slot.label;
  }
  WC.slotName = slotName;

  function stageLabel(m) { return m.stage === "group" ? "Grupo " + m.group : STAGE_LABEL[m.stage]; }
  WC.stageLabel = stageLabel;

  function recompute() {
    matchesByNumCache = null;
    state.tables = WC.standings.computeGroups(state.matches, state.teams);
    state.thirds = WC.standings.rankThirds(state.tables);
  }

  /* ---------- partidos ---------- */
  const matchesGrid = document.getElementById("matchesGrid");
  const dateStrip = document.getElementById("dateStrip");
  let activeDate = "TODOS";
  let visibleMatches = 6;
  let activeMatchFilter = "upcoming";

  function teamRowHtml(m, side) {
    const id = side === "home" ? m.home : m.away;
    const score = side === "home" ? m.hs : m.as;
    if (id) {
      const t = team(id);
      return '<button class="team-row" data-team-id="' + t.id + '"><em>' + t.name + "</em><span>" + t.flag + "</span>" +
        (m.status !== "scheduled" && score != null ? "<strong>" + score + "</strong>" : "") + "</button>";
    }
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, slotCtx());
    if (slot.teamId) {
      const t = team(slot.teamId);
      return '<button class="team-row" data-team-id="' + t.id + '"><em>' + t.name + "</em><span>" + t.flag + "</span></button>";
    }
    return '<div class="team-row placeholder"><em>' + esc(slot.label) + "</em></div>";
  }

  function matchCard(m) {
    const statusTxt = m.status === "played" ? "FINAL" : m.status === "live" ? "● EN VIVO" : "PRÓXIMO";
    const pens = m.hp != null && m.hp + m.ap > 0 ? "Penales " + m.hp + "–" + m.ap + " · " : "";
    return '<article class="match-card ' + m.status + '">' +
      '<div class="match-meta"><span>' + dayLocal(m.date) + " · " + stageLabel(m) + "</span><span>" + timeLocal(m.date) + "</span></div>" +
      teamRowHtml(m, "home") + teamRowHtml(m, "away") +
      '<div class="match-bottom"><strong>' + pens + esc(m.city) + '</strong><span class="status-' + m.status + '">' + statusTxt + "</span></div></article>";
  }

  function filteredMatches() {
    let list = state.matches;
    if (activeMatchFilter === "upcoming") list = list.filter(function (m) { return m.status !== "played"; });
    if (activeMatchFilter === "results") {
      list = list.filter(function (m) { return m.status === "played"; }).slice().reverse();
    }
    if (activeDate !== "TODOS") list = list.filter(function (m) { return dateKey(m.date) === activeDate; });
    return list;
  }

  function renderMatches() {
    const list = filteredMatches();
    const empty = document.getElementById("resultsEmpty");
    const showMore = document.getElementById("showMoreMatches");
    empty.hidden = !(activeMatchFilter === "results" && list.length === 0);
    const shown = activeDate === "TODOS" ? list.slice(0, visibleMatches) : list;
    matchesGrid.innerHTML = shown.map(matchCard).join("");
    showMore.hidden = activeDate !== "TODOS" || visibleMatches >= list.length;
  }

  function renderDates() {
    const seen = new Map();
    state.matches.forEach(function (m) {
      const key = dateKey(m.date);
      if (!seen.has(key)) seen.set(key, m.date);
    });
    dateStrip.innerHTML = ['<button class="date-button" data-date="TODOS"><span>Calendario</span><strong>Todos</strong></button>']
      .concat(Array.from(seen.entries()).map(function (pair) {
        const parts = fmtDay.formatToParts(new Date(pair[1]));
        const wd = (parts.find(function (p) { return p.type === "weekday"; }) || { value: "" }).value.toUpperCase().replace(".", "");
        const dayNum = (parts.find(function (p) { return p.type === "day"; }) || { value: "" }).value;
        return '<button class="date-button" data-date="' + pair[0] + '"><span>' + wd + "</span><strong>" + dayNum + "</strong></button>";
      })).join("");
    dateStrip.querySelectorAll("[data-date]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.date === activeDate);
    });
  }

  /* ---------- grupos ---------- */
  const groupsGrid = document.getElementById("groupsGrid");
  const noTeams = document.getElementById("noTeams");

  function renderGroups(query) {
    const normalized = (query || "").toLocaleLowerCase("es").trim();
    const cards = GROUP_IDS.map(function (g) {
      const all = state.tables[g] || [];
      const rows = all.filter(function (r) { return team(r.teamId).name.toLocaleLowerCase("es").includes(normalized); });
      if (!rows.length) return "";
      const played = all.some(function (r) { return r.pj > 0; });
      return '<article class="group-card"><div class="group-title"><strong>Grupo ' + g + "</strong><span>" +
        (played ? "PTS · PJ · DG" : "4 selecciones") + "</span></div>" +
        rows.map(function (r) {
          const t = team(r.teamId);
          const pos = all.indexOf(r);
          const qualifying = played && pos < 2;
          return '<button class="group-team' + (t.host ? " host" : "") + (qualifying ? " qualifying" : "") + '" data-team-id="' + t.id + '">' +
            "<span>" + t.flag + "</span><em>" + t.name + "</em>" +
            (played ? '<small class="mini-stats">' + r.pts + " · " + r.pj + " · " + (r.dg > 0 ? "+" : "") + r.dg + "</small>" : "") +
            "</button>";
        }).join("") + "</article>";
    }).filter(Boolean);
    groupsGrid.innerHTML = cards.join("");
    noTeams.hidden = cards.length > 0;
  }

  /* ---------- favoritos ---------- */
  function renderRankings() {
    document.getElementById("rankingList").innerHTML = rankings.map(function (row, index) {
      const t = teamByName(row[0]);
      if (!t) return "";
      return '<article class="ranking-row" data-team-id="' + t.id + '" style="cursor:pointer">' +
        '<span class="num">' + String(index + 2).padStart(2, "0") + "</span>" +
        '<span class="flag">' + t.flag + "</span>" +
        "<div><strong>" + t.name + "</strong><small>Grupo " + t.group + "</small></div>" +
        '<span class="chance">' + row[1] + "</span></article>";
    }).join("");
  }

  /* ---------- hero / cuenta regresiva ---------- */
  let countdownTarget = null;

  function heroMatch() {
    const live = state.matches.find(function (m) { return m.status === "live"; });
    if (live) return live;
    return state.matches.filter(function (m) { return m.status === "scheduled"; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); })[0] || null;
  }

  function renderHero() {
    const m = heroMatch();
    if (!m) return;
    document.getElementById("countdownLabel").textContent = m.status === "live" ? "En vivo ahora" : "Cuenta regresiva";
    document.getElementById("countdownTitle").textContent = slotName(m, "home") + " vs " + slotName(m, "away");
    document.getElementById("countdownMeta").innerHTML = "<span>" + dayLocal(m.date) + " · " + timeLocal(m.date) + "</span><small>" + esc(m.city) + "</small>";
    countdownTarget = new Date(m.date).getTime();
  }

  function updateCountdown() {
    if (!countdownTarget) return;
    const distance = Math.max(0, countdownTarget - Date.now());
    const values = {
      days: Math.floor(distance / 86400000),
      hours: Math.floor((distance % 86400000) / 3600000),
      minutes: Math.floor((distance % 3600000) / 60000),
      seconds: Math.floor((distance % 60000) / 1000)
    };
    Object.keys(values).forEach(function (key) {
      document.getElementById(key).textContent = String(values[key]).padStart(2, "0");
    });
  }

  /* ---------- estado de datos ---------- */
  function renderStatus() {
    const el = document.getElementById("dataStatus");
    if (state.source === "live") {
      el.textContent = "Datos en vivo · actualizado " + fmtTime.format(new Date(state.updatedAt));
    } else if (state.source === "cache") {
      el.textContent = "Sin conexión · últimos datos de " + fmtDay.format(new Date(state.updatedAt)) + " " + fmtTime.format(new Date(state.updatedAt));
    } else {
      el.textContent = "Sin conexión · calendario oficial precargado";
    }
    el.className = "data-status " + state.source;
    document.getElementById("tzLabel").textContent = "Horarios en tu zona (" + Intl.DateTimeFormat().resolvedOptions().timeZone + ")";
  }

  /* ---------- búsqueda global ---------- */
  const searchOverlay = document.getElementById("searchOverlay");
  const globalSearch = document.getElementById("globalSearch");

  function toggleSearch(open) {
    searchOverlay.classList.toggle("open", open);
    searchOverlay.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) setTimeout(function () { globalSearch.focus(); }, 100);
  }

  function renderGlobalSearch(query) {
    const normalized = (query || "").toLocaleLowerCase("es").trim();
    const all = Object.values(state.teams).sort(function (a, b) { return a.name.localeCompare(b.name, "es"); });
    const results = normalized
      ? all.filter(function (t) { return t.name.toLocaleLowerCase("es").includes(normalized); }).slice(0, 8)
      : all.slice(0, 6);
    document.getElementById("searchResults").innerHTML = results.map(function (t) {
      return '<button class="search-result" data-team-id="' + t.id + '" data-close-search style="width:100%;text-align:left;border:0;background:none;cursor:pointer">' +
        "<span>" + t.flag + "</span><div><strong>" + t.name + "</strong><small>Grupo " + t.group + "</small></div></button>";
    }).join("");
  }

  /* ---------- render maestro ---------- */
  function renderAll() {
    renderGroups(document.getElementById("teamSearch").value);
    renderDates();
    renderMatches();
    renderRankings();
    renderGlobalSearch(globalSearch.value);
    renderHero();
    renderStatus();
    WC.bracket.render();
  }
  WC.renderAll = renderAll;

  /* ---------- eventos ---------- */
  document.getElementById("teamSearch").addEventListener("input", function (e) { renderGroups(e.target.value); });
  document.getElementById("showMoreMatches").addEventListener("click", function () {
    visibleMatches += 6;
    renderMatches();
  });

  dateStrip.addEventListener("click", function (event) {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    activeDate = button.dataset.date;
    dateStrip.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); });
    renderMatches();
  });

  document.querySelector(".match-tabs").addEventListener("click", function (event) {
    const button = event.target.closest("[data-match-filter]");
    if (!button) return;
    activeMatchFilter = button.dataset.matchFilter;
    visibleMatches = 6;
    document.querySelectorAll("[data-match-filter]").forEach(function (item) { item.classList.toggle("active", item === button); });
    renderMatches();
  });

  document.getElementById("searchToggle").addEventListener("click", function () { toggleSearch(true); });
  document.getElementById("searchClose").addEventListener("click", function () { toggleSearch(false); });
  searchOverlay.addEventListener("click", function (event) {
    if (event.target === searchOverlay) toggleSearch(false);
    if (event.target.closest("[data-close-search]")) toggleSearch(false);
  });
  globalSearch.addEventListener("input", function (e) { renderGlobalSearch(e.target.value); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { toggleSearch(false); WC.teamPanel.close(); }
  });

  document.getElementById("menuToggle").addEventListener("click", function () {
    document.querySelector(".main-nav").classList.toggle("open");
  });
  document.querySelectorAll(".main-nav a").forEach(function (link) {
    link.addEventListener("click", function () { document.querySelector(".main-nav").classList.remove("open"); });
  });

  /* clic en cualquier equipo → panel */
  document.addEventListener("click", function (event) {
    const el = event.target.closest("[data-team-id]");
    if (!el || el.closest("#bracketGrid")) return;
    WC.teamPanel.open(el.dataset.teamId);
  });

  /* nav activa por scroll */
  const sections = Array.from(document.querySelectorAll("main section[id]"));
  const navLinks = Array.from(document.querySelectorAll(".main-nav a"));
  const sectionObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        navLinks.forEach(function (link) {
          link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
        });
      }
    });
  }, { rootMargin: "-35% 0px -55%" });
  sections.forEach(function (section) { sectionObserver.observe(section); });

  /* ---------- init ---------- */
  function applyData(result) {
    state.matches = result.matches;
    state.source = result.source;
    state.updatedAt = result.updatedAt;
    recompute();
    renderAll();
  }

  recompute();
  renderAll();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  WC.api.load().then(applyData);
  WC.api.startPolling(function () { return state.matches; }, applyData);
})();
