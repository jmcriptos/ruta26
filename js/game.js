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
    WC.game = { onDataUpdate: function () {} };
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let session = null;
  let profile = null;
  let data = { profiles: [], predictions: [], picks: [] };
  let mine = {};            // match_id → {hg, ag, state, error}
  let myPick = null;        // team_id
  let predFilter = "open";  // open | done
  let loadError = false;
  const saveTimers = {};

  /* ---------- helpers ---------- */
  function matches() { return WC.state.matches; }
  function matchById(id) { return matches().find(function (m) { return m.id === id; }); }
  function kicked(m) { return new Date(m.date).getTime() <= Date.now(); }
  function championOpen() { return Date.now() < new Date(WC.scoring.CHAMPION_LOCK).getTime(); }
  function teamName(id) { const t = WC.state.teams[id]; return t ? t.flag + " " + esc(t.name) : "—"; }
  function teamFlag(id) { const t = WC.state.teams[id]; return t && t.flag ? t.flag : "🏳️"; }
  // bandera del campeón de un usuario, respetando lo que el RLS dejó ver (champion_picks ajenos
  // solo llegan tras el cierre; antes, solo el propio). Si no hay pick visible → escudo.
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
        client.from("predictions").select("user_id, match_id, hg, ag, pens"),
        client.from("champion_picks").select("user_id, team_id")
      ]);
      if (results.some(function (r) { return r.error; })) { loadError = true; return; }
      data.profiles = results[0].data || [];
      data.predictions = results[1].data || [];
      data.picks = results[2].data || [];
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

  /* ---------- render ---------- */
  function stateLabel(v) {
    if (!v || !v.state || v.state === "saved") return { cls: "ok", text: v ? "Guardado ✓" : "" };
    if (v.state === "saving") return { cls: "", text: "Guardando…" };
    return { cls: "err", text: v.error || "Error" };
  }

  function predType(m) { return m.stage === "final" ? "score" : (m.stage === "group" ? "1x2" : "ko"); }

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
      const chip = s.kind === "none" ? '<span class="pick-points miss">sin pick</span>'
        : s.kind === "pending" ? '<span class="pick-points pending">en juego</span>'
        : '<span class="pick-points ' + s.kind + '">' + (s.points > 0 ? "+" + s.points + " pts" : "0 pts") + "</span>";
      return '<div class="pick-card locked" data-match="' + m.id + '">' + head +
        '<div class="pick-foot"><small>Tu pick: ' + pickLabel(m, v) + " · Real: " + real + "</small>" + chip + "</div></div>";
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
    return '<div class="pick-card" data-match="' + m.id + '" data-type="' + type + '">' + head +
      controls +
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
      "<tr><td>Campeón</td><td>15 pts</td></tr></table>" +
      "<p>Cada partido cierra a su hora de inicio. El bonus de penales solo cuenta si además aciertas quién avanza. " +
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

  function predictionsHtml() {
    const shown = matches().filter(function (m) {
      return predFilter === "open" ? !kicked(m) : kicked(m);
    });
    return '<div class="game-card"><h3>Mis predicciones</h3>' +
      '<div class="match-tabs" id="gFilter">' +
      '<button data-pf="open" class="' + (predFilter === "open" ? "active" : "") + '">Por jugar</button>' +
      '<button data-pf="done" class="' + (predFilter === "done" ? "active" : "") + '">Jugados</button>' +
      "</div><div id=\"gPicks\">" +
      (shown.length ? shown.map(pickRowHtml).join("") : '<p class="rank-empty">Nada por aquí todavía.</p>') +
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

  function rankingHtml() {
    const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches());
    const uid = session ? session.user.id : null;
    return '<div class="game-card"><h3>Ranking</h3>' +
      (rows.length === 0 ? '<p class="rank-empty">Aún no hay jugadores. ¡Sé el primero!</p>'
        : '<table class="rank-table"><tr><th>#</th><th></th><th>Jugador</th><th class="col-x">Exactos</th><th class="col-x">Resultados</th><th class="col-x">Bonus</th><th>Pts</th></tr>' +
          rows.map(function (r) {
            const medal = r.pos === 1 ? "🥇" : r.pos === 2 ? "🥈" : r.pos === 3 ? "🥉" : '<span class="num">' + r.pos + "</span>";
            return "<tr" + (r.userId === uid ? ' class="me"' : "") + '><td class="pos">' + medal + '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + '</td><td class="col-x">' +
              r.exact + '</td><td class="col-x">' + r.outcome + '</td><td class="col-x">' + (r.bonus || 0) + '</td><td class="pts">' + r.points + "</td></tr>";
          }).join("") + "</table>") +
      (uid && rows.some(function (r) { return r.userId === uid; })
        ? '<div class="game-actions" style="margin-top:14px"><button class="game-btn secondary" id="gShare">Compartir mi posición</button></div>'
        : "") +
      "</div>";
  }

  function render() {
    if (loadError) {
      rootEl.innerHTML = '<div class="game-card game-off"><h3>El juego no está disponible ahora</h3><p>Revisa tu conexión e intenta de nuevo en un momento.</p></div>';
      return;
    }
    if (!session) {
      rootEl.innerHTML = authHtml() + rankingHtml() + rulesHtml();
      return;
    }
    rootEl.innerHTML =
      '<div class="game-userbar"><strong>Hola, ' + esc(profile ? profile.username : "jugador") + '</strong>' +
      '<button id="gLogout">Cerrar sesión</button></div>' +
      championHtml() + rankingHtml() + predictionsHtml() + rulesHtml();
  }

  /* ---------- eventos (delegación) ---------- */
  rootEl.addEventListener("click", async function (event) {
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
    const pf = event.target.closest("[data-pf]");
    if (pf) { predFilter = pf.dataset.pf; render(); return; }
    if (event.target.id === "gLogout") { await client.auth.signOut(); return; }
    if (event.target.id === "gShare") {
      const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches());
      const me = rows.find(function (r) { return session && r.userId === session.user.id; });
      const url = location.origin + location.pathname + "#quiniela";
      const text = me
        ? "Voy #" + me.pos + " con " + me.points + " pts en la quiniela del Mundial ⚽ ¿Te le mides?"
        : "Juega la quiniela del Mundial 2026 ⚽";
      if (navigator.share) navigator.share({ title: "Quiniela Ruta 26", text: text, url: url }).catch(function () {});
      else if (navigator.clipboard) { navigator.clipboard.writeText(text + " " + url); event.target.textContent = "Enlace copiado ✓"; }
      return;
    }
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
      render();
    })();
  });

  WC.game = {
    onDataUpdate: function () {
      // tras cada refresh de resultados FIFA (carga inicial o manual), refresca puntos y bloqueos —
      // sin pisar una edición en curso (timers de guardado activos)
      const editing = Object.keys(saveTimers).some(function (k) {
        const v = mine[k]; return v && v.state === "saving";
      });
      if (!editing) render();
    },
    reload: async function () { await loadAll(); render(); }
  };

  (async function init() {
    const got = await client.auth.getSession();
    session = got.data ? got.data.session : null;
    lastAuthUserId = session && session.user ? session.user.id : null;
    if (session) await ensureProfile(session.user);
    await loadAll();
    render();
  })();
})();
