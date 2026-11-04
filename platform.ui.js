"use strict";

(() => {
  const parts = [
    "platform.ui.parts/part-01.js",
    "platform.ui.parts/part-02.js",
    "platform.ui.parts/part-03.js",
    "platform.ui.parts/part-04.js",
    "platform.ui.parts/part-05.js",
    "platform.ui.parts/part-06.js",
    "platform.ui.parts/part-07.js",
  ];
  const currentScript = document.currentScript;
  const baseUrl = currentScript?.src || "./platform.ui.js";
  const cacheSuffix = (() => {
    try {
      return new URL(baseUrl, window.location.href).search || "";
    } catch {
      return "";
    }
  })();
  const sources = parts.map((file) => {
    const url = new URL(file, baseUrl);
    url.search = cacheSuffix;
    return url.toString();
  });
  if (document.readyState === "loading") {
    document.write(sources.map((src) => `<script src="${src}"><\/script>`).join(""));
    return;
  }
  sources
    .reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(script);
    })), Promise.resolve())
    .catch((error) => setTimeout(() => { throw error; }, 0));
})();
