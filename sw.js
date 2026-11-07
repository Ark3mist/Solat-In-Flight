// Caches the app so it opens with no connection (after one online visit).
const CACHE = "solat-flight-v40";
const FILES = ["./", "index.html", "airports.js", "solat.js", "world.js", "globe.js", "world50.js", "ofp.js", "wmm.js", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  // cache each file on its own, so one missing file cannot stop the app installing
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(FILES.map((f) => c.add(new Request(f, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates arrive when online), cache when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).pathname.endsWith("/version.json")) return;   // always ask the network
  if (new URL(e.request.url).origin !== location.origin) return;           // analytics and other sites: not cached
  e.respondWith(
    // revalidate with the server every time (GitHub Pages lets browsers reuse files for 10 min otherwise)
    (new URL(e.request.url).origin === location.origin ? fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(e.request))
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
