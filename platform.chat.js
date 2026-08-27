"use strict";

function activeChatConversation() {
  return state.chatConversations.find((item) => item.id === state.chatActiveConversationId) || null;
}

function chatCopy(en, zh) { return state.lang === "zh" ? zh : en; }

function chatPoster(character = {}) {
  return String(character.posterUrl || DEFAULT_TEMPLATE_COVER);
}

function chatTimeLabel(value = "") {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(state.lang || "en", { month: "short", day: "numeric" });
}

function chatFormattedText(value = "") {
  return escapeHtml(String(value || "")).replace(/\*([^*\n]+)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
}

function renderChatConversationList() {
  if (!els.chatConversationList) return;
  const zh = String(state.lang || "").toLowerCase().startsWith("zh");
  const search = document.querySelector("#chatSearch");
  if (search) search.placeholder = zh ? "搜索聊天..." : "Search chats...";
  const query = String(state.chatSearch || "").trim().toLowerCase();
  const items = state.chatConversations.filter((item) => !query || `${item.title} ${item.lastMessage}`.toLowerCase().includes(query));
  els.chatConversationList.innerHTML = items.length ? items.map((item) => `
    <button class="chat-conversation-item ${item.id === state.chatActiveConversationId ? "is-active" : ""}" type="button" data-chat-conversation="${escapeHtml(item.id)}">
      <img src="${escapeHtml(chatPoster(item.character))}" alt="" />
      <span><strong>${escapeHtml(item.title || item.character?.name || "Chat")}</strong><small>${escapeHtml(item.lastMessage || "Start chatting")}</small></span>
      <time>${escapeHtml(chatTimeLabel(item.updatedAt))}</time>
    </button>
  `).join("") : `<div class="chat-list-empty">${state.chatLoading ? (zh ? "加载中..." : "Loading...") : (zh ? "暂无聊天" : "No chats yet")}</div>`;
  els.chatConversationList.querySelectorAll("[data-chat-conversation]").forEach((button) => {
    button.addEventListener("click", () => { els.chatShell?.classList.remove("mobile-list-open"); openChatConversation(button.dataset.chatConversation || ""); });
  });
}

function chatMessageMarkup(message = {}) {
  const assistant = message.role !== "user";
  const media = message.kind === "image";
  const mediaMarkup = media ? (message.imageUrl
    ? `<figure class="chat-message-media"><img src="${escapeHtml(message.imageUrl)}" alt="${escapeHtml(message.content || "Generated scene")}" /><figcaption>${chatFormattedText(message.content || "Generated scene")}</figcaption></figure>`
    : `<div class="chat-media-pending ${message.status === "failed" ? "is-failed" : ""}"><i data-lucide="${message.status === "failed" ? "circle-alert" : "loader-circle"}"></i><span>${escapeHtml(message.error || "Generating image...")}</span></div>`) : chatFormattedText(message.content || "");
  return `
    <article class="chat-message ${assistant ? "is-assistant" : "is-user"}" data-chat-message="${escapeHtml(message.id || "")}">
      <div class="chat-message-content">${mediaMarkup}</div>
      <div class="chat-message-actions">
        <button class="icon-btn" type="button" data-chat-copy aria-label="Copy" title="Copy"><i data-lucide="copy"></i></button>
        ${assistant && !media ? `<button class="icon-btn" type="button" data-chat-read aria-label="Read aloud" title="Read aloud"><i data-lucide="volume-2"></i></button>` : ""}
        ${assistant && !media
          ? `<button class="icon-btn" type="button" data-chat-regenerate aria-label="Regenerate" title="Regenerate"><i data-lucide="refresh-cw"></i></button>`
          : !assistant ? `<button class="icon-btn" type="button" data-chat-edit aria-label="Edit" title="Edit"><i data-lucide="pencil"></i></button>` : ""}
        ${assistant && !media ? `<button class="icon-btn" type="button" data-chat-continue aria-label="Continue" title="Continue"><i data-lucide="fast-forward"></i></button>` : ""}
        ${media && message.status === "succeeded" ? `<button class="icon-btn" type="button" data-chat-animate aria-label="Create video" title="Create video"><i data-lucide="clapperboard"></i></button>` : ""}
        <details class="chat-message-more"><summary class="icon-btn" aria-label="More" title="More"><i data-lucide="ellipsis"></i></summary><div>
          <button type="button" data-chat-branch><i data-lucide="git-branch"></i>Branch from here</button>
          <button type="button" data-chat-report><i data-lucide="flag"></i>Report</button>
          <button type="button" data-chat-delete><i data-lucide="trash-2"></i>Delete</button>
        </div></details>
      </div>
    </article>`;
}

function renderChatTracker(conversation = activeChatConversation()) {
  if (!els.chatTracker) return;
  els.chatTracker.hidden = !conversation || !state.chatTrackerVisible;
  if (els.chatTracker.hidden) return;
  const tracker = conversation.tracker || {};
  const zh = String(state.lang || "").toLowerCase().startsWith("zh");
  const fields = [
    ["clock-3", zh ? "日期和时间" : "Date and time", tracker.dateTime],
    ["map-pin", zh ? "地点" : "Location", tracker.location],
    ["shirt", zh ? "服装" : `${conversation.character?.name || "Character"}'s outfit`, tracker.outfit],
    ["heart-handshake", zh ? "关系" : "Relationship", tracker.relationship],
    ["smile", zh ? "心情" : "Mood", tracker.mood],
  ].filter(([, , value]) => value);
  els.chatTracker.innerHTML = `<header><strong>${zh ? "状态追踪" : "State tracker"}</strong><span>${zh ? "实时" : "Live"}</span></header>${fields.length ? fields.map(([icon, label, value]) => `<div><i data-lucide="${icon}"></i><span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span></div>`).join("") : `<p>${zh ? "下一次角色回复后显示状态。" : "State appears after the next character reply."}</p>`}`;
}

function syncChatViewportHeight() {
  if (!els.chatShell) return;
  if (window.innerWidth > 720) {
    els.chatShell.style.removeProperty("height");
    return;
  }
  const documentTop = Math.max(0, Math.round(els.chatShell.getBoundingClientRect().top + window.scrollY));
  els.chatShell.style.height = `${Math.max(320, window.innerHeight - documentTop)}px`;
}

function renderChatSettings(conversation = activeChatConversation()) {
  if (!els.chatSettingsBody) return;
  document.querySelectorAll("[data-chat-setting]").forEach((button) => button.classList.toggle("is-active", button.dataset.chatSetting === state.chatSetting));
  if (!conversation) {
    els.chatSettingsBody.innerHTML = "";
    return;
  }
  if (state.chatSetting === "memory") {
    els.chatSettingsBody.innerHTML = `
      <label class="chat-setting-field"><span>Pinned memory</span><textarea id="chatMemoryInput" rows="7" maxlength="4000" placeholder="Facts this character should always remember">${escapeHtml(conversation.memory || "")}</textarea></label>
      <label class="chat-setting-field"><span>Custom instructions</span><textarea id="chatInstructionsInput" rows="7" maxlength="4000" placeholder="How the character should respond">${escapeHtml(conversation.instructions || "")}</textarea></label>
      <button class="primary-button" id="chatSaveMemoryBtn" type="button">Save memory</button>`;
    document.querySelector("#chatSaveMemoryBtn")?.addEventListener("click", () => updateChatPreferences({
      memory: document.querySelector("#chatMemoryInput")?.value || "",
      instructions: document.querySelector("#chatInstructionsInput")?.value || "",
    }));
    return;
  }
  if (state.chatSetting === "preferences") {
    els.chatSettingsBody.innerHTML = `
      <label class="chat-toggle"><span><strong>Character background</strong><small>Show the character image behind messages</small></span><input id="chatBackgroundToggle" type="checkbox" ${conversation.backgroundEnabled !== false ? "checked" : ""} /></label>`;
    document.querySelector("#chatBackgroundToggle")?.addEventListener("change", (event) => updateChatPreferences({ backgroundEnabled: event.currentTarget.checked }));
    return;
  }
  const styles = [
    ["balanced", "Balanced", "Natural conversation with vivid roleplay"],
    ["immersive", "Immersive", "Longer, sensory and character-driven"],
    ["concise", "Concise", "Short, direct replies"],
    ["cinematic", "Cinematic", "Atmospheric scenes and strong pacing"],
  ];
  els.chatSettingsBody.innerHTML = `<div class="chat-style-options">${styles.map(([id, label, description]) => `
    <button class="chat-style-option ${conversation.style === id ? "is-active" : ""}" type="button" data-chat-style="${id}">
      <span><strong>${label}</strong><small>${description}</small></span><i data-lucide="${conversation.style === id ? "circle-check" : "circle"}"></i>
    </button>`).join("")}</div>`;
  els.chatSettingsBody.querySelectorAll("[data-chat-style]").forEach((button) => button.addEventListener("click", () => updateChatPreferences({ style: button.dataset.chatStyle })));
}

function renderChatPanel() {
  const zh = String(state.lang || "").toLowerCase().startsWith("zh");
  const chatTitle = document.querySelector("[data-panel=chat] .chat-list-head strong");
  if (chatTitle) chatTitle.textContent = zh ? "聊天" : "Chats";
  const emptyTitle = document.querySelector("#chatEmpty strong");
  if (emptyTitle) emptyTitle.textContent = chatCopy("Start a character chat", "开始角色聊天");
  if (els.chatEmptyBrowseBtn) els.chatEmptyBrowseBtn.textContent = chatCopy("Browse characters", "浏览角色");
  renderChatConversationList();
  const conversation = activeChatConversation();
  const hasConversation = Boolean(conversation);
  if (els.chatEmpty) els.chatEmpty.hidden = hasConversation;
  if (els.chatThread) els.chatThread.hidden = !hasConversation;
  if (els.chatComposer) els.chatComposer.hidden = !hasConversation;
  if (els.chatSuggestion) els.chatSuggestion.hidden = !hasConversation || !state.chatMessages.length;
  if (els.chatMainHead) {
    els.chatMainHead.innerHTML = hasConversation ? `<button class="icon-btn chat-mobile-control" type="button" data-chat-mobile-list aria-label="Chats"><i data-lucide="panel-left"></i></button><img src="${escapeHtml(chatPoster(conversation.character))}" alt="" /><span><strong>${escapeHtml(conversation.title)}</strong><small>BytePlus Language</small></span><button class="icon-btn chat-mobile-control" type="button" data-chat-mobile-settings aria-label="Chat settings"><i data-lucide="sliders-horizontal"></i></button>` : "";
    els.chatMainHead.querySelector("[data-chat-mobile-list]")?.addEventListener("click", () => els.chatShell?.classList.toggle("mobile-list-open"));
    els.chatMainHead.querySelector("[data-chat-mobile-settings]")?.addEventListener("click", () => els.chatShell?.classList.toggle("mobile-settings-open"));
  }
  if (els.chatThread && hasConversation) {
    els.chatThread.style.setProperty("--chat-background", `url("${chatPoster(conversation.character).replace(/["\\]/g, "")}")`);
    els.chatThread.classList.toggle("has-background", conversation.backgroundEnabled !== false);
    const pendingMarkup = state.chatSending ? `<article class="chat-message is-assistant chat-message-pending" aria-live="polite"><div class="chat-message-content"><i data-lucide="loader-circle"></i><span>${chatCopy("Thinking...", "思考中...")}</span></div></article>` : "";
    els.chatThread.innerHTML = state.chatMessages.map(chatMessageMarkup).join("") + pendingMarkup || `<div class="chat-list-empty">No messages yet</div>`;
    els.chatThread.querySelectorAll("[data-chat-message]").forEach((article) => {
      const message = state.chatMessages.find((item) => item.id === article.dataset.chatMessage);
      article.querySelector("[data-chat-copy]")?.addEventListener("click", () => navigator.clipboard?.writeText(message?.imageUrl || message?.content || ""));
      article.querySelector("[data-chat-read]")?.addEventListener("click", () => readChatMessage(message));
      article.querySelector("[data-chat-regenerate]")?.addEventListener("click", () => sendChatMessage({ action: "regenerate", targetMessageId: message?.id || "" }));
      article.querySelector("[data-chat-continue]")?.addEventListener("click", () => sendChatMessage({ action: "continue", targetMessageId: message?.id || "" }));
      article.querySelector("[data-chat-branch]")?.addEventListener("click", () => branchChatFromMessage(message?.id || ""));
      article.querySelector("[data-chat-report]")?.addEventListener("click", () => reportChatMessage(message));
      article.querySelector("[data-chat-delete]")?.addEventListener("click", () => deleteChatMessage(message?.id || ""));
      article.querySelector("[data-chat-animate]")?.addEventListener("click", (event) => openChatImageInVideo(message, event.currentTarget));
      article.querySelector("[data-chat-edit]")?.addEventListener("click", () => {
        if (!els.chatInput) return;
        els.chatInput.value = message?.content || "";
        els.chatInput.dataset.editMessageId = message?.id || "";
        els.chatInput.focus();
      });
    });
    requestAnimationFrame(() => { els.chatThread.scrollTop = els.chatThread.scrollHeight; });
    state.chatMessages.filter((message) => message.kind === "image" && message.taskId && message.status === "generating").forEach((message) => pollChatImage(conversation.id, message.taskId));
  }
  if (els.chatCharacterCard) {
    els.chatCharacterCard.innerHTML = hasConversation ? `
      <img src="${escapeHtml(chatPoster(conversation.character))}" alt="${escapeHtml(conversation.character?.name || "")}" />
      <strong>${escapeHtml(conversation.character?.name || conversation.title)}</strong>
      <p>${escapeHtml(conversation.character?.description || "")}</p>
      <div>${(conversation.character?.tags || []).slice(0, 5).map((tag) => `<small>${escapeHtml(tag)}</small>`).join("")}</div>` : "";
  }
  if (els.chatSuggestionBtn && hasConversation) els.chatSuggestionBtn.textContent = zh ? `告诉我更多，${String(conversation.character?.name || "").split(/\s+/)[0] || "请"}。` : `Tell me more, ${String(conversation.character?.name || "").split(/\s+/)[0] || "please"}.`;
  renderChatTracker(conversation);
  renderChatMode();
  renderChatSettings(conversation);
  refreshIcons();
  requestAnimationFrame(syncChatViewportHeight);
}

async function loadChatConversations({ selectFirst = true } = {}) {
  if (!state.user) {
    state.chatConversations = [];
    state.chatActiveConversationId = "";
    state.chatMessages = [];
    renderChatPanel();
    return;
  }
  state.chatLoading = true;
  renderChatConversationList();
  try {
    const payload = await requestJson("/api/chat/conversations");
    state.chatConversations = payload.conversations || [];
    if (selectFirst && !state.chatActiveConversationId && state.chatConversations[0]) state.chatActiveConversationId = state.chatConversations[0].id;
    if (state.chatActiveConversationId) await openChatConversation(state.chatActiveConversationId, { renderList: false });
  } finally {
    state.chatLoading = false;
    renderChatPanel();
  }
}

async function openChatConversation(conversationId = "", { renderList = true } = {}) {
  if (!conversationId) return;
  state.chatActiveConversationId = conversationId;
  if (renderList) renderChatConversationList();
  const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
  state.chatMessages = payload.messages || [];
  const index = state.chatConversations.findIndex((item) => item.id === conversationId);
  if (index >= 0) state.chatConversations[index] = payload.conversation;
  else state.chatConversations.unshift(payload.conversation);
  renderChatPanel();
}

async function startCharacterChat(characterId = "") {
  if (!state.user) {
    openLogin();
    return;
  }
  const existing = state.chatConversations.find((item) => item.characterId === characterId);
  if (existing) {
    state.chatActiveConversationId = existing.id;
    setTab("chat");
    return;
  }
  const payload = await requestJson("/api/chat/conversations", { method: "POST", body: { characterId } });
  state.chatConversations.unshift(payload.conversation);
  state.chatActiveConversationId = payload.conversation.id;
  state.chatMessages = payload.messages || [];
  setTab("chat");
}

function renderChatMode() {
  const imageMode = state.chatMode === "image";
  if (els.chatInput) els.chatInput.placeholder = imageMode ? "Describe an image..." : "Send a message";
  if (els.chatModeBtn) {
    els.chatModeBtn.innerHTML = `<i data-lucide="${imageMode ? "image" : "message-circle"}"></i>`;
    els.chatModeBtn.title = imageMode ? "Image mode" : "Chat mode";
  }
  if (els.chatSendBtn && !state.chatSending) els.chatSendBtn.innerHTML = `<i data-lucide="${imageMode ? "sparkles" : "send"}"></i><span>${imageMode ? "Generate" : "Send"}</span>`;
  if (els.chatContinueBtn) els.chatContinueBtn.hidden = imageMode;
  if (els.chatVoiceBtn) els.chatVoiceBtn.hidden = imageMode;
  els.chatModeMenu?.querySelectorAll("[data-chat-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.chatMode === state.chatMode));
}

function readChatMessage(message = {}) {
  if (!message.content || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(message.content).replace(/\*/g, ""));
  utterance.lang = state.lang || "en-US";
  window.speechSynthesis.speak(utterance);
}

function reportChatMessage(message = {}) {
  if (typeof openSupportDialog !== "function") return;
  openSupportDialog();
  if (els.supportSubject) els.supportSubject.value = "Character chat message report";
  if (els.supportMessage) els.supportMessage.value = `Conversation: ${message.conversationId || ""}\nMessage: ${message.id || ""}\n\nPlease describe the issue:`;
}

function scheduleChatTrackerRefresh(conversationId = "") {
  [10000, 26000].forEach((delayMs) => window.setTimeout(async () => {
    if (state.chatActiveConversationId !== conversationId) return;
    try {
      const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
      const index = state.chatConversations.findIndex((item) => item.id === conversationId);
      if (index >= 0) state.chatConversations[index] = payload.conversation;
      renderChatTracker(payload.conversation);
      refreshIcons();
    } catch {}
  }, delayMs));
}

async function branchChatFromMessage(messageId = "") {
  const conversation = activeChatConversation();
  if (!conversation || !messageId) return;
  const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/branch`, { method: "POST", body: { messageId } });
  state.chatConversations.unshift(payload.conversation);
  state.chatActiveConversationId = payload.conversation.id;
  state.chatMessages = payload.messages || [];
  renderChatPanel();
}

async function deleteChatMessage(messageId = "") {
  const conversation = activeChatConversation();
  if (!conversation || !messageId || !window.confirm("Delete this message?")) return;
  const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
  state.chatMessages = payload.messages || [];
  const index = state.chatConversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) state.chatConversations[index] = payload.conversation;
  renderChatPanel();
}

async function openChatImageInVideo(message = {}, button = null) {
  if (!message.taskId) return;
  if (button) button.disabled = true;
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(message.taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
      if (typeof useAssetInAdvanced === "function") useAssetInAdvanced(payload.asset, "use");
      setTab("advanced");
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function pollChatImage(conversationId = "", taskId = "") {
  const key = `${conversationId}:${taskId}`;
  if (!conversationId || !taskId || state.chatImagePolls.has(key)) return;
  const poll = async () => {
    try {
      const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversationId)}/images/${encodeURIComponent(taskId)}/refresh`, { method: "POST" });
      const index = state.chatMessages.findIndex((message) => message.taskId === taskId);
      if (index >= 0 && payload.message) state.chatMessages[index] = payload.message;
      if (state.chatActiveConversationId === conversationId) renderChatPanel();
      if (payload.done) {
        state.chatImagePolls.delete(key);
        return;
      }
    } catch (error) {
      console.warn("Chat image refresh failed", error);
    }
    state.chatImagePolls.set(key, window.setTimeout(poll, 3500));
  };
  state.chatImagePolls.set(key, window.setTimeout(poll, 1200));
}

