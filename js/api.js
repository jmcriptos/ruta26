(function (root) {
  const ENDPOINT = "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=500&language=es";
  const STORAGE_KEY = "wc26-live-v1";
  const STAGE_BY_ID = {
    "289273": "group", "289287": "r32", "289288": "r16",
    "289289": "qf", "289290": "sf", "289291": "third", "289292": "final"
  };

  function mapStatus(s) {
    if (s === 0) return "played";
    if (s === 3 || s === 12) return "live";
    return "scheduled";
  }

  function normalize(m) {
    const groupName = m.GroupName && m.GroupName.length ? m.GroupName[0].Description : null;
    return {
      id: m.IdMatch,
      num: Number(m.MatchNumber),
      stage: STAGE_BY_ID[m.IdStage] || "group",
      group: groupName ? groupName.replace(/^Grupo\s+/, "") : null,
      date: m.Date,
      city: m.Stadium && m.Stadium.CityName && m.Stadium.CityName.length ? m.Stadium.CityName[0].Description : "",
      stadium: m.Stadium && m.Stadium.Name && m.Stadium.Name.length ? m.Stadium.Name[0].Description : "",
      home: m.Home && m.Home.IdTeam ? m.Home.IdTeam : null,
      away: m.Away && m.Away.IdTeam ? m.Away.IdTeam : null,
      phA: m.PlaceHolderA || null,
      phB: m.PlaceHolderB || null,
      hs: m.HomeTeamScore != null ? m.HomeTeamScore : null,
      as: m.AwayTeamScore != null ? m.AwayTeamScore : null,
      hp: m.HomeTeamPenaltyScore != null ? m.HomeTeamPenaltyScore : null,
      ap: m.AwayTeamPenaltyScore != null ? m.AwayTeamPenaltyScore : null,
      status: mapStatus(m.MatchStatus),
      winner: m.Winner || null
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
      const res = await fetch(ENDPOINT, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return json.Results.map(normalize);
    } finally { clearTimeout(t); }
  }

  async function load() {
    const snap = root.WC.SNAPSHOT.matches;
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
