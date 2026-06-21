/* Push pre-partido de la quiniela. Corre en GitHub Actions cada 15 min:
   hasta ~3h antes del kickoff manda pushes accionables (pick pendiente o
   Capitán pendiente), con dedupe/frecuencia por usuario. Dedupe persistente vía
   tabla push_sent (PK match+user; más estricto que match+reason).

   Env: SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
        DRY_RUN=1 → solo lista, no envía ni registra.
        DIAG_USERNAME=<usuario> → diagnostica sin enviar ni registrar. */

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const pm = require("./push-messages.js");
const scoring = require("../js/scoring.js");
const engagement = require("../js/engagement.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://wwzgpifvfmogjttwstxy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.env.DRY_RUN === "1";
const SITE = "https://jmcriptos.github.io/ruta26/";
const WINDOW_MS = (Number(process.env.WINDOW_MIN) > 0 ? Number(process.env.WINDOW_MIN) : 180) * 60 * 1000; // ventana amplia: los cron de Actions se saltan corridas (12 JUN se perdió un push con 75 min); el dedupe garantiza un solo push por partido
const MAX_SUBSCRIPTIONS_PER_USER = 5;

if (!SERVICE_KEY) { console.error("ERROR: falta SUPABASE_SERVICE_KEY"); process.exit(1); }
webpush.setVapidDetails("mailto:jm.aceleracion@gmail.com",
  process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

async function rest(pathq, init) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + pathq, Object.assign({
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates"
    }
  }, init || {}));
  if (!res.ok) throw new Error("Supabase " + res.status + " en " + pathq.split("?")[0]);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "fcm.googleapis.com" ||
      host === "android.googleapis.com" ||
      host === "web.push.apple.com" ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com")
    );
  } catch (e) {
    return false;
  }
}

function validSubscriptions(subs) {
  const valid = subs.filter(function (s) { return validPushEndpoint(s.endpoint); });
  if (valid.length !== subs.length) {
    console.error("Suscripciones omitidas por endpoint no permitido: " + (subs.length - valid.length));
  }
  return valid;
}

// Payload en formato Declarative Web Push (web_push: 8030): en iOS/Safari moderno
// el sistema pinta la notificación directo del JSON (sin depender de que el service
// worker despierte a tiempo, que era lo que mostraba el placeholder "Notificación");
// en Chrome/Android el push handler del sw lee el mismo JSON y la muestra él.
function pushPayload(title, body, data) {
  const notification = {
    title: title,
    body: body,
    navigate: SITE + "#quiniela",
    lang: "es",
    silent: false // sonido estándar del sistema (iOS no permite sonidos personalizados en web push)
  };
  // metadata allowlisted para atribución (push_reminder_clicked); el sw reenvía data.reason
  if (data) notification.data = typeof data === "string" ? { reason: data } : data;
  return JSON.stringify({ web_push: 8030, notification: notification });
}

function snapshot() {
  const txt = fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8");
  return JSON.parse(txt.slice(txt.indexOf("WC.SNAPSHOT = ") + 14, txt.lastIndexOf(";")));
}

function curacaoDayStartIso(ms) {
  // Curaçao es UTC-4 sin DST. El matchday local empieza a las 04:00Z.
  const local = new Date(ms - 4 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4, 0, 0)).toISOString();
}

function engagementMatch(m) {
  return { id: m.id, stage: m.stage, status: m.status, kickoff_at: m.date, home: m.home, away: m.away, winner: m.winner };
}

function userOpportunityCandidate(uid, soon, teams, official, allPreds, caps, now) {
  const myPredictions = {};
  allPreds.forEach(function (p) {
    if (p.user_id === uid) myPredictions[p.match_id] = { hg: p.hg, ag: p.ag, pens: !!p.pens };
  });
  const myCaptains = (caps || []).filter(function (c) { return c.user_id === uid; });
  const matchPotentials = {};
  soon.forEach(function (m) {
    const isCap = myCaptains.some(function (c) { return c.match_id === m.id; });
    matchPotentials[m.id] = scoring.maxMatchPoints(m, { captain: isCap });
  });
  const opp = engagement.opportunity({
    now: now,
    meId: uid,
    official: official,
    live: [],
    matches: soon.map(engagementMatch),
    matchPotentials: matchPotentials,
    myPredictions: myPredictions,
    myCaptains: myCaptains,
    visiblePredictions: [],
    teams: teams
  });
  if (!opp || !opp.match || ["pending_pick", "captain", "reachable_rival", "rival_threat"].indexOf(opp.reason) === -1) return null;
  return {
    userId: uid,
    matchId: opp.match.id,
    reason: opp.reason,
    kickoffAt: opp.match.kickoffAt,
    opp: opp
  };
}

