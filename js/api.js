(function (root) {
  const ENDPOINT = "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=500&language=es";
  const STORAGE_KEY = "wc26-live-v1";
  const STAGE_BY_ID = {
    "289273": "group", "289287": "r32", "289288": "r16",
    "289289": "qf", "289290": "sf", "289291": "third", "289292": "final"
  };

  function safeId(value) {
    const id = value == null ? "" : String(value);
    return /^[0-9]{1,20}$/.test(id) ? id : null;
  }

  function safeInt(value, min, max) {
    if (value == null) return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  }

  function safeDate(value) {
    const ms = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  function safeText(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) : "";
  }

  function safePlaceholder(value) {
    const slot = value == null ? "" : String(value);
    return /^(?:[12][A-L]|3[A-L]+|W[0-9]{1,3}|RU[0-9]{1,3})$/.test(slot) ? slot : null;
  }

  function mapStatus(s) {
    if (s === 0) return "played";
    if (s === 3 || s === 12) return "live";
    return "scheduled";
  }

  function normalize(m) {
    m = m || {};
    const groupName = m.GroupName && m.GroupName.length ? m.GroupName[0].Description : null;
    const groupMatch = typeof groupName === "string" ? groupName.match(/^Grupo\s+([A-L])$/i) : null;
    const stage = STAGE_BY_ID[String(m.IdStage)] || "group";
    return {
      id: safeId(m.IdMatch),
      num: safeInt(m.MatchNumber, 1, 1000),
      stage: stage,
      group: stage === "group" && groupMatch ? groupMatch[1].toUpperCase() : null,
      date: safeDate(m.Date),
      city: safeText(m.Stadium && m.Stadium.CityName && m.Stadium.CityName.length ? m.Stadium.CityName[0].Description : ""),
      stadium: safeText(m.Stadium && m.Stadium.Name && m.Stadium.Name.length ? m.Stadium.Name[0].Description : ""),
      home: safeId(m.Home && m.Home.IdTeam),
      away: safeId(m.Away && m.Away.IdTeam),
      phA: stage !== "group" ? safePlaceholder(m.PlaceHolderA) : null,
      phB: stage !== "group" ? safePlaceholder(m.PlaceHolderB) : null,
      hs: safeInt(m.HomeTeamScore, 0, 99),
      as: safeInt(m.AwayTeamScore, 0, 99),
      hp: safeInt(m.HomeTeamPenaltyScore, 0, 99),
      ap: safeInt(m.AwayTeamPenaltyScore, 0, 99),
      status: mapStatus(safeInt(m.MatchStatus, 0, 99)),
      winner: safeId(m.Winner)
    };
  }

  function merge(snapshot, live) {
    const byId = {};
    live.forEach(function (x) { byId[x.id] = x; });
    return snapshot.map(function (x) { return byId[x.id] ? Object.assign({}, x, byId[x.id]) : x; });
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function writeCache(payload) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) { /* Safari privado, etc. */ }
  }

  async function fetchLive() {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      const res = await fetch(ENDPOINT, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json || !Array.isArray(json.Results)) throw new Error("Respuesta FIFA inválida");
      return json.Results.map(normalize).filter(function (m) {
        return m.id && m.num && m.date;
      });
    } finally { clearTimeout(t); }
  }

  async function load() {
    const snap = (root.WC.SNAPSHOT && root.WC.SNAPSHOT.matches) || [];
    try {
      const live = await fetchLive();
      const payload = { updatedAt: Date.now(), matches: live };
      writeCache(payload);
      return { matches: merge(snap, live), source: "live", updatedAt: payload.updatedAt };
    } catch (e) {
      const cached = readCache();
      if (cached && cached.matches) {
        return { matches: merge(snap, cached.matches), source: "cache", updatedAt: cached.updatedAt };
      }
      return { matches: snap.slice(), source: "snapshot", updatedAt: null };
    }
  }

  function shouldPoll(matches) {
    const now = Date.now();
    return matches.some(function (m) {
      return m.status === "live" ||
        (m.status === "scheduled" && Math.abs(new Date(m.date).getTime() - now) < 6 * 3600000);
    });
  }

  function startPolling(getMatches, onData) {
    setInterval(async function () {
      if (!shouldPoll(getMatches())) return;
      onData(await load());
    }, 120000);
  }

  const api = { normalize: normalize, mapStatus: mapStatus, merge: merge, load: load, startPolling: startPolling, ENDPOINT: ENDPOINT };
  root.WC = root.WC || {};
  root.WC.api = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
