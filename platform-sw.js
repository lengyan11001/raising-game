"use strict";

(() => {
  const version = new URL(self.location.href).searchParams.get("v") || "dev";
  const cacheName = `vipeak-platform-shell-${version}`;
  const cacheableAsset = /^\/(?:platform(?:\.|$)|vendor\/lucide-|chat-live\.js$)/;

  self.addEventListener("install", (event) => {
    // Do not preload the shell or module manifest during install. Navigation and
    // chunks are cached by the fetch handler after the page requests them once.
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith("vipeak-platform-shell-") && key !== cacheName)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    })());
  });

  async function refresh(cache, request, key = request) {
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok) await cache.put(key, response.clone());
    } catch (error) {}
  }

  function isPlatformAsset(pathname) {
    return cacheableAsset.test(pathname) && /^\/platform/.test(pathname);
  }

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

    if (request.mode === "navigate") {
      const key = url.pathname === "/" || url.pathname === "/platform.html" ? "/" : request;
      event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        // Painted shell first: public-origin TCP/TLS stalls must not hold an
        // already-cached refresh hostage. Revalidate in the background so a
        // deployment is picked up on the next navigation.
        const cached = await cache.match(key, { ignoreSearch: true });
        if (cached) {
          event.waitUntil(refresh(cache, request, key));
          return cached;
        }
        try {
          const response = await fetch(request, { cache: "no-cache" });
          if (response.ok) await cache.put(key, response.clone());
          return response;
        } catch (error) {
          return Response.error();
        }
      })());
      return;
    }

    if (!cacheableAsset.test(url.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      // Platform assets carry the server-rendered content-hash query string,
      // so a cached entry for this exact URL is safe to use immediately. A
      // background refresh also populates the next deploy's URLs when visited.
      if (isPlatformAsset(url.pathname)) {
        const cached = await cache.match(request);
        if (cached) {
          event.waitUntil(refresh(cache, request));
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch (error) {
          return Response.error();
        }
      }
      const cached = await cache.match(request);
      if (cached) {
        event.waitUntil(refresh(cache, request));
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  });
})();
