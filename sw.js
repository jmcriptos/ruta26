/* Service worker de Ruta 26: solo notificaciones push. Sin caché — los assets
   se versionan con ?v= y el navegador maneja su propia caché. */

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || "Quiniela Ruta 26", {
    body: data.body || "",
    icon: "favicon.png",
    badge: "favicon.png",
    lang: "es",
    data: { url: data.url || "./#quiniela" }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./#quiniela";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (let i = 0; i < list.length; i++) {
      if ("focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
