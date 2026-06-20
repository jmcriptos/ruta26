/* Dashboard de estadísticas de la quiniela — vanilla JS, sin dependencias.
   Lee las mismas tablas que la versión anterior de stats.html. Depende de
   js/config.js (WC.CONFIG) y js/data.js (WC.SNAPSHOT). */
(function () {
  "use strict";

  var cfg = WC.CONFIG;
  var teams = WC.SNAPSHOT.teams;
  var matches = WC.SNAPSHOT.matches;
  var MS = 86400e3;
  var num = new Intl.NumberFormat("es-MX");
  var timeFmt = new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit" });

  /* ── Estado ───────────────────────────────────────── */
  var raw = null;
  var loading = false;
  var range = 14;
  var theme = "claro";
  try {
    var r = parseInt(localStorage.getItem("r26-dash-range"), 10);
    if (r === 7 || r === 14 || r === 30) range = r;
    var th = localStorage.getItem("r26-dash-theme");
    if (th === "oscuro" || th === "claro") theme = th;
  } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function codeToFlag(code) {
    if (!/^[A-Z]{2}$/.test(code)) return "";
    return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
  }
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["es"], { type: "region" }); } catch (e) {}
  function countryName(code) {
    if (regionNames) { try { var n = regionNames.of(code); if (n && n !== code) return n; } catch (e) {} }
    return code;
  }
  function dayKey(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayLabel(key) {
    return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(new Date(key + "T12:00:00"));
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var ms = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < ms.length; i++) if (ms[i] * pow >= v) return ms[i] * pow;
    return 10 * pow;
  }
  function pctDelta(cur, prev) {
    if (prev === 0) return cur > 0 ? { txt: "nuevo", dir: "up" } : { txt: "—", dir: "flat" };
    var p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return { txt: "0%", dir: "flat" };
    return { txt: (p > 0 ? "↗ +" : "↘ ") + p + "%", dir: p > 0 ? "up" : "down" };
  }

  /* ── Tema ─────────────────────────────────────────── */
  function applyTheme() {
    document.body.setAttribute("data-theme", theme);
    $("thClaro").classList.toggle("active", theme === "claro");
    $("thOscuro").classList.toggle("active", theme === "oscuro");
    try { localStorage.setItem("r26-dash-theme", theme); } catch (e) {}
  }
  $("thClaro").addEventListener("click", function () { theme = "claro"; applyTheme(); });
  $("thOscuro").addEventListener("click", function () { theme = "oscuro"; applyTheme(); });
  applyTheme();

  /* ── Datos ────────────────────────────────────────── */
  function q(path) {
    return fetch(cfg.SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY }
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function rpc(name, args) {
    return fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args || {})
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 404) throw new Error("falta desplegar analytics_rollup en Supabase");
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    });
  }

  function load() {
    if (loading) return;
    loading = true;
    $("refreshBtn").classList.add("spin");
    $("updated").textContent = "cargando…";
    var since = new Date(Date.now() - 62 * MS).toISOString();
    Promise.all([
      q("profiles?select=id,username,created_at"),
      q("champion_picks?select=user_id,team_id"),
      q("predictions?select=user_id,match_id&limit=5000"),
      rpc("analytics_rollup", { since_at: since }),
      rpc("engagement_rollup", { since_at: since }).catch(function () { return []; })
    ]).then(function (res) {
      raw = { profiles: res[0], picks: res[1], preds: res[2], views: res[3], eng: res[4] };
      $("updated").textContent = "al " + timeFmt.format(new Date());
      render();
    }).catch(function (e) {
      $("updated").textContent = "error";
      if (!raw) {
        $("content").innerHTML = '<div class="dz-main"><div class="dz-err">No se pudieron cargar los datos (' +
          esc(e.message) + "). Revisa tu conexión e intenta de nuevo.</div></div>";
      }
    }).then(function () {
      loading = false;
      $("refreshBtn").classList.remove("spin");
    });
  }
  $("refreshBtn").addEventListener("click", load);
  setInterval(load, 5 * 60000); /* auto-refresh cada 5 min */

  /* Usuarios en vivo: sesiones activas en los últimos 5 min. Refresco ~45 s.
     Si la RPC no está desplegada (404), se muestra "—" sin romper nada. */
  var liveValue = null;
  function refreshLive() {
    rpc("analytics_live").then(function (n) {
      liveValue = Array.isArray(n) ? (Number(n[0]) || 0) : (Number(n) || 0);
      var el = $("liveCount");
      if (el) el.textContent = num.format(liveValue);
    }).catch(function () {
      var el = $("liveCount");
      if (el && liveValue == null) el.textContent = "—";
    });
  }
  refreshLive();
  setInterval(refreshLive, 45000);

  /* ── Agregación ───────────────────────────────────── */
  function aggregate() {
    var now = Date.now();
    var dayKeys = [], i;
    for (i = range - 1; i >= 0; i--) dayKeys.push(dayKey(new Date(now - i * MS).toISOString()));
    var inRange = {};
    dayKeys.forEach(function (k) { inRange[k] = true; });

    var vDay = {}, sessByDay = {}, vSec = {}, dev = { mobile: 0, desktop: 0 }, pwa = 0, periods = {}, vCountry = {};
    raw.views.forEach(function (v) {
      var views = Number(v.views) || 0;
      var sessions = Number(v.sessions) || 0;
      if (v.dimension === "period") {
        periods[v.value] = { views: views, sessions: sessions };
        return;
      }
      var d = String(v.day || "");
      if (!inRange[d]) return;
      if (v.dimension === "day") {
        vDay[d] = views;
        sessByDay[d] = sessions;
      } else if (v.dimension === "section") {
        var s = (v.value || "#inicio").replace("#", "") || "inicio";
        vSec[s] = (vSec[s] || 0) + views;
      } else if (v.dimension === "device" && (v.value === "mobile" || v.value === "desktop")) {
        dev[v.value] += views;
      } else if (v.dimension === "standalone" && v.value === "true") {
        pwa += views;
      } else if (v.dimension === "country" && /^[A-Z]{2}$/.test(v.value)) {
        vCountry[v.value] = (vCountry[v.value] || 0) + sessions;
      }
    });
    var current = periods[range + "_current"] || { views: 0, sessions: 0 };
    var previous = periods[range + "_previous"] || { views: 0, sessions: 0 };

    var viewsSeries = dayKeys.map(function (k) {
      return { label: dayLabel(k), views: vDay[k] || 0, sessions: sessByDay[k] || 0 };
    });

    var regsDay = {}, regsInRange = 0;
    raw.profiles.forEach(function (p) {
      var d = dayKey(p.created_at);
      if (inRange[d]) { regsDay[d] = (regsDay[d] || 0) + 1; regsInRange++; }
    });
    var regsSeries = dayKeys.map(function (k) { return { label: dayLabel(k), n: regsDay[k] || 0 }; });

    var champ = {};
    raw.picks.forEach(function (pk) {
      var t = teams[pk.team_id];
      var k = t ? t.flag + " " + t.name : String(pk.team_id);
      champ[k] = (champ[k] || 0) + 1;
    });
    var champions = Object.keys(champ).sort(function (a, b) { return champ[b] - champ[a]; })
      .map(function (k) { return { label: k, n: champ[k] }; });

    var sinChamp = raw.profiles.filter(function (p) {
      return !raw.picks.some(function (pk) { return pk.user_id === p.id; });
    }).map(function (p) { return p.username; });

    var kicked = matches.filter(function (m) { return new Date(m.date) <= new Date(); });
    var tname = function (id) { var t = teams[id]; return t ? t.flag + " " + t.name.split(" ")[0] : "—"; };
    var matchPicks = kicked.slice(-8).map(function (m) {
      var n = raw.preds.filter(function (p) { return p.match_id === m.id; }).length;
      return { label: tname(m.home) + " – " + tname(m.away), n: n, val: n + "/" + raw.profiles.length };
    });

    var sections = Object.keys(vSec).sort(function (a, b) { return vSec[b] - vSec[a]; }).slice(0, 8)
      .map(function (s) { return { label: s, n: vSec[s] }; });

    var countries = Object.keys(vCountry).sort(function (a, b) { return vCountry[b] - vCountry[a]; }).slice(0, 12)
      .map(function (c) { return { label: codeToFlag(c) + " " + countryName(c), n: vCountry[c] }; });

    var todayK = dayKey(new Date().toISOString());

    return {
      players: raw.profiles.length,
      withChampion: raw.picks.length,
      sinChamp: sinChamp,
      viewsSeries: viewsSeries, regsSeries: regsSeries,
      curViews: current.views,
      curSess: current.sessions,
      regsInRange: regsInRange,
      deltaViews: pctDelta(current.views, previous.views),
      deltaSess: pctDelta(current.sessions, previous.sessions),
      viewsToday: vDay[todayK] || 0,
      sessToday: sessByDay[todayK] || 0,
      sections: sections, devices: dev, pwa: pwa,
      countries: countries,
      champions: champions, matchPicks: matchPicks
    };
  }

  /* ── SVG builders ─────────────────────────────────── */
  var ACCENT = "#68a7ff", SECOND = "#ff7c42";

  function sparkSVG(points, color) {
    if (points.length < 2) return "";
    var W = 120, H = 30, max = Math.max.apply(null, points.concat([1]));
    var step = W / (points.length - 1);
    var xy = points.map(function (p, i) { return [(i * step).toFixed(1), (H - 3 - (H - 8) * (p / max)).toFixed(1)]; });
    var line = xy.map(function (p) { return p.join(","); }).join(" ");
    return '<svg class="dz-kpi-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,' + H + " " + line + " " + W + "," + H + '" fill="' + color + '" opacity="0.16"></polygon>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></polyline></svg>';
  }

  var chart = null; /* geometría del área para el hover */
  function areaSVG(data) {
    var W = 720, H = 230, padL = 40, padR = 12, padT = 14, padB = 26;
    var n = data.length;
    var rawMax = Math.max.apply(null, data.map(function (d) { return Math.max(d.views, d.sessions); }).concat([1]));
    var top = niceMax(rawMax);
    var x = function (i) { return padL + (n <= 1 ? (W - padL - padR) / 2 : (W - padL - padR) * i / (n - 1)); };
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / top); };
    chart = { data: data, W: W, padL: padL, padR: padR, padT: padT, y0: y(0), x: x, y: y, n: n };

    var viewsLine = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.views).toFixed(1); }).join(" ");
    var sessLine = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.sessions).toFixed(1); }).join(" ");
    var area = x(0).toFixed(1) + "," + y(0).toFixed(1) + " " + viewsLine + " " + x(n - 1).toFixed(1) + "," + y(0).toFixed(1);
    var labelEvery = Math.max(1, Math.ceil(n / 8));

    var grid = [0.25, 0.5, 0.75, 1].map(function (f) {
      var yy = y(top * f).toFixed(1);
      return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"></line>' +
        '<text x="' + (padL - 7) + '" y="' + (+yy + 3.5) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="DM Sans">' + num.format(Math.round(top * f)) + "</text>";
    }).join("");

    var xLabels = data.map(function (d, i) {
      if (i % labelEvery !== 0) return "";
      return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="DM Sans">' + d.label + "</text>";
    }).join("");

    return '<div class="dz-chart-wrap" id="areaWrap">' +
      '<div class="dz-tip" id="areaTip"></div>' +
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Visitas y sesiones por día">' +
      grid +
      '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="var(--line)" stroke-width="1"></line>' +
      '<polygon points="' + area + '" fill="' + ACCENT + '" opacity="0.14"></polygon>' +
      '<polyline points="' + viewsLine + '" fill="none" stroke="' + ACCENT + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      '<polyline points="' + sessLine + '" fill="none" stroke="' + SECOND + '" stroke-width="1.6" stroke-dasharray="4 4" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      xLabels +
      '<g id="areaHover" style="display:none">' +
      '<line id="hovLine" x1="0" x2="0" y1="' + padT + '" y2="' + y(0).toFixed(1) + '" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"></line>' +
      '<circle id="hovDot1" r="4" fill="' + ACCENT + '" stroke="var(--card)" stroke-width="1.5"></circle>' +
      '<circle id="hovDot2" r="3.5" fill="' + SECOND + '" stroke="var(--card)" stroke-width="1.5"></circle>' +
      "</g></svg></div>" +
      '<div class="dz-legend">' +
      "<span><i style=\"background:" + ACCENT + '"></i> Secciones vistas</span>' +
      "<span><i style=\"background:" + SECOND + '"></i> Sesiones únicas</span></div>';
  }

  function bindAreaHover() {
    var wrap = $("areaWrap");
    if (!wrap || !chart) return;
    wrap.addEventListener("mousemove", function (e) {
      var r = wrap.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * chart.W;
      var i = Math.round((px - chart.padL) / ((chart.W - chart.padL - chart.padR) / Math.max(1, chart.n - 1)));
      i = Math.max(0, Math.min(chart.n - 1, i));
      var d = chart.data[i], xx = chart.x(i);
      $("areaHover").style.display = "";
      $("hovLine").setAttribute("x1", xx); $("hovLine").setAttribute("x2", xx);
      $("hovDot1").setAttribute("cx", xx); $("hovDot1").setAttribute("cy", chart.y(d.views));
      $("hovDot2").setAttribute("cx", xx); $("hovDot2").setAttribute("cy", chart.y(d.sessions));
      var tip = $("areaTip");
      tip.style.display = "block";
      tip.style.left = (xx / chart.W * 100) + "%";
      tip.innerHTML = "<b>" + esc(d.label) + "</b><br>" + num.format(d.views) + " vistas · " + num.format(d.sessions) + " sesiones";
    });
    wrap.addEventListener("mouseleave", function () {
      $("areaHover").style.display = "none";
      $("areaTip").style.display = "none";
    });
  }

  function columnSVG(data, color) {
    var W = 720, H = 150, padB = 24, padT = 16;
    var n = data.length;
    var max = Math.max.apply(null, data.map(function (d) { return d.n; }).concat([1]));
    var slot = W / n;
    var bw = Math.min(34, slot * 0.62);
    var labelEvery = Math.max(1, Math.ceil(n / 9));
    var showVals = n <= 16;
    var bars = data.map(function (d, i) {
      var h = d.n === 0 ? 2 : (H - padB - padT) * (d.n / max);
      var cx = i * slot + slot / 2;
      return "<g>" +
        '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (H - padB - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + (d.n === 0 ? "var(--track)" : color) + '" opacity="0.9"><title>' + esc(d.label) + ": " + d.n + "</title></rect>" +
        (showVals && d.n > 0 ? '<text x="' + cx.toFixed(1) + '" y="' + (H - padB - h - 5).toFixed(1) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--txt)" font-family="DM Sans">' + d.n + "</text>" : "") +
        (i % labelEvery === 0 ? '<text x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="DM Sans">' + d.label + "</text>" : "") +
        "</g>";
    }).join("");
    return '<div class="dz-chart-wrap"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Registros por día">' +
      '<line x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" stroke="var(--line)" stroke-width="1"></line>' +
      bars + "</svg></div>";
  }

  function barList(rows, color) {
    if (!rows.length) return "";
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    return rows.map(function (r) {
      return '<div class="dz-bar-row"><span class="lbl" title="' + esc(r.label) + '">' + esc(r.label) + "</span>" +
        '<div class="bar"><i style="width:' + Math.round(100 * r.n / max) + "%;background:" + color + '"></i></div>' +
        '<span class="val">' + (r.val != null ? esc(r.val) : num.format(r.n)) + "</span></div>";
    }).join("");
  }

  function donutSVG(segs, centerValue, centerLabel) {
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0);
    var R = 52, C = 2 * Math.PI * R, acc = 0;
    var circles = segs.map(function (s) {
      if (s.value === 0 || total === 0) return "";
      var frac = s.value / total, dash = frac * C, off = -acc * C;
      acc += frac;
      return '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="16" stroke-dasharray="' +
        dash.toFixed(2) + " " + (C - dash).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 70 70)"></circle>';
    }).join("");
    var legend = segs.map(function (s) {
      return '<div class="row"><i style="background:' + s.color + '"></i><span>' + esc(s.label) + "</span>" +
        '<span class="pct">' + (total ? Math.round(100 * s.value / total) + "%" : "—") + "</span>" +
        '<span class="n">' + num.format(s.value) + "</span></div>";
    }).join("");
    return '<div class="dz-donut-wrap">' +
      '<svg viewBox="0 0 140 140" style="width:132px;flex:none" role="img" aria-label="' + esc(centerLabel) + '">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="var(--track)" stroke-width="16"></circle>' + circles +
      '<text x="70" y="67" text-anchor="middle" font-size="24" font-weight="800" fill="var(--txt)" font-family="League Spartan">' + num.format(centerValue) + "</text>" +
      '<text x="70" y="84" text-anchor="middle" font-size="9.5" fill="var(--muted)" font-family="DM Sans" letter-spacing="1">' + esc(centerLabel) + "</text>" +
      '</svg><div class="dz-donut-legend">' + legend + "</div></div>";
  }

  /* ── Render ───────────────────────────────────────── */
  function kpi(label, value, opts) {
    opts = opts || {};
    return '<div class="dz-kpi"><small>' + esc(label) + "</small>" +
      '<div class="dz-kpi-row"><strong>' + num.format(value) + "</strong>" +
      (opts.of != null ? '<span class="of">/ ' + num.format(opts.of) + "</span>" : "") +
      (opts.delta ? '<span class="dz-delta ' + opts.delta.dir + '">' + opts.delta.txt + "</span>" : "") +
      "</div>" +
      (opts.sub ? '<span class="sub">' + opts.sub + "</span>" : "") +
      (opts.progress != null ? '<div class="dz-progress"><i style="width:' + Math.round(opts.progress * 100) + '%"></i></div>' : "") +
      (opts.spark ? sparkSVG(opts.spark, opts.color || ACCENT) : "") +
      "</div>";
  }

  function card(title, body, opts) {
    opts = opts || {};
    return '<article class="dz-card' + (opts.span2 ? " span2" : "") + '"><div class="dz-card-head"><h2>' + esc(title) + "</h2>" +
      (opts.aside ? '<span class="aside">' + esc(opts.aside) + "</span>" : "") + "</div>" + body + "</article>";
  }

  function render() {
    if (!raw) return;
    var a = aggregate();

    var tabs = [7, 14, 30].map(function (d) {
      return '<button type="button" data-range="' + d + '"' + (range === d ? ' class="active"' : "") + ">" + d + " días</button>";
    }).join("");

    var sinChampHtml = a.sinChamp.length
      ? '<div class="dz-chips"><span class="pre">Sin campeón:</span>' +
        a.sinChamp.map(function (n) { return '<span class="dz-chip">' + esc(n) + "</span>"; }).join("") + "</div>"
      : "";

    $("content").innerHTML =
      '<main class="dz-main">' +
      '<div class="dz-controls">' +
      '<div class="dz-tabs" role="tablist" aria-label="Rango de fechas">' + tabs + "</div>" +
      '<span class="dz-status" title="Sesiones activas en los últimos 5 minutos"><span class="dot"></span> <span id="liveCount">' +
      (liveValue == null ? "—" : num.format(liveValue)) + "</span> en vivo</span>" +
      '<span class="dz-kicker" style="margin-left:auto">Hoy: ' + num.format(a.viewsToday) + " vistas · " + num.format(a.sessToday) + " sesiones</span>" +
      "</div>" +

      '<section class="dz-kpis">' +
      kpi("Jugadores", a.players, {
        delta: a.regsInRange > 0 ? { txt: "+" + a.regsInRange + " en " + range + " días", dir: "up" } : null,
        spark: a.regsSeries.map(function (r) { return r.n; }), color: SECOND
      }) +
      kpi("Con campeón", a.withChampion, {
        of: a.players,
        progress: a.players ? a.withChampion / a.players : 0,
        sub: a.sinChamp.length ? "Faltan " + a.sinChamp.length + " por elegir" : "Todos eligieron 🎉"
      }) +
      kpi("Vistas · " + range + " días", a.curViews, {
        delta: a.deltaViews, spark: a.viewsSeries.map(function (d) { return d.views; })
      }) +
      kpi("Sesiones · " + range + " días", a.curSess, {
        delta: a.deltaSess, spark: a.viewsSeries.map(function (d) { return d.sessions; })
      }) +
      "</section>" +

      '<section class="dz-grid">' +
      card("Actividad por día", areaSVG(a.viewsSeries), { span2: true, aside: "vs. " + range + " días previos: " + a.deltaViews.txt }) +
      card("Dispositivos",
        donutSVG([
          { label: "Celular", value: a.devices.mobile, color: ACCENT },
          { label: "Computadora", value: a.devices.desktop, color: SECOND }
        ], a.devices.mobile + a.devices.desktop, "VISTAS") +
        '<p class="dz-note">' + num.format(a.pwa) + " vistas desde la app instalada (PWA en pantalla de inicio).</p>") +
      card("Campeón elegido",
        (a.champions.length ? barList(a.champions, ACCENT) : '<p class="dz-empty">Nadie ha elegido campeón todavía.</p>') + sinChampHtml,
        { aside: a.withChampion + " picks" }) +
      card("Secciones más vistas",
        a.sections.length ? barList(a.sections, SECOND) : '<p class="dz-empty">Sin visitas en este rango.</p>',
        { aside: "últimos " + range + " días" }) +
      (a.countries.length
        ? card("Países", barList(a.countries, ACCENT), { aside: "sesiones · " + range + " días" })
        : "") +
      card("Picks por partido",
        (a.matchPicks.length ? barList(a.matchPicks, ACCENT) : '<p class="dz-empty">Aún no inicia ningún partido.</p>') +
        '<p class="dz-note">Solo partidos ya iniciados — antes del kickoff los picks son privados.</p>') +
      card("Registros por día", columnSVG(a.regsSeries, SECOND), { span2: true, aside: "+" + a.regsInRange + " en el rango" }) +
      "</section></main>";

    bindAreaHover();
  }

  /* Tabs de rango (delegado, sobrevive re-renders) */
  $("content").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-range]") : null;
    if (!btn) return;
    range = parseInt(btn.getAttribute("data-range"), 10);
    try { localStorage.setItem("r26-dash-range", String(range)); } catch (err) {}
    render();
  });

  load();
})();
