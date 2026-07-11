/* La Carrera de Ruta 26 — bar chart race de puntos acumulados por día.
   Lógica pura (buildDailySeries) dual-environment (browser + node:test) y, en el
   navegador, la animación. Reusa WC.scoring como única fuente de verdad del puntaje. */
(function (root) {
  "use strict";

  // Día calendario en Curaçao (UTC-4, sin DST) → "YYYY-MM-DD". Las claves ordenan
  // lexicográficamente, así que se comparan como strings.
  var _dayFmt = null;
  function curacaoDay(iso) {
    if (!_dayFmt) _dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Curacao", year: "numeric", month: "2-digit", day: "2-digit" });
    return _dayFmt.format(new Date(iso));
  }

  var STAGE_LABEL = {
    group: "Fase de grupos", r32: "16avos de final", r16: "Octavos de final",
    qf: "Cuartos de final", sf: "Semifinal", third: "Tercer puesto", final: "La Final"
  };

  function dayLabel(key) {
    return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "America/Curacao" }).format(new Date(key + "T12:00:00-04:00"));
  }

  // Subtítulo del día: etiqueta de la ronda predominante + cuántos partidos jugados.
  function daySubtitle(playedThatDay) {
    if (!playedThatDay.length) return "";
    var counts = {};
    playedThatDay.forEach(function (m) { counts[m.stage] = (counts[m.stage] || 0) + 1; });
    var stage = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var n = playedThatDay.length;
    return (STAGE_LABEL[stage] || "Partidos") + " · " + n + (n === 1 ? " partido" : " partidos");
  }

  // Serie diaria acumulada. Los fotogramas son los días con ≥1 partido jugado; por
  // cada día se corre buildLeaderboard con los partidos hasta el final de ese día,
  // dando el puntaje acumulado y la posición de cada jugador en esa fecha.
  // Devuelve { frames: [{ day, label, subtitle, rows: [{userId, username, points, pos}] }] }.
  function buildDailySeries(profiles, predictions, picks, matches, captains, scoring) {
    var played = (matches || []).filter(function (m) { return m && m.status === "played" && m.hs != null; });
    var byDay = {};
    played.forEach(function (m) { var d = curacaoDay(m.date); (byDay[d] = byDay[d] || []).push(m); });
    var days = Object.keys(byDay).sort();
    var frames = days.map(function (day) {
      var upTo = (matches || []).filter(function (m) { return curacaoDay(m.date) <= day; });
      var rows = scoring.buildLeaderboard(profiles || [], predictions || [], picks || [], upTo, captains || [])
        .map(function (r) { return { userId: r.userId, username: r.username, points: r.points, pos: r.pos }; });
      return { day: day, label: dayLabel(day), subtitle: daySubtitle(byDay[day]), rows: rows };
    });
    return { frames: frames };
  }

  root.WC = root.WC || {};
  root.WC.race = { buildDailySeries: buildDailySeries, curacaoDay: curacaoDay, dayLabel: dayLabel, STAGE_LABEL: STAGE_LABEL };
  if (typeof module !== "undefined" && module.exports) module.exports = root.WC.race;

  /* ---------------- Animación (solo navegador) ---------------- */
  if (typeof document === "undefined") return;

  var ROW = 42;          // alto de fila en px
  var TOP_N = 12;        // barras visibles a la vez
  var BAR_MIN = 5, BAR_SPAN = 56; // ancho de barra en % (mín + proporción)
  var STEP_MS = 1300;    // tiempo por día

  var cfg = root.WC.CONFIG;
  var teams = (root.WC.SNAPSHOT && root.WC.SNAPSHOT.teams) || {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Color estable por jugador (hash → tono HSL agradable).
  function colorFor(id) {
    var h = 0, s = String(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return "hsl(" + h + " 62% 52%)";
  }

  function q(path) {
    return fetch(cfg.SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY }
    }).then(function (r) { if (!r.ok) throw new Error(path + " → " + r.status); return r.json(); });
  }

  var els = {}, frames = [], champByUser = {}, rowEls = {}, cur = 0, timer = null, playing = false, source = "snapshot";

  function setStatus(msg) { if (els.status) els.status.textContent = msg; }

  function buildRows(profiles) {
    els.track.innerHTML = "";
    els.track.style.height = (TOP_N * ROW) + "px";
    (profiles || []).forEach(function (p) {
      var champ = champByUser[p.id];
      var flag = champ && teams[champ] ? teams[champ].flag : "";
      var el = document.createElement("div");
      el.className = "rc-row";
      el.style.setProperty("--c", colorFor(p.id));
      el.innerHTML =
        '<span class="rc-rank"></span>' +
        '<span class="rc-bar"></span>' +
        '<span class="rc-name">' + (flag ? '<span class="rc-flag">' + flag + "</span>" : "") + esc(p.username || "—") + "</span>" +
        '<span class="rc-val"></span>';
      els.track.appendChild(el);
      rowEls[p.id] = el;
    });
  }

  function render(i) {
    var f = frames[i]; if (!f) return;
    var max = f.rows.reduce(function (mx, r) { return Math.max(mx, r.points); }, 0) || 1;
    els.date.textContent = f.label;
    els.sub.textContent = f.subtitle;
    els.scrub.value = i;
    f.rows.forEach(function (r, rank) {
      var el = rowEls[r.userId]; if (!el) return;
      var vis = rank < TOP_N;
      el.style.transform = "translateY(" + (Math.min(rank, TOP_N) * ROW) + "px)";
      el.style.opacity = vis ? "1" : "0";
      el.classList.toggle("lead", rank === 0);
      el.querySelector(".rc-rank").textContent = rank + 1;
      el.querySelector(".rc-bar").style.width = (BAR_MIN + (r.points / max) * BAR_SPAN) + "%";
      el.querySelector(".rc-val").textContent = r.points;
    });
  }

  function stop() { playing = false; clearInterval(timer); timer = null; els.play.textContent = "▶"; els.play.setAttribute("aria-label", "Reproducir"); }
  function atEnd() { return cur >= frames.length - 1; }

  function play() {
    if (atEnd()) cur = 0;               // al final, "play" reinicia
    playing = true; els.play.textContent = "⏸"; els.play.setAttribute("aria-label", "Pausar");
    render(cur);
    clearInterval(timer);
    timer = setInterval(function () {
      if (atEnd()) { stop(); els.play.textContent = "↻"; els.play.setAttribute("aria-label", "Repetir"); return; }
      cur++; render(cur);
    }, STEP_MS);
  }

  function init() {
    els = {
      track: document.getElementById("rc-track"), date: document.getElementById("rc-date"),
      sub: document.getElementById("rc-sub"), scrub: document.getElementById("rc-scrub"),
      play: document.getElementById("rc-play"), status: document.getElementById("rc-status"),
      src: document.getElementById("rc-src")
    };
    els.play.onclick = function () { playing ? stop() : play(); };
    els.scrub.oninput = function (e) { stop(); cur = +e.target.value; render(cur); };

    setStatus("Cargando la quiniela…");
    Promise.all([
      q("profiles?select=id,username"),
      q("predictions?select=user_id,match_id,hg,ag,adv&limit=20000"),
      q("champion_picks?select=user_id,team_id"),
      q("captain_picks?select=user_id,match_id&limit=20000"),
      root.WC.api.load()
    ]).then(function (res) {
      var profiles = res[0], preds = res[1], picks = res[2], caps = res[3], loaded = res[4];
      source = loaded.source;
      var matches = loaded.matches;
      (picks || []).forEach(function (pk) { champByUser[pk.user_id] = pk.team_id; });
      frames = buildDailySeries(profiles, preds, picks, matches, caps, root.WC.scoring).frames;
      if (!frames.length) { setStatus("Aún no hay partidos jugados."); return; }
      setStatus("");
      els.scrub.max = frames.length - 1;
      buildRows(profiles);
      els.src.textContent = { live: "en vivo", cache: "caché", snapshot: "local" }[source] || "";
      cur = 0; render(0);
      // arranca solo tras un respiro para que se aprecie el reordenamiento inicial
      setTimeout(play, 600);
    }).catch(function (e) { setStatus("No se pudo cargar: " + (e.message || e)); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
