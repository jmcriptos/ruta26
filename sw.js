/* Service worker de Ruta 26: solo notificaciones push. Sin caché — los assets
   se versionan con ?v= y el navegador maneja su propia caché. */

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

function safeNavigationUrl(value) {
  const scope = new URL(self.registration.scope);
  const fallback = new URL("./#quiniela", scope);
  try {
    const url = new URL(value || fallback.href, scope);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname) ? url.href : fallback.href;
  } catch (e) {
    return fallback.href;
  }
}

self.addEventListener("push", function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  // payload declarativo ({web_push, notification}) o plano ({title, body, url})
  const n = data.notification || data;
  event.waitUntil(self.registration.showNotification(n.title || "Quiniela Ruta 26", {
    body: n.body || "",
    icon: "favicon.png",
    badge: "favicon.png",
    lang: "es",
    data: { url: safeNavigationUrl(n.navigate || n.url) }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = safeNavigationUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (let i = 0; i < list.length; i++) {
      if ("focus" in list[i]) {
        // app ya abierta: avisarle a la página para que se desplace a la quiniela
        // (navigate() desde el SW no es confiable en iOS standalone)
        list[i].postMessage({ type: "open-quiniela" });
        return list[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
