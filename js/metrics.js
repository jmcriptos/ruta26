/* Analytics propio, mínimo y sin cookies: registra "sección vista" en Supabase
   (tabla page_views). Sin identidad: session_id aleatorio por pestaña, sin IP
   ni user agent completo. Respeta Do Not Track. Depende de config.js. */
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
  } catch (e) { sid = "anon"; }

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

  let lastSection = null;
  function track(section) {
    section = (section || "#inicio").slice(0, 40);
    if (section === lastSection) return;
    lastSection = section;
    try {
      fetch(cfg.SUPABASE_URL + "/rest/v1/page_views", {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ session_id: sid, section: section, device: device, standalone: standalone, ref: ref })
      }).catch(function () {});
    } catch (e) {}
  }

  track(location.hash);
  window.addEventListener("hashchange", function () { track(location.hash); });
})();
