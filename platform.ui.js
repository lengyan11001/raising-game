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
  // Never use document.write: parser-blocking writes delay first paint and
  // hide the rest of the document from the browser's preload scanner.
  sources.forEach((src) => {
    const script = document.createElement("script");
    script.src = src;
    // async=false keeps the source order without blocking HTML parsing.
    script.async = false;
    script.onerror = () => console.error("Failed to load " + src);
    document.head.appendChild(script);
  });
})();
