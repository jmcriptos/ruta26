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
    rootEl.innerHTML = '<div class="game-card game-off"><h3>No se pudo cargar el juego</h3>' +
      "<p>Revisa tu conexión y recarga la página.</p></div>";
    WC.game = { onDataUpdate: function () {}, myMatchPoints: function () { return null; } };
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let session = null;
  let profile = null;
  let data = { profiles: [], predictions: [], picks: [], captains: [], koHints: {} };
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

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    var u = URL.createObjectURL(blob);
    a.href = u; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }

  // Compartir "Mi jornada": genera la imagen del podio y la comparte (móvil) o la
  // descarga + copia el texto (desktop). Cae a solo-texto si algo falla.
  function shareMiJornada(btn) {
    var text = btn.dataset.share || "";
    var origHTML = btn.innerHTML;

    function shareTextOnly() {
      if (navigator.share) { navigator.share({ title: "Quiniela Ruta 26", text: text }).catch(function () {}); trackEvent("share_summary_clicked", { channel: "native" }); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { btn.textContent = "Texto copiado ✓"; }).catch(function () { window.prompt("Copia tu resumen:", text); }); trackEvent("whatsapp_copy_clicked", {}); }
      else { window.prompt("Copia tu resumen:", text); trackEvent("whatsapp_copy_clicked", {}); }
    }
    function restore() { setTimeout(function () { btn.innerHTML = origHTML; btn.disabled = false; }, 2200); }

    if (!WC.shareCard) { shareTextOnly(); return; }

    btn.disabled = true; btn.innerHTML = "Generando…";
    var rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    var top3 = rows.slice(0, 3).map(function (r) {
      return { username: r.username, points: r.points, flag: champFlagFor(r.userId) };
    });
    var snap = (typeof engagementSnapshot === "function") ? engagementSnapshot() : null;
    var meId = snap ? snap.meId : null;
    var meRow = meId ? rows.find(function (r) { return r.userId === meId; }) : null;
    var me = meRow ? { pos: meRow.pos, points: meRow.points } : null;
    var url = location.origin + location.pathname + "#quiniela";

    WC.shareCard.podiumBlob({ top3: top3, me: me, teams: WC.state.teams || {}, url: url })
      .then(function (blob) {
        var file = new File([blob], "ruta26-podio.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: text }).then(function () {
            trackEvent("share_summary_clicked", { channel: "image" });
          });
        }
        downloadBlob(blob, "ruta26-podio.png");
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
        btn.innerHTML = "Imagen descargada ✓";
        trackEvent("share_summary_clicked", { channel: "download" });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return; // el usuario canceló la hoja → no hacer nada
        shareTextOnly();                               // error real → solo texto
      })
      .finally(restore);
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
        client.from("predictions").select("user_id, match_id, hg, ag, adv").limit(20000),
        client.from("champion_picks").select("user_id, team_id"),
        client.from("captain_picks").select("user_id, match_id").limit(20000),
        // Pista gruesa del batacazo: agregado server-side (RPC security definer).
        // NO esencial: si el RPC aún no existe o falla, la quiniela sigue sin pista.
        // El .catch evita que un rechazo (red) tumbe el Promise.all y la carga.
        client.rpc("batacazo_hints").then(function (r) { return r; }, function () { return { error: true }; })
      ]);
      // captain_picks (results[3]) y batacazo_hints (results[4]) son NO esenciales:
      // si la tabla/función aún no existe o falla, la quiniela debe seguir
      // funcionando (sin bonus / sin pista), así que se excluyen del chequeo de
      // error fatal y degradan a vacío.
      if (results.slice(0, 3).some(function (r) { return r.error; })) { loadError = true; return; }
      data.profiles = results[0].data || [];
      data.predictions = results[1].data || [];
      data.picks = results[2].data || [];
      data.captains = results[3].error ? [] : (results[3].data || []);
      data.koHints = {};
      if (!results[4].error && results[4].data) {
        results[4].data.forEach(function (h) { data.koHints[h.match_id] = { home: h.home_band, away: h.away_band }; });
      }
      if (session) {
        const uid = session.user.id;
        mine = {};
        data.predictions.forEach(function (r) {
          if (r.user_id === uid) mine[r.match_id] = { hg: r.hg, ag: r.ag, adv: r.adv || null, state: "saved" };
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
      // adv solo aplica al empate KO; pens queda en false (columna NOT NULL legacy).
      const advVal = (v.hg === v.ag) ? (v.adv || null) : null;
      const res = await client.from("predictions").upsert({
        user_id: uid, match_id: matchId, hg: v.hg, ag: v.ag, pens: false, adv: advVal,
        updated_at: new Date().toISOString()
      });
      if (res.error) {
        v.state = "err";
        v.error = /policy|row-level|violates/i.test(res.error.message) ? "Este partido ya cerró" : "No se pudo guardar";
      } else {
        v.state = "saved"; v.error = null;
        const idx = data.predictions.findIndex(function (r) { return r.user_id === uid && r.match_id === matchId; });
        const row = { user_id: uid, match_id: matchId, hg: v.hg, ag: v.ag, adv: advVal };
        if (idx >= 0) data.predictions[idx] = row; else data.predictions.push(row);
        const sm = WC.state.matches.find(function (x) { return x.id === matchId; });
        trackEvent("prediction_submitted", { stage: sm ? sm.stage : "" });
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
        trackEvent("push_reminder_clicked", { reason: event.data.reason });
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
      if (pushStatus === "on") trackEvent("push_enabled", {});
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
    trackEvent("push_dismissed", {});
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
      trackEvent("push_prompt_seen", {});
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

  function predType(m) { return m.stage === "group" ? "1x2" : "score"; }
  // Rondas KO donde alguien avanza (el toggle de empate y la pista del batacazo aplican).
  // La final España–Argentina también necesita el selector para resolver quién gana por
  // penales a efectos de su promo; ninguna otra final/terminal obtiene ese comportamiento.
  function isAdvancingStage(m) {
    return m.stage === "r32" || m.stage === "r16" || m.stage === "qf" || m.stage === "sf" ||
      (m.stage === "final" && m.id === "400021543");
  }
  function isBat25Final(m) { return m && m.stage === "final" && m.id === "400021543"; }

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
  // Bono del capitán para un partido resuelto: pCorrect = % de la liga que acertó
  // el avance (de las predicciones cargadas), pasado a scoring.captainBonus.
  function captainBonusFor(m) {
    let total = 0, correct = 0;
    data.predictions.forEach(function (pr) {
      if (pr.match_id !== m.id) return;
      total++;
      const pw = pr.hg > pr.ag ? m.home : (pr.hg < pr.ag ? m.away : (pr.adv === "home" ? m.home : pr.adv === "away" ? m.away : null));
      if (m.winner && pw === m.winner) correct++;
    });
    // Usa el bono efectivo (incluye las promos de scoring.SPECIAL_BATACAZOS) con el pick propio.
    const v = mine[m.id];
    const pred = v ? { hg: v.hg, ag: v.ag, adv: v.adv } : null;
    return WC.scoring.effectiveBatacazoBonus(m, total > 0 ? correct / total : 1, pred);
  }

  // Produce HTML (se interpola en innerHTML): todo string de equipo debe pasar por esc().
  function pickLabel(m, v) {
    if (!v) return "sin pick";
    if (m.stage === "group") {
      if (v.hg > v.ag) return "Gana " + esc(WC.slotName(m, "home"));
      if (v.hg < v.ag) return "Gana " + esc(WC.slotName(m, "away"));
      return "Empate";
    }
    // KO (incl. final): marcador; si es empate, además quién resuelve por penales.
    let s = v.hg + "–" + v.ag;
    if (v.hg === v.ag && v.adv) {
      s += isBat25Final(m)
        ? " (gana " + esc(WC.slotName(m, v.adv)) + " por penales)"
        : " (pasa " + esc(WC.slotName(m, v.adv)) + ")";
    }
    return s;
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

  // Pista gruesa del batacazo: traduce la banda del RPC a una etiqueta orientativa
  // bajo cada "Avanza". "poca gente" = vas contracorriente (batacazo grande si aciertas).
  // 'na'/sin dato → sin etiqueta (no delatamos nada con muestras chicas).
  function bandLabel(band) {
    const txt = { few: "poca gente", split: "dividido", most: "la mayoría" }[band];
    if (!txt) return "";
    return ' <small class="adv-band adv-' + band + '">' + txt + "</small>";
  }

  // Aviso de una promo de batacazo amarrada a un partido (ver scoring.SPECIAL_BATACAZOS).
  // Con teamId hay que ir por ese equipo (Cabo Verde +50); sin teamId es simétrica y basta
  // acertar quién avanza (semi Inglaterra–Argentina +15). El copy se adapta a si el partido
  // está por jugarse, ya cerrado (locked/en vivo) o terminado con el premio logrado.
  function specialPromoHtml(m) {
    const sp = (WC.scoring.SPECIAL_BATACAZOS || []).find(function (x) { return x.matchId === m.id; });
    if (sp) {
      const v = mine[m.id];
      if (m.status === "played" && m.hs != null) {
        const won = isCaptain(m.id) && v && WC.scoring.specialBatacazoApplies(m, { hg: v.hg, ag: v.ag, adv: v.adv });
        return won ? '<div class="promo-bat won">💥 ¡Batacazo especial logrado! <b>+' + sp.bonus + " puntos</b></div>" : "";
      }
      const bonus = "<b>+" + sp.bonus + " puntos</b>";
      const txt = isBat25Final(m)
        ? (kicked(m)
            ? "Batacazo especial: " + bonus + " si aciertas quién sale campeón."
            : "Marca esta final como tu <b>Batacazo</b> y gana " + bonus + " si aciertas quién sale campeón — " +
              esc(WC.slotName(m, "home")) + " o " + esc(WC.slotName(m, "away")) + ".")
        : sp.teamId
        ? (kicked(m)
            ? "Batacazo especial: " + bonus + " si " + teamName(sp.teamId) + " avanza."
            : "Marca a <b>" + teamName(sp.teamId) + "</b> como tu batacazo y gana " + bonus + " si avanza.")
        : (kicked(m)
            ? "Batacazo especial: " + bonus + " si aciertas quién avanza."
            : "Marca este partido como tu <b>Batacazo</b> y gana " + bonus + " si aciertas quién avanza — " +
              esc(WC.slotName(m, "home")) + " o " + esc(WC.slotName(m, "away")) + ", da igual cuál.");
      return '<div class="promo-bat"><span class="promo-bat-tag">💥 Especial</span> <span class="promo-bat-txt">' + txt + "</span></div>";
    }
    // Promo "Atrévete a Suiza": no exige batacazo, aplica a cualquier pick que vaya
    // con Suiza; muestra el premio logrado cuando el partido se resuelve.
    const promo = (WC.scoring.SPECIAL_MATCH_PROMOS || []).find(function (p) { return p.matchId === m.id; });
    if (promo) {
      const v = mine[m.id];
      if (m.status === "played" && m.hs != null) {
        const s = v ? WC.scoring.specialMatchScore({ hg: v.hg, ag: v.ag, adv: v.adv }, m) : null;
        return s ? '<div class="promo-bat won">🇨🇭 ¡Te atreviste con Suiza! <b>+' + s.points + ' puntos</b></div>' : "";
      }
      const txt = kicked(m)
        ? "Atrévete a <b>Suiza</b>: <b>+25</b> si gana, <b>+50</b> si clavas el marcador."
        : "Atrévete a <b>Suiza</b>: pon que gana y suma <b>+25</b>, o <b>+50</b> si clavas el marcador.";
      return '<div class="promo-bat"><span class="promo-bat-tag">🇨🇭 Especial</span> <span class="promo-bat-txt">' + txt + "</span></div>";
    }
    return "";
  }

  function pickRowHtml(m) {
    const v = mine[m.id];
    const locked = kicked(m);
    const when = WC.fmt.dayLocal(m.date) + " · " + WC.fmt.timeLocal(m.date);
    const head = '<div class="pick-head"><span>' + when + "</span><span>" + WC.stageLabel(m) + "</span></div>" + matchupHtml(m) + specialPromoHtml(m);
    if (locked) {
      const s = WC.scoring.scoreMatch(v ? { hg: v.hg, ag: v.ag, adv: v.adv } : null, m);
      const real = m.status !== "scheduled" && m.hs != null
        ? m.hs + "–" + m.as + (m.hp != null ? " (pen " + m.hp + "–" + m.ap + ")" : "")
        : "—";
      // mismo formato que el chip de la sección Partidos (app.js pointsChip)
      const chip = s.kind === "none" ? '<span class="pts-chip none">Sin pronóstico</span>'
        : s.kind === "pending" ? '<span class="pts-chip pending">En juego</span>'
        : s.points > 0 ? '<span class="pts-chip win">+' + s.points + " " + (s.points === 1 ? "punto" : "puntos") + "</span>"
        : '<span class="pts-chip zero">0 puntos</span>';
      const wasCap = m.stage !== "group" && isCaptain(m.id);
      const pred = v ? { hg: v.hg, ag: v.ag, adv: v.adv } : null;
      const specialWon = pred && WC.scoring.specialBatacazoApplies(m, pred);
      // La promo de la final puede cobrar con base 0 si solo difiere el método de victoria;
      // el batacazo ordinario conserva el requisito histórico de haber sumado base.
      const capBonus = wasCap && (s.points > 0 || specialWon) ? captainBonusFor(m) : 0;
      const capTag = wasCap ? ' <span class="cap-tag">💥 Batacazo' + (capBonus > 0 ? " +" + capBonus : "") + "</span>" : "";
      return '<div class="pick-card locked" data-match="' + m.id + '">' + head +
        '<div class="pick-foot"><small>Tu pick: ' + pickLabel(m, v) + " · Real: " + real + capTag + "</small>" + chip + "</div></div>";
    }
    const type = predType(m);
    let controls;
    if (type === "score") {
      const hg = v ? v.hg : "·";
      const ag = v ? v.ag : "·";
      const hId = advId(m, "home"), aId = advId(m, "away");
      controls = '<div class="pick-controls">' +
        '<span class="pcf">' + (hId ? teamFlag(hId) : "🏳️") + "</span>" +
        '<button type="button" data-step="hg,-1" aria-label="Menos goles local">−</button><b data-val="hg">' + hg + "</b>" +
        '<button type="button" data-step="hg,1" aria-label="Más goles local">+</button>' +
        "<i>:</i>" +
        '<button type="button" data-step="ag,-1" aria-label="Menos goles visitante">−</button><b data-val="ag">' + ag + "</b>" +
        '<button type="button" data-step="ag,1" aria-label="Más goles visitante">+</button>' +
        '<span class="pcf">' + (aId ? teamFlag(aId) : "🏳️") + "</span></div>";
      // pista gruesa del batacazo + selector de desempate donde scoring lo necesita
      if (isAdvancingStage(m)) {
        const hint = data.koHints[m.id] || {};
        const hb = bandLabel(hint.home), ab = bandLabel(hint.away);
        if (hb || ab) controls += '<div class="adv-hints"><span>' + (hId ? teamFlag(hId) : "🏳️") + hb + '</span><span>' + (aId ? teamFlag(aId) : "🏳️") + ab + "</span></div>";
        const isDraw = v && v.hg != null && v.hg === v.ag;
        controls += '<div class="ko-adv' + (isDraw ? "" : " hidden") + '">' +
          '<span class="ko-adv-q">Empate → ¿quién ' + (isBat25Final(m) ? "gana" : "avanza") + ' por penales?</span>' +
          '<button type="button" data-adv="home" class="' + (v && v.adv === "home" ? "on" : "") + '"><span class="b1f">' + (hId ? teamFlag(hId) : "🏳️") + "</span>" + esc(WC.slotName(m, "home")) + "</button>" +
          '<button type="button" data-adv="away" class="' + (v && v.adv === "away" ? "on" : "") + '"><span class="b1f">' + (aId ? teamFlag(aId) : "🏳️") + "</span>" + esc(WC.slotName(m, "away")) + "</button></div>";
      }
    } else {
      // grupos: 1X2
      const sel = v ? (v.hg > v.ag ? "h" : (v.hg < v.ag ? "a" : "x")) : "";
      controls = '<div class="pick-1x2">' +
        '<button type="button" data-1x2="h" class="' + (sel === "h" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.home) + "</span>Gana</button>" +
        '<button type="button" data-1x2="x" class="' + (sel === "x" ? "on" : "") + '">Empate</button>' +
        '<button type="button" data-1x2="a" class="' + (sel === "a" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.away) + "</span>Gana</button></div>";
    }
    const st = stateLabel(v);
    const showStar = m.stage !== "group";
    const starOn = showStar && isCaptain(m.id);
    const star = showStar
      ? '<button type="button" class="cap-star' + (starOn ? " on" : "") + '" data-captain="' + m.id + '"' +
        (v ? "" : " disabled") + ' aria-pressed="' + (starOn ? "true" : "false") +
        '" title="Batacazo del día: suma puntos extra si aciertas (más si pocos lo tenían, 0 si era el favorito obvio)">💥 Batacazo' + (starOn ? " ✓" : "") + "</button>"
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
    // toggle de avance (empate KO): mostrar solo si el marcador es empate; marcar el lado elegido
    const isDraw = !!(v && v.hg != null && v.hg === v.ag);
    const advWrap = row.querySelector(".ko-adv");
    if (advWrap) advWrap.classList.toggle("hidden", !isDraw);
    row.querySelectorAll("[data-adv]").forEach(function (b) { b.classList.toggle("on", !!(v && v.adv === b.dataset.adv)); });
    // el botón de Batacazo se habilita en cuanto hay pick (al renderizar nace disabled sin pick)
    const capStar = row.querySelector(".cap-star");
    if (capStar) capStar.disabled = !v;
  }

  function rulesHtml() {
    return '<details class="game-rules game-card"><summary>Cómo se juega</summary>' +
      "<table><tr><th>Predicción</th><th>Puntos</th></tr>" +
      "<tr><td>Grupos: acertar gana/empata/pierde</td><td>1 pt</td></tr>" +
      "<tr><td>Eliminatorias y final: marcador exacto</td><td>3 pts</td></tr>" +
      "<tr><td>Eliminatorias y final: solo el resultado</td><td>1 pt</td></tr>" +
      "<tr><td>Eliminatorias: + acertar quién avanza</td><td>+1 pt</td></tr>" +
      "<tr><td>Campeón: según hasta dónde llegue (8vos / 4tos / semis / final / copa)</td><td>4 · 8 · 11 · 13 · 15</td></tr>" +
      "<tr><td>💥 Batacazo: mientras menos gente tenía tu acierto, más suma</td><td>+1 a +3</td></tr></table>" +
      "<p>Cada partido cierra a su hora de inicio. En eliminatorias ahora pronosticas el MARCADOR: exacto vale 3, solo el resultado 1, y en las rondas con avance (16vos a semis) sumas +1 extra si aciertas quién pasa. Si pones empate, eliges a quién avanza por penales. " +
      "Tu campeón suma en el camino: cada ronda que sobrevive te paga más (4 en 8vos, 8 en 4tos, 11 en semis, 13 si llega a la final, 15 la copa), aunque no levante el trofeo. " +
      "Marcas un partido por día como Batacazo 💥 (solo suma si aciertas el avance, nunca resta): mientras menos gente tenía tu acierto, más suma — hasta +3 si casi nadie lo tenía, y 0 si era el favorito obvio. " +
      "Bajo el marcador verás una pista de qué tan acompañado va cada lado (poca gente · dividido · la mayoría) para que elijas tu batacazo con los ojos abiertos. " +
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
        ? '<p>Ahora suma en el camino: 4 pts si llega a 8vos, 8 a 4tos, 11 a semis, 13 a la final y 15 si levanta la copa. Puedes cambiarlo hasta el 28 de junio.</p><div class="champ-pick">' +
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
    const snap = engagementSnapshot();
    if (snap && snap.liveStale) {
      trackEvent("live_ranking_viewed", { has_personal_impact: false });
      return '<div class="game-card live-rank" id="liveRank"><h3><span class="lr-dot"></span> Ranking en vivo</h3>' +
        '<div class="es-status-row"><span class="es-label live">Datos en vivo</span><span class="es-status live">Sin datos frescos</span></div>' +
        '<h2 class="lr-social">Actualizando ranking en vivo</h2>' +
        '<p class="lr-note">Los datos live no están frescos. El Ranking Oficial sigue visible abajo.</p></div>';
    }
    const rows = WC.scoring.buildLiveLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    if (!rows.length) return "";
    const uid = session ? session.user.id : null;
    // Picks por jugador de los partidos en vivo (bloqueados al kickoff: mostrarlos es fair play)
    const predByKey = {};
    data.predictions.forEach(function (pr) { predByKey[pr.user_id + "|" + pr.match_id] = pr; });
    const capByKey = {};
    data.captains.forEach(function (c) { capByKey[c.user_id + "|" + c.match_id] = true; });
    function pickCell(userId, m) {
      const pr = predByKey[userId + "|" + m.id];
      const view = WC.engagement ? WC.engagement.livePickView(pr, m) : null;
      if (!view) return '<td class="lr-pick none">–</td>';
      const s = WC.scoring.scoreMatch({ hg: pr.hg, ag: pr.ag, adv: pr.adv }, WC.scoring.freezeLive(m));
      const adv = view.advSide ? " " + teamFlag(view.advSide === "home" ? m.home : m.away) : "";
      const cap = capByKey[userId + "|" + m.id] ? ' <span class="lr-pick-cap" title="Batacazo" aria-label="Batacazo">Ⓑ</span>' : "";
      return '<td class="lr-pick ' + s.kind + '">' + esc(view.score) + adv + cap + "</td>";
    }
    const table = rows.map(function (r) {
      const mov = r.delta > 0 ? '<span class="lr-up">▲' + r.delta + "</span>"
        : r.delta < 0 ? '<span class="lr-down">▼' + (-r.delta) + "</span>"
        : '<span class="lr-eq">–</span>';
      const bump = r.livePoints > (lastLivePoints[r.userId] || 0) ? " bump" : "";
      const plus = r.livePoints > 0 ? ' <span class="lr-plus' + bump + '">+' + r.livePoints + "</span>" : "";
      return "<tr" + (r.userId === uid ? ' class="me"' : "") + ' data-user="' + r.userId + '">' +
        '<td class="pos"><span class="num">' + r.pos + '</span></td><td class="lr-mov">' + mov +
        '</td><td class="flag">' + champFlagFor(r.userId) + '</td><td class="lr-name"><div class="lr-name-flex"><span class="lr-nm">' + esc(r.username) + "</span>" + plus + "</div></td>" +
        liveMs.map(function (m) { return pickCell(r.userId, m); }).join("") +
        '<td class="pts">' + r.points + "</td></tr>";
    }).join("");
    lastLivePoints = {};
    rows.forEach(function (r) { lastLivePoints[r.userId] = r.livePoints; });
    // Story 1.7 — bloque social (impacto personal/grupal) + tira de marcador en vivo
    const tension = WC.engagement && snap ? WC.engagement.liveTension(snap) : null;
    const headline = tension && tension.state !== "fallback" && tension.message ? tension.message : "";
    const scoreStrips = liveMs.map(function (m) {
      const score = m.hs + " - " + m.as + (m.hp != null && m.ap != null ? " (" + m.hp + "-" + m.ap + ")" : "");
      return engMatchStrip(m.home, m.away, '<div class="es-score live">' + esc(score) + "</div>");
    }).join("");
    const headBlock = '<h2 class="lr-social" aria-live="polite">' + esc(headline || "La tabla se mueve en vivo") + "</h2>" + scoreStrips;
    const groupsHtml = (WC.engagement && snap ? liveMs : []).map(function (m) {
      const pg = WC.engagement.predictionGroups(snap, m.id);
      if (!pg || pg.state !== "visible" || !pg.groups.length) return "";
      const chips = pg.groups.map(function (g) {
        return '<span class="pg-chip">' + esc(g.label) + " <b>" + g.count + "</b></span>";
      }).join("");
      return '<div class="pg-row"><span class="pg-vs">' + teamFlag(m.home) + " " + teamFlag(m.away) + "</span>" + chips + "</div>";
    }).filter(Boolean).join("");
    const groupsBlock = groupsHtml ? '<div class="pg-block"><h4>Cómo se reparte la quiniela</h4>' + groupsHtml + "</div>" : "";
    trackEvent("live_ranking_viewed", { has_personal_impact: !!(tension && tension.state === "personal") });
    if (groupsBlock) trackEvent("locked_predictions_viewed", {});
    return '<div class="game-card live-rank" id="liveRank"><h3><span class="lr-dot"></span> Ranking en vivo</h3>' +
      headBlock +
      '<p class="lr-note">Provisional: así quedaría si los partidos terminan como van. El oficial suma al final.</p>' +
      '<div class="lr-scroll"><table class="rank-table"><tr><th>#</th><th></th><th></th><th>Jugador</th>' +
      liveMs.map(function (m) { const vs = esc(WC.slotName(m, "home")) + " vs " + esc(WC.slotName(m, "away")); return '<th class="lr-pick-th" title="' + vs + '" aria-label="' + vs + '">' + teamFlag(m.home) + " " + teamFlag(m.away) + "</th>"; }).join("") +
      "<th>Pts</th></tr>" + table + "</table></div>" +
      groupsBlock + "</div>";
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

  // Podio del Top 3 (centro #1, izquierda #2, derecha #3). Pura presentación de
  // filas de buildLeaderboard. Empates: cada uno muestra su medalla real por tier.
  // Podio clásico: medalla y número por ESCALÓN (1º/2º/3º), no por nivel de puntaje.
  // Las medallas viven solo aquí; la lista de abajo muestra solo el número de posición.
  function podiumHtml(top3, uid) {
    if (!top3.length) return "";
    const MEDAL = { first: "🥇", second: "🥈", third: "🥉" };
    const RANK = { first: 1, second: 2, third: 3 };
    const step = function (r, cls) {
      if (!r) return "";
      const me = r.userId === uid ? " pod-me" : "";
      const acc = r.decided > 0 ? Math.round((r.exact + r.outcome) / r.decided * 100) + "% aciertos" : "—";
      return '<div class="pod-step ' + cls + me + '">' +
        '<div class="pod-medal">' + MEDAL[cls] + "</div>" +
        '<div class="pod-flag">' + champFlagFor(r.userId) + "</div>" +
        '<div class="pod-name">' + esc(r.username) + "</div>" +
        '<div class="pod-pts">' + r.points + " pts</div>" +
        '<div class="pod-acc">' + acc + "</div>" +
        '<div class="pod-block">' + RANK[cls] + "</div>" +
        "</div>";
    };
    return '<div class="podium">' + step(top3[1], "second") + step(top3[0], "first") + step(top3[2], "third") + "</div>";
  }

  function rankingHtml() {
    const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    const uid = session ? session.user.id : null;
    if (rows.length === 0) {
      return '<div class="game-card"><h3>Ranking</h3><p class="rank-empty">Aún no hay jugadores. ¡Sé el primero!</p></div>';
    }
    // El podio SIEMPRE por puntos (rows); la lista respeta el sort elegido (view).
    const top3 = rows.slice(0, 3);
    const top3Ids = {};
    top3.forEach(function (r) { top3Ids[r.userId] = true; });
    const view = rankSort === "acc"
      ? rows.slice().sort(function (x, y) { return accValue(y) - accValue(x) || y.points - x.points; })
      : rows;
    const rest = view.filter(function (r) { return !top3Ids[r.userId]; });
    const arrow = function (key) { return rankSort === key ? ' <span class="sort-ar">▼</span>' : ""; };
    const accTh = '<th class="col-acc sortable' + (rankSort === "acc" ? " sort-active" : "") + '" data-rank-sort="acc">% Acierto' + arrow("acc") + "</th>";
    const ptsTh = '<th class="sortable' + (rankSort === "pts" ? " sort-active" : "") + '" data-rank-sort="pts">Pts' + arrow("pts") + "</th>";
    const tableHtml = rest.length === 0 ? "" :
      '<table class="rank-table"><tr><th>#</th><th></th><th>Jugador</th><th class="col-x">Exactos</th><th class="col-x">Resultados</th>' + accTh + '<th class="col-x">Bonus</th>' + ptsTh + "</tr>" +
        rest.map(function (r, i) {
          // Las medallas son solo del podio; en la lista va un número CORRELATIVO
          // (4, 5, 6, …), sin repetidos, continuando después del podio.
          const medal = '<span class="num">' + (top3.length + i + 1) + "</span>";
          const acc = r.decided > 0 ? Math.round((r.exact + r.outcome) / r.decided * 100) + "%" : "—";
          return "<tr" + (r.userId === uid ? ' class="me"' : "") + '><td class="pos">' + medal + '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + '</td><td class="col-x">' +
            r.exact + '</td><td class="col-x">' + r.outcome + '</td><td class="col-acc">' + acc + '</td><td class="col-x">' + (r.bonus || 0) + '</td><td class="pts">' + r.points + "</td></tr>";
        }).join("") + "</table>";
    return '<div class="game-card"><h3>Ranking</h3>' +
      podiumHtml(top3, uid) +
      tableHtml +
      (uid && rows.some(function (r) { return r.userId === uid; })
        ? '<div class="game-actions game-share" style="margin-top:14px"><button class="game-btn secondary" id="gShare">Compartir mi posición</button></div>'
        : "") +
      "</div>";
  }

  // Eventos de engagement (Story 1.9): no bloqueante, degrada si metrics falla.
  function trackEvent(event, fields) {
    try { if (WC.metrics && WC.metrics.track) WC.metrics.track(event, fields); } catch (e) {}
  }

  // Snapshot para js/engagement.js: mapea datos de la app al contrato
  // (kickoff_at, snake_case). game.js orquesta; engagement.js deriva view models.
  function engagementSnapshot() {
    if (!session) return null;
    const ms = matches();
    const uid = session.user.id;
    const userById = {};
    data.profiles.forEach(function (p) { userById[p.id] = p.username; });
    const matchPotentials = {};
    ms.forEach(function (m) {
      matchPotentials[m.id] = WC.scoring.maxMatchPoints(m, { captain: isCaptain(m.id) });
    });
    const liveDataStale = ms.some(function (m) { return m.status === "live"; }) &&
      (!WC.state.updatedAt || WC.state.source !== "live" || (Date.now() - WC.state.updatedAt) > 5 * 60 * 1000);
    return {
      now: Date.now(),
      meId: uid,
      official: WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, ms, data.captains),
      live: WC.scoring.buildLiveLeaderboard(data.profiles, data.predictions, data.picks, ms, data.captains),
      liveStale: liveDataStale,
      matchPotentials: matchPotentials,
      matches: ms.map(function (m) {
        return { id: m.id, stage: m.stage, status: m.status, kickoff_at: m.date, home: m.home, away: m.away, winner: m.winner };
      }),
      myPredictions: mine,
      myCaptains: data.captains.filter(function (c) { return c.user_id === uid; }),
      visiblePredictions: data.predictions.map(function (pr) {
        return { match_id: pr.match_id, username: userById[pr.user_id], hg: pr.hg, ag: pr.ag };
      }),
      teams: WC.state.teams
    };
  }

  // Tira de partido estilo broadcast (mockups). `mid` = nodo central (VS o marcador).
  function engGroupSmall(id) {
    const t = WC.state.teams[id];
    return t && t.group ? '<small>Grupo ' + esc(t.group) + "</small>" : "";
  }
  function engMatchStrip(homeId, awayId, mid, cls) {
    const tn = function (id, fb) { const t = WC.state.teams[id]; return esc(t && t.name ? t.name : fb); };
    return '<div class="es-strip' + (cls ? " " + cls : "") + '">' +
      '<div class="es-team"><span class="es-name">' + teamFlag(homeId) + " " + tn(homeId, "Local") + "</span>" + engGroupSmall(homeId) + "</div>" +
      mid +
      '<div class="es-team"><span class="es-name">' + teamFlag(awayId) + " " + tn(awayId, "Visitante") + "</span>" + engGroupSmall(awayId) + "</div>" +
      "</div>";
  }
  // "Mi jornada": fusiona el resumen (postMatchSummary) + la oportunidad en una sola
  // narración, con empujón psicológico a volver y revisar pronósticos. Texto crudo en
  // las cláusulas; se escapa UNA vez al renderizar (no escapar dentro de a/b/c).
  function miJornadaHtml() {
    if (!session || !WC.engagement) return "";
    const snap = engagementSnapshot();
    if (!snap) return "";
    const me = (snap.official || []).find(function (r) { return r.userId === snap.meId; });
    const teams = WC.state.teams || {};

    // recap del último partido / jornada del día (puede quedar null)
    const ms = matches();
    const played = ms.filter(function (m) { return m.status === "played" && m.hs != null; });
    let recap = null, last = null;
    if (played.length) {
      last = played[0];
      played.forEach(function (m) { if (new Date(m.date) > new Date(last.date)) last = m; });
      const lastDay = matchDay(last);
      const inDay = played.filter(function (m) { return matchDay(m) === lastDay; });
      const scope = inDay.length > 1 ? "matchday" : "match";
      const msBefore = ms.map(function (m) {
        return m.status === "played" && m.hs != null && matchDay(m) === lastDay
          ? Object.assign({}, m, { status: "scheduled", hs: null, as: null, hp: null, ap: null, winner: null })
          : m;
      });
      const before = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, msBefore, data.captains);
      recap = WC.engagement.postMatchSummary(Object.assign({}, snap, { summaryScope: scope }), before, snap.official);
    }

    const opp = WC.engagement.opportunity(snap);
    const hasOpp = !!(opp && opp.state !== "fallback" && opp.copy && opp.copy.headline);

    // cláusula A — recap o posición
    let a = "";
    if (recap) {
      const homeN = (teams[last.home] || {}).name, awayN = (teams[last.away] || {}).name;
      a = recap.scope === "matchday" ? "Cerró la jornada"
        : (homeN && awayN ? "Terminó " + homeN + " " + last.hs + "-" + last.as + " " + awayN : "Terminó el partido");
      if (recap.movement === "passed_friend") a += " y pasaste a " + recap.rival;
      else if (recap.movement === "passed_by_friend") a += " y " + recap.rival + " te pasó";
      else if (recap.movement === "up") a += " y subiste " + recap.posDelta + " puesto" + (recap.posDelta > 1 ? "s" : "");
      else if (recap.movement === "down") a += " y bajaste " + Math.abs(recap.posDelta) + " puesto" + (Math.abs(recap.posDelta) > 1 ? "s" : "");
      else if (recap.ptsGain > 0) a += " y sumaste " + recap.ptsGain + " pt" + (recap.ptsGain > 1 ? "s" : "");
      a += me ? ("; vas " + me.pos + "º con " + me.points + " pts.") : ".";
    } else if (me) {
      a = "Vas " + me.pos + "º con " + me.points + " pts.";
    }

    // cláusula B — oportunidad
    let b = "";
    if (hasOpp) {
      const mn = opp.match && opp.match.homeName && opp.match.awayName ? (opp.match.homeName + " vs " + opp.match.awayName) : "tu próximo partido";
      const rival = (opp.rival && opp.rival.username) || "tu rival";
      const gap = opp.rival ? opp.rival.pointsGap : null;
      const ptTxt = function (n) { return n + " pt" + (n > 1 ? "s" : ""); };
      if (opp.state === "pending_pick") b = "Aún te falta tu pick de " + mn + " — no te quedes afuera.";
      else if (opp.state === "captain") b = "Marca tu Batacazo para " + mn + " y súmale filo.";
      else if (opp.state === "reachable_rival") b = gap > 0 ? "Tienes a " + rival + " a tiro (a " + ptTxt(gap) + "): aciertas y lo pasas." : "Estás empatado con " + rival + ": aciertas y lo pasas.";
      else if (opp.state === "rival_threat") b = (gap > 0 ? rival + " te pisa los talones a " + ptTxt(gap) : rival + " está empatado contigo") + " — defiende tu lugar.";
      else if (opp.state === "win_matchday") b = "Hoy puedes ganar la jornada.";
    }

    // cláusula C — empujón a volver
    const c = hasOpp ? "Entra antes del kickoff, que la tabla no espera." : (recap ? "Mañana hay revancha 🔁." : "");

    const narration = [a, b, c].filter(Boolean).join(" ");
    if (!narration) return "";

    if (recap) trackEvent("post_match_summary_viewed", { movement: recap.movement, scope: recap.scope });
    if (hasOpp) trackEvent("opportunity_viewed", { state: opp.state, reason: opp.reason });

    const url = location.origin + location.pathname + "#quiniela";
    const ctaTarget = hasOpp && opp.primaryAction ? opp.primaryAction.targetMatchId : "";
    const ctaLabel = hasOpp ? "Pronosticar ahora" : "Revisar mis pronósticos";
    const cta = '<button class="mj-btn mj-go opp-cta" data-opp-target="' + esc(ctaTarget) + '" data-opp-reason="' + esc((opp && opp.reason) || "mijornada") + '">' + ctaLabel + "</button>";
    const teaser = narration + " " + url;
    const waIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02Zm-7.01 15.24h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 5.82 2.42 8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>';
    const share = '<button class="mj-btn mj-share" id="pmsShare" data-share="' + esc(teaser) + '">' + waIcon + "Compartir</button>";

    // Resaltar el nombre del rival mencionado (ya escapado) dentro de la narración.
    let narrationHtml = esc(narration);
    const rivalNames = [];
    if (recap && recap.rival && (recap.movement === "passed_friend" || recap.movement === "passed_by_friend")) rivalNames.push(recap.rival);
    if (hasOpp && opp.rival && opp.rival.username && (opp.state === "reachable_rival" || opp.state === "rival_threat")) rivalNames.push(opp.rival.username);
    rivalNames.filter(function (n, i, a) { return a.indexOf(n) === i; }).forEach(function (n) {
      const e = esc(n);
      narrationHtml = narrationHtml.split(e).join('<span class="mj-rival">' + e + "</span>");
    });
    return '<div class="game-card mijornada-card"><h3>Mi jornada ⚽</h3>' +
      '<p class="mj-narration">' + narrationHtml + "</p>" +
      '<div class="mj-actions">' + cta + share + "</div>" +
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
      miJornadaHtml() + championHtml() + remindersHtml("top") + liveRankingHtml() + rankingHtml() + predictionsHtml() + remindersHtml("bottom") + rulesHtml();
    animateLiveRows(prevLiveRows);
    const strip = document.getElementById("gDates");
    const active = strip && strip.querySelector(".active");
    if (strip && active) strip.scrollLeft = Math.max(0, active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2);
  }

  /* ---------- eventos (delegación) ---------- */
  rootEl.addEventListener("click", async function (event) {
    const oppBtn = event.target.closest("[data-opp-target]");
    if (oppBtn) {
      trackEvent("opportunity_cta_clicked", { reason: oppBtn.dataset.oppReason });
      // CTA de Oportunidad: scroll/focus al pronóstico relevante (sin modal).
      // El value va entre comillas, así que solo se escapan " y \ (no CSS.escape,
      // que rompería un id numérico como 400021450 → \34 00021450).
      const id = (oppBtn.dataset.oppTarget || "").replace(/["\\]/g, "\\$&");
      const target = (id && rootEl.querySelector('[data-match="' + id + '"]')) || rootEl.querySelector(".pick-card");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const btn = target.querySelector("button");
        if (btn) btn.focus();
      }
      return;
    }
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
      const v = mine[matchId];
      if (!v) return; // primero hay que poner el marcador
      v.adv = bAdv.dataset.adv; // "home" | "away" — a quién pasa por penales en el empate
      v.state = "saving";
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
    var pmsBtn = event.target.closest ? event.target.closest("#pmsShare") : (event.target.id === "pmsShare" ? event.target : null);
    if (pmsBtn) {
      shareMiJornada(pmsBtn);
      return;
    }
    if (event.target.id === "pmsCopy") {
      const text = event.target.dataset.share || "";
      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { event.target.textContent = "Texto copiado ✓"; }).catch(function () { window.prompt("Copia tu resumen:", text); }); }
      else { window.prompt("Copia tu resumen:", text); }
      trackEvent("whatsapp_copy_clicked", {});
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
    const s = WC.scoring.scoreMatch({ hg: pred.hg, ag: pred.ag, adv: pred.adv }, match);
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
    reload: async function () { await loadAll(); render(); },
    // Re-sincroniza predicciones/perfiles desde Supabase y re-renderiza, SIN pisar
    // una edición en curso. La llama app.js periódicamente y al volver a la app
    // para que el ranking no quede desfasado entre dispositivos.
    refresh: async function () {
      const editing = Object.keys(saveTimers).some(function (k) {
        const v = mine[k]; return v && v.state === "saving";
      });
      if (editing) return;
      await loadAll();
      render();
      refreshMatchCards();
    }
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
