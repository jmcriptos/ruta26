(function (root) {
  const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?lang=es&region=mx&event=";
  const CACHE_PREFIX = "wc26-detail-v1:";
  // [clave ESPN, etiqueta] en orden de render; posesión se dibuja como barra.
  const STATS = [
    ["possessionPct", "Posesión"],
    ["totalShots", "Tiros"],
    ["shotsOnTarget", "Al arco"],
    ["foulsCommitted", "Faltas"],
    ["yellowCards", "Amarillas"],
    ["redCards", "Rojas"],
    ["wonCorners", "Córners"],
    ["offsides", "Offsides"],
    ["saves", "Atajadas"],
    ["accuratePasses", "Pases buenos"]
  ];

  // Elimina caracteres de control; el escape HTML lo hace el render.
  function safeText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max || 80) : "";
  }

  // Acepta solo minutos con formato "9'" o "90'+2'"; rechaza cualquier otra cosa.
  function safeMinute(value) {
    const v = typeof value === "string" ? value : "";
    return /^[0-9]{1,3}'(?:\+[0-9]{1,2}')?$/.test(v) ? v : null;
  }

  // Convierte a número; acepta enteros y decimales no negativos hasta 2000.
  function safeNum(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : null;
  }

  // Construye mapa de teamId → "home"/"away" desde header.competitions[0].
  function sideByTeamId(json) {
    const out = {};
    const comps = (((json.header || {}).competitions || [])[0] || {}).competitors || [];
    comps.forEach(function (c) {
      if (c && (c.homeAway === "home" || c.homeAway === "away") && c.team && c.team.id != null) {
        out[String(c.team.id)] = c.homeAway;
      }
    });
    return out;
  }

  // Determina el tipo de evento; devuelve null si hay que ignorarlo.
  function eventKind(ev) {
    if (ev.shootout === true) return null;
    if (ev.scoringPlay === true) {
      if (ev.ownGoal === true) return "og";
      if (ev.penaltyKick === true) return "pen";
      return "goal";
    }
    const type = ev.type || {};
    const typeId = type.id == null ? "" : String(type.id);
    if (typeId === "94" || type.text === "Yellow Card") return "yellow";
    if (typeId === "93" || type.text === "Red Card") return "red";
    return null;
  }

  // Extrae lista de eventos relevantes (goles, tarjetas) separados por lado.
  function parseEvents(json, sides) {
    const events = { home: [], away: [] };
    const list = Array.isArray(json.keyEvents) ? json.keyEvents : [];
    list.forEach(function (ev) {
      if (!ev) return;
      const side = sides[String((ev.team || {}).id)];
      if (!side) return;
      const kind = eventKind(ev);
      if (!kind) return;
      const minute = safeMinute((ev.clock || {}).displayValue);
      const first = (Array.isArray(ev.participants) ? ev.participants : [])[0];
      const name = safeText(first && first.athlete && first.athlete.displayName);
      if (!minute || !name) return;
      events[side].push({ minute: minute, name: name, kind: kind });
    });
    return events;
  }

  // Extrae estadísticas del boxscore en el orden definido por STATS.
  function parseStats(json) {
    const teams = ((json.boxscore || {}).teams) || [];
    const bySide = {};
    teams.forEach(function (t) {
      if (!t || (t.homeAway !== "home" && t.homeAway !== "away")) return;
      const vals = {};
      (Array.isArray(t.statistics) ? t.statistics : []).forEach(function (s) {
        if (s && typeof s.name === "string") vals[s.name] = safeNum(s.displayValue);
      });
      bySide[t.homeAway] = vals;
    });
    if (!bySide.home || !bySide.away) return [];
    const rows = [];
    STATS.forEach(function (def) {
      const home = bySide.home[def[0]];
      const away = bySide.away[def[0]];
      if (home == null || away == null) return;
      rows.push({ key: def[0], label: def[1], home: home, away: away });
    });
    return rows;
  }

  // Punto de entrada: parsea el JSON del summary de ESPN.
  function parseSummary(json) {
    json = json && typeof json === "object" ? json : {};
    return { events: parseEvents(json, sideByTeamId(json)), stats: parseStats(json) };
  }

  // Narración jugada a jugada; lo más reciente primero. isGoal es solo presentación.
  function parseCommentary(json) {
    const list = Array.isArray(json && json.commentary) ? json.commentary : [];
    const out = [];
    list.forEach(function (e) {
      if (!e) return;
      const text = safeText(e.text, 300);
      if (!text) return;
      const seq = safeNum(e.sequence);
      out.push({
        seq: seq == null ? 0 : seq,
        minute: safeMinute((e.time || {}).displayValue) || "",
        text: text,
        isGoal: /^¡Go+l/.test(text)
      });
    });
    out.sort(function (a, b) { return b.seq - a.seq; });
    return out;
  }

  // Escapa caracteres especiales de HTML para evitar inyección.
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  const ICONS = { goal: "⚽", pen: "⚽", og: "⚽", yellow: "🟨", red: "🟥" };
  const SUFFIX = { pen: " (P)", og: " (AG)" };

  // Genera el HTML de una línea de evento (gol, tarjeta).
  // El minuto se re-valida aquí porque el modelo puede venir de una caché
  // manipulada; esc() no sirve para esto (convertiría el apóstrofe en &#39;).
  function eventLine(ev) {
    const minute = safeMinute(ev.minute) || "";
    return '<li><span class="ev-min">' + minute + "</span> " + (ICONS[ev.kind] || "") + " " +
      esc(ev.name) + (SUFFIX[ev.kind] || "") + "</li>";
  }

  // Renderiza el modelo {events, stats} a HTML listo para innerHTML.
  function renderDetail(model) {
    const hasEvents = model.events.home.length || model.events.away.length;
    if (!hasEvents && !model.stats.length) {
      return '<p class="detail-empty">Sin detalle disponible para este partido.</p>';
    }
    let html = "";
    if (hasEvents) {
      html += '<div class="detail-events">' +
        '<ul class="detail-col">' + model.events.home.map(eventLine).join("") + "</ul>" +
        '<ul class="detail-col away">' + model.events.away.map(eventLine).join("") + "</ul>" +
        "</div>";
    }
    const poss = model.stats.find(function (s) { return s.key === "possessionPct"; });
    // safeNum re-valida los porcentajes: van a un atributo style y el modelo
    // puede venir de una caché manipulada.
    const possHome = poss ? safeNum(poss.home) : null;
    const possAway = poss ? safeNum(poss.away) : null;
    if (possHome != null && possAway != null) {
      html += '<div class="detail-row poss"><b>' + possHome + '%</b><span>Posesión</span><b>' + possAway + "%</b></div>" +
        '<div class="poss-bar"><i style="width:' + possHome + '%"></i></div>';
    }
    html += model.stats.filter(function (s) { return s.key !== "possessionPct"; }).map(function (s) {
      return '<div class="detail-row"><b>' + esc(s.home) + "</b><span>" + esc(s.label) + "</span><b>" + esc(s.away) + "</b></div>";
    }).join("");
    return html;
  }

  // Lista de jugadas, lo más nuevo arriba; con showAll=false solo las últimas 5.
  function renderNarration(entries, showAll) {
    if (!entries.length) return '<p class="detail-empty">Aún no hay narración disponible.</p>';
    const shown = showAll ? entries : entries.slice(0, 5);
    let html = '<ul class="live-feed">' + shown.map(function (e) {
      const minute = safeMinute(e.minute) || "";
      return '<li' + (e.isGoal ? ' class="live-goal"' : "") + '><span class="ev-min">' + minute + "</span><span>" + esc(e.text) + "</span></li>";
    }).join("") + "</ul>";
    if (!showAll && entries.length > 5) {
      html += '<button type="button" class="detail-toggle live-more" data-live-more>Ver jugadas anteriores</button>';
    }
    return html;
  }

  // Panel completo de partido en vivo: tabs + cuerpo + pie.
  function renderLive(state) {
    const commentary = Array.isArray(state.commentary) ? state.commentary : [];
    const statsTab = state.tab === "stats";
    const tabs = '<div class="live-tabs">' +
      '<button type="button" class="live-tab' + (statsTab ? "" : " active") + '" data-live-tab="narracion">Narración</button>' +
      '<button type="button" class="live-tab' + (statsTab ? " active" : "") + '" data-live-tab="stats">Estadísticas</button></div>';
    const body = statsTab ? renderDetail(state.model) : renderNarration(commentary, state.showAll);
    const latest = commentary.find(function (e) { return e.minute; });
    const minute = latest ? safeMinute(latest.minute) : null;
    return tabs + '<div class="live-body">' + body + "</div>" +
      '<div class="live-foot"><span data-live-updated>Actualizado hace 0 s</span><span>' +
      (minute ? minute + " · " : "") + "Datos: ESPN</span></div>";
  }

  function isObj(value) { return value != null && typeof value === "object"; }

  // Lee el modelo cacheado de localStorage; devuelve null si no existe o es inválido.
  function readCache(matchId) {
    try {
      const model = JSON.parse(localStorage.getItem(CACHE_PREFIX + matchId));
      if (!(model && model.events && Array.isArray(model.events.home) &&
        Array.isArray(model.events.away) && Array.isArray(model.stats))) return null;
      // Filtra items no-objeto: una caché manipulada no debe romper el render.
      model.events.home = model.events.home.filter(isObj);
      model.events.away = model.events.away.filter(isObj);
      model.stats = model.stats.filter(isObj);
      return model;
    } catch (e) { return null; }
  }

  // Guarda el modelo en localStorage; silencioso en Safari privado.
  function writeCache(matchId, model) {
    try { localStorage.setItem(CACHE_PREFIX + matchId, JSON.stringify(model)); } catch (e) { /* Safari privado */ }
  }

  // Descarga el summary de ESPN para el espnId dado; aborta tras 10 s.
  async function fetchDetail(espnId) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      const res = await fetch(SUMMARY_URL + encodeURIComponent(espnId), { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return parseSummary(await res.json());
    } finally { clearTimeout(t); }
  }

  // Carga el detalle de un partido en el panel dado; usa caché si hay.
  async function loadInto(matchId, panel) {
    const espnId = (root.WC.ESPN_MAP || {})[matchId];
    if (!espnId) { panel.innerHTML = '<p class="detail-empty">Sin detalle disponible para este partido.</p>'; return; }
    const cached = readCache(matchId);
    if (cached) { panel.innerHTML = renderDetail(cached); return; }
    panel.innerHTML = '<p class="detail-empty">Cargando…</p>';
    try {
      const model = await fetchDetail(espnId);
      // No cachear modelos vacíos: ESPN puede tardar en publicar el detalle
      // tras el final y un vacío cacheado quedaría "sin detalle" para siempre.
      if (model.events.home.length || model.events.away.length || model.stats.length) {
        writeCache(matchId, model);
      }
      panel.innerHTML = renderDetail(model);
    } catch (e) {
      panel.innerHTML = '<p class="detail-empty">No se pudo cargar el detalle. ' +
        '<button type="button" class="detail-retry" data-detail-retry="' + esc(matchId) + '">Reintentar</button></p>';
    }
  }

  // btn: el botón "Ver más" dentro de la tarjeta; el panel es su hermano siguiente.
  function toggle(matchId, btn) {
    const panel = btn.nextElementSibling;
    if (!panel || !panel.classList.contains("match-detail")) return;
    const open = !panel.hidden;
    panel.hidden = open;
    btn.textContent = open ? "Ver más" : "Ver menos";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    if (!open) loadInto(matchId, panel);
  }

  // Reintenta la carga después de un error; retryBtn vive dentro del panel.
  function retry(matchId, retryBtn) {
    loadInto(matchId, retryBtn.closest(".match-detail"));
  }

  const api = { parseSummary: parseSummary, renderDetail: renderDetail, toggle: toggle, retry: retry, STATS: STATS, parseCommentary: parseCommentary, renderNarration: renderNarration, renderLive: renderLive };
  root.WC = root.WC || {};
  root.WC.matchDetail = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
