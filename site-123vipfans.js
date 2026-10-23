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

    // ----- hero clip reel -----
    // The hero frame plays a rotation of short clips instead of a still mock.
    // Only the current clip decodes, and the whole reel stays on its poster
    // when motion is unwelcome until the visitor asks for it.
    const reel = document.getElementById("wFrameBody");
    if (reel) {
      const clips = Array.from(reel.querySelectorAll(".w-frame-video"));
      const segHolder = reel.querySelector(".w-reel-segs");
      const toggle = reel.querySelector('[data-w-reel="toggle"]');
      let clipIndex = Math.max(0, clips.findIndex((clip) => clip.classList.contains("is-active")));
      let stopped = reducedMotion();

      const segs = clips.map((_, i) => {
        const seg = document.createElement("button");
        seg.type = "button";
        seg.setAttribute("role", "tab");
        seg.setAttribute("aria-label", "Shot " + (i + 1));
        seg.addEventListener("click", () => showClip(i, true));
        if (segHolder) segHolder.appendChild(seg);
        return seg;
      });

      function paintClip() {
        clips.forEach((clip, i) => {
          const current = i === clipIndex;
          clip.classList.toggle("is-active", current);
          if (current && !stopped) {
            clip.preload = "auto";
            const played = clip.play();
            if (played && played.catch) played.catch(() => {});
          } else {
            try { clip.pause(); } catch (error) {}
          }
        });
        segs.forEach((seg, i) => seg.classList.toggle("is-active", i === clipIndex));
        if (toggle) {
          toggle.classList.toggle("is-paused", stopped);
          toggle.setAttribute("aria-pressed", stopped ? "true" : "false");
        }
      }

      function showClip(next, wake) {
        clipIndex = (next + clips.length) % clips.length;
        if (wake) stopped = false;
        paintClip();
      }

      clips.forEach((clip) => {
        clip.addEventListener("ended", () => {
          if (!stopped) showClip(clipIndex + 1, false);
        });
      });

      if (toggle) {
        toggle.addEventListener("click", () => {
          stopped = !stopped;
          paintClip();
        });
      }

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          clips.forEach((clip) => { try { clip.pause(); } catch (error) {} });
        } else {
          paintClip();
        }
      });

      paintClip();
    }

    // ----- case library -----
    const caseSection = document.getElementById("wCaseLibrary");
    if (caseSection) {
      const tabs = document.getElementById("wCaseTabs");
      const grid = document.getElementById("wCaseGrid");
      const search = document.getElementById("wCaseSearch");
      const count = document.getElementById("wCaseCount");
      const status = document.getElementById("wCaseStatus");
      const more = document.getElementById("wCaseMore");
      const dialog = document.getElementById("wCaseDialog");
      const dialogCategory = document.getElementById("wCaseDialogCategory");
      const dialogTitle = document.getElementById("wCaseDialogTitle");
      const dialogModel = document.getElementById("wCaseDialogModel");
      const dialogMedia = document.getElementById("wCaseDialogMedia");
      const dialogPrompt = document.getElementById("wCaseDialogPrompt");
      const dialogReference = document.getElementById("wCaseDialogReference");
      const dialogFacts = document.getElementById("wCaseDialogFacts");
      const dialogNote = document.getElementById("wCaseDialogNote");
      const copyButton = document.getElementById("wCaseCopy");
      const PAGE_SIZE = 24;
      const categoryOrder = ["image_gen", "i2v", "image_edit", "swap"];
      const categoryNames = {
        image_gen: "文生图",
        i2v: "图生视频",
        image_edit: "图像编辑",
        swap: "换脸 / 换头",
      };
      let cases = [];
      let category = "all";
      let query = "";
      let shown = PAGE_SIZE;
      let activeCase = null;
      let lastFocus = null;

      const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[character]));
      const language = () => String(document.documentElement.lang || "zh").toLowerCase().startsWith("en") ? "en" : "zh";
      const casePrompt = (item) => {
        const lang = language();
        return String(lang === "en" ? (item.prompt_en || item.prompt || item.prompt_zh) : (item.prompt_zh || item.prompt || item.prompt_en) || "");
      };
      const caseNote = (item) => {
        const lang = language();
        return String(lang === "en" ? (item.note_en || item.note || "") : (item.note_zh || item.note || "") || "");
      };
      const categoryLabel = (id) => {
        const found = categoryNames[id] || "";
        return found || (cases.find((item) => item.category === id)?.category_label || id || "案例");
      };
      const primaryOutput = (item) => (item.outputs || [])[0] || null;
      const primaryInput = (item) => (item.inputs || [])[0] || null;
      const cardPoster = (item) => {
        const output = primaryOutput(item);
        if (!output) return "";
        return output.poster || output.url || "";
      };
      const isVideo = (asset) => String(asset?.kind || "") === "video";
      const formatParam = (key, value) => {
        const labels = { resolution: "分辨率", ratio: "比例", duration: "时长", audio: "音频", prompt_extend: "提示词增强", seed: "种子" };
        if (value === true) value = "开启";
        if (value === false) value = "关闭";
        return `${labels[key] || key}：${value}`;
      };
      const modelLabel = (item) => {
        const raw = String(item.model_label || item.model_key || "");
        return raw.replace(/\s*\(([^)]+)\)\s*$/, (_, suffix) => " · " + suffix);
      };

      function renderTabs() {
        if (!tabs) return;
        const counts = { all: cases.length };
        cases.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });
        const ids = ["all", ...categoryOrder.filter((id) => counts[id])];
        tabs.innerHTML = ids.map((id) => {
          const label = id === "all" ? "全部案例" : categoryLabel(id);
          return `<button type="button" role="tab" aria-selected="${id === category}" class="${id === category ? "is-active" : ""}" data-w-case-tab="${escapeHtml(id)}">${escapeHtml(label)}<small>${counts[id]}</small></button>`;
        }).join("");
      }

      function filteredCases() {
        const needle = query.trim().toLowerCase();
        return cases.filter((item) => {
          if (category !== "all" && item.category !== category) return false;
          if (!needle) return true;
          return [casePrompt(item), item.prompt, item.model_label, item.model_key, ...(item.tags || [])]
            .join("\n").toLowerCase().includes(needle);
        });
      }

      function renderCards(reset) {
        if (!grid) return;
        if (reset) shown = PAGE_SIZE;
        const items = filteredCases();
        const visible = items.slice(0, shown);
        if (count) count.textContent = `共 ${items.length} 个案例`;
        if (status) status.textContent = query ? `搜索：${query}` : "";
        if (!visible.length) {
          grid.innerHTML = `<div class="w-case-empty">没有找到匹配的案例，换个关键词或分类试试。</div>`;
        } else {
          grid.innerHTML = visible.map((item) => {
            const output = primaryOutput(item);
            const poster = cardPoster(item);
            const prompt = casePrompt(item).replace(/\s+/g, " ").trim();
            const video = isVideo(output);
            const media = poster
              ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" decoding="async" />`
              : `<span class="w-case-empty">暂无预览</span>`;
            return `<button class="w-case-card" type="button" data-w-case-id="${item.id}" aria-label="查看案例 ${item.id}">
              <span class="w-case-thumb">${media}${video ? `<span class="w-case-play"><i data-lucide="play"></i></span>` : ""}<span class="w-case-kind">${video ? "视频" : "图片"}</span></span>
              <span class="w-case-body"><strong>${escapeHtml(modelLabel(item))}</strong><p>${escapeHtml(prompt || "查看提示词与参考素材")}</p><span>${escapeHtml(categoryLabel(item.category))} · ${escapeHtml(item.created_at_str || "")}</span></span>
            </button>`;
          }).join("");
        }
        if (more) more.hidden = items.length <= shown;
        if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
      }

      function mediaMarkup(asset, className, alt) {
        if (!asset) return "";
        if (isVideo(asset)) {
          return `<video class="${className}" src="${escapeHtml(asset.url)}" poster="${escapeHtml(asset.poster || "")}" controls playsinline preload="metadata"></video>`;
        }
        return `<img class="${className}" src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
      }

      function openCase(item) {
        if (!dialog || !item) return;
        activeCase = item;
        const output = primaryOutput(item);
        const inputs = item.inputs || [];
        lastFocus = document.activeElement;
        if (dialogCategory) dialogCategory.textContent = categoryLabel(item.category);
        if (dialogTitle) dialogTitle.textContent = modelLabel(item);
        if (dialogModel) dialogModel.textContent = item.category_label || categoryLabel(item.category);
        if (dialogMedia) {
          dialogMedia.innerHTML = `
            <div class="w-case-main-media">${mediaMarkup(output, "", "案例生成结果")}</div>
            ${inputs.length ? `<div class="w-case-inputs">${inputs.map((asset, index) => `<figure>${mediaMarkup(asset, "", `参考素材 ${index + 1}`)}<figcaption>${escapeHtml(asset.label || (isVideo(asset) ? `参考视频 ${index + 1}` : `参考图片 ${index + 1}`))}</figcaption></figure>`).join("")}</div>` : ""}
          `;
        }
        if (dialogPrompt) dialogPrompt.textContent = casePrompt(item) || "暂无提示词";
        if (dialogReference) {
          const refs = (item.tags || []).slice(0, 12);
          dialogReference.innerHTML = refs.length ? `<span>标签</span>${refs.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}` : "";
          dialogReference.hidden = !refs.length;
        }
        if (dialogFacts) {
          const facts = Object.entries(item.params || {}).filter(([, value]) => value !== "" && value != null).map(([key, value]) => formatParam(key, value));
          if (item.seed != null && !("seed" in (item.params || {}))) facts.push(formatParam("seed", item.seed));
          dialogFacts.innerHTML = facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("");
        }
        const note = caseNote(item);
        if (dialogNote) {
          dialogNote.textContent = note;
          dialogNote.hidden = !note;
        }
        if (copyButton) {
          copyButton.textContent = "复制";
          copyButton.dataset.wCaseCopy = "prompt";
        }
        if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
        document.body.classList.add("w-case-open");
      }

      function closeCase() {
        if (!dialog) return;
        dialog.querySelectorAll("video").forEach((video) => { try { video.pause(); } catch (error) {} });
        if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
        document.body.classList.remove("w-case-open");
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      }

      async function copyText(text) {
        try {
          await navigator.clipboard.writeText(String(text || ""));
          return true;
        } catch (error) {
          const field = document.createElement("textarea");
          field.value = String(text || "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          const copied = document.execCommand("copy");
          field.remove();
          return copied;
        }
      }

      tabs?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-w-case-tab]");
        if (!button) return;
        category = button.dataset.wCaseTab || "all";
        renderTabs();
        renderCards(true);
      });
      search?.addEventListener("input", () => {
        query = search.value || "";
        renderCards(true);
      });
      more?.addEventListener("click", () => {
        shown += PAGE_SIZE;
        renderCards(false);
      });
      grid?.addEventListener("click", (event) => {
        const card = event.target.closest("[data-w-case-id]");
        if (!card) return;
        const item = cases.find((candidate) => String(candidate.id) === card.dataset.wCaseId);
        openCase(item);
      });
      copyButton?.addEventListener("click", async () => {
        if (!activeCase) return;
        const copied = await copyText(casePrompt(activeCase));
        copyButton.textContent = copied ? "已复制" : "复制失败";
        window.setTimeout(() => { copyButton.textContent = "复制"; }, 1500);
      });
      dialog?.querySelectorAll("[data-w-case-close]").forEach((button) => button.addEventListener("click", closeCase));
      dialog?.addEventListener("click", (event) => { if (event.target === dialog) closeCase(); });
      dialog?.addEventListener("cancel", (event) => { event.preventDefault(); closeCase(); });

      fetch("./assets/showcase/spicy/cases.json", { credentials: "same-origin" })
        .then((response) => {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then((data) => {
          cases = Array.isArray(data) ? data : [];
          cases.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
          renderTabs();
          renderCards(true);
          caseSection.dataset.loaded = "true";
        })
        .catch(() => {
          if (status) status.textContent = "案例暂时加载失败，请稍后刷新。";
          if (grid) grid.innerHTML = `<div class="w-case-empty">案例暂时加载失败，请稍后刷新。</div>`;
        });
    }

    const year = document.getElementById("welcomeYear");
    if (year) year.textContent = String(new Date().getFullYear());

    // The hero loop is decorative: keep it still when motion is unwelcome and
    // make sure it is only decoded while the welcome page is actually shown.
    const video = document.querySelector(".w-hero-video");
    if (video) {
      if (reducedMotion()) {
        video.removeAttribute("autoplay");
        try { video.pause(); } catch (error) {}
      } else {
        const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };
        play();
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) { try { video.pause(); } catch (error) {} } else play();
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWelcomeLanding, { once: true });
  } else {
    initWelcomeLanding();
  }
})();