async function generateChatImage({ mode = "image" } = {}) {
  const conversation = activeChatConversation();
  if (!conversation || state.chatSending) return;
  const prompt = String(els.chatInput?.value || "").trim();
  if (mode === "image" && !prompt) return;
  state.chatSending = true;
  renderChatPanel();
  if (els.chatSendBtn) {
    els.chatSendBtn.disabled = true;
    els.chatSendBtn.innerHTML = `<i data-lucide="loader-circle"></i><span>Creating...</span>`;
  }
  try {
    const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/images`, { method: "POST", body: { mode, prompt } });
    if (els.chatInput) els.chatInput.value = "";
    state.chatMessages.push(payload.message);
    const index = state.chatConversations.findIndex((item) => item.id === conversation.id);
    if (index >= 0) state.chatConversations[index] = payload.conversation;
    renderChatPanel();
    pollChatImage(conversation.id, payload.taskId);
  } catch (error) {
    if (els.chatInput && !els.chatInput.value) els.chatInput.value = prompt;
    window.alert(error.message || "Image generation failed.");
  } finally {
    state.chatSending = false;
    if (els.chatSendBtn) els.chatSendBtn.disabled = false;
    renderChatPanel();
  }
}

async function sendChatMessage({ action = "send", targetMessageId = "" } = {}) {
  if (state.chatMode === "image" && action === "send") return generateChatImage({ mode: "image" });
  const conversation = activeChatConversation();
  if (!conversation || state.chatSending) return;
  const editMessageId = els.chatInput?.dataset.editMessageId || "";
  const content = String(els.chatInput?.value || "").trim();
  const effectiveAction = editMessageId && action === "send" ? "edit" : action;
  if (!["continue", "regenerate"].includes(effectiveAction) && !content) return;
  const previousMessages = state.chatMessages.slice();
  if (effectiveAction === "send") {
    state.chatMessages = [...state.chatMessages, { id: `pending-${Date.now()}`, role: "user", content }];
    if (els.chatInput) els.chatInput.value = "";
  }
  state.chatSending = true;
  renderChatPanel();
  if (els.chatSendBtn) {
    els.chatSendBtn.disabled = true;
    els.chatSendBtn.innerHTML = `<i data-lucide="loader-circle"></i><span>Thinking...</span>`;
  }
  if (els.chatContinueBtn) els.chatContinueBtn.disabled = true;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages`, {
      method: "POST",
      body: { content, action: effectiveAction, targetMessageId: targetMessageId || editMessageId, language: state.lang },
    });
    if (els.chatInput) {
      els.chatInput.value = "";
      delete els.chatInput.dataset.editMessageId;
    }
    if (payload.credits !== undefined && state.user) state.user.credits = payload.credits;
    await openChatConversation(conversation.id);
    scheduleChatTrackerRefresh(conversation.id);
    renderAccountMenu();
    renderTopupSummary();
  } catch (error) {
    state.chatMessages = previousMessages;
    if (els.chatInput && !els.chatInput.value && content) els.chatInput.value = content;
    window.alert(error.message || "Chat failed.");
  } finally {
    state.chatSending = false;
    if (els.chatSendBtn) {
      els.chatSendBtn.disabled = false;
      els.chatSendBtn.innerHTML = `<i data-lucide="send"></i><span>Send</span>`;
    }
    if (els.chatContinueBtn) els.chatContinueBtn.disabled = false;
    renderChatPanel();
  }
}

