"use strict";

(() => {
  const version = new URL(self.location.href).searchParams.get("v") || "dev";
  const cacheName = `vipeak-platform-shell-${version}`;
  const shellUrls = ["/", "/platform.html", "/platform.css", "/platform.js", "/platform.vitals.js"];
  const cacheableAsset = /^\/(?:platform(?:\.|$)|vendor\/lucide-|chat-live\.js$)/;

  self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      await Promise.all(shellUrls.map(async (url) => {
        try {
          const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
          if (response.ok) await cache.put(url, response);
        } catch (error) {}
      }));
      await self.skipWaiting();
    })());
  });

  self.addEventListener("message", (event) => {
    if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      await Promise.all(event.data.urls.map(async (url) => {
        try {
          if (await cache.match(url)) return;
          const response = await fetch(url, { credentials: "same-origin" });
          if (response.ok) await cache.put(url, response);
        } catch (error) {}
      }));
    })());
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
      const response = await fetch(request);
      if (response.ok) await cache.put(key, response.clone());
    } catch (error) {}
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
        const cached = await cache.match(key, { ignoreSearch: true });
        if (cached) {
          event.waitUntil(refresh(cache, request, key));
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(key, response.clone());
          return response;
        } catch (error) {
          return cached || Response.error();
        }
      })());
      return;
    }

    if (!cacheableAsset.test(url.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
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
