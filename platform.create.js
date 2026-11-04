"use strict";

(() => {
  const parts = [
    "platform.create.parts/part-01.js",
    "platform.create.parts/part-02.js",
    "platform.create.parts/part-03.js",
    "platform.create.parts/part-04.js",
    "platform.create.parts/part-05.js",
    "platform.create.parts/part-06.js",
  ];
  const currentScript = document.currentScript;
  const baseUrl = currentScript?.src || "./platform.create.js";
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
