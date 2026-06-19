/* Quiniela. Depende de: config.js, scoring.js, app.js (WC.state, WC.fmt, WC.slotName, WC.stageLabel) y el SDK supabase (CDN). */
(function () {
  const rootEl = document.getElementById("gameRoot");
  if (!rootEl) return;

  const cfg = (window.WC && WC.CONFIG) || {};
  // Email sintético invisible para el jugador. Plus-addressing sobre la cuenta
  // del admin: pasa la validación de dominio de Supabase y cualquier correo
  // (nunca se envían: confirmación desactivada) llegaría al admin, no a terceros.
  function toEmail(username) { return "jm.aceleracion+" + username + "@gmail.com"; }
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- sin configuración: tarjeta apagada ---------- */
  if (!window.supabase || String(cfg.SUPABASE_URL).indexOf("http") !== 0) {
    rootEl.innerHTML = '<div class="game-card game-off"><h3>La quiniela aún no está activa</h3>' +
      "<p>Estamos conectando el juego. Vuelve en un rato.</p></div>";
    WC.game = { onDataUpdate: function () {}, myMatchPoints: function () { return null; } };
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let session = null;
  let profile = null;
  let data = { profiles: [], predictions: [], picks: [], captains: [] };
  let captainErr = {}; // matchId → mensaje de error del capitán (se limpia al reintentar)
  let mine = {};            // match_id → {hg, ag, state, error}
  let myPick = null;        // team_id
  let predDate = null;      // jornada activa: clave YYYY-MM-DD
  let rankSort = "pts";     // orden del ranking: "pts" | "acc" (% de acierto)
  let loadError = false;
  const saveTimers = {};

  /* ---------- helpers ---------- */
  function matches() { return WC.state.matches; }
  function matchById(id) { return matches().find(function (m) { return m.id === id; }); }
  function kicked(m) { return new Date(m.date).getTime() <= Date.now(); }
  function championOpen() { return Date.now() < new Date(WC.scoring.CHAMPION_LOCK).getTime(); }
  function teamName(id) { const t = WC.state.teams[id]; return t ? t.flag + " " + esc(t.name) : "—"; }
  function teamFlag(id) { const t = WC.state.teams[id]; return t && t.flag ? t.flag : "🏳️"; }
  // bandera del campeón de un usuario; los picks son públicos desde que se eligen
  // (RLS de lectura abierto). Si aún no eligió → escudo.
  function champFlagFor(userId) {
    const pk = data.picks.find(function (r) { return r.user_id === userId; });
    return pk ? teamFlag(pk.team_id) : "🛡️";
  }

  /* ---------- auth ---------- */
  async function signUp(username, password) {
    username = username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return "El usuario debe tener 3 a 20 caracteres: letras minúsculas, números o _";
    if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres";
    const res = await client.auth.signUp({
      email: toEmail(username),
      password: password,
      options: { data: { username: username } }
    });
    if (res.error) {
      if (/already|registered/i.test(res.error.message)) return "Ese usuario ya existe";
      return "No se pudo crear la cuenta (" + res.error.message + ")";
    }
    return null;
  }

  async function signIn(username, password) {
    username = username.trim().toLowerCase();
    const res = await client.auth.signInWithPassword({ email: toEmail(username), password: password });
    if (res.error) return "Usuario o contraseña incorrectos";
    return null;
  }

  async function ensureProfile(user) {
    const local = user.email.split("@")[0];
    const username = (user.user_metadata && user.user_metadata.username) ||
      (local.indexOf("+") !== -1 ? local.split("+")[1] : local);
    const got = await client.from("profiles").select("id, username").eq("id", user.id);
    if (got.data && got.data.length) { profile = got.data[0]; return; }
    const ins = await client.from("profiles").insert({ id: user.id, username: username }).select().single();
    profile = ins.data || { id: user.id, username: username };
  }

  /* ---------- datos ---------- */
  async function loadAll() {
    loadError = false;
    try {
      const results = await Promise.all([
        client.from("profiles").select("id, username"),
        // limit explícito: el default de Supabase son 1000 filas y el torneo
        // completo supera eso (jugadores × 104 partidos) — el ranking quedaría corto
        client.from("predictions").select("user_id, match_id, hg, ag, pens").limit(20000),
        client.from("champion_picks").select("user_id, team_id"),
        client.from("captain_picks").select("user_id, match_id").limit(20000)
      ]);
      // captain_picks (results[3]) es NO esencial: si la tabla aún no existe o
      // falla, la quiniela debe seguir funcionando (sin bonus de capitán), así
      // que se excluye del chequeo de error fatal y degrada a lista vacía.
      if (results.slice(0, 3).some(function (r) { return r.error; })) { loadError = true; return; }
      data.profiles = results[0].data || [];
      data.predictions = results[1].data || [];
      data.picks = results[2].data || [];
      data.captains = results[3].error ? [] : (results[3].data || []);
      if (session) {
        const uid = session.user.id;
        mine = {};
        data.predictions.forEach(function (r) {
          if (r.user_id === uid) mine[r.match_id] = { hg: r.hg, ag: r.ag, pens: !!r.pens, state: "saved" };
        });
        const own = data.picks.find(function (r) { return r.user_id === uid; });
        myPick = own ? own.team_id : null;
      }
    } catch (e) {
      loadError = true;
    }
  }

  function savePrediction(matchId) {
    clearTimeout(saveTimers[matchId]);
    saveTimers[matchId] = setTimeout(async function () {
      const v = mine[matchId];
      if (!v || !session) return;
      const uid = session.user.id;
      v.state = "saving"; paintRow(matchId);
      const res = await client.from("predictions").upsert({
        user_id: uid, match_id: matchId, hg: v.hg, ag: v.ag, pens: !!v.pens,
        updated_at: new Date().toISOString()
      });
      if (res.error) {
        v.state = "err";
        v.error = /policy|row-level|violates/i.test(res.error.message) ? "Este partido ya cerró" : "No se pudo guardar";
      } else {
        v.state = "saved"; v.error = null;
        const idx = data.predictions.findIndex(function (r) { return r.user_id === uid && r.match_id === matchId; });
        const row = { user_id: uid, match_id: matchId, hg: v.hg, ag: v.ag, pens: !!v.pens };
        if (idx >= 0) data.predictions[idx] = row; else data.predictions.push(row);
      }
      paintRow(matchId);
    }, 600);
  }

  async function saveChampion(teamId) {
    const uid = session.user.id;
    const box = document.getElementById("champState");
    if (box) box.textContent = "Guardando…";
    const res = await client.from("champion_picks").upsert({
      user_id: uid, team_id: teamId, updated_at: new Date().toISOString()
    });
    if (res.error) {
      if (box) box.textContent = /policy|row-level/i.test(res.error.message) ? "La elección de campeón ya cerró" : "No se pudo guardar";
    } else {
      myPick = teamId;
      const idx = data.picks.findIndex(function (r) { return r.user_id === uid; });
      const row = { user_id: uid, team_id: teamId };
      if (idx >= 0) data.picks[idx] = row; else data.picks.push(row);
      if (box) box.textContent = "Guardado ✓";
    }
  }

  async function saveCaptain(matchId) {
    if (!session) return;
    const uid = session.user.id;
    const m = WC.state.matches.find(function (x) { return x.id === matchId; });
    if (!m) return;
    const day = matchDay(m);
    const yaEra = data.captains.some(function (c) { return c.user_id === uid && c.match_id === matchId; });
    const previos = data.captains.filter(function (c) { return c.user_id === uid && captainMatchDay(c) === day; });
    delete captainErr[matchId];
    // Actualización optimista para feedback inmediato; si la persistencia falla,
    // captainFail() resincroniza con el servidor (verdad) y muestra el error.
    data.captains = data.captains.filter(function (c) { return !(c.user_id === uid && captainMatchDay(c) === day); });
    if (!yaEra) data.captains.push({ user_id: uid, match_id: matchId });
    render();
    for (const c of previos) {
      const del = await client.from("captain_picks").delete().eq("user_id", uid).eq("match_id", c.match_id);
      if (del.error) return captainFail(matchId, del.error);
    }
    if (yaEra) return; // toggle-off completado
    const res = await client.from("captain_picks").upsert({
      user_id: uid, match_id: matchId, match_day: day, updated_at: new Date().toISOString()
    });
    if (res.error) return captainFail(matchId, res.error);
  }

  async function captainFail(matchId, err) {
    captainErr[matchId] = /policy|row-level|violates/i.test((err && err.message) || "") ? "Este partido ya cerró" : "No se pudo guardar el capitán";
    await loadAll(); // resincroniza data.captains con la verdad del servidor (revierte cambios parciales)
    render();
  }

  /* ---------- notificaciones push (recordatorio si falta el pick) ---------- */
  let pushStatus = null; // "on" | "off" | "denied" | "ios-install" | "unsupported" | "busy" | null (sin sesión)

  function urlB64ToBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function localTimeZone() {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return /^[A-Za-z0-9_+./-]{1,64}$/.test(zone || "") ? zone : null;
    } catch (e) { return null; }
  }

  async function savePushSubscription(sub) {
    const j = sub.toJSON();
    const row = {
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth
    };
    const zone = localTimeZone();
    if (zone) row.timezone = zone;
    let res = await client.from("push_subscriptions").upsert(row);
    // Compatibilidad mientras se despliega la columna timezone en Supabase.
    if (res.error && zone && /timezone|schema cache|column/i.test(res.error.message || "")) {
      delete row.timezone;
      res = await client.from("push_subscriptions").upsert(row);
    }
    return res;
  }

  // venimos de tocar una notificación con la app ya abierta: ir a la quiniela
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (event.data && event.data.type === "open-quiniela") {
        // salto directo (sin smooth): el scroll animado durante la reanudación
        // de la app agrava la desincronización del viewport en iOS
        const sec = document.getElementById("quiniela");
        if (sec) sec.scrollIntoView();
      }
    });
  }

  function iosSinInstalar() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalada = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    return ios && !instalada;
  }

  async function checkPush() {
    if (!session) { pushStatus = null; return; }
    if (!pushSupported()) { pushStatus = iosSinInstalar() ? "ios-install" : "unsupported"; return; }
    if (Notification.permission === "denied") { pushStatus = "denied"; return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration("sw.js");
      if (reg) reg.update().catch(function () {}); // recoger cambios de sw.js al abrir
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) { pushStatus = "off"; return; }
      const got = await client.from("push_subscriptions").select("endpoint")
        .eq("user_id", session.user.id).eq("endpoint", sub.endpoint);
      pushStatus = got.data && got.data.length ? "on" : "off";
      if (pushStatus === "on") savePushSubscription(sub).catch(function () {});
    } catch (e) { pushStatus = "off"; }
  }

  async function enablePush() {
    pushStatus = "busy"; render();
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { pushStatus = perm === "denied" ? "denied" : "off"; render(); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToBytes(cfg.VAPID_PUBLIC_KEY)
      });
      const res = await savePushSubscription(sub);
      pushStatus = res.error ? "off" : "on";
    } catch (e) { pushStatus = "off"; }
    render();
  }

  async function disablePush() {
    pushStatus = "busy"; render();
    try {
      const reg = await navigator.serviceWorker.getRegistration("sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await client.from("push_subscriptions").delete()
          .eq("user_id", session.user.id).eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (e) {}
    pushStatus = "off";
    render();
  }

  // La tarjeta vive arriba (CTA con acento) mientras haya una acción pendiente;
  // ya activados los avisos, baja al fondo como línea compacta.
  function remindersHtml(place) {
    if (!pushStatus) return "";
    if (place === "top" && pushStatus === "on") return "";
    if (place === "bottom" && pushStatus !== "on") return "";
    if (pushStatus === "on") {
      return '<div class="game-card push-mini"><span>🔔 Avisos activados <b class="pm-ok">✓</b></span>' +
        '<button class="game-btn secondary" id="pushOff">Desactivar</button></div>';
    }
    let inner;
    if (pushStatus === "busy") {
      inner = "<p>Un momento…</p>";
    } else if (pushStatus === "ios-install") {
      inner = "<p>En iPhone los avisos solo llegan con la app instalada: toca <b>Compartir</b> → " +
        "<b>Añadir a pantalla de inicio</b>, abre <b>Ruta 26</b> desde ahí y activa los avisos en esta sección.</p>";
    } else if (pushStatus === "unsupported") {
      inner = "<p>Tu navegador no soporta notificaciones push.</p>";
    } else if (pushStatus === "denied") {
      inner = "<p>Las notificaciones están bloqueadas para este sitio. Actívalas en la configuración de tu navegador y recarga.</p>";
    } else {
      inner = "<p>Recibe un aviso con tiempo antes de cada partido si aún no pusiste tu predicción.</p>" +
        '<div class="game-actions"><button class="game-btn" id="pushOn">Activar avisos 🔔</button></div>';
    }
    return '<div class="game-card push-cta"><h3>Recordatorios 🔔</h3>' + inner + "</div>";
  }

  /* ---------- render ---------- */
  function stateLabel(v) {
    if (!v || !v.state || v.state === "saved") return { cls: "ok", text: v ? "Guardado ✓" : "" };
    if (v.state === "saving") return { cls: "", text: "Guardando…" };
    return { cls: "err", text: v.error || "Error" };
  }

  function predType(m) { return m.stage === "final" ? "score" : (m.stage === "group" ? "1x2" : "ko"); }

  // Día calendario del partido en Curazao (UTC-4, sin DST) → "YYYY-MM-DD".
  function matchDay(m) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Curacao", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(m.date));
  }
  function captainMatchDay(c) {
    const m = WC.state.matches.find(function (x) { return x.id === c.match_id; });
    return m ? matchDay(m) : null;
  }
  function isCaptain(matchId) {
    if (!session) return false;
    const uid = session.user.id;
    return data.captains.some(function (c) { return c.user_id === uid && c.match_id === matchId; });
  }

  // Produce HTML (se interpola en innerHTML): todo string de equipo debe pasar por esc().
  function pickLabel(m, v) {
    if (!v) return "sin pick";
    if (m.stage === "final") return v.hg + "–" + v.ag;
    if (m.stage === "group") {
      if (v.hg > v.ag) return "Gana " + esc(WC.slotName(m, "home"));
      if (v.hg < v.ag) return "Gana " + esc(WC.slotName(m, "away"));
      return "Empate";
    }
    const adv = v.hg > v.ag ? WC.slotName(m, "home") : WC.slotName(m, "away");
    return "Avanza " + esc(adv) + (v.pens ? " (pen)" : "");
  }

  function advId(m, side) {
    const direct = side === "home" ? m.home : m.away;
    if (direct) return direct;
    const slot = WC.standings.resolveSlot(side === "home" ? m.phA : m.phB, WC.slotCtx());
    return slot.teamId || null;
  }

  function matchupHtml(m) {
    const hId = advId(m, "home"), aId = advId(m, "away");
    return '<div class="pick-matchup">' +
      '<div class="pm-team"><span class="pm-flag">' + (hId ? teamFlag(hId) : "🏳️") + '</span><span class="pm-name">' + esc(WC.slotName(m, "home")) + "</span></div>" +
      '<span class="pm-vs">VS</span>' +
      '<div class="pm-team"><span class="pm-flag">' + (aId ? teamFlag(aId) : "🏳️") + '</span><span class="pm-name">' + esc(WC.slotName(m, "away")) + "</span></div></div>";
  }

  function pickRowHtml(m) {
    const v = mine[m.id];
    const locked = kicked(m);
    const when = WC.fmt.dayLocal(m.date) + " · " + WC.fmt.timeLocal(m.date);
    const head = '<div class="pick-head"><span>' + when + "</span><span>" + WC.stageLabel(m) + "</span></div>" + matchupHtml(m);
    if (locked) {
      const s = WC.scoring.scoreMatch(v ? { hg: v.hg, ag: v.ag, pens: v.pens } : null, m);
      const real = m.status !== "scheduled" && m.hs != null
        ? m.hs + "–" + m.as + (m.hp != null ? " (pen " + m.hp + "–" + m.ap + ")" : "")
        : "—";
      // mismo formato que el chip de la sección Partidos (app.js pointsChip)
      const chip = s.kind === "none" ? '<span class="pts-chip none">Sin pronóstico</span>'
        : s.kind === "pending" ? '<span class="pts-chip pending">En juego</span>'
        : s.points > 0 ? '<span class="pts-chip win">+' + s.points + " " + (s.points === 1 ? "punto" : "puntos") + "</span>"
        : '<span class="pts-chip zero">0 puntos</span>';
      const wasCap = m.stage !== "group" && isCaptain(m.id);
      const capTag = wasCap ? ' <span class="cap-tag">⭐ Capitán ×3</span>' : "";
      return '<div class="pick-card locked" data-match="' + m.id + '">' + head +
        '<div class="pick-foot"><small>Tu pick: ' + pickLabel(m, v) + " · Real: " + real + capTag + "</small>" + chip + "</div></div>";
    }
    const type = predType(m);
    let controls;
    if (type === "score") {
      const hg = v ? v.hg : "·";
      const ag = v ? v.ag : "·";
      controls = '<div class="pick-controls">' +
        '<span class="pcf">' + teamFlag(m.home) + "</span>" +
        '<button type="button" data-step="hg,-1" aria-label="Menos goles local">−</button><b data-val="hg">' + hg + "</b>" +
        '<button type="button" data-step="hg,1" aria-label="Más goles local">+</button>' +
        "<i>:</i>" +
        '<button type="button" data-step="ag,-1" aria-label="Menos goles visitante">−</button><b data-val="ag">' + ag + "</b>" +
        '<button type="button" data-step="ag,1" aria-label="Más goles visitante">+</button>' +
        '<span class="pcf">' + teamFlag(m.away) + "</span></div>";
    } else if (type === "1x2") {
      const sel = v ? (v.hg > v.ag ? "h" : (v.hg < v.ag ? "a" : "x")) : "";
      controls = '<div class="pick-1x2">' +
        '<button type="button" data-1x2="h" class="' + (sel === "h" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.home) + "</span>Gana</button>" +
        '<button type="button" data-1x2="x" class="' + (sel === "x" ? "on" : "") + '">Empate</button>' +
        '<button type="button" data-1x2="a" class="' + (sel === "a" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.away) + "</span>Gana</button></div>";
    } else {
      const sel = v ? (v.hg > v.ag ? "h" : "a") : "";
      const hId = advId(m, "home"), aId = advId(m, "away");
      controls = '<div class="pick-1x2 ko">' +
        '<button type="button" data-adv="h" class="' + (sel === "h" ? "on" : "") + '"><span class="b1f">' + (hId ? teamFlag(hId) : "🏳️") + "</span>Avanza</button>" +
        '<button type="button" data-adv="a" class="' + (sel === "a" ? "on" : "") + '"><span class="b1f">' + (aId ? teamFlag(aId) : "🏳️") + "</span>Avanza</button>" +
        '<button type="button" data-pens class="pens ' + (v && v.pens ? "on" : "") + '">⚽ Por penales</button></div>';
    }
    const st = stateLabel(v);
    const showStar = m.stage !== "group";
    const starOn = showStar && isCaptain(m.id);
    const star = showStar
      ? '<button type="button" class="cap-star' + (starOn ? " on" : "") + '" data-captain="' + m.id + '"' +
        (v ? "" : " disabled") + ' aria-pressed="' + (starOn ? "true" : "false") +
        '" title="Capitán del día: este partido vale ×3">⭐ Capitán' + (starOn ? " ✓" : "") + "</button>"
      : "";
    const capMsg = (showStar && captainErr[m.id]) ? '<span class="cap-msg">' + esc(captainErr[m.id]) + "</span>" : "";
    return '<div class="pick-card" data-match="' + m.id + '" data-type="' + type + '">' + head +
      controls + star + capMsg +
      '<span class="pick-state ' + st.cls + '">' + st.text + "</span></div>";
  }

  function paintRow(matchId) {
    const row = rootEl.querySelector('[data-match="' + matchId + '"]');
    if (!row) return;
    const v = mine[matchId];
    const st = stateLabel(v);
    const stateEl = row.querySelector(".pick-state");
    if (stateEl) { stateEl.className = "pick-state " + st.cls; stateEl.textContent = st.text; }
    row.querySelectorAll("[data-val]").forEach(function (b) { b.textContent = v ? v[b.dataset.val] : "·"; });
    const sel1x2 = v ? (v.hg > v.ag ? "h" : (v.hg < v.ag ? "a" : "x")) : "";
    row.querySelectorAll("[data-1x2]").forEach(function (b) { b.classList.toggle("on", b.dataset["1x2"] === sel1x2); });
    row.querySelectorAll("[data-adv]").forEach(function (b) { b.classList.toggle("on", v && b.dataset.adv === (v.hg > v.ag ? "h" : "a")); });
    const pensBtn = row.querySelector("[data-pens]");
    if (pensBtn) pensBtn.classList.toggle("on", !!(v && v.pens));
  }

  function rulesHtml() {
    return '<details class="game-rules game-card"><summary>Cómo se juega</summary>' +
      "<table><tr><th>Predicción</th><th>Puntos</th></tr>" +
      "<tr><td>Grupos: acertar gana/empata/pierde</td><td>1 pt</td></tr>" +
      "<tr><td>Eliminatorias: acertar quién avanza</td><td>1 pt</td></tr>" +
      "<tr><td>Eliminatorias: + acertar que fue por penales</td><td>+1 pt</td></tr>" +
      "<tr><td>Final: marcador exacto</td><td>3 pts</td></tr>" +
      "<tr><td>Final: solo el resultado</td><td>1 pt</td></tr>" +
      "<tr><td>Campeón</td><td>15 pts</td></tr>" +
      "<tr><td>⭐ Capitán de eliminatorias: tu partido del día vale ×3</td><td>×3 base</td></tr></table>" +
      "<p>Cada partido cierra a su hora de inicio. El bonus de penales solo cuenta si además aciertas quién avanza. " +
      "Desde octavos puedes marcar un partido por día como Capitán ⭐: sus puntos base valen ×3 (el +1 de penales no se multiplica). Solo suma, nunca resta. " +
      "Los picks de los demás se revelan cuando el partido empieza. ¿Olvidaste tu contraseña? Escríbele a JM.</p></details>";
  }

  function authHtml() {
    return '<div class="game-card game-auth"><h3>Juega la quiniela</h3>' +
      "<p>Solo necesitas un usuario y una contraseña. Sin correo, sin datos personales.</p>" +
      '<input id="gUser" type="text" placeholder="usuario" autocomplete="username" maxlength="20">' +
      '<input id="gPass" type="password" placeholder="contraseña" autocomplete="current-password">' +
      '<div class="game-actions">' +
      '<button class="game-btn" id="gLogin">Entrar</button>' +
      '<button class="game-btn secondary" id="gSignup">Crear cuenta</button>' +
      "</div>" +
      '<p class="game-error" id="gError" hidden></p></div>';
  }

  function dateKey(iso) {
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // días únicos del torneo, en orden cronológico: [{key, iso}]
  function tournamentDays() {
    const seen = new Map();
    matches().slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); })
      .forEach(function (m) { const k = dateKey(m.date); if (!seen.has(k)) seen.set(k, m.date); });
    return Array.from(seen.entries()).map(function (e) { return { key: e[0], iso: e[1] }; });
  }

  // primer día con un partido por jugar; si todos jugados, el último día
  function defaultPredDate() {
    const days = tournamentDays();
    const pend = days.find(function (d) {
      return matches().some(function (m) { return dateKey(m.date) === d.key && !kicked(m); });
    });
    return pend ? pend.key : (days.length ? days[days.length - 1].key : null);
  }

  function predictionsHtml() {
    if (!predDate) predDate = defaultPredDate();
    const days = tournamentDays();
    const todayKey = dateKey(new Date().toISOString());
    const strip = days.map(function (d) {
      const parts = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric" }).formatToParts(new Date(d.iso));
      const wd = (parts.find(function (p) { return p.type === "weekday"; }) || { value: "" }).value.toUpperCase().replace(/\./g, "");
      const dn = (parts.find(function (p) { return p.type === "day"; }) || { value: "" }).value;
      const isToday = d.key === todayKey;
      return '<button type="button" class="game-date' + (d.key === predDate ? " active" : "") + (isToday ? " today" : "") +
        '" data-gdate="' + d.key + '"><span>' + (isToday ? "HOY" : wd) + "</span><strong>" + dn + "</strong></button>";
    }).join("");
    const shown = matches().filter(function (m) { return dateKey(m.date) === predDate; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    return '<div class="game-card"><h3>Mis predicciones</h3>' +
      '<div class="game-dates" id="gDates">' + strip + "</div>" +
      '<div id="gPicks">' +
      (shown.length ? shown.map(pickRowHtml).join("") : '<p class="rank-empty">Sin partidos este día.</p>') +
      "</div></div>";
  }

  function championHtml() {
    const open = championOpen();
    const opts = Object.values(WC.state.teams)
      .sort(function (a, b) { return a.name.localeCompare(b.name, "es"); })
      .map(function (t) {
        return '<option value="' + t.id + '"' + (myPick === t.id ? " selected" : "") + ">" + t.flag + " " + esc(t.name) + "</option>";
      });
    return '<div class="game-card"><h3>Mi campeón 🏆</h3>' +
      (open
        ? '<p>Vale 15 puntos. Puedes cambiarlo hasta el 28 de junio.</p><div class="champ-pick">' +
          '<select id="gChamp"><option value="">Elige tu campeón…</option>' + opts.join("") + "</select>" +
          '<span class="pick-state ok" id="champState">' + (myPick ? "Guardado ✓" : "") + "</span></div>"
        : '<p>La elección cerró el 28 de junio.</p><p class="champ-locked">' + (myPick ? teamName(myPick) : "No elegiste campeón") + "</p>") +
      "</div>";
  }

  /* ---------- ranking en vivo (provisional) ---------- */
  let lastLivePoints = {}; // userId → livePoints del render anterior (para el "bump")

  function liveRankingHtml() {
    const liveMs = matches().filter(function (m) { return m.status === "live"; });
    if (!liveMs.length) return "";
    const rows = WC.scoring.buildLiveLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    if (!rows.length) return "";
    const uid = session ? session.user.id : null;
    const table = rows.map(function (r) {
      const mov = r.delta > 0 ? '<span class="lr-up">▲' + r.delta + "</span>"
        : r.delta < 0 ? '<span class="lr-down">▼' + (-r.delta) + "</span>"
        : '<span class="lr-eq">–</span>';
      const bump = r.livePoints > (lastLivePoints[r.userId] || 0) ? " bump" : "";
      const plus = r.livePoints > 0 ? ' <span class="lr-plus' + bump + '">+' + r.livePoints + "</span>" : "";
      return "<tr" + (r.userId === uid ? ' class="me"' : "") + ' data-user="' + r.userId + '">' +
        '<td class="pos"><span class="num">' + r.pos + '</span></td><td class="lr-mov">' + mov +
        '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + plus +
        '</td><td class="pts">' + r.points + "</td></tr>";
    }).join("");
    lastLivePoints = {};
    rows.forEach(function (r) { lastLivePoints[r.userId] = r.livePoints; });
    const detail = liveMs.map(function (m) {
      const frozen = WC.scoring.freezeLive(m);
      const gainers = data.profiles.map(function (p) {
        const pr = data.predictions.find(function (r) { return r.user_id === p.id && r.match_id === m.id; });
        const s = WC.scoring.scoreMatch(pr ? { hg: pr.hg, ag: pr.ag, pens: pr.pens } : null, frozen);
        return s.points > 0 ? '<span class="lr-chip">' + esc(p.username) + " +" + s.points + "</span>" : "";
      }).filter(Boolean);
      const score = m.hs + "–" + m.as + (m.hp != null ? " (pen " + m.hp + "–" + m.ap + ")" : "");
      return '<div class="lr-match"><span class="lr-score">' + teamFlag(m.home) + " " + score + " " + teamFlag(m.away) + "</span>" +
        (gainers.length ? gainers.join("") : '<span class="lr-none">nadie suma todavía</span>') + "</div>";
    }).join("");
    return '<div class="game-card live-rank" id="liveRank"><h3><span class="lr-dot"></span> Ranking en vivo</h3>' +
      "<p>Así quedaría si los partidos terminan como van. Se actualiza solo; el oficial suma al final.</p>" +
      '<table class="rank-table"><tr><th>#</th><th></th><th></th><th>Jugador</th><th>Pts</th></tr>' + table + "</table>" +
      '<div class="lr-detail">' + detail + "</div></div>";
  }

  // FLIP: las filas del ranking en vivo se deslizan a su nueva posición tras cada re-render
  function captureLiveRows() {
    const map = {};
    rootEl.querySelectorAll("#liveRank tr[data-user]").forEach(function (tr) {
      map[tr.dataset.user] = tr.getBoundingClientRect().top;
    });
    return map;
  }

  function animateLiveRows(prev) {
    rootEl.querySelectorAll("#liveRank tr[data-user]").forEach(function (tr) {
      const old = prev[tr.dataset.user];
      if (old == null) return;
      const dy = old - tr.getBoundingClientRect().top;
      if (!dy) return;
      tr.style.transition = "none";
      tr.style.transform = "translateY(" + dy + "px)";
      requestAnimationFrame(function () {
        tr.style.transition = "transform .6s cubic-bezier(.22,1,.36,1)";
        tr.style.transform = "";
      });
    });
  }

  // % de acierto como fracción para ordenar; sin partidos resueltos va al fondo
  function accValue(r) { return r.decided > 0 ? (r.exact + r.outcome) / r.decided : -1; }

  function rankingHtml() {
    const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    const uid = session ? session.user.id : null;
    // las medallas (tier) y el número (pos) son del ranking oficial de Pts;
    // ordenar por % solo cambia el orden de aparición, no el podio.
    const view = rankSort === "acc"
      ? rows.slice().sort(function (x, y) { return accValue(y) - accValue(x) || y.points - x.points; })
      : rows;
    const arrow = function (key) { return rankSort === key ? ' <span class="sort-ar">▼</span>' : ""; };
    const accTh = '<th class="col-acc sortable' + (rankSort === "acc" ? " sort-active" : "") + '" data-rank-sort="acc">% Acierto' + arrow("acc") + "</th>";
    const ptsTh = '<th class="sortable' + (rankSort === "pts" ? " sort-active" : "") + '" data-rank-sort="pts">Pts' + arrow("pts") + "</th>";
    return '<div class="game-card"><h3>Ranking</h3>' +
      (rows.length === 0 ? '<p class="rank-empty">Aún no hay jugadores. ¡Sé el primero!</p>'
        : '<table class="rank-table"><tr><th>#</th><th></th><th>Jugador</th><th class="col-x">Exactos</th><th class="col-x">Resultados</th>' + accTh + '<th class="col-x">Bonus</th>' + ptsTh + "</tr>" +
          view.map(function (r) {
            const medal = r.tier === 1 ? "🥇" : r.tier === 2 ? "🥈" : r.tier === 3 ? "🥉" : '<span class="num">' + r.pos + "</span>";
            const acc = r.decided > 0 ? Math.round((r.exact + r.outcome) / r.decided * 100) + "%" : "—";
            return "<tr" + (r.userId === uid ? ' class="me"' : "") + '><td class="pos">' + medal + '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + '</td><td class="col-x">' +
              r.exact + '</td><td class="col-x">' + r.outcome + '</td><td class="col-acc">' + acc + '</td><td class="col-x">' + (r.bonus || 0) + '</td><td class="pts">' + r.points + "</td></tr>";
          }).join("") + "</table>") +
      (uid && rows.some(function (r) { return r.userId === uid; })
        ? '<div class="game-actions game-share" style="margin-top:14px"><button class="game-btn secondary" id="gShare">Compartir mi posición</button></div>'
        : "") +
      "</div>";
  }

  function closeUserMenu() {
    const drop = document.getElementById("userDropdown");
    const chip = document.getElementById("userChip");
    if (drop) drop.hidden = true;
    if (chip) chip.setAttribute("aria-expanded", "false");
  }

  function updateUserChip() {
    const menu = document.getElementById("userMenu");
    const chip = document.getElementById("userChip");
    const login = document.getElementById("loginChip");
    if (!menu || !chip) return;
    if (session && profile) {
      chip.textContent = profile.username; menu.hidden = false;
      if (login) login.hidden = true;
    } else {
      chip.textContent = ""; menu.hidden = true; closeUserMenu();
      if (login) login.hidden = false;
    }
  }

  /* menú del usuario en el header: el chip abre/cierra, fuera se cierra, logout adentro */
  (function wireUserMenu() {
    const menu = document.getElementById("userMenu");
    const chip = document.getElementById("userChip");
    const drop = document.getElementById("userDropdown");
    const out = document.getElementById("userLogout");
    if (!menu || !chip || !drop || !out) return;
    chip.addEventListener("click", function () {
      const willOpen = drop.hidden;
      drop.hidden = !willOpen;
      chip.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) closeUserMenu();
    });
    drop.addEventListener("click", async function (event) {
      if (event.target.id === "userLogout") { closeUserMenu(); await client.auth.signOut(); }
      else if (event.target.id === "userGoQuiniela") closeUserMenu();
    });
  })();

  function render() {
    updateUserChip();
    if (loadError) {
      rootEl.innerHTML = '<div class="game-card game-off"><h3>El juego no está disponible ahora</h3><p>Revisa tu conexión e intenta de nuevo en un momento.</p></div>';
      return;
    }
    const prevLiveRows = captureLiveRows();
    if (!session) {
      rootEl.innerHTML = authHtml() + liveRankingHtml() + rankingHtml() + rulesHtml();
      animateLiveRows(prevLiveRows);
      return;
    }
    rootEl.innerHTML =
      championHtml() + remindersHtml("top") + liveRankingHtml() + rankingHtml() + predictionsHtml() + remindersHtml("bottom") + rulesHtml();
    animateLiveRows(prevLiveRows);
    const strip = document.getElementById("gDates");
    const active = strip && strip.querySelector(".active");
    if (strip && active) strip.scrollLeft = Math.max(0, active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2);
  }

  /* ---------- eventos (delegación) ---------- */
  rootEl.addEventListener("click", async function (event) {
    const capBtn = event.target.closest("[data-captain]");
    if (capBtn) {
      if (capBtn.disabled) return;
      saveCaptain(capBtn.dataset.captain);
      return;
    }
    const b1x2 = event.target.closest("[data-1x2]");
    if (b1x2 && session) {
      const row = b1x2.closest("[data-match]");
      const matchId = row.dataset.match;
      const code = b1x2.dataset["1x2"];
      mine[matchId] = { hg: code === "h" ? 1 : 0, ag: code === "a" ? 1 : 0, pens: false, state: "saving" };
      paintRow(matchId);
      savePrediction(matchId);
      return;
    }
    const bAdv = event.target.closest("[data-adv]");
    if (bAdv && session) {
      const row = bAdv.closest("[data-match]");
      const matchId = row.dataset.match;
      const prev = mine[matchId] || {};
      mine[matchId] = { hg: bAdv.dataset.adv === "h" ? 1 : 0, ag: bAdv.dataset.adv === "a" ? 1 : 0, pens: !!prev.pens, state: "saving" };
      paintRow(matchId);
      savePrediction(matchId);
      return;
    }
    const bPens = event.target.closest("[data-pens]");
    if (bPens && session) {
      const row = bPens.closest("[data-match]");
      const matchId = row.dataset.match;
      const v = mine[matchId];
      if (!v) return; // primero hay que elegir quién avanza
      v.pens = !v.pens; v.state = "saving";
      paintRow(matchId);
      savePrediction(matchId);
      return;
    }
    const stepBtn = event.target.closest("[data-step]");
    if (stepBtn && session) {
      const row = stepBtn.closest("[data-match]");
      const matchId = row.dataset.match;
      const parts = stepBtn.dataset.step.split(",");
      const field = parts[0], delta = Number(parts[1]);
      if (!mine[matchId]) mine[matchId] = { hg: 0, ag: 0, state: "saving" };
      const v = mine[matchId];
      v[field] = Math.max(0, Math.min(99, v[field] + delta));
      v.state = "saving";
      paintRow(matchId);
      savePrediction(matchId);
      return;
    }
    const gd = event.target.closest("[data-gdate]");
    if (gd) { predDate = gd.dataset.gdate; render(); return; }
    const sortTh = event.target.closest("[data-rank-sort]");
    if (sortTh) { rankSort = sortTh.dataset.rankSort; render(); return; }
    if (event.target.id === "gShare") {
      const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
      const me = rows.find(function (r) { return session && r.userId === session.user.id; });
      const url = location.origin + location.pathname + "#quiniela";
      const text = me
        ? "Voy #" + me.pos + " con " + me.points + " pts en la quiniela del Mundial ⚽ ¿Te le mides?"
        : "Juega la quiniela del Mundial 2026 ⚽";
      if (navigator.share) navigator.share({ title: "Quiniela Ruta 26", text: text, url: url }).catch(function () {});
      else if (navigator.clipboard) { navigator.clipboard.writeText(text + " " + url); event.target.textContent = "Enlace copiado ✓"; }
      return;
    }
    if (event.target.id === "pushOn") { enablePush(); return; }
    if (event.target.id === "pushOff") { disablePush(); return; }
    if (event.target.id === "gLogin" || event.target.id === "gSignup") {
      const user = document.getElementById("gUser").value;
      const pass = document.getElementById("gPass").value;
      const errEl = document.getElementById("gError");
      errEl.hidden = true;
      event.target.disabled = true;
      const err = event.target.id === "gSignup" ? await signUp(user, pass) : null;
      const err2 = err ? err : await signIn(user, pass);
      event.target.disabled = false;
      if (err2) { errEl.textContent = err2; errEl.hidden = false; }
    }
  });

  rootEl.addEventListener("change", function (event) {
    if (event.target.id === "gChamp" && event.target.value) saveChampion(event.target.value);
  });

  rootEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.target.id === "gUser" || event.target.id === "gPass")) {
      const btn = document.getElementById("gLogin");
      if (btn) btn.click();
    }
  });

  /* ---------- ciclo de vida ---------- */
  let lastAuthUserId;
  client.auth.onAuthStateChange(function (eventName, s) {
    const newId = s && s.user ? s.user.id : null;
    if (typeof lastAuthUserId !== "undefined" && newId === lastAuthUserId) return; // TOKEN_REFRESHED etc.
    lastAuthUserId = newId;
    session = s;
    (async function () {
      if (session) await ensureProfile(session.user);
      else { profile = null; mine = {}; myPick = null; }
      await loadAll();
      await checkPush();
      render();
      refreshMatchCards();
    })();
  });

  // Puntos del jugador logueado en un partido finalizado, para mostrarlos en
  // su tarjeta. null si no hay sesión / no aplica; {hasPred:false} si no
  // pronosticó; {hasPred:true, points, kind} con el resultado de scoreMatch.
  function myMatchPoints(match) {
    if (!session || !match || match.status !== "played") return null;
    const pred = mine[match.id];
    if (!pred) return { hasPred: false };
    const s = WC.scoring.scoreMatch({ hg: pred.hg, ag: pred.ag, pens: pred.pens }, match);
    return { hasPred: true, points: s.points, kind: s.kind };
  }

  WC.game = {
    onDataUpdate: function () {
      // tras cada refresh de resultados FIFA (carga inicial o manual), refresca puntos y bloqueos —
      // sin pisar una edición en curso (timers de guardado activos)
      const editing = Object.keys(saveTimers).some(function (k) {
        const v = mine[k]; return v && v.state === "saving";
      });
      if (!editing) render();
    },
    myMatchPoints: myMatchPoints,
    reload: async function () { await loadAll(); render(); }
  };

  // Las tarjetas de partidos (app.js) muestran los puntos del jugador; hay que
  // re-renderizarlas cuando cambia la sesión o se (re)cargan las predicciones.
  function refreshMatchCards() {
    if (WC.app && WC.app.refreshMatches) WC.app.refreshMatches();
  }

  (async function init() {
    const got = await client.auth.getSession();
    session = got.data ? got.data.session : null;
    lastAuthUserId = session && session.user ? session.user.id : null;
    if (session) await ensureProfile(session.user);
    await loadAll();
    await checkPush();
    render();
    refreshMatchCards();
  })();
})();