(async function main() {
  const snap = snapshot();
  const now = Date.now();
  const soon = snap.matches.filter(function (m) {
    const t = new Date(m.date).getTime();
    return m.status === "scheduled" && t > now && t <= now + WINDOW_MS;
  });

  // Diagnóstico de solo lectura para soporte: nunca envía ni registra.
  if (process.env.DIAG_USERNAME) {
    const uname = process.env.DIAG_USERNAME.trim().toLowerCase();
    const prof = await rest("profiles?select=id,username&username=eq." + encodeURIComponent(uname));
    if (!prof.length) { console.error("No existe el usuario " + uname); process.exit(1); }
    const uid = prof[0].id;
    const subs = await rest("push_subscriptions?select=endpoint,p256dh,auth&user_id=eq." + uid);
    const valid = validSubscriptions(subs);
    console.log("Diagnóstico " + uname + ": suscripciones=" + subs.length + ", válidas=" + valid.length);
    if (!soon.length) { console.log("Sin partidos en la ventana."); return; }
    const ids = soon.map(function (m) { return m.id; }).join(",");
    const preds = await rest("predictions?select=match_id&user_id=eq." + uid + "&match_id=in.(" + ids + ")");
    const sent = await rest("push_sent?select=match_id&user_id=eq." + uid + "&match_id=in.(" + ids + ")");
    const hasPred = new Set(preds.map(function (p) { return p.match_id; }));
    const wasSent = new Set(sent.map(function (s) { return s.match_id; }));
    soon.forEach(function (m) {
      console.log("P" + m.num + ": pick=" + (hasPred.has(m.id) ? "sí" : "no") +
        ", marcado_enviado=" + (wasSent.has(m.id) ? "sí" : "no"));
    });
    return;
  }

  // Modo prueba/dirigido: TEST_USERNAME=usuario1,usuario2 manda el push REAL a
  // esos usuarios (aunque falte mucho para el partido) y termina. Por defecto
  // usa el próximo partido del calendario; TEST_MATCH=<número de partido> elige
  // uno específico. Es un preview exacto de lo que recibirán todos en la ventana.
  if (process.env.TEST_USERNAME) {
    const unames = process.env.TEST_USERNAME.split(",").map(function (u) { return u.trim().toLowerCase(); }).filter(Boolean);
    if (!unames.length) { console.error("TEST_USERNAME vacío"); process.exit(1); }

    // Partido objetivo: TEST_MATCH (m.num) o el próximo del calendario.
    let targetMatches;
    if (process.env.TEST_MATCH) {
      const num = Number(process.env.TEST_MATCH);
      const m = snap.matches.find(function (x) { return x.num === num; });
      if (!m) { console.error("No existe el partido número " + process.env.TEST_MATCH); process.exit(1); }
      targetMatches = [m];
    } else {
      const upcoming = snap.matches.filter(function (m) { return new Date(m.date).getTime() > now; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      if (!upcoming.length) { console.error("No quedan partidos en el calendario."); process.exit(1); }
      targetMatches = upcoming.filter(function (m) { return m.date === upcoming[0].date; });
    }
    const targetIds = targetMatches.map(function (m) { return m.id; }).join(",");
    const preds = await rest("predictions?select=user_id,match_id,hg,ag&match_id=in.(" + targetIds + ")");
    const tallies = pm.tallyByMatch(preds);

    for (const uname of unames) {
      const prof = await rest("profiles?select=id,username&username=eq." + encodeURIComponent(uname));
      if (!prof.length) { console.error("No existe el usuario " + uname); continue; }
      const uid = prof[0].id;
      const subs = validSubscriptions(await rest("push_subscriptions?select=endpoint,p256dh,auth&user_id=eq." + uid))
        .slice(0, MAX_SUBSCRIPTIONS_PER_USER);
      if (!subs.length) { console.error(uname + " no tiene suscripciones push activas."); continue; }
      const missingPick = targetMatches.some(function (m) {
        return !preds.some(function (p) { return p.user_id === uid && p.match_id === m.id; });
      });
      const msg = pm.buildPush(targetMatches, snap.teams, tallies, missingPick);
      console.log("Prueba para " + uname + ": " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
      const payload = pushPayload(msg.title, msg.body);
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          console.log("  enviado a " + uname + " (" + s.endpoint.slice(0, 40) + "…)");
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await rest("push_subscriptions?user_id=eq." + uid + "&endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
            console.log("  suscripción expirada eliminada (" + uname + "); debe reactivar avisos en la app");
          } else {
            console.error("  error " + (e.statusCode || "") + ": " + (e.body || e.message));
          }
        }
      }
    }
    return;
  }

  if (!soon.length) { console.log("Sin partidos en la ventana."); return; }
  console.log("Partidos próximos: " + soon.map(function (m) { return m.id; }).join(", "));

  const subs = validSubscriptions(await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth"));
  if (!subs.length) { console.log("Sin suscriptores."); return; }
  const ids = soon.map(function (m) { return m.id; }).join(",");
  const preds = await rest("predictions?select=user_id,match_id,hg,ag,pens&limit=20000");
  const profiles = await rest("profiles?select=id,username");
  const picks = await rest("champion_picks?select=user_id,team_id");
  const sent = await rest("push_sent?select=user_id,match_id,sent_at&match_id=in.(" + ids + ")");
  const sentTodayRows = await rest("push_sent?select=user_id,sent_at&sent_at=gte." + encodeURIComponent(curacaoDayStartIso(now)));
  // capitanes (para la oportunidad "marca tu Capitán"); degrada si la tabla falta
  const caps = await rest("captain_picks?select=user_id,match_id&limit=20000").catch(function () { return []; });
  const alreadySent = new Set();
  sent.forEach(function (s) {
    Object.keys(pm.REASON_PRIORITY).forEach(function (reason) {
      alreadySent.add(s.user_id + "|" + s.match_id + "|" + reason);
    });
  });
  const sentTodayCount = {};
  (sentTodayRows || []).forEach(function (s) { sentTodayCount[s.user_id] = (sentTodayCount[s.user_id] || 0) + 1; });

  const byUser = {};
  subs.forEach(function (s) {
    const userSubs = byUser[s.user_id] = byUser[s.user_id] || [];
    if (userSubs.length < MAX_SUBSCRIPTIONS_PER_USER) userSubs.push(s);
  });
  const official = scoring.buildLeaderboard(profiles || [], preds || [], picks || [], snap.matches, caps || []);
  const candidates = Object.keys(byUser).map(function (uid) {
    return userOpportunityCandidate(uid, soon, snap.teams, official, preds || [], caps || [], now);
  }).filter(Boolean);
  const winners = pm.applyGuardrails(candidates, { alreadySent: alreadySent, sentTodayCount: sentTodayCount });
  const winnersByUser = {};
  winners.forEach(function (c) { (winnersByUser[c.userId] = winnersByUser[c.userId] || []).push(c); });

  let avisados = 0;
  for (const uid of Object.keys(winnersByUser)) {
    for (const candidate of winnersByUser[uid]) {
      const msg = pm.buildOpportunityPush(candidate.opp, pm.horaTxt(candidate.kickoffAt));
      if (!msg) continue;
      const payload = pushPayload(msg.title, msg.body, msg.data);
      console.log((DRY ? "[dry-run] " : "") + uid.slice(0, 8) + "… [" + candidate.reason + "] ← " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
      if (DRY) { avisados++; continue; }

      let delivered = 0;
      for (const s of byUser[uid]) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered++;
          console.log("  push aceptado por proveedor");
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await rest("push_subscriptions?user_id=eq." + uid + "&endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
            console.log("  suscripción expirada eliminada");
          } else {
            console.error("  error de envío: " + (e.statusCode || e.message));
          }
        }
      }
      if (!delivered) {
        console.error("  ningún endpoint aceptó el push; se reintentará");
        continue;
      }
      await rest("push_sent", {
        method: "POST",
        body: JSON.stringify([{ match_id: candidate.matchId, user_id: uid }])
      });
      avisados++;
    }
  }
  console.log((DRY ? "[dry-run] " : "") + "Usuarios avisados: " + avisados);
})().catch(function (e) { console.error(e.message || e); process.exit(1); });
