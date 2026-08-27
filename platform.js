(() => {
  const chunkFiles = [
    "platform.config.js",
    "platform.copy.js",
    "platform.ui.js",
    "platform.telegram.js",
    "platform.google.js",
    "platform.workflow-canvases.js",
    "platform.explore.js",
    "platform.chat.js",
    "platform.create.js",
    "platform.video-tools.js",
    "platform.undress-tool.js",
    "platform.main.js",
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
