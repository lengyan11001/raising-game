(() => {
  const chunkFiles = [
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
    "platform.workflow-canvases.js",
    "platform.explore.js",
    "platform.cases.js",
    "platform.chat.js",
    "platform.create.parts/part-01.js",
    "platform.create.parts/part-02.js",
    "platform.create.parts/part-03.js",
    "platform.create.parts/part-04.js",
    "platform.create.parts/part-05.js",
    "platform.create.parts/part-06.js",
    "platform.video-tools.js",
    "platform.undress-tool.js",
    "platform.main.js",
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
  const chunkSources = chunkFiles.map((file) => {
    const url = new URL(file, baseUrl);
    url.search = cacheSuffix;
    return url.toString();
  });

  function loadChunks() {
    chunkSources.forEach((src) => {
      const script = document.createElement("script");
      script.src = src;
      // Preserve source order without blocking the HTML parser.
      script.async = false;
      script.onerror = () => console.error("Failed to load " + src);
      document.head.appendChild(script);
    });
  }

  // Never use document.write here: parser-blocking writes delay first paint and
  // prevent the browser from discovering the rest of the page resources early.
  // Start ordered chunk downloads as soon as this loader executes instead of
  // waiting for DOMContentLoaded; async=false still preserves execution order.
  loadChunks();
})();
