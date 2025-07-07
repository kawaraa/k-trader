// self.importScripts('foo.js', 'bar.js');
const staticFileCacheName = "static-files-v-0xbcy2ye7y3ubfhwvdtw1tye984it0y45pl";
const staticFileCachePaths = [
  "/offline.html",
  "/manifest.json",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon.ico",
  "/desktop-screenshot.png",
  "/android-chrome-512x512.png",
  "/android-chrome-192x192.png",
  "/apple-touch-icon.png",
  "/login/",
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(staticFileCacheName).then((cache) => cache.addAll(staticFileCachePaths)));
  self.skipWaiting();
});

self.addEventListener("activate", async (evt) => {
  console.log(staticFileCacheName);
  evt.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => key !== staticFileCacheName && caches.delete(key))))
  );
});

self.addEventListener("fetch", (evt) => evt.respondWith(handleRequest(evt.request)));

self.addEventListener("push", (event) => {
  const customPayload = {
    title: "New notification from K-Trader",
    body: "Open K-trader app to see it!",
    url: "/",
  };
  const payload = event.data?.json() || customPayload;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/android-chrome-192x192.png",
      // badge: "/icons/badge.png",
      vibrate: [200, 100, 200],
      data: { url: `${self.location.origin}${payload.url || customPayload.url}` }, // Optional: URL to open when clicked
    })
  );
  // new Audio("/bell-notification-sound.mp3").play().catch((e) => console.log(e));
  // Todo: cache "-sound.mp3" and Keep the sound file small (<100 KB) to avoid performance issues
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});

const handleRequest = async (request) => {
  // console.log("Received request:>>>", navigator.onLine, request.method, request.url);
  const networkErrorResponse = Response.error();
  try {
    if (
      !request.url.includes("http") ||
      !["GET", "HEAD"].includes(request.method) ||
      /api|api\/auth|api\/users/gim.test(request.url)
    ) {
      return fetch(request);
    } else {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      else if (!navigator.onLine) {
        const res = await caches.match(request.url);
        if (res) return res;
      }

      const response = await fetch(request);
      if (!response.ok) return response;

      const cache = await caches.open(staticFileCacheName);
      await cache.put(request, response.clone()).catch(() => null);
      // Ignore the error in case the responses can not be cached or is not supported in cashing like "POST", "PUT" and responses with 206 status code
      return response;
    }
  } catch (error) {
    // console.log("caches ERROR: >>>", request.method, request.url, error);
    if (request.method == "GET" && (request.mode == "navigate" || !request.url.includes("api"))) {
      return caches.match(staticFileCachePaths[0]); // offline fallback page
    }
  }
  return networkErrorResponse;
};
