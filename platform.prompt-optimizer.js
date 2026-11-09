(() => {
  const MAX_CHARS = 5000;
  const WAN_PROVIDERS = new Set(["wan30", "wan30-prime", "wan27", "wan-animate", "h3-vega"]);
  let activeModal = null;

  function normalizeProvider(value = "") {
    const raw = String(value || "").trim().toLowerCase();
    if (typeof window.normalizeAdvancedProvider === "function") {
      try { return window.normalizeAdvancedProvider(raw); } catch {}
    }
    if (raw.includes("wan30") || raw.includes("wan3.0") || raw === "w3" || raw === "w3-prime") return raw.includes("prime") ? "wan30-prime" : "wan30";
    if (raw.includes("wan27") || raw.includes("wan2.7")) return "wan27";
    if (raw.includes("wan-animate") || raw.includes("wananimate")) return "wan-animate";
    if (raw === "h3-vega" || raw.includes("vega")) return "h3-vega";
    return raw.replace(/[\s_]+/g, "-");
  }

  function isWanProvider(value = "") {
    const provider = normalizeProvider(value);
    return WAN_PROVIDERS.has(provider) || provider.startsWith("wan-");
  }

  function detectPromptLanguage(value = "") {
    const source = String(value || "");
    const chinese = (source.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (source.match(/[A-Za-z]/g) || []).length;
    return chinese >= 4 && chinese >= latin * 0.45 ? "zh" : (latin > 0 ? "en" : "zh");
  }

  function requestHeaders() {
    const headers = { "content-type": "application/json" };
    try {
      const token = localStorage.getItem("raisingGameToken") || localStorage.getItem("token") || "";
      if (token) headers.authorization = `Bearer ${token}`;
    } catch {}
    return headers;
  }

  async function requestOptimize(payload = {}) {
    const prompt = String(payload.prompt || "").trim();
    if (!prompt) throw new Error("请先输入提示词。");
    if (prompt.length > MAX_CHARS) throw new Error(`提示词不能超过 ${MAX_CHARS} 个字符。`);
    const response = await fetch("/api/advanced/prompt-optimize", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ ...payload, prompt }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.message || `优化失败：${response.status}`);
      error.code = result.code || "";
      error.statusCode = response.status;
      throw error;
    }
    return result;
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureModal() {
    if (activeModal?.dialog?.isConnected) return activeModal;
    const dialog = document.createElement("dialog");
    dialog.className = "modal prompt-optimizer-dialog";
    dialog.innerHTML = `
      <form method="dialog">
        <header>
          <div><span>W3 Prompt Optimizer</span><strong>AI 优化提示词</strong></div>
          <button class="icon-btn" type="button" data-prompt-optimizer-close aria-label="Close"><i data-lucide="x"></i></button>
        </header>
        <div class="modal-body prompt-optimizer-body">
          <div class="prompt-optimizer-loading" data-prompt-optimizer-loading>
            <i data-lucide="sparkles"></i><span>正在按 W3 规则优化，请稍候...</span>
          </div>
          <div class="prompt-optimizer-error" data-prompt-optimizer-error hidden></div>
          <div class="prompt-optimizer-content" data-prompt-optimizer-content hidden>
            <label class="prompt-optimizer-field">
              <span>原提示词</span>
              <textarea data-prompt-optimizer-original rows="5" readonly></textarea>
            </label>
            <label class="prompt-optimizer-field">
              <span>优化结果 <small data-prompt-optimizer-count></small></span>
              <textarea data-prompt-optimizer-result rows="10" maxlength="${MAX_CHARS}"></textarea>
            </label>
            <ul class="prompt-optimizer-notes" data-prompt-optimizer-notes></ul>
          </div>
        </div>
        <div class="modal-actions inline-actions">
          <button class="ghost-button" type="button" data-prompt-optimizer-cancel>取消</button>
          <button class="ghost-button" type="button" data-prompt-optimizer-retry>重新优化</button>
          <button class="generate-btn" type="button" data-prompt-optimizer-apply disabled><i data-lucide="check"></i>填入提示词</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    const modal = {
      dialog,
      original: dialog.querySelector("[data-prompt-optimizer-original]"),
      result: dialog.querySelector("[data-prompt-optimizer-result]"),
      count: dialog.querySelector("[data-prompt-optimizer-count]"),
      notes: dialog.querySelector("[data-prompt-optimizer-notes]"),
      loading: dialog.querySelector("[data-prompt-optimizer-loading]"),
      error: dialog.querySelector("[data-prompt-optimizer-error]"),
      content: dialog.querySelector("[data-prompt-optimizer-content]"),
      apply: dialog.querySelector("[data-prompt-optimizer-apply]"),
      retry: dialog.querySelector("[data-prompt-optimizer-retry]"),
      payload: null,
      onApply: null,
    };
    const close = () => {
      if (dialog.open) dialog.close("cancel");
      activeModal = null;
    };
    dialog.querySelector("[data-prompt-optimizer-close]").addEventListener("click", close);
    dialog.querySelector("[data-prompt-optimizer-cancel]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.addEventListener("close", () => { modal.onApply = null; if (activeModal === modal) activeModal = null; });
    const updateCount = () => { modal.count.textContent = `${modal.result.value.length} / ${MAX_CHARS}`; };
    modal.result.addEventListener("input", updateCount);
    modal.retry.addEventListener("click", () => run(modal, modal.payload, modal.onApply));
    modal.apply.addEventListener("click", () => {
      const value = modal.result.value.trim();
      if (!value) return;
      const callback = modal.onApply;
      if (typeof callback === "function") callback(value);
      close();
    });
    activeModal = modal;
    return modal;
  }

  function setLoading(modal, loading) {
    modal.loading.hidden = !loading;
    modal.content.hidden = loading || Boolean(modal.error.textContent && !modal.error.hidden);
    modal.retry.disabled = loading;
    modal.apply.disabled = loading || !modal.result.value.trim();
  }

  async function run(modal, payload, onApply) {
    modal.payload = payload;
    modal.onApply = onApply;
    modal.error.hidden = true;
    modal.error.textContent = "";
    modal.result.value = "";
    modal.original.value = payload.prompt;
    modal.count.textContent = `0 / ${MAX_CHARS}`;
    modal.notes.innerHTML = "";
    modal.apply.disabled = true;
    setLoading(modal, true);
    window.lucide?.createIcons?.();
    try {
      const result = await requestOptimize(payload);
      modal.original.value = result.originalPrompt || payload.prompt;
      modal.result.value = String(result.optimizedPrompt || "").slice(0, MAX_CHARS);
      modal.notes.innerHTML = (result.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
      modal.count.textContent = `${modal.result.value.length} / ${MAX_CHARS}`;
      modal.loading.hidden = true;
      modal.content.hidden = false;
      modal.apply.disabled = !modal.result.value.trim();
      modal.retry.disabled = false;
      modal.result.focus();
    } catch (error) {
      modal.loading.hidden = true;
      modal.content.hidden = true;
      modal.error.hidden = false;
      modal.error.textContent = error.message || String(error);
      modal.retry.disabled = false;
      modal.apply.disabled = true;
    }
  }

  function openPromptOptimizer(options = {}) {
    const prompt = String(options.prompt ?? options.value ?? "").trim();
    if (!prompt) {
      window.alert?.("请先输入提示词。");
      return Promise.resolve("");
    }
    if (prompt.length > MAX_CHARS) {
      window.alert?.(`提示词不能超过 ${MAX_CHARS} 个字符。`);
      return Promise.resolve("");
    }
    const modal = ensureModal();
    const payload = {
      prompt,
      provider: options.provider || "",
      providerLabel: options.providerLabel || "",
      duration: options.duration,
      resolution: options.resolution,
      mode: options.mode,
      language: options.language || detectPromptLanguage(prompt),
    };
    const apply = options.onApply || (() => {});
    if (!modal.dialog.open) modal.dialog.showModal();
    run(modal, payload, apply);
    return Promise.resolve("");
  }

  window.W3PromptOptimizer = Object.freeze({ isWanProvider, normalizeProvider, open: openPromptOptimizer, maxChars: MAX_CHARS });
  window.isWanPromptOptimizerProvider = isWanProvider;
  window.openPromptOptimizer = openPromptOptimizer;
})();
