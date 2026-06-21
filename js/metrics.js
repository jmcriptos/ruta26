/* Analytics propio, mínimo y sin cookies: registra "sección vista" mediante
   un RPC validado y limitado. Sin identidad: session_id aleatorio por pestaña,
   sin IP ni user agent completo. Respeta Do Not Track. Depende de config.js. */
(function () {
  const cfg = (window.WC && WC.CONFIG) || {};
  if (!cfg.SUPABASE_URL || String(cfg.SUPABASE_URL).indexOf("http") !== 0) return;
  if (navigator.doNotTrack === "1") return;

  let sid;
  try {
    sid = sessionStorage.getItem("wc26-sid");
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
      sessionStorage.setItem("wc26-sid", sid);
    }
  } catch (e) { sid = "fallback-" + String(Math.random()).slice(2, 24); }

  // ---- Eventos de engagement (allowlist, sin PII, no bloqueante) ----
  // Cada evento solo admite los campos listados (enums cortos); nada de nombres,
  // texto libre ni pronósticos. Ver docs/architecture/data-contracts.md.
  const ALLOWED_EVENTS = {
    opportunity_viewed: ["state", "reason"],
    opportunity_cta_clicked: ["reason"],
    prediction_submitted: ["stage"],
    locked_predictions_viewed: [],
    live_ranking_viewed: ["has_personal_impact"],
    post_match_summary_viewed: ["movement"],
    share_summary_clicked: ["channel"],
    whatsapp_copy_clicked: [],
    push_prompt_seen: [], push_enabled: [], push_dismissed: [], push_reminder_clicked: ["reason"]
  };
  function sanitizeEvent(event, fields) {
    const allowed = ALLOWED_EVENTS[event];
    if (!allowed) return null;
    const out = {};
    if (fields && typeof fields === "object") {
      allowed.forEach(function (k) {
        if (fields[k] == null) return;
        if (typeof fields[k] === "boolean" || typeof fields[k] === "number") out[k] = fields[k];
        else out[k] = String(fields[k]).slice(0, 40);
      });
    }
    return { event: event, fields: out };
  }
  const sentViews = {};
  function trackEvent(event, fields) {
    try {
      if (navigator.doNotTrack === "1") return;
      if (!cfg.SUPABASE_URL || String(cfg.SUPABASE_URL).indexOf("http") !== 0) return;
      const ev = sanitizeEvent(event, fields);
      if (!ev) return;
      // los eventos de "vista" se mandan una sola vez por contexto (evita spam en re-render)
      if (/_viewed$|_seen$/.test(event)) {
        const key = event + ":" + JSON.stringify(ev.fields);
        if (sentViews[key]) return;
        sentViews[key] = true;
      }
      fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/record_engagement_event", {
        method: "POST", keepalive: true,
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ p_session_id: sid, p_event: ev.event, p_fields: ev.fields })
      }).catch(function () {});
    } catch (e) {}
  }
  window.WC = window.WC || {};
  window.WC.metrics = { track: trackEvent, sanitizeEvent: sanitizeEvent, ALLOWED_EVENTS: ALLOWED_EVENTS };

  const device = window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop";
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  let ref = "";
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== location.hostname) ref = host.slice(0, 80);
    }
  } catch (e) {}

  // País (agregado, sin IP): Cloudflare resuelve la IP y nos da solo el código
  // ISO-2. Lo cacheamos por sesión y lo enviamos como p_country.
  let country = "";
  function resolveCountry(cb) {
    let cached = "";
    try { cached = sessionStorage.getItem("wc26-country") || ""; } catch (e) {}
    if (cached) { country = cached === "-" ? "" : cached; cb(); return; }
    fetch("https://www.cloudflare.com/cdn-cgi/trace", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        const m = t.match(/^loc=([A-Z]{2})$/m);
        country = m ? m[1] : "";
        try { sessionStorage.setItem("wc26-country", country || "-"); } catch (e) {}
        cb();
      })
      .catch(function () { cb(); });
  }

  let lastSection = null;
  function track(section) {
    section = (section || "#inicio").slice(0, 40);
    if (section === lastSection) return;
    lastSection = section;
    try {
      fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/record_page_view", {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          p_session_id: sid,
          p_section: section,
          p_device: device,
          p_standalone: standalone,
          p_ref: ref,
          p_country: country
        })
      }).catch(function () {});
    } catch (e) {}
  }

  // Resolver país antes del primer registro; si tarda o falla, registrar igual.
  let firstTracked = false;
  function firstTrack() {
    if (firstTracked) return;
    firstTracked = true;
    track(location.hash);
  }
  resolveCountry(firstTrack);
  setTimeout(firstTrack, 1500);
  window.addEventListener("hashchange", function () { track(location.hash); });
})();
