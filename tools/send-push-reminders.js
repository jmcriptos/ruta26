/* Push pre-partido de la quiniela. Corre en GitHub Actions cada 15 min:
   ~75 min antes del primer partido de cada ventana manda un push a TODOS los
   suscriptores con el % del resultado más votado; añade línea extra si al
   usuario aún le falta el pick. Dedupe vía tabla push_sent (PK match+user).

   Env: SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
        DRY_RUN=1 → solo lista, no envía ni registra.
        DIAG_USERNAME=<usuario> → diagnostica sin enviar ni registrar. */

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const pm = require("./push-messages.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://wwzgpifvfmogjttwstxy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.env.DRY_RUN === "1";
const SITE = "https://jmcriptos.github.io/ruta26/";
const WINDOW_MS = 75 * 60 * 1000; // ~1h antes; margen por crons retrasados
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
function pushPayload(title, body) {
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title: title,
      body: body,
      navigate: SITE + "#quiniela",
      lang: "es",
      silent: false // sonido estándar del sistema (iOS no permite sonidos personalizados en web push)
    }
  });
}

function snapshot() {
  const txt = fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8");
  return JSON.parse(txt.slice(txt.indexOf("WC.SNAPSHOT = ") + 14, txt.lastIndexOf(";")));
}

(async function main() {
  const snap = snapshot();
  const now = Date.now();
  const soon = snap.matches.filter(function (m) {
    const t = new Date(m.date).getTime();
    return t > now && t <= now + WINDOW_MS;
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
    if (!soon.length) { console.log("Sin partidos en los próximos 75 min."); return; }
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

  // Modo prueba: TEST_USERNAME=<usuario> le manda a ese usuario el push REAL
  // del próximo partido del calendario (aunque falte más de 75 min) y termina.
  // Es un preview exacto de lo que recibirán todos en la ventana real.
  if (process.env.TEST_USERNAME) {
    const uname = process.env.TEST_USERNAME.trim().toLowerCase();
    const prof = await rest("profiles?select=id,username&username=eq." + encodeURIComponent(uname));
    if (!prof.length) { console.error("No existe el usuario " + uname); process.exit(1); }
    const uid = prof[0].id;
    const subs = validSubscriptions(await rest("push_subscriptions?select=endpoint,p256dh,auth&user_id=eq." + uid))
      .slice(0, MAX_SUBSCRIPTIONS_PER_USER);
    if (!subs.length) { console.error(uname + " no tiene suscripciones push activas."); process.exit(1); }

    const upcoming = snap.matches.filter(function (m) { return new Date(m.date).getTime() > now; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (!upcoming.length) { console.error("No quedan partidos en el calendario."); process.exit(1); }
    const nextMatches = upcoming.filter(function (m) { return m.date === upcoming[0].date; });
    const nextIds = nextMatches.map(function (m) { return m.id; }).join(",");
    const nextPreds = await rest("predictions?select=user_id,match_id,hg,ag&match_id=in.(" + nextIds + ")");
    const missingPick = nextMatches.some(function (m) {
      return !nextPreds.some(function (p) { return p.user_id === uid && p.match_id === m.id; });
    });
    const msg = pm.buildPush(nextMatches, snap.teams, pm.tallyByMatch(nextPreds), missingPick);
    console.log("Prueba para " + uname + ": " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
    const payload = pushPayload(msg.title, msg.body);
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        console.log("Prueba enviada a " + uname + " (" + s.endpoint.slice(0, 40) + "…)");
      } catch (e) { console.error("Error " + (e.statusCode || "") + ": " + (e.body || e.message)); }
    }
    return;
  }

  if (!soon.length) { console.log("Sin partidos en los próximos 75 min."); return; }
  console.log("Partidos próximos: " + soon.map(function (m) { return m.id; }).join(", "));

  const subs = validSubscriptions(await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth"));
  if (!subs.length) { console.log("Sin suscriptores."); return; }
  const ids = soon.map(function (m) { return m.id; }).join(",");
  const preds = await rest("predictions?select=user_id,match_id,hg,ag&match_id=in.(" + ids + ")");
  const sent = await rest("push_sent?select=user_id,match_id&match_id=in.(" + ids + ")");
  const tallies = pm.tallyByMatch(preds);
  const hasPred = new Set(preds.map(function (p) { return p.user_id + "|" + p.match_id; }));
  const wasSent = new Set(sent.map(function (s) { return s.user_id + "|" + s.match_id; }));

  // agrupar suscripciones por usuario; un push por usuario y por ventana
  const byUser = {};
  subs.forEach(function (s) {
    const userSubs = byUser[s.user_id] = byUser[s.user_id] || [];
    if (userSubs.length < MAX_SUBSCRIPTIONS_PER_USER) userSubs.push(s);
  });

  let avisados = 0;
  for (const uid of Object.keys(byUser)) {
    const pending = soon.filter(function (m) { return !wasSent.has(uid + "|" + m.id); });
    if (!pending.length) continue;
    const missingPick = pending.some(function (m) { return !hasPred.has(uid + "|" + m.id); });
    const msg = pm.buildPush(pending, snap.teams, tallies, missingPick);
    const payload = pushPayload(msg.title, msg.body);
    console.log((DRY ? "[dry-run] " : "") + uid.slice(0, 8) + "… ← " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
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
      body: JSON.stringify(pending.map(function (m) { return { match_id: m.id, user_id: uid }; }))
    });
    avisados++;
  }
  console.log((DRY ? "[dry-run] " : "") + "Usuarios avisados: " + avisados);
})().catch(function (e) { console.error(e.message || e); process.exit(1); });
