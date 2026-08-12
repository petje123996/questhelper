// Minimal service worker whose only job is to let gem-crab-timer show
// notifications via ServiceWorkerRegistration.showNotification(). Mobile
// browsers (Android Chrome in particular) reject the plain `new
// Notification()` constructor from a page context, so a registered worker
// is required even though nothing here needs to run in the background.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/gem-crab-timer");
    })
  );
});