async function updateChatPreferences(changes = {}) {
  const conversation = activeChatConversation();
  if (!conversation) return;
  const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}`, { method: "PATCH", body: changes });
  const index = state.chatConversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) state.chatConversations[index] = payload.conversation;
  renderChatPanel();
}

els.chatBrowseBtn?.addEventListener("click", () => setTab("gallery"));
els.chatEmptyBrowseBtn?.addEventListener("click", () => setTab("gallery"));
els.chatSearch?.addEventListener("input", () => { state.chatSearch = els.chatSearch.value || ""; renderChatConversationList(); });
els.chatComposer?.addEventListener("submit", (event) => { event.preventDefault(); sendChatMessage(); });
els.chatInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }
});
els.chatContinueBtn?.addEventListener("click", () => sendChatMessage({ action: "continue" }));
els.chatSuggestionBtn?.addEventListener("click", () => { if (els.chatInput) { els.chatInput.value = els.chatSuggestionBtn.textContent || ""; els.chatInput.focus(); } });
els.chatModeBtn?.addEventListener("click", () => { if (els.chatModeMenu) els.chatModeMenu.hidden = !els.chatModeMenu.hidden; });
els.chatModeMenu?.querySelectorAll("[data-chat-mode]").forEach((button) => button.addEventListener("click", () => {
  state.chatMode = button.dataset.chatMode === "image" ? "image" : "chat";
  els.chatModeMenu.hidden = true;
  renderChatMode();
  refreshIcons();
  els.chatInput?.focus();
}));
els.chatModeMenu?.querySelector("[data-chat-scene]")?.addEventListener("click", () => {
  els.chatModeMenu.hidden = true;
  if (window.confirm("Generate an image from the current scene? Image generation credits apply.")) generateChatImage({ mode: "scene" });
});
els.chatModeMenu?.querySelector("[data-chat-tracker]")?.addEventListener("click", () => {
  state.chatTrackerVisible = !state.chatTrackerVisible;
  els.chatModeMenu.hidden = true;
  renderChatPanel();
});
els.chatVoiceBtn?.addEventListener("click", () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    window.alert("Voice input is not supported in this browser.");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = state.lang || "en-US";
  recognition.interimResults = false;
  recognition.onstart = () => els.chatVoiceBtn?.classList.add("is-recording");
  recognition.onend = () => els.chatVoiceBtn?.classList.remove("is-recording");
  recognition.onerror = () => els.chatVoiceBtn?.classList.remove("is-recording");
  recognition.onresult = (event) => {
    const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
    if (transcript && els.chatInput) els.chatInput.value = `${els.chatInput.value ? `${els.chatInput.value} ` : ""}${transcript}`;
  };
  recognition.start();
});
document.querySelectorAll("[data-chat-setting]").forEach((button) => button.addEventListener("click", () => { state.chatSetting = button.dataset.chatSetting || "style"; renderChatSettings(); refreshIcons(); }));
document.querySelectorAll("[data-chat-close-panels]").forEach((button) => button.addEventListener("click", () => els.chatShell?.classList.remove("mobile-list-open", "mobile-settings-open")));
window.addEventListener("resize", syncChatViewportHeight);
