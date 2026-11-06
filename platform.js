(() => {
  const criticalChunkFiles = [
    "platform.config.js",
    "platform.vega-media.js",
    "platform.copy.js",
    "platform.ui.parts/part-01.js",
    "platform.ui.parts/part-02.js",
    "platform.ui.parts/part-03.js",
    "platform.ui.parts/part-04.js",
    "platform.ui.parts/part-05.js",
    "platform.ui.parts/part-06.js",
    "platform.ui.parts/part-07.js",
    "platform.telegram.js",
    "platform.google.js",
    "platform.explore.js",
    "platform.cases.js",
    "platform.chat.js",
    "platform.create.parts/part-01.js",
    "platform.create.parts/part-02.js",
    "platform.create.parts/part-03.js",
    "platform.create.parts/part-04.js",
    "platform.create.parts/part-05.js",
    "platform.create.parts/part-06.js",
    "platform.main.js",
  ];
  // These modules are only needed after the user opens a non-gallery tool.
  // Downloading and parsing them during initial paint made refresh feel slow.
  const deferredChunkFiles = [
    "platform.workflow-canvases.js",
    "platform.video-tools.js",
    "platform.undress-tool.js",
    "chat-live.js",
  ];
  const currentScript = document.currentScript;
  const baseUrl = currentScript?.src || "./platform.js";
  const cacheSuffix = (() => {
    try {
      return new URL(baseUrl, window.location.href).search || "";
    } catch {
      return "";
    }
  })();
  function sourceFor(file) {
    const url = new URL(file, baseUrl);
    url.search = cacheSuffix;
    return url.toString();
  }

  function appendChunks(files) {
    return Promise.all(files.map((file) => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sourceFor(file);
      // Preserve source order without blocking the HTML parser.
      script.async = false;
      script.onload = () => resolve(script.src);
      script.onerror = () => {
        console.error("Failed to load " + script.src);
        reject(new Error("Failed to load " + script.src));
      };
      document.head.appendChild(script);
    })));
  }

  // Never use document.write here: parser-blocking writes delay first paint and
  // prevent the browser from discovering the rest of the page resources early.
  // Start only the shell-critical chunks immediately. async=false preserves
  // their execution order while still allowing the HTML parser to continue.
  appendChunks(criticalChunkFiles).catch(() => {});

  let deferredLoadPromise = null;
  const loadDeferredChunks = () => {
    if (deferredLoadPromise) return deferredLoadPromise;
    deferredLoadPromise = appendChunks(deferredChunkFiles).then(() => {
      window.dispatchEvent(new CustomEvent("platform-deferred-ready"));
    }).catch((error) => {
      // Keep the failed promise visible to explicit click handlers, but let
      // the page remain usable if an optional module cannot be downloaded.
      console.error("Deferred platform modules failed", error.message || error);
      throw error;
    });
    return deferredLoadPromise;
  };
  window.PlatformDeferredModules = { load: loadDeferredChunks };
  window.addEventListener("load", () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => loadDeferredChunks().catch(() => {}), { timeout: 1200 });
    } else {
      window.setTimeout(() => loadDeferredChunks().catch(() => {}), 250);
    }
  }, { once: true });

  // Icons are decorative and must not compete with the first screen for parse
  // time. Load them after the page load event, then hydrate the existing DOM.
  const loadIcons = () => {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
      return;
    }
    const script = document.createElement("script");
    script.src = sourceFor("vendor/lucide-1.27.0.min.js");
    script.async = true;
    script.onload = () => window.lucide?.createIcons?.();
    script.onerror = () => console.warn("Failed to load icons");
    document.head.appendChild(script);
  };
  window.addEventListener("load", () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(loadIcons, { timeout: 1000 });
    } else {
      window.setTimeout(loadIcons, 200);
    }
  }, { once: true });

  // A stale-while-revalidate service worker makes repeat refreshes paint from
  // the local shell immediately. It never intercepts API requests or account
  // data, and it is only an optimisation fallback when the browser supports it.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = new URL("platform-sw.js", baseUrl);
      swUrl.search = cacheSuffix;
      navigator.serviceWorker.register(swUrl.toString(), {
        scope: new URL("./", baseUrl).pathname,
        updateViaCache: "none",
      })
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const urls = [...criticalChunkFiles, ...deferredChunkFiles, "vendor/lucide-1.27.0.min.js"]
            .map((file) => sourceFor(file));
          registration.active?.postMessage({ type: "precache", urls });
        })
        .catch((error) => console.warn("service worker registration failed", error.message || error));
    }, { once: true });
  }
})();
