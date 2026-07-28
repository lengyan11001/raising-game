(() => {
  "use strict";

  if (!("PerformanceObserver" in window) || /bot|crawler|spider|lighthouse/i.test(navigator.userAgent || "")) return;

  const pageId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const metrics = { LCP: null, INP: null, CLS: 0 };
  const interactionDurations = new Map();
  let clsWindowValue = 0;
  let clsWindowStart = 0;
  let clsWindowEnd = 0;
  let sent = false;

  function observe(type, callback, options = {}) {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true, ...options });
      return observer;
    } catch {
      return null;
    }
  }

  observe("largest-contentful-paint", (entries) => {
    const entry = entries.at(-1);
    if (entry) metrics.LCP = entry.startTime;
  });

  observe("layout-shift", (entries) => {
    entries.forEach((entry) => {
      if (entry.hadRecentInput) return;
      const startsNewWindow = !clsWindowStart
        || entry.startTime - clsWindowEnd > 1000
        || entry.startTime - clsWindowStart > 5000;
      if (startsNewWindow) {
        clsWindowStart = entry.startTime;
        clsWindowValue = entry.value;
      } else {
        clsWindowValue += entry.value;
      }
      clsWindowEnd = entry.startTime;
      metrics.CLS = Math.max(metrics.CLS, clsWindowValue);
    });
  });

  observe("event", (entries) => {
    entries.forEach((entry) => {
      if (!entry.interactionId || !Number.isFinite(entry.duration)) return;
      interactionDurations.set(
        entry.interactionId,
        Math.max(interactionDurations.get(entry.interactionId) || 0, entry.duration),
      );
    });
    const values = [...interactionDurations.values()].sort((a, b) => b - a);
    if (values.length) metrics.INP = values[Math.min(values.length - 1, Math.floor(values.length / 50))];
  }, { durationThreshold: 40 });

  function deviceClass() {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    if (coarse && Math.min(screen.width, screen.height) >= 600) return "tablet";
    if (coarse || window.innerWidth < 768) return "mobile";
    return "desktop";
  }

  function report() {
    if (sent) return;
    const samples = Object.entries(metrics)
      .filter(([metric, value]) => Number.isFinite(value) && (metric === "CLS" || value > 0))
      .map(([metric, value]) => ({ metric, value: Math.round(value * 1000) / 1000 }));
    if (!samples.length) return;
    sent = true;
    const navigation = performance.getEntriesByType?.("navigation")?.[0];
    const payload = JSON.stringify({
      pageId,
      pagePath: `${window.location.pathname}${window.location.hash}`,
      device: deviceClass(),
      navigationType: navigation?.type || "navigate",
      samples,
    });
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        "/api/analytics/web-vitals",
        new Blob([payload], { type: "application/json" }),
      );
      if (accepted) return;
    }
    fetch("/api/analytics/web-vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") report();
  }, { capture: true });
  window.addEventListener("pagehide", report, { capture: true });
  window.setTimeout(report, 30000);
})();
