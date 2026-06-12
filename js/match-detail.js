(function (root) {
  const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";
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
  function safeText(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) : "";
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
    const text = (ev.type || {}).text || "";
    if (text === "Yellow Card") return "yellow";
    if (text === "Red Card") return "red";
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

  const api = { parseSummary: parseSummary, STATS: STATS };
  root.WC = root.WC || {};
  root.WC.matchDetail = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
