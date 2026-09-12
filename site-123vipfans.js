"use strict";

// Landing interactions for the 123vip.fans site profile. Loaded only for that
// host (server side) and inert everywhere else.
(function () {
  const PROFILE = "custom-workflow";
  const AUTOPLAY_MS = 5500;
  let initialized = false;

  function siteProfile() {
    const features = window.__TENANT_FEATURES__;
    return features && typeof features === "object" ? String(features.siteProfile || "") : "";
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function initWelcomeLanding() {
    if (initialized) return;
    const panel = document.querySelector('[data-panel="home"]');
    if (!panel) return;
    if (siteProfile() !== PROFILE && !document.body.classList.contains("site-custom-workflow")) return;
    initialized = true;

    // ----- sticky nav state -----
    const nav = document.getElementById("welcomeNav");
    const syncNav = () => {
      if (!nav) return;
      nav.classList.toggle("is-scrolled", (window.scrollY || 0) > 24);
    };
    window.addEventListener("scroll", syncNav, { passive: true });
    syncNav();

    // ----- anchors / tab switches -----
    panel.querySelectorAll("[data-w-anchor]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = document.getElementById(link.dataset.wAnchor || "");
        if (target) target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      });
    });
    panel.querySelectorAll("[data-w-scroll]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.wScroll || "");
        if (target) target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      });
    });
    panel.querySelectorAll("[data-w-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.wTab || "";
        if (tab && typeof setTab === "function") setTab(tab);
      });
    });

    // ----- pointer spotlight on the hero -----
    const hero = document.getElementById("wHero");
    if (hero && !reducedMotion()) {
      let frame = 0;
      let px = 0;
      let py = 0;
      hero.addEventListener("pointermove", (event) => {
        const rect = hero.getBoundingClientRect();
        px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
        py = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
        hero.classList.add("is-pointing");
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          hero.style.setProperty("--w-mx", px.toFixed(2) + "%");
          hero.style.setProperty("--w-my", py.toFixed(2) + "%");
        });
      });
      hero.addEventListener("pointerleave", () => hero.classList.remove("is-pointing"));
    }

    // ----- scroll reveal -----
    const revealed = panel.querySelectorAll(".w-reveal");
    if ("IntersectionObserver" in window && !reducedMotion()) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
      revealed.forEach((element) => observer.observe(element));
    } else {
      revealed.forEach((element) => element.classList.add("is-visible"));
    }

    // ----- template carousel -----
    const carousel = document.getElementById("wCarousel");
    if (carousel) {
      const slides = Array.from(carousel.querySelectorAll(".w-slide"));
      const dotsHolder = carousel.querySelector(".w-car-dots");
      let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
      let timer = 0;

      const dots = slides.map((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", "Slide " + (i + 1));
        dot.addEventListener("click", () => go(i, true));
        if (dotsHolder) dotsHolder.appendChild(dot);
        return dot;
      });

      function apply() {
        slides.forEach((slide, i) => {
          const offset = (i - index + slides.length) % slides.length;
          slide.classList.toggle("is-active", offset === 0);
          slide.classList.toggle("is-prev", offset === slides.length - 1);
          slide.classList.toggle("is-next", offset === 1);
        });
        dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
      }

      function go(next, fromUser) {
        index = (next + slides.length) % slides.length;
        apply();
        if (fromUser) restart();
      }

      function restart() {
        if (timer) window.clearInterval(timer);
        if (reducedMotion()) return;
        timer = window.setInterval(() => go(index + 1, false), AUTOPLAY_MS);
      }

      carousel.querySelectorAll("[data-w-car]").forEach((button) => {
        button.addEventListener("click", () => {
          go(index + (button.dataset.wCar === "prev" ? -1 : 1), true);
        });
      });
      carousel.addEventListener("mouseenter", () => { if (timer) window.clearInterval(timer); timer = 0; });
      carousel.addEventListener("mouseleave", restart);
      carousel.addEventListener("focusin", () => { if (timer) window.clearInterval(timer); timer = 0; });
      carousel.addEventListener("focusout", restart);
      carousel.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") go(index - 1, true);
        if (event.key === "ArrowRight") go(index + 1, true);
      });

      let startX = 0;
      carousel.addEventListener("pointerdown", (event) => { startX = event.clientX; });
      carousel.addEventListener("pointerup", (event) => {
        const delta = event.clientX - startX;
        if (Math.abs(delta) > 42) go(index + (delta < 0 ? 1 : -1), true);
      });

      apply();
      restart();
    }

    const year = document.getElementById("welcomeYear");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWelcomeLanding, { once: true });
  } else {
    initWelcomeLanding();
  }
})();
