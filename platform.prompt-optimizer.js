(() => {
  const MAX_CHARS = 5000;
  const OPTIMIZER_MODELS = Object.freeze([
    { id: "carrothub-papaya-1.0", label: "Papaya 1.0" },
    { id: "qwen3.7-flash", label: "Qwen3.7 Flash" },
    { id: "byteplus-language", label: "BytePlus Language" },
  ]);
  const DEFAULT_OPTIMIZER_MODEL = OPTIMIZER_MODELS[0].id;
  const WAN_PROVIDERS = new Set(["wan30", "wan30-prime", "wan27", "wan-animate", "h3-vega"]);
  const SEEDANCE_PROVIDERS = new Set(["seedance", "seedance25", "seedance-nsfw", "seedance20-vega", "seedance25-vega"]);
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

  function isSeedanceProvider(value = "") {
    const provider = normalizeProvider(value);
    return SEEDANCE_PROVIDERS.has(provider) || provider.startsWith("seedance");
  }

  function isPromptOptimizerProvider(value = "") {
    return isWanProvider(value) || isSeedanceProvider(value);
  }

  function normalizeReferences(value = []) {
    return (Array.isArray(value) ? value : []).slice(0, 50).map((item, index) => {
      const kind = String(item?.kind || item?.type || "").trim().toLowerCase();
      return {
        kind: ["image", "video", "audio", "document"].includes(kind) ? kind : "image",
        label: String(item?.label || "").trim().slice(0, 80) || `Image ${index + 1}`,
        index: index + 1,
      };
    });
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
    const requestBody = {
      prompt,
      provider: String(payload.provider || "").slice(0, 80),
      providerLabel: String(payload.providerLabel || "").slice(0, 80),
      duration: Number(payload.duration || 0) || undefined,
      resolution: String(payload.resolution || "").slice(0, 32),
      mode: String(payload.mode || "").slice(0, 80),
      language: String(payload.language || detectPromptLanguage(prompt)).slice(0, 32),
      references: normalizeReferences(payload.references),
      optimizerModel: String(payload.optimizerModel || DEFAULT_OPTIMIZER_MODEL).slice(0, 120),
    };
    const response = await fetch("/api/advanced/prompt-optimize", {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const code = String(result.code || "");
      const message = result.message || (
        response.status === 429
          ? "请求太频繁，请稍后重试。"
          : code === "PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT"
            ? "当前模型响应超时，请重试或更换模型。"
            : `优化失败：${response.status}`
      );
      const error = new Error(message);
      error.code = code;
      error.statusCode = response.status;
      error.requestId = String(result.requestId || "");
      throw error;
    }
    return result;
  }

  function readableOptimizedPrompt(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return "";
    if (typeof value === "string") {
      const text = value.trim().replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
      if (!text) return "";
      if (/^[{[]/.test(text) || (text.startsWith('"') && text.endsWith('"'))) {
        try { return readableOptimizedPrompt(JSON.parse(text), depth + 1); } catch {}
      }
      return text;
    }
    if (typeof value !== "object" || Array.isArray(value)) return "";
    for (const key of ["optimizedPrompt", "optimized_prompt", "prompt", "text", "content", "result"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const candidate = readableOptimizedPrompt(value[key], depth + 1);
        if (candidate) return candidate;
      }
    }
    return "";
  }

  function wrapWanPromptParagraph(value = "", limit = 180) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (source.length <= limit) return source;
    const sentences = source.match(/[^。！？!?]+[。！？!?]?/g) || [source];
    const lines = [];
    let current = "";
    for (const sentence of sentences) {
      const next = sentence.trim();
      if (!next) continue;
      if (current && current.length + next.length > limit) {
        lines.push(current.trim());
        current = next;
      } else {
        current += next;
      }
    }
    if (current.trim()) lines.push(current.trim());
    return lines.join("\n");
  }

  function normalizeWanFillPrompt(value = "") {
    let text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return "";
    text = text
      .replace(/^```(?:json|text|markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
      .replace(/^[ \t]*(?:>[ \t]*)+/gm, "")
      .replace(/^[ \t]*(?:[-*+•]+|\d+[.)、])[ \t]+/gm, "")
      .replace(/^[ \t]*(?:[-*_]\s*){3,}$/gm, "")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1");
    text = text
      .replace(/(?<!\n)\s+(?=(?:【[^】\n]{1,40}】|At\s+\d{1,2}:\d{2}(?::\d{2})?|(?:Ambient|Camera static\.)\b))/gi, "\n")
      .replace(/([。！？!?])\s*(?=(?:At\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}(?:\s*[—–\-~至到]\s*)\d{1,2}\s*秒?\s*[：:]|(?:Ambient|Camera static\.)\b))/gi, "$1\n\n")
      .replace(/[ \t]+(?=\d{1,2}(?:\s*[—–\-~至到]\s*)\d{1,2}\s*秒?\s*[：:])/g, "\n")
      .replace(/([。！？!?])\s*(?=(?:正向约束|结尾约束|最终约束|Final constraints?)\s*[：:])/gi, "$1\n\n")
      .replace(/[ \t]+(?=(?:正向约束|结尾约束|最终约束|Final constraints?)\s*[：:])/gi, "\n\n");
    const lines = text.split("\n")
      .map((line) => line.trim())
      .filter((line, index, list) => line || (index > 0 && list[index - 1]))
      .filter((line) => !/^(?:W3|Wan|Seedance)?\s*(?:提示词|prompt)\s*[：:]?$|^优化后(?:的)?提示词\s*[：:]?$/i.test(line));
    const readable = [];
    for (const line of lines) {
      if (!line) {
        if (readable.length && readable[readable.length - 1] !== "") readable.push("");
        continue;
      }
      const isFinalStack = /^(?:Camera static\.|正向约束|结尾约束|最终约束|Final constraints?\s*[：:])/i.test(line);
      if (isFinalStack && readable.length && readable[readable.length - 1] !== "") readable.push("");
      readable.push(wrapWanPromptParagraph(line));
    }
    return readable.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    // Keep one dialog instance. Closing it clears the active handle so the next
    // open can reuse the same DOM node instead of appending duplicate modals.
    let dialog = document.querySelector("dialog.prompt-optimizer-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "modal prompt-optimizer-dialog";
      dialog.dataset.promptOptimizerVersion = "2";
      dialog.innerHTML = `
      <form method="dialog">
        <header>
          <div><span data-prompt-optimizer-kicker>Prompt Optimizer</span><strong>AI 优化提示词</strong></div>
          <button class="icon-btn" type="button" data-prompt-optimizer-close aria-label="Close"><i data-lucide="x"></i></button>
        </header>
        <div class="modal-body prompt-optimizer-body">
          <div class="prompt-optimizer-content" data-prompt-optimizer-content>
            <label class="prompt-optimizer-field">
              <span>优化模型</span>
              <select data-prompt-optimizer-model>
                ${OPTIMIZER_MODELS.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label class="prompt-optimizer-field">
              <span>原提示词 <small>可以直接修改</small></span>
              <textarea data-prompt-optimizer-original rows="6" maxlength="${MAX_CHARS}"></textarea>
            </label>
            <div class="prompt-optimizer-loading" data-prompt-optimizer-loading hidden>
              <i data-lucide="sparkles"></i><span data-prompt-optimizer-loading-text>正在按模型规则优化，请稍候...</span>
            </div>
            <div class="prompt-optimizer-error" data-prompt-optimizer-error hidden></div>
            <label class="prompt-optimizer-field" data-prompt-optimizer-result-field hidden>
              <span>优化结果 <small data-prompt-optimizer-count></small></span>
              <textarea data-prompt-optimizer-result rows="10" maxlength="${MAX_CHARS}"></textarea>
            </label>
            <ul class="prompt-optimizer-notes" data-prompt-optimizer-notes></ul>
            <div class="prompt-optimizer-reference-plan" data-prompt-optimizer-reference-plan hidden>
              <strong>建议补充素材（可选）</strong>
              <ul data-prompt-optimizer-reference-list></ul>
            </div>
          </div>
        </div>
        <div class="modal-actions inline-actions">
          <button class="ghost-button" type="button" data-prompt-optimizer-cancel>取消</button>
          <button class="ghost-button" type="button" data-prompt-optimizer-retry>开始优化</button>
          <button class="generate-btn" type="button" data-prompt-optimizer-apply disabled><i data-lucide="check"></i>填入提示词</button>
        </div>
      </form>`;
      document.body.appendChild(dialog);
    }
    const modal = {
      dialog,
      original: dialog.querySelector("[data-prompt-optimizer-original]"),
      result: dialog.querySelector("[data-prompt-optimizer-result]"),
      resultField: dialog.querySelector("[data-prompt-optimizer-result-field]"),
      model: dialog.querySelector("[data-prompt-optimizer-model]"),
      count: dialog.querySelector("[data-prompt-optimizer-count]"),
      notes: dialog.querySelector("[data-prompt-optimizer-notes]"),
      referencePlan: dialog.querySelector("[data-prompt-optimizer-reference-plan]"),
      referenceList: dialog.querySelector("[data-prompt-optimizer-reference-list]"),
      loading: dialog.querySelector("[data-prompt-optimizer-loading]"),
      loadingText: dialog.querySelector("[data-prompt-optimizer-loading-text]"),
      kicker: dialog.querySelector("[data-prompt-optimizer-kicker]"),
      error: dialog.querySelector("[data-prompt-optimizer-error]"),
      content: dialog.querySelector("[data-prompt-optimizer-content]"),
      apply: dialog.querySelector("[data-prompt-optimizer-apply]"),
      start: dialog.querySelector("[data-prompt-optimizer-retry]"),
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
    modal.start.addEventListener("click", () => submitCurrent(modal));
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

  function selectedModelLabel(modal) {
    return OPTIMIZER_MODELS.find((item) => item.id === modal.model.value)?.label || "当前模型";
  }

  function setLoading(modal, loading) {
    modal.dialog.setAttribute("aria-busy", loading ? "true" : "false");
    modal.loading.hidden = !loading;
    modal.start.disabled = loading;
    modal.model.disabled = loading;
    modal.apply.disabled = loading || !modal.result.value.trim();
  }

  function submitCurrent(modal) {
    const prompt = String(modal.original.value || "").trim();
    if (!prompt) {
      modal.error.hidden = false;
      modal.error.textContent = "请先输入提示词。";
      modal.original.focus();
      return;
    }
    run(modal, {
      ...(modal.payload || {}),
      prompt,
      optimizerModel: modal.model.value,
      language: detectPromptLanguage(prompt),
    }, modal.onApply);
  }

  async function run(modal, payload, onApply) {
    modal.payload = payload;
    modal.onApply = onApply;
    modal.error.hidden = true;
    modal.error.textContent = "";
    modal.result.value = "";
    modal.resultField.hidden = true;
    modal.count.textContent = `0 / ${MAX_CHARS}`;
    modal.notes.innerHTML = "";
    modal.referencePlan.hidden = true;
    modal.referenceList.innerHTML = "";
    modal.apply.disabled = true;
    modal.start.textContent = "开始优化";
    const seedance = isSeedanceProvider(payload.provider);
    const hasReferences = Array.isArray(payload.references) && payload.references.length > 0;
    modal.kicker.textContent = seedance ? "Seedance Prompt Optimizer" : "W3 Prompt Optimizer";
    const loadingHint = seedance
      ? (hasReferences
        ? "正在按 Seedance 参考素材与提示词规则优化，请稍候..."
        : "正在按 Seedance 纯文本提示词规则优化，素材可稍后添加...")
      : "正在按 W3 规则优化，请稍候...";
    modal.loadingText.textContent = `${selectedModelLabel(modal)} · ${loadingHint} 时间可能稍长，请勿重复提交。`;
    setLoading(modal, true);
    window.lucide?.createIcons?.();
    try {
      const result = await requestOptimize(payload);
      const optimized = readableOptimizedPrompt(result.optimizedPrompt);
      modal.result.value = (seedance ? optimized : normalizeWanFillPrompt(optimized)).slice(0, MAX_CHARS);
      modal.resultField.hidden = false;
      modal.notes.innerHTML = (result.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
      const referencePlan = Array.isArray(result.referencePlan) ? result.referencePlan.filter(Boolean).slice(0, 12) : [];
      modal.referencePlan.hidden = referencePlan.length === 0;
      modal.referenceList.innerHTML = referencePlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      modal.count.textContent = `${modal.result.value.length} / ${MAX_CHARS}`;
      modal.loading.hidden = true;
      modal.apply.disabled = !modal.result.value.trim();
      modal.start.disabled = false;
      modal.model.disabled = false;
      modal.start.textContent = "重新优化";
      modal.dialog.setAttribute("aria-busy", "false");
      modal.result.focus();
    } catch (error) {
      modal.loading.hidden = true;
      modal.error.hidden = false;
      modal.error.textContent = error.message || String(error);
      modal.start.disabled = false;
      modal.model.disabled = false;
      modal.apply.disabled = true;
      modal.dialog.setAttribute("aria-busy", "false");
    }
  }

  function openPromptOptimizer(options = {}) {
    let prompt = String(options.prompt ?? options.value ?? "");
    if (prompt.length > MAX_CHARS) {
      window.alert?.(`提示词不能超过 ${MAX_CHARS} 个字符。`);
      return Promise.resolve("");
    }
    const modal = ensureModal();
    modal.payload = {
      prompt,
      provider: options.provider || "",
      providerLabel: options.providerLabel || "",
      duration: options.duration,
      resolution: options.resolution,
      mode: options.mode,
      references: normalizeReferences(options.references),
      language: options.language || detectPromptLanguage(prompt),
      optimizerModel: OPTIMIZER_MODELS.some((item) => item.id === options.optimizerModel)
        ? options.optimizerModel
        : DEFAULT_OPTIMIZER_MODEL,
    };
    modal.onApply = options.onApply || (() => {});
    modal.original.value = prompt;
    modal.model.value = modal.payload.optimizerModel;
    modal.result.value = "";
    modal.resultField.hidden = true;
    modal.error.hidden = true;
    modal.error.textContent = "";
    modal.loading.hidden = true;
    modal.notes.innerHTML = "";
    modal.referencePlan.hidden = true;
    modal.referenceList.innerHTML = "";
    modal.start.textContent = "开始优化";
    modal.start.disabled = false;
    modal.model.disabled = false;
    modal.apply.disabled = true;
    modal.count.textContent = `0 / ${MAX_CHARS}`;
    const seedance = isSeedanceProvider(modal.payload.provider);
    modal.kicker.textContent = seedance ? "Seedance Prompt Optimizer" : "W3 Prompt Optimizer";
    if (!modal.dialog.open) modal.dialog.showModal();
    modal.original.focus();
    window.lucide?.createIcons?.();
    return Promise.resolve("");
  }

  window.W3PromptOptimizer = Object.freeze({ isWanProvider, isSeedanceProvider, isProvider: isPromptOptimizerProvider, normalizeProvider, readableOptimizedPrompt, normalizeWanFillPrompt, open: openPromptOptimizer, maxChars: MAX_CHARS });
  window.isWanPromptOptimizerProvider = isWanProvider;
  window.isSeedancePromptOptimizerProvider = isSeedanceProvider;
  window.isPromptOptimizerProvider = isPromptOptimizerProvider;
  window.openPromptOptimizer = openPromptOptimizer;
})();
