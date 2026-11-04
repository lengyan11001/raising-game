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

  if (document.readyState === "loading") {
    document.write(chunkSources.map((src) => `<script src="${src}"><\/script>`).join(""));
    return;
  }

  chunkSources
    .reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(script);
    })), Promise.resolve())
    .catch((error) => setTimeout(() => { throw error; }, 0));
})();
