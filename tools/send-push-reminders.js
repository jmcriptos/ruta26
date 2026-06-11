/* Recordatorios push de la quiniela. Corre en GitHub Actions cada 15 min:
   busca partidos que empiezan en la próxima hora y avisa a los suscriptores
   que aún no tienen predicción. Dedupe vía tabla push_sent (PK match+user).

   Env: SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
        DRY_RUN=1 → solo lista, no envía ni registra. */

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://wwzgpifvfmogjttwstxy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.env.DRY_RUN === "1";
const SITE = "https://jmcriptos.github.io/ruta26/";
const WINDOW_MS = 60 * 60 * 1000; // 1 hora antes del kickoff

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
  // Modo prueba: TEST_USERNAME=<usuario> manda un push de prueba a ese usuario y termina.
  if (process.env.TEST_USERNAME) {
    const uname = process.env.TEST_USERNAME.trim().toLowerCase();
    const prof = await rest("profiles?select=id,username&username=eq." + encodeURIComponent(uname));
    if (!prof.length) { console.error("No existe el usuario " + uname); process.exit(1); }
    const subs = validSubscriptions(await rest("push_subscriptions?select=endpoint,p256dh,auth&user_id=eq." + prof[0].id));
    if (!subs.length) { console.error(uname + " no tiene suscripciones push activas."); process.exit(1); }
    const payload = pushPayload("🔔 Prueba de recordatorios",
      "Así te avisaremos una hora antes si te falta un pick. ¡Todo listo! ✓");
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        console.log("Prueba enviada a " + uname + " (" + s.endpoint.slice(0, 40) + "…)");
      } catch (e) { console.error("Error " + (e.statusCode || "") + ": " + (e.body || e.message)); }
    }
    return;
  }

  const snap = snapshot();
  const now = Date.now();
  const soon = snap.matches.filter(function (m) {
    const t = new Date(m.date).getTime();
    return t > now && t <= now + WINDOW_MS;
  });
  if (!soon.length) { console.log("Sin partidos en la próxima hora."); return; }
  console.log("Partidos próximos: " + soon.map(function (m) { return m.id; }).join(", "));

  const subs = validSubscriptions(await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth"));
  if (!subs.length) { console.log("Sin suscriptores."); return; }
  const ids = soon.map(function (m) { return m.id; }).join(",");
  const preds = await rest("predictions?select=user_id,match_id&match_id=in.(" + ids + ")");
  const sent = await rest("push_sent?select=user_id,match_id&match_id=in.(" + ids + ")");
  const hasPred = new Set(preds.map(function (p) { return p.user_id + "|" + p.match_id; }));
  const wasSent = new Set(sent.map(function (s) { return s.user_id + "|" + s.match_id; }));

  const teamTxt = function (id) {
    const t = snap.teams[id];
    return t ? t.flag + " " + t.name : null;
  };
  const horaTxt = function (iso) {
    return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Curacao" })
      .format(new Date(iso)).replace(/ /g, " ");
  };

  // agrupar suscripciones por usuario; un aviso por usuario aunque falten varios partidos
  const byUser = {};
  subs.forEach(function (s) {
    (byUser[s.user_id] = byUser[s.user_id] || []).push(s);
  });

  let avisados = 0;
  for (const uid of Object.keys(byUser)) {
    const missing = soon.filter(function (m) {
      return !hasPred.has(uid + "|" + m.id) && !wasSent.has(uid + "|" + m.id);
    });
    if (!missing.length) continue;
    const first = missing[0];
    const vs = teamTxt(first.home) && teamTxt(first.away)
      ? teamTxt(first.home) + " vs " + teamTxt(first.away)
      : "El partido";
    const body = missing.length === 1
      ? vs + " empieza a las " + horaTxt(first.date) + " y aún no pones tu predicción."
      : "Te faltan picks para " + missing.length + " partidos que empiezan pronto. El primero a las " + horaTxt(first.date) + ".";
    const payload = pushPayload("⚽ ¡Te falta tu pick!", body);
    console.log((DRY ? "[dry-run] " : "") + uid.slice(0, 8) + "… ← " + body);
    if (DRY) { avisados++; continue; }

    for (const s of byUser[uid]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          // suscripción muerta: limpiarla
          await rest("push_subscriptions?user_id=eq." + uid + "&endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
          console.log("  suscripción expirada eliminada");
        } else {
          console.error("  error de envío: " + (e.statusCode || e.message));
        }
      }
    }
    await rest("push_sent", {
      method: "POST",
      body: JSON.stringify(missing.map(function (m) { return { match_id: m.id, user_id: uid }; }))
    });
    avisados++;
  }
  console.log((DRY ? "[dry-run] " : "") + "Usuarios avisados: " + avisados);
})().catch(function (e) { console.error(e.message || e); process.exit(1); });
