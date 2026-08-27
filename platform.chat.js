"use strict";

function activeChatConversation() {
  return state.chatConversations.find((item) => item.id === state.chatActiveConversationId) || null;
}

function chatPoster(character = {}) {
  return String(character.posterUrl || DEFAULT_TEMPLATE_COVER);
}

function chatTimeLabel(value = "") {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(state.lang || "en", { month: "short", day: "numeric" });
}

function renderChatConversationList() {
  if (!els.chatConversationList) return;
  const query = String(state.chatSearch || "").trim().toLowerCase();
  const items = state.chatConversations.filter((item) => !query || `${item.title} ${item.lastMessage}`.toLowerCase().includes(query));
  els.chatConversationList.innerHTML = items.length ? items.map((item) => `
    <button class="chat-conversation-item ${item.id === state.chatActiveConversationId ? "is-active" : ""}" type="button" data-chat-conversation="${escapeHtml(item.id)}">
      <img src="${escapeHtml(chatPoster(item.character))}" alt="" />
      <span><strong>${escapeHtml(item.title || item.character?.name || "Chat")}</strong><small>${escapeHtml(item.lastMessage || "Start chatting")}</small></span>
      <time>${escapeHtml(chatTimeLabel(item.updatedAt))}</time>
    </button>
  `).join("") : `<div class="chat-list-empty">${state.chatLoading ? "Loading..." : "No chats yet"}</div>`;
  els.chatConversationList.querySelectorAll("[data-chat-conversation]").forEach((button) => {
    button.addEventListener("click", () => { els.chatShell?.classList.remove("mobile-list-open"); openChatConversation(button.dataset.chatConversation || ""); });
  });
}

function chatMessageMarkup(message = {}) {
  const assistant = message.role !== "user";
  return `
    <article class="chat-message ${assistant ? "is-assistant" : "is-user"}" data-chat-message="${escapeHtml(message.id || "")}">
      <div class="chat-message-content">${escapeHtml(message.content || "").replace(/\n/g, "<br>")}</div>
      <div class="chat-message-actions">
        <button class="icon-btn" type="button" data-chat-copy aria-label="Copy" title="Copy"><i data-lucide="copy"></i></button>
        ${assistant
          ? `<button class="icon-btn" type="button" data-chat-regenerate aria-label="Regenerate" title="Regenerate"><i data-lucide="refresh-cw"></i></button>`
          : `<button class="icon-btn" type="button" data-chat-edit aria-label="Edit" title="Edit"><i data-lucide="pencil"></i></button>`}
      </div>
    </article>`;
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
    els.chatThread.innerHTML = state.chatMessages.map(chatMessageMarkup).join("") || `<div class="chat-list-empty">No messages yet</div>`;
    els.chatThread.querySelectorAll("[data-chat-message]").forEach((article) => {
      const message = state.chatMessages.find((item) => item.id === article.dataset.chatMessage);
      article.querySelector("[data-chat-copy]")?.addEventListener("click", () => navigator.clipboard?.writeText(message?.content || ""));
      article.querySelector("[data-chat-regenerate]")?.addEventListener("click", () => sendChatMessage({ action: "regenerate", targetMessageId: message?.id || "" }));
      article.querySelector("[data-chat-edit]")?.addEventListener("click", () => {
        if (!els.chatInput) return;
        els.chatInput.value = message?.content || "";
        els.chatInput.dataset.editMessageId = message?.id || "";
        els.chatInput.focus();
      });
    });
    requestAnimationFrame(() => { els.chatThread.scrollTop = els.chatThread.scrollHeight; });
  }
  if (els.chatCharacterCard) {
    els.chatCharacterCard.innerHTML = hasConversation ? `
      <img src="${escapeHtml(chatPoster(conversation.character))}" alt="${escapeHtml(conversation.character?.name || "")}" />
      <strong>${escapeHtml(conversation.character?.name || conversation.title)}</strong>
      <p>${escapeHtml(conversation.character?.description || "")}</p>
      <div>${(conversation.character?.tags || []).slice(0, 5).map((tag) => `<small>${escapeHtml(tag)}</small>`).join("")}</div>` : "";
  }
  if (els.chatSuggestionBtn && hasConversation) els.chatSuggestionBtn.textContent = `Tell me more, ${String(conversation.character?.name || "").split(/\s+/)[0] || "please"}.`;
  renderChatSettings(conversation);
  refreshIcons();
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

async function sendChatMessage({ action = "send", targetMessageId = "" } = {}) {
  const conversation = activeChatConversation();
  if (!conversation || state.chatSending) return;
  const editMessageId = els.chatInput?.dataset.editMessageId || "";
  const content = String(els.chatInput?.value || "").trim();
  const effectiveAction = editMessageId && action === "send" ? "edit" : action;
  if (!["continue", "regenerate"].includes(effectiveAction) && !content) return;
  state.chatSending = true;
  if (els.chatSendBtn) els.chatSendBtn.disabled = true;
  try {
    const payload = await requestJson(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages`, {
      method: "POST",
      body: { content, action: effectiveAction, targetMessageId: targetMessageId || editMessageId },
    });
    if (els.chatInput) {
      els.chatInput.value = "";
      delete els.chatInput.dataset.editMessageId;
    }
    if (payload.credits !== undefined && state.user) state.user.credits = payload.credits;
    await openChatConversation(conversation.id);
    renderAccountMenu();
    renderTopupSummary();
  } catch (error) {
    if (els.chatInput && !els.chatInput.value && content) els.chatInput.value = content;
    window.alert(error.message || "Chat failed.");
  } finally {
    state.chatSending = false;
    if (els.chatSendBtn) els.chatSendBtn.disabled = false;
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
document.querySelectorAll("[data-chat-setting]").forEach((button) => button.addEventListener("click", () => { state.chatSetting = button.dataset.chatSetting || "style"; renderChatSettings(); refreshIcons(); }));
document.querySelectorAll("[data-chat-close-panels]").forEach((button) => button.addEventListener("click", () => els.chatShell?.classList.remove("mobile-list-open", "mobile-settings-open")));
