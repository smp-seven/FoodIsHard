// FoodIsHard offline copy (online version only; the Home Assistant app never registers this).
// Keeps the app's own files on the phone so it opens without signal. Each version's files are
// kept together and never mixed: a new version downloads in the background, then waits until
// you press "Update now" in Settings (or the app is fully closed and reopened). Household data isn't
// cached here: the app already keeps the latest plan and list on the phone, and queues
// ticks until it's back online.
const VERSION = "foodishard-0.10.5";
const SHELL = [
  "./", "index.html", "style.css", "ops.js", "core.js", "ui.js",
  "data/recipes.json", "data/ingredients.json", "data/defaults.json",
  "manifest.webmanifest", "favicon.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "fonts/fraunces-600.woff2", "fonts/inter-regular.woff", "fonts/inter-medium.woff", "fonts/inter-semibold.woff", "fonts/inter-bold.woff",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Fetch each file ourselves so a sign-in redirect is never stored as the app.
    await Promise.all(SHELL.map(async (path) => {
      try {
        const res = await fetch(path, { cache: "no-store", redirect: "manual" });
        if (res.ok) await cache.put(path === "./" ? "index.html" : path, res);
      } catch { /* offline during install: it'll fill in later */ }
    }));
  })());
});

// "Update now" in Settings: switch to the new version straight away.
self.addEventListener("message", (event) => { if (event.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/") || url.pathname.endsWith("/whatsnew.json")) return; // always live

  // Opening the app: try the network (which also handles signing in), fall back to the copy.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req); // the copy saved at install stays as this version's offline fallback
      } catch {
        return (await caches.match("index.html", { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // App files: this version's copy. Anything missing (e.g. offline during install) comes from the network.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = url.pathname.replace(/^\//, "") || "index.html";
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const res = await fetch(req, { redirect: "manual" });
      if (res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    } catch { return Response.error(); }
  })());
});
