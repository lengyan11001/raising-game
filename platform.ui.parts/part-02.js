async function tokenAccessPackageMarkdown() {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const baseUrl = API_ORIGIN || window.location.origin || "";
  const docsUrl = apiUrl("/docs/api.md");
  const docsJsonUrl = apiUrl("/docs/api.json");
  const modelsJsonUrl = apiUrl("/api/models");
  const modelDocs = await fetchLatestModelDocsMarkdown({ revealToken: true });
  return [
    "# Vipeak AI API Access Package",
    "",
    `Base URL: ${baseUrl}`,
    `API Token: ${token}`,
    `Markdown documentation: ${docsUrl}`,
    `Structured JSON documentation: ${docsJsonUrl}`,
    `Models JSON: ${modelsJsonUrl}`,
    "",
    "This package contains the production token and the complete canonical API documentation below.",
    "Keep the token on your server. Do not expose it in browser code or public repositories.",
    "",
    `Advanced task detail: ${apiUrl("/api/generation-records/<taskId>")}`,
    "",
    "---",
    "",
    modelDocs.trim(),
    "",
  ].join("\n");
}

function apiSubtokenStatusLabel(token = {}) {
  const status = String(token.status || "").toLowerCase();
  if (status === "revoked") return t("access.subtokenRevoked");
  if (status === "expired") return t("access.subtokenExpired");
  return t("access.subtokenActive");
}

function apiSubtokenQuotaLabel(token = {}) {
  const quotaType = String(token.quotaType || "") === "count" ? "count" : "amount";
  const unit = quotaType === "count" ? t("access.subtokenCount") : t("common.credits");
  return `${formatCredits(token.remaining)} / ${formatCredits(token.quotaLimit)} ${unit}`;
}

function apiSubtokenUsedLabel(token = {}) {
  if (String(token.quotaType || "") === "count") {
    return `${formatCredits(token.usedCount || 0)} ${t("access.subtokenCount")}`;
  }
  return `${formatCredits(token.usedAmount || 0)} ${t("common.credits")}`;
}

function apiSubtokenRemainingStep(token = {}) {
  return String(token.quotaType || "") === "count" ? "1" : "0.000001";
}

function apiSubtokenRemainingEditLabel(token = {}) {
  return String(token.quotaType || "") === "count"
    ? t("access.subtokenRemainingCountEdit")
    : t("access.subtokenRemainingAmountEdit");
}

function apiSubtokenExpiresInputValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function renderApiSubtokens() {
  if (!els.accessSubtokens) return;
  if (!tenantFeature("apiAccess", true)) {
    els.accessSubtokens.innerHTML = "";
    return;
  }
  if (!state.user) {
    els.accessSubtokens.innerHTML = `
      <article class="access-doc-card access-subtoken-card">
        <div class="access-doc-head">
          <div>
            <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
            <p>${escapeHtml(t("access.subtokensLogin"))}</p>
          </div>
        </div>
      </article>
    `;
    refreshIcons();
    return;
  }

  const created = state.createdApiSubtoken;
  const rows = (state.apiSubtokens || []).map((token) => `
    <article class="subtoken-row ${token.active ? "" : "is-disabled"}">
      <div class="subtoken-main">
        <strong>${escapeHtml(token.name || token.id)}</strong>
        <code>${escapeHtml(token.tokenPreview || maskToken(token.token || ""))}</code>
      </div>
      <div class="subtoken-metrics">
        <span><small>${escapeHtml(t("access.subtokenRemaining"))}</small><b>${escapeHtml(apiSubtokenQuotaLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenUsed"))}</small><b>${escapeHtml(apiSubtokenUsedLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenStatus"))}</small><b>${escapeHtml(apiSubtokenStatusLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenLastUsed"))}</small><b>${escapeHtml(token.lastUsedAt ? formatDateTime(token.lastUsedAt) : t("access.subtokenNever"))}</b></span>
      </div>
      <form class="subtoken-edit" id="subtoken-edit-${escapeHtml(token.id)}" data-edit-subtoken="${escapeHtml(token.id)}">
        <label class="field"><span>${escapeHtml(apiSubtokenRemainingEditLabel(token))}</span><input name="remaining" type="number" min="0" step="${escapeHtml(apiSubtokenRemainingStep(token))}" value="${escapeHtml(formatCredits(token.remaining || 0))}" ${token.revokedAt ? "disabled" : ""} /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input name="expiresAt" type="datetime-local" value="${escapeHtml(apiSubtokenExpiresInputValue(token.expiresAt))}" ${token.revokedAt ? "disabled" : ""} /></label>
      </form>
      <div class="subtoken-actions">
        <button class="ghost-button" type="button" disabled><i data-lucide="lock-keyhole"></i>${escapeHtml(t("access.subtokenMasked"))}</button>
        <button class="ghost-button" type="submit" form="subtoken-edit-${escapeHtml(token.id)}" data-save-subtoken="${escapeHtml(token.id)}" ${token.revokedAt ? "disabled" : ""}><i data-lucide="save"></i>${escapeHtml(t("access.subtokenSave"))}</button>
        <button class="ghost-button danger-link" type="button" data-revoke-subtoken="${escapeHtml(token.id)}" ${token.active ? "" : "disabled"}><i data-lucide="ban"></i>${escapeHtml(t("access.subtokenRevoke"))}</button>
      </div>
    </article>
  `).join("");

  els.accessSubtokens.innerHTML = `
    <article class="access-doc-card access-subtoken-card">
      <div class="access-doc-head subtoken-head">
        <div>
          <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
          <p>${escapeHtml(t("access.subtokensDesc"))}</p>
        </div>
        <button class="ghost-button" type="button" id="refreshSubtokensBtn" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="refresh-cw"></i>${escapeHtml(t("history.refresh"))}</button>
      </div>
      <form class="subtoken-create" id="subtokenCreateForm">
        <label class="field"><span>${escapeHtml(t("access.subtokenName"))}</span><input id="subtokenName" type="text" maxlength="80" placeholder="${escapeHtml(t("access.subtokenNamePlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuotaType"))}</span><select id="subtokenQuotaType"><option value="amount">${escapeHtml(t("access.subtokenAmount"))}</option><option value="count">${escapeHtml(t("access.subtokenCount"))}</option></select></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuota"))}</span><input id="subtokenQuotaLimit" type="number" min="0.000001" step="0.000001" placeholder="${escapeHtml(t("access.subtokenQuotaPlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input id="subtokenExpiresAt" type="datetime-local" /></label>
        <button class="copy-btn" type="submit" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="plus"></i>${escapeHtml(t("access.createSubtoken"))}</button>
      </form>
      ${created?.token ? `
        <div class="subtoken-created">
          <div>
            <strong>${escapeHtml(t("access.subtokenCreated"))}</strong>
            <code>${escapeHtml(created.token)}</code>
          </div>
          <button class="copy-btn" type="button" data-copy-created-subtoken="${escapeHtml(created.token)}"><i data-lucide="copy"></i>${escapeHtml(t("access.subtokenCopyNew"))}</button>
        </div>
      ` : ""}
      ${state.apiSubtokenMessage ? `<p class="job-note subtoken-message">${escapeHtml(state.apiSubtokenMessage)}</p>` : ""}
      <div class="subtoken-list">
        ${state.apiSubtokensLoading ? `<div class="job-note">${escapeHtml(t("assets.loading"))}</div>` : (rows || `<div class="job-note">${escapeHtml(t("access.subtokenEmpty"))}</div>`)}
      </div>
    </article>
  `;

  els.accessSubtokens.querySelector("#refreshSubtokensBtn")?.addEventListener("click", () => loadApiSubtokens({ force: true }));
  els.accessSubtokens.querySelector("#subtokenCreateForm")?.addEventListener("submit", submitApiSubtokenCreate);
  els.accessSubtokens.querySelectorAll("[data-copy-created-subtoken]").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = button.dataset.copyCreatedSubtoken || "";
      if (!token) return;
      await navigator.clipboard.writeText(token);
      button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("access.subtokenCopiedShort"))}`;
      refreshIcons();
      window.setTimeout(() => renderApiSubtokens(), 1400);
    });
  });
  els.accessSubtokens.querySelectorAll("[data-revoke-subtoken]").forEach((button) => {
    button.addEventListener("click", () => revokeApiSubtoken(button.dataset.revokeSubtoken || "", button));
  });
  els.accessSubtokens.querySelectorAll("[data-edit-subtoken]").forEach((form) => {
    form.addEventListener("submit", submitApiSubtokenUpdate);
  });
  refreshIcons();
}

async function loadApiSubtokens({ force = false } = {}) {
  if (!tenantFeature("apiAccess", true) || !state.user || !els.accessSubtokens) {
    state.apiSubtokens = [];
    state.apiSubtokensLoaded = false;
    renderApiSubtokens();
    return;
  }
  if (state.apiSubtokensLoading || (state.apiSubtokensLoaded && !force)) {
    renderApiSubtokens();
    return;
  }
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens");
    state.apiSubtokens = payload.subtokens || [];
    state.apiSubtokensLoaded = true;
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenLoadFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function submitApiSubtokenCreate(event) {
  event.preventDefault();
  if (!tenantFeature("apiAccess", true)) return;
  if (!state.user) return openLogin();
  const root = els.accessSubtokens;
  const name = root?.querySelector("#subtokenName")?.value.trim() || "";
  const quotaType = root?.querySelector("#subtokenQuotaType")?.value || "amount";
  const quotaLimit = Number(root?.querySelector("#subtokenQuotaLimit")?.value || 0);
  const expiresInput = root?.querySelector("#subtokenExpiresAt")?.value || "";
  const expiresAt = expiresInput ? new Date(expiresInput).toISOString() : "";
  if (!name || !Number.isFinite(quotaLimit) || quotaLimit <= 0) return;
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens", {
      method: "POST",
      body: { name, quotaType, quotaLimit, expiresAt },
    });
    state.createdApiSubtoken = payload.subtoken || null;
    state.apiSubtokens = payload.subtoken
      ? [payload.subtoken, ...(state.apiSubtokens || []).filter((token) => token.id !== payload.subtoken.id)]
      : state.apiSubtokens;
    state.apiSubtokensLoaded = true;
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenCreateFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function revokeApiSubtoken(tokenId, button = null) {
  if (!tenantFeature("apiAccess", true)) return;
  if (!tokenId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenRevoke"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenRevokeFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

async function submitApiSubtokenUpdate(event) {
  event.preventDefault();
  if (!tenantFeature("apiAccess", true)) return;
  const form = event.currentTarget;
  const tokenId = form?.dataset?.editSubtoken || "";
  if (!tokenId) return;
  const remainingInput = form.querySelector("[name='remaining']");
  const expiresInput = form.querySelector("[name='expiresAt']");
  const remaining = Number(remainingInput?.value || 0);
  if (!Number.isFinite(remaining) || remaining < 0) return;
  const expiresAt = expiresInput?.value ? new Date(expiresInput.value).toISOString() : "";
  const button = Array.from(els.accessSubtokens?.querySelectorAll("[data-save-subtoken]") || [])
    .find((item) => item.dataset.saveSubtoken === tokenId);
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenSave"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, {
      method: "PATCH",
      body: { remaining, expiresAt },
    });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenUpdateFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

function renderTokenDisplays() {
  const apiAccessEnabled = tenantFeature("apiAccess", true);
  if (els.accessTokenDisplay) {
    els.accessTokenDisplay.textContent = currentTokenLabel(state.showAccessToken);
  }
  if (els.accessTokenHint) {
    els.accessTokenHint.textContent = state.user
      ? t("access.tokenHintUser")
      : t("access.tokenHintGuest");
  }
  if (els.toggleAccessTokenBtn) {
    els.toggleAccessTokenBtn.textContent = state.showAccessToken ? t("common.hide") : t("common.showFull");
    els.toggleAccessTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyTokenBtn) {
    els.copyTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.copyTokenBtn.hidden = !apiAccessEnabled;
    els.copyTokenBtn.innerHTML = `<i data-lucide="key-round"></i>Copy token + docs`;
  }
  const accountTokenBox = els.accountToken?.closest(".token-box");
  if (accountTokenBox) accountTokenBox.hidden = !apiAccessEnabled;
  if (els.supportFab) {
    els.supportFab.hidden = !state.user;
  }
  if (els.accountName) els.accountName.textContent = state.user?.username || t("account.title");
  if (els.accountCredits) els.accountCredits.textContent = String(Number(state.user?.credits || 0));
  if (els.menuBalanceValue) els.menuBalanceValue.textContent = String(Number(state.user?.credits || 0));
  if (els.mobileDrawerUserName) els.mobileDrawerUserName.textContent = state.user?.username || t("nav.login");
  if (els.mobileDrawerCredits) {
    els.mobileDrawerCredits.hidden = !state.user;
    els.mobileDrawerCredits.textContent = state.user ? `${Number(state.user?.credits || 0)} credits` : "";
  }
  if (els.accountRole) els.accountRole.textContent = state.user?.role || "user";
  if (els.accountToken) els.accountToken.textContent = currentTokenLabel(state.showAccountToken);
  if (els.toggleAccountTokenBtn) {
    els.toggleAccountTokenBtn.textContent = state.showAccountToken ? t("common.hide") : t("common.showFull");
    els.toggleAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.toggleAccountTokenBtn.hidden = !apiAccessEnabled;
  }
  if (els.copyAccountTokenBtn) {
    els.copyAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.copyAccountTokenBtn.hidden = !apiAccessEnabled;
  }
}

function renderAccountMenu() {
  const loggedIn = Boolean(state.user);
  const apiAccessEnabled = tenantFeature("apiAccess", true);
  if (els.menuBalance) els.menuBalance.hidden = !loggedIn;
  if (els.topupHeadBtn) els.topupHeadBtn.hidden = !loggedIn;
  if (els.mobileDrawerTopupBtn) els.mobileDrawerTopupBtn.hidden = !loggedIn;
  if (els.mobileDrawerUser) els.mobileDrawerUser.hidden = !loggedIn;
  if (els.mobileDrawerLoginBtn) els.mobileDrawerLoginBtn.hidden = loggedIn;
  if (els.mobileDrawerLogoutBtn) els.mobileDrawerLogoutBtn.hidden = !loggedIn;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    const publicTab = button.dataset.tab === "pricing";
    button.hidden = !isTabAllowed(button.dataset.tab || "") || (!loggedIn && !publicTab);
  });
  if (els.menuLoginBtn) els.menuLoginBtn.hidden = loggedIn;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.disabled = !state.token || !state.user?.apiToken;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.hidden = !apiAccessEnabled || !loggedIn;
  if (els.menuLogoutBtn) {
    els.menuLogoutBtn.hidden = !loggedIn;
    els.menuLogoutBtn.disabled = !loggedIn;
  }
}

function closeAccountMenu() {
  if (els.accountMenu) els.accountMenu.hidden = true;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    button.classList.remove("is-active");
  });
}

function toggleAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = !els.accountMenu.hidden;
  renderAccountMenu();
  refreshIcons();
}

function generationVideoUrl(record) {
  return record?.cdnVideoUrl
    || record?.remoteVideoUrl
    || record?.providerVideoUrl
    || record?.upstreamVideoUrl
    || record?.videoUrl
    || record?.localVideoUrl
    || "";
}

const GENERATION_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const GENERATION_EXPIRED_PLACEHOLDER_URL = "/assets/brand/generation-expired.svg?v=content-expired-1";

function generationResultTimestamp(record = {}) {
  const value = record.createdAt || record.created_at || record.updatedAt || record.updated_at || "";
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isGenerationResultExpired(record = {}) {
  const timestamp = generationResultTimestamp(record);
  // Once a task is older than the provider's 24-hour result window, hide all
  // media uniformly, including records whose provider URL is already gone.
  return Boolean(timestamp && Date.now() - timestamp >= GENERATION_RESULT_TTL_MS);
}

function generationExpiredPlaceholderUrl() {
  return GENERATION_EXPIRED_PLACEHOLDER_URL;
}

function generationImageResultUrl(record) {
  return record?.cdnImageUrl
    || record?.remoteImageUrl
    || record?.providerImageUrl
    || record?.upstreamImageUrl
    || record?.imageResultUrl
    || record?.localImageUrl
    || "";
}

function generationImageResultUrls(record = {}) {
  return [...new Set([
    ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
    ...(Array.isArray(record.imageResultUrls) ? record.imageResultUrls : []),
    ...(Array.isArray(record.localImageUrls) ? record.localImageUrls : []),
    ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
    generationImageResultUrl(record),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
}

function generationPosterUrl(record) {
  return record?.cdnPosterUrl || record?.posterUrl || record?.localPosterUrl || generationImageResultUrl(record) || "";
}

function generationRecordDownloadHref(record = {}) {
  // Use the durable CDN copy first. Provider URLs expire quickly and can make
  // downloads stall even though the same file is already available on R2.
  const mediaUrl = record?.cdnVideoUrl || record?.cdnImageUrl
    || (Array.isArray(record?.cdnImageUrls) ? record.cdnImageUrls.find((item) => String(item || "").trim()) : "")
    || generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl || "";
  if (mediaUrl) return mediaUrl;
  const taskId = String(record?.taskId || "").trim();
  return taskId && !taskId.startsWith("pending-")
    ? `/api/generation-records/${encodeURIComponent(taskId)}/download`
    : "";
}

function generationRecordDownloadName(record = {}) {
  const taskId = String(record?.taskId || "generation").replace(/[^a-z0-9_-]/gi, "_") || "generation";
  const resultUrl = generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl || "";
  const cleanPath = String(resultUrl || "").split("?")[0].toLowerCase();
  const match = cleanPath.match(/\.(mp4|webm|mov|m4v|png|jpe?g|webp|bmp)$/i);
  return `${taskId}${match ? match[0] : (generationVideoUrl(record) ? ".mp4" : ".png")}`;
}

function canDownloadGenerationRecord(record = {}) {
  return Boolean(generationRecordDownloadHref(record) && (generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl));
}

function canAdvancedDownloadGenerationRecord(record = {}) {
  return Boolean(
    !isGenerationResultExpired(record)
    && record?.resultLocked !== true
    && String(record?.taskId || "").trim()
    && (record?.r2DownloadReady || record?.advancedDownloadAvailable)
    && (generationVideoUrl(record) || generationImageResultUrl(record) || record?.downloadUrl)
  );
}

function setAdvancedDownloadButtonState(button, status = "idle") {
  if (!button) return;
  const zh = state.lang === "zh";
  button.dataset.downloadState = status;
  button.classList.toggle("is-transferring", status === "transferring");
  button.classList.toggle("is-ready", status === "ready");
  const hint = `<span class="advanced-result-download-hint" aria-hidden="true">如果下载素材慢请点击我保存</span>`;
  if (status === "transferring") {
    button.disabled = true;
    button.innerHTML = `${hint}<i data-lucide="loader-circle"></i>${escapeHtml(zh ? "download2 转存中" : "Preparing download2")}`;
  } else if (status === "ready") {
    button.disabled = false;
    button.innerHTML = `${hint}<i data-lucide="cloud-download"></i>${escapeHtml(zh ? "download2 可下载" : "download2 available")}`;
  } else if (status === "failed") {
    button.disabled = false;
    button.innerHTML = `${hint}<i data-lucide="circle-alert"></i>${escapeHtml(zh ? "download2 重试" : "Retry download2")}`;
  } else {
    button.innerHTML = `${hint}<i data-lucide="cloud-download"></i>${escapeHtml(t("history.advancedDownload"))}`;
  }
  refreshIcons();
}

function showAdvancedDownloadError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) return;
  void showInlineDialog({
    title: state.lang === "zh" ? "高级下载暂不可用" : "Advanced download unavailable",
    body: `<p class="job-note">${escapeHtml(message)}</p>`,
    confirmText: t("common.close"),
    onConfirm: async () => {},
  });
}

function triggerBrowserDownload(href, fileName, options = {}) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  if (options.newTab) link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadGenerationRecord(record = {}, { advanced = false } = {}) {
  try {
    await downloadGenerationRecordInternal(record, { advanced });
    return true;
  } catch (error) {
    if (advanced) showAdvancedDownloadError(error);
    else console.warn("[generation-download-failed]", error?.message || error);
    return false;
  }
}

async function downloadGenerationRecordInternal(record = {}, { advanced = false } = {}) {
  let href = generationRecordDownloadHref(record);
  if (!advanced && href && !href.startsWith("/api/")) return triggerBrowserDownload(href, generationRecordDownloadName(record), { newTab: true });
  let fileName = generationRecordDownloadName(record);
  const taskId = String(record?.taskId || "").trim();
  const legacyHref = taskId && !taskId.startsWith("pending-")
    ? `/api/generation-records/${encodeURIComponent(taskId)}/download`
    : "";

  // Open a browser tab immediately. Fetching the whole media file through
  // fetch()+blob made the click appear unresponsive until the download had
  // completely finished. The browser can stream the upstream/R2 URL itself.
  const popup = advanced ? null : window.open("about:blank", "_blank");
  const openHref = (url) => {
    const target = String(url || "").trim();
    if (!target) return;
    if (popup && !popup.closed) {
      popup.location.href = target;
      return;
    }
    window.open(target, "_blank");
  };

  // Advanced downloads always resolve server-side first. A provider URL in
  // the record is not a durable download and must never bypass the on-demand
  // R2 preparation step.
  if (advanced && taskId && !taskId.startsWith("pending-")) {
    // On-demand R2 preparation may take several minutes. Keep each request
    // short and poll the lightweight status endpoint so Cloudflare cannot
    // time out while the server downloads and uploads the media.
    const startedAt = Date.now();
    const maxWaitMs = 16 * 60 * 1000;
    let retry = true;
    while (Date.now() - startedAt < maxWaitMs) {
      const query = new URLSearchParams({ quality: "r2" });
      if (retry) query.set("retry", "1");
      retry = false;
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/download-url?${query}`, { timeoutMs: 30000 });
      href = String(payload.url || "").trim();
      fileName = payload.fileName || fileName;
      if (href) {
        // R2 returns an attachment with CORS headers. Send the browser straight
        // to the signed URL instead of buffering the whole video with fetch()+blob.
        triggerBrowserDownload(href, fileName);
        return;
      }
      if (String(payload.status || "") === "failed") {
        throw new Error(payload.message || "高级下载转存失败，请重试。");
      }
      if (String(payload.status || "") !== "preparing") {
        throw new Error(payload.message || "高级下载暂时不可用。");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
    }
    throw new Error("高级下载转存超时，请稍后重试。");
  }

  // Standard downloads intentionally use the provider asset whenever it is
  // available. Do not wait for a presign request in that path.
  if (href && !href.startsWith("/api/")) {
    openHref(href);
    return;
  }
  if (taskId && !taskId.startsWith("pending-")) {
    try {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/download-url`);
      if (payload.url) {
        href = payload.url;
        fileName = payload.fileName || fileName;
      }
      if (payload.source === "r2_signed") {
        triggerBrowserDownload(href, fileName);
        return;
      }
    } catch {
      // Fall through to the public URL or legacy download endpoint.
    }
  }
  openHref(href || legacyHref);
}

function stripModelParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value || null;
  const next = { ...value };
  ["model", "provider", "modelProvider", "model_provider"].forEach((key) => delete next[key]);
  return next;
}

function mediaAssetPreviewUrl(asset = {}) {
  return asset.imageUrl
    || asset.videoUrl
    || asset.publicUrl
    || asset.cdnUrl
    || asset.url
    || asset.sourceImageUrl
    || asset.previewUrl
    || asset.localUrl
    || "";
}

function mediaAssetLabel(asset = {}, index = 0) {
  const type = String(asset.type || asset.key || "").replace(/_/g, " ");
  if (asset.type === "first_frame" || asset.key === "firstFrame") return "First frame";
  if (asset.type === "last_frame" || asset.key === "lastFrame") return "Last frame";
  if (asset.type === "reference_video") return "Video 1";
  if (asset.type === "first_clip") return "First clip";
  if (asset.type === "reference_image") return `Reference ${index + 1}`;
  return type || `Image ${index + 1}`;
}

function upstreamInputImageAssets(record = {}) {
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const payload = record.upstreamPayload && typeof record.upstreamPayload === "object" && !Array.isArray(record.upstreamPayload) ? record.upstreamPayload : {};
  const payloadParams = payload.params && typeof payload.params === "object" && !Array.isArray(payload.params) ? payload.params : {};
  const fileInfos = Array.isArray(payload.FileInfos) ? payload.FileInfos : [];
  const content = Array.isArray(payload.Content) ? payload.Content : Array.isArray(payload.content) ? payload.content : [];
  const nestedMedia = [...fileInfos, ...content].filter((item) => {
    const category = String(item?.Category || item?.category || item?.type || item?.Type || "").toLowerCase();
    const role = String(item?.Usage || item?.usage || item?.role || item?.Role || "").toLowerCase();
    return category.includes("image") || role.includes("image") || role.includes("reference") || role.includes("first") || role.includes("last");
  });
  const values = (source) => [
    source?.input_image,
    source?.inputImage,
    source?.image_url,
    source?.imageUrl,
    source?.image,
    source?.first_frame_url,
    source?.firstFrameUrl,
    source?.first_image,
    source?.firstImage,
    source?.last_frame_url,
    source?.lastFrameUrl,
    source?.last_image,
    source?.lastImage,
    ...(Array.isArray(source?.images) ? source.images : []),
    ...(Array.isArray(source?.image_urls) ? source.image_urls : []),
    ...(Array.isArray(source?.imageUrls) ? source.imageUrls : []),
    ...(Array.isArray(source?.reference_images) ? source.reference_images : []),
    ...(Array.isArray(source?.referenceImages) ? source.referenceImages : []),
    ...(Array.isArray(source?.reference_image_urls) ? source.reference_image_urls : []),
    ...(Array.isArray(source?.referenceImageUrls) ? source.referenceImageUrls : []),
  ];
  const normalize = (item) => {
    const source = typeof item === "string" ? { imageUrl: item, type: "reference_image" } : item;
    if (!source || typeof source !== "object") return null;
    const role = String(source.Usage || source.usage || source.role || source.Role || "").toLowerCase();
    const category = String(source.Category || source.category || source.Type || "").toLowerCase();
    const declaredType = String(source.type || "").toLowerCase();
    const type = role.includes("last") || role.includes("end")
      ? "last_frame"
      : role.includes("first")
      ? "first_frame"
      : category.includes("video") || declaredType.includes("video")
      ? "reference_video"
      : category.includes("audio") || declaredType.includes("audio")
      ? "reference_audio"
      : "reference_image";
    const imageUrl = source.imageUrl
      || source.image_url?.url
      || source.image_url
      || source.Url
      || source.URL
      || source.url
      || source.publicUrl
      || source.sourceImageUrl
      || source.image
      || "";
    if (!mediaAssetPreviewUrl({ ...source, imageUrl }) && !source.userAssetId && !source.assetId && !source.id) return null;
    return { ...source, imageUrl, type };
  };
  const sourceLists = [values(params), values(payloadParams), values(payload), nestedMedia]
    .map((list) => list.flatMap((item) => Array.isArray(item) ? item : [item]).map(normalize).filter(Boolean));
  const groups = new Map();
  sourceLists.forEach((items) => {
    const byType = new Map();
    items.forEach((item) => {
      if (!byType.has(item.type)) byType.set(item.type, []);
      byType.get(item.type).push(item);
    });
    byType.forEach((typeItems, type) => {
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(typeItems);
    });
  });
  return [...groups.entries()].flatMap(([type, lists]) => {
    if (type !== "reference_image") return lists.flat();
    const length = Math.max(0, ...lists.map((list) => list.length));
    const merged = [];
    for (let index = 0; index < length; index += 1) {
      let item = null;
      lists.forEach((list) => {
        const candidate = list[index];
        if (!candidate) return;
        if (!item) {
          item = { ...candidate };
          return;
        }
        item = {
          ...item,
          ...Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined && value !== null && value !== "")),
          imageUrl: item.imageUrl?.startsWith("asset://") ? candidate.imageUrl || item.imageUrl : item.imageUrl,
          assetId: item.assetId || candidate.assetId,
          userAssetId: item.userAssetId || candidate.userAssetId,
          assetUri: item.assetUri || candidate.assetUri,
          referenceAssetUri: item.referenceAssetUri || candidate.referenceAssetUri,
          type,
        };
      });
      if (item) merged.push(item);
    }
    return merged;
  });
}

function recordImageAssets(record = {}) {
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const normalizeImage = (asset = {}, fallbackType = "reference_image", fallbackLabel = "") => {
    const source = typeof asset === "string" ? { imageUrl: asset } : (asset || {});
    const rawUrl = String(mediaAssetPreviewUrl(source) || "").trim();
    const role = String(source.Usage || source.usage || source.role || source.Role || "").toLowerCase();
    const category = String(source.Category || source.category || source.Type || "").toLowerCase();
    const declaredType = String(source.type || source.key || "").toLowerCase();
    const type = role.includes("last") || role.includes("end")
      ? "last_frame"
      : role.includes("first")
      ? "first_frame"
      : category.includes("video") || declaredType.includes("video")
      ? "reference_video"
      : category.includes("audio") || declaredType.includes("audio")
      ? "reference_audio"
      : ["first_frame", "firstframe", "first-frame", "last_frame", "lastframe", "last-frame", "end_frame", "endframe", "source_image", "reference_image"].includes(declaredType)
      ? declaredType.replace(/[-]/g, "_")
      : fallbackType;
    const assetUri = String(source.assetUri || source.referenceAssetUri || (rawUrl.startsWith("asset://") ? rawUrl : "") || "").trim();
    const httpUrl = String(source.imageUrl || source.publicUrl || source.cdnUrl || source.url || source.sourceImageUrl || source.previewUrl || source.localUrl || "").trim();
    const resolvedHttpUrl = httpUrl && !httpUrl.startsWith("asset://") ? httpUrl : "";
    const inferredAssetId = (resolvedHttpUrl.match(/asset-[A-Za-z0-9-]+?(?=\.[A-Za-z0-9]+(?:[?#]|$))/)?.[0]
      || resolvedHttpUrl.match(/asset-[A-Za-z0-9-]+/)?.[0]
      || "");
    const assetId = String(source.userAssetId || source.assetId || source.id || inferredAssetId || "").trim();
    const url = resolvedHttpUrl || assetUri || rawUrl;
    return {
      ...source,
      type,
      assetId,
      userAssetId: source.userAssetId || assetId,
      assetUri,
      referenceAssetUri: source.referenceAssetUri || assetUri,
      imageUrl: resolvedHttpUrl || source.imageUrl || assetUri || rawUrl,
      url,
      dataUrl: source.dataUrl?.startsWith("asset://") ? "" : (source.dataUrl || resolvedHttpUrl),
      label: source.label || fallbackLabel || mediaAssetLabel({ ...source, type }, 0),
    };
  };
  const splitImages = (list = [], fallbackType = "reference_image") => {
    const groups = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const normalized = normalizeImage(item, fallbackType);
      if (!normalized.assetId && !normalized.assetUri && !normalized.url) return;
      if (["reference_audio", "reference_video", "first_clip"].includes(normalized.type)) return;
      const type = normalized.type || fallbackType;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(normalized);
    });
    return groups;
  };
  const mergeAtSamePosition = (lists = []) => {
    const length = Math.max(0, ...lists.map((list) => list.length));
    const merged = [];
    for (let index = 0; index < length; index += 1) {
      let item = null;
      lists.forEach((list) => {
        const candidate = list[index];
        if (!candidate) return;
        if (!item) {
          item = { ...candidate };
          return;
        }
        item = {
          ...item,
          ...Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined && value !== null && value !== "")),
          type: item.type || candidate.type,
          assetId: item.assetId || candidate.assetId,
          userAssetId: item.userAssetId || candidate.userAssetId,
          assetUri: item.assetUri || candidate.assetUri,
          referenceAssetUri: item.referenceAssetUri || candidate.referenceAssetUri,
          imageUrl: item.imageUrl?.startsWith("asset://") ? candidate.imageUrl || item.imageUrl : item.imageUrl,
          url: item.url?.startsWith("asset://") ? candidate.url || item.url : item.url,
          dataUrl: item.dataUrl || candidate.dataUrl,
        };
      });
      if (item) merged.push(item);
    }
    return merged;
  };
  const groups = new Map();
  const addGroups = (sourceGroups) => {
    sourceGroups.forEach((items, type) => {
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(items);
    });
  };
  addGroups(splitImages((Array.isArray(record.mediaAssets) ? record.mediaAssets : []).filter((asset) => !["driving_audio", "first_clip"].includes(asset.type))));
  addGroups(splitImages(params.referenceImages, "reference_image"));
  const referenceImageAssetIds = (Array.isArray(params.referenceImageAssetIds) ? params.referenceImageAssetIds : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (referenceImageAssetIds.length) {
    const referenceItems = groups.get("reference_image") || [];
    referenceItems.forEach((items, index) => {
      const assetId = referenceImageAssetIds[index];
      if (!assetId) return;
      items.forEach((item) => {
        if (item.assetId) return;
        item.assetId = assetId;
        item.userAssetId = assetId;
        item.fromLibrary = true;
      });
    });
  }
  addGroups(splitImages(record.imageUrls, "reference_image"));
  addGroups(splitImages(record.sourceImageUrls, "source_image"));
  addGroups(splitImages(params.referenceImageUrls, "reference_image"));
  addGroups(splitImages(upstreamInputImageAssets(record), "reference_image"));
  addGroups(splitImages([record.imageUrl].filter(Boolean), "reference_image"));
  addGroups(splitImages([record.sourceImageUrl].filter(Boolean), "source_image"));

  const typeOrder = ["first_frame", "firstframe", "first-frame", "last_frame", "lastframe", "last-frame", "end_frame", "endframe", "reference_image", "source_image"];
  const orderedTypes = [
    ...typeOrder.filter((type) => groups.has(type)),
    ...[...groups.keys()].filter((type) => !typeOrder.includes(type)),
  ];
  const seenUrls = new Set();
  const seenAssetIds = new Set();
  const seenAssetUris = new Set();
  const images = [];
  orderedTypes.forEach((type) => {
    mergeAtSamePosition(groups.get(type) || []).forEach((item) => {
      const url = String(item.url || item.imageUrl || "").trim();
      const assetId = String(item.assetId || item.userAssetId || "").trim();
      const assetUri = String(item.assetUri || item.referenceAssetUri || "").trim();
      if (!url && !assetId && !assetUri) return;
      if ((assetId && seenAssetIds.has(assetId))
        || (assetUri && seenAssetUris.has(assetUri))
        || (url && seenUrls.has(url))) return;
      if (assetId) seenAssetIds.add(assetId);
      if (assetUri) seenAssetUris.add(assetUri);
      if (url) seenUrls.add(url);
      images.push({ ...item, label: item.label || mediaAssetLabel(item, images.length) });
    });
  });
  const referenceIds = [
    ...(Array.isArray(record.userAssetIds) ? record.userAssetIds : [record.userAssetId]),
    ...(Array.isArray(params.referenceImageAssetIds) ? params.referenceImageAssetIds : []),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const unmatchedIds = referenceIds.filter((assetId) => !seenAssetIds.has(assetId));
  const urlOnlyImages = images.filter((item) => !item.assetId && (item.url || item.imageUrl));
  unmatchedIds.forEach((assetId, index) => {
    const target = urlOnlyImages[index];
    if (!target) return;
    target.assetId = assetId;
    target.userAssetId = assetId;
    target.fromLibrary = true;
    seenAssetIds.add(assetId);
  });
  return images;
}

function recordVideoAssets(record = {}) {
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => ["reference_video", "first_clip"].includes(asset.type))
    .map((asset, index) => ({
      ...asset,
      label: asset.label || (asset.type === "first_clip" ? "First clip" : `Video ${index + 1}`),
      videoUrl: asset.videoUrl || asset.url || asset.localUrl || "",
    }))
    .filter((asset) => asset.videoUrl);
}

function generationRecordSignature(record = {}) {
  const billing = record.billing || {};
  return [
    record.taskId,
    record.updatedAt,
    record.status,
    generationVideoUrl(record),
    generationPosterUrl(record),
    record.downloadUrl,
    record.error,
    record.ratio,
    record.resolution,
    record.duration,
    generationImageResultUrl(record),
    JSON.stringify(record.mediaAssets || []),
    billing.status,
    billing.final,
    billing.settled,
  ].map((value) => String(value ?? "")).join("|");
}

function generationRecordsSignature(records = []) {
  return [...records]
    .sort((left, right) => String(left.taskId || "").localeCompare(String(right.taskId || "")))
    .map(generationRecordSignature)
    .join("\n");
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return t("status.completed");
  if (["cancelled", "canceled"].includes(value)) return "Canceled";
  if (["failed", "error"].includes(value)) return t("status.failed");
  if (["running", "processing", "in_progress", "preparing", "submitting", "queued"].includes(value)) return t("status.processing");
  return status || t("status.submitted");
}

function openMobileDrawer() {
  if (document.querySelector("dialog[open]")) return;
  document.body.classList.add("mobile-drawer-open");
  if (els.mobileDrawerToggle) els.mobileDrawerToggle.setAttribute("aria-expanded", "true");
  if (els.mobileDrawerBackdrop) els.mobileDrawerBackdrop.hidden = false;
}

function closeMobileDrawer() {
  document.body.classList.remove("mobile-drawer-open");
  if (els.mobileDrawerToggle) els.mobileDrawerToggle.setAttribute("aria-expanded", "false");
  if (els.mobileDrawerBackdrop) els.mobileDrawerBackdrop.hidden = true;
}

function toggleMobileDrawer() {
  if (document.body.classList.contains("mobile-drawer-open")) closeMobileDrawer();
  else openMobileDrawer();
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["preparing", "submitting", "running", "processing", "in_progress", "queued"].includes(value)) return "running";
  return "submitted";
}

function isSucceededGenerationStatus(status) {
  return statusClass(status) === "succeeded";
}

function isCompletedGenerationRecord(record = {}) {
  if (isTerminalGenerationStatus(record.status)) return true;
  return Boolean((generationVideoUrl(record) || generationImageResultUrl(record) || String(record.textResult || record.responseText || "").trim())
    && !isPendingGenerationRecord(record));
}

function isFailedGenerationRecord(record = {}) {
  return statusClass(record.status) === "failed" || ["reference_failed", "rejected", "refunded"].includes(String(record.status || "").toLowerCase());
}

function generationCompletionLabel(record = {}) {
  return publicGenerationDisplayTitle(record, "生成记录");
}

function showGenerationCompletionNotice(record = {}) {
  const root = els.generationCompletionNotices;
  if (!root) return;
  const failed = isFailedGenerationRecord(record);
  const failureDetail = String(record.error || record.errorMessage || "").trim();
  const item = document.createElement("div");
  item.className = `generation-completion-notice${failed ? " is-failed" : ""}`;
  item.setAttribute("role", "status");
  item.innerHTML = `
    <span class="generation-completion-notice-icon"><i data-lucide="${failed ? "alert-circle" : "check"}"></i></span>
    <div class="generation-completion-notice-copy">
      <strong>${escapeHtml(failed ? (state.lang === "zh" ? "生成失败" : "Generation failed") : (state.lang === "zh" ? "🎉 生成完成" : "🎉 Generation complete"))}</strong>
      <span>${escapeHtml(generationCompletionLabel(record))} ${escapeHtml(failed
        ? (state.lang === "zh" ? `生成失败${failureDetail ? `：${failureDetail}` : ""}` : `failed${failureDetail ? `: ${failureDetail}` : ""}`)
        : (state.lang === "zh" ? "记录生成成功" : "generated successfully"))}</span>
    </div>
    <button class="generation-completion-notice-close" type="button" aria-label="${escapeHtml(state.lang === "zh" ? "关闭通知" : "Close notification")}"><i data-lucide="x"></i></button>
  `;
  item.querySelector(".generation-completion-notice-close")?.addEventListener("click", () => item.remove());
  root.prepend(item);
  refreshIcons();
  window.setTimeout(() => item.remove(), 6000);
}

const GENERATION_COMPLETION_STATUS_STORAGE_KEY = "raisingGameGenerationCompletionStatuses";
const GENERATION_COMPLETION_STATUS_LIMIT = 300;

function generationCompletionStatusStorageKey(userId = "") {
  return userId ? `${GENERATION_COMPLETION_STATUS_STORAGE_KEY}:${userId}` : "";
}

function readGenerationCompletionStatuses(userId = "") {
  const key = generationCompletionStatusStorageKey(userId);
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveGenerationCompletionStatuses() {
  const key = generationCompletionStatusStorageKey(state.user?.id || "");
  if (!key) return;
  const entries = Object.entries(state.generationCompletionStatuses || {}).filter(([taskId, status]) => taskId && status);
  const statuses = Object.fromEntries(entries.slice(-GENERATION_COMPLETION_STATUS_LIMIT));
  try {
    localStorage.setItem(key, JSON.stringify(statuses));
  } catch {
    // Notification persistence is best-effort; polling still works without it.
  }
}

function notifyGenerationCompletionChanges(previousRecords = [], nextRecords = []) {
  state.generationCompletionStatuses = state.generationCompletionStatuses || {};
  const previousByTask = new Map((Array.isArray(previousRecords) ? previousRecords : [])
    .filter((record) => record?.taskId)
    .map((record) => [String(record.taskId), record]));
  const completed = (Array.isArray(nextRecords) ? nextRecords : [])
    .filter((record) => record?.taskId && isCompletedGenerationRecord(record))
    .filter((record) => {
      const taskId = String(record.taskId);
      const rememberedStatus = state.generationCompletionStatuses[taskId];
      const previousStatus = rememberedStatus || previousByTask.get(taskId)?.status;
      if (!previousStatus || isTerminalGenerationStatus(previousStatus)) return false;
      return isTerminalGenerationStatus(record.status);
    })
    .filter((record) => {
      const taskId = String(record.taskId);
      if (state.generationCompletionNotified?.[taskId]) return false;
      state.generationCompletionNotified = state.generationCompletionNotified || {};
      state.generationCompletionNotified[taskId] = true;
      return true;
    });
  (Array.isArray(nextRecords) ? nextRecords : []).forEach((record) => {
    if (!record?.taskId || !record.status) return;
    const taskId = String(record.taskId);
    const previousStatus = state.generationCompletionStatuses[taskId];
    // A terminal result is authoritative. Do not let a stale list response
    // downgrade it and make the same task look newly completed on the next poll.
    if (isTerminalGenerationStatus(previousStatus)) return;
    state.generationCompletionStatuses[taskId] = String(record.status).toLowerCase();
  });
  saveGenerationCompletionStatuses();
  completed.slice(0, 3).forEach(showGenerationCompletionNotice);
  if (completed.length > 3) showGenerationCompletionNotice({ taskId: `${completed.length} records`, modelLabel: state.lang === "zh" ? `还有 ${completed.length - 3} 条` : `${completed.length - 3} more` });
}

const GENERATION_COMPLETION_REFRESH_INTERVAL_MS = 10 * 1000;

function mergeGenerationPollRecords(previousRecords = [], incomingRecords = []) {
  const incomingByTask = new Map((incomingRecords || [])
    .filter((record) => record?.taskId)
    .map((record) => [String(record.taskId), record]));
  const merged = (previousRecords || []).map((record) => incomingByTask.get(String(record?.taskId || "")) || record);
  incomingRecords.forEach((record) => {
    if (!record?.taskId || merged.some((item) => String(item?.taskId || "") === String(record.taskId))) return;
    merged.push(record);
  });
  return merged;
}

async function refreshGenerationCompletionRecords() {
  if (!state.user || state.generationCompletionRefreshInFlight) return;
  state.generationCompletionRefreshInFlight = true;
  try {
    const payload = await requestJson("/api/generation-records?page=1&limit=20&refresh=1");
    const records = Array.isArray(payload.records) ? payload.records : [];
    const historyRecords = Array.isArray(state.historyRecords) ? state.historyRecords : [];
    const resultRecords = Array.isArray(state.advancedResultRecords) ? state.advancedResultRecords : [];
    const trackedRecords = mergeGenerationPollRecords(
      mergeGenerationPollRecords(state.generationCompletionRecords || [], historyRecords),
      resultRecords,
    );
    notifyGenerationCompletionChanges(trackedRecords, records);
    state.generationCompletionRecords = records;
    records.forEach((record) => {
      if (record?.taskId && typeof mergeAdvancedResultRecord === "function") mergeAdvancedResultRecord(record);
    });
    const currentPage = Math.max(1, Number(state.historyRecordsPage || 1) || 1);
    if (currentPage === 1) state.historyRecords = mergeGenerationPollRecords(historyRecords, records);
    if (payload.user && JSON.stringify(payload.user) !== JSON.stringify(state.user)) {
      setUser(payload.user, { skipReferralRefresh: true });
    }
    if (state.tab === "history" && currentPage === 1) {
      renderHistory(state.historyRecords);
      historyRecordsSignature = generationRecordsSignature(state.historyRecords);
    }
    if (state.tab === "advanced" && state.advancedSideTab === "result" && typeof renderAdvancedResultPanel === "function") {
      renderAdvancedResultPanel();
    }
  } catch {
    // Transient polling failures are retried by the next interval.
  } finally {
    state.generationCompletionRefreshInFlight = false;
  }
}

function syncGenerationCompletionRefresh() {
  if (!state.user) {
    if (state.generationCompletionRefreshTimer) {
      window.clearInterval(state.generationCompletionRefreshTimer);
      state.generationCompletionRefreshTimer = 0;
    }
    state.generationCompletionRefreshInFlight = false;
    return;
  }
  if (state.generationCompletionRefreshTimer) return;
  state.generationCompletionRefreshTimer = window.setInterval(refreshGenerationCompletionRecords, GENERATION_COMPLETION_REFRESH_INTERVAL_MS);
  // Prime notifications with the current list, then refresh immediately so a
  // task that finished just before login is shown without waiting 10 seconds.
  refreshGenerationCompletionRecords();
}

function stopGenerationCompletionRefresh() {
  if (state.generationCompletionRefreshTimer) {
    window.clearInterval(state.generationCompletionRefreshTimer);
    state.generationCompletionRefreshTimer = 0;
  }
  state.generationCompletionRefreshInFlight = false;
}

function isTerminalGenerationStatus(status) {
  const value = String(status || "").toLowerCase();
  return ["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled", "reference_failed", "rejected", "refunded"].includes(value);
}

function billingLabel(billing = {}) {
  const pre = Number(billing.preDeducted || 0);
  const final = billing.final === null || billing.final === undefined ? null : Number(billing.final || 0);
  if (billing.status === "settle_pending_insufficient") return t("billing.pending", { pre, final });
  if (billing.settled && final !== null) return t("billing.final", { pre, final });
  return pre > 0 ? t("billing.prepaid", { pre }) : t("billing.noCharge");
}

function formatCredits(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "";
  return Number.isInteger(next) ? String(next) : next.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function creditsAmount(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function userPricingMultiplier() {
  const next = Number(state.user?.pricingMultiplier || 1);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.max(0.01, Math.min(100, next));
}

function formatDurationSeconds(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return t("cost.seconds", { value: Number.isInteger(next) ? next : next.toFixed(1).replace(/0+$/, "").replace(/\.$/, "") });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function templateCostLabel(templateId) {
  const estimate = state.estimates?.[templateId];
  if (!estimate) return t("cost.checking");
  if (estimate.available === false || estimate.credits === null || estimate.credits === undefined) return t("cost.unavailable");
  const duration = formatDurationSeconds(estimate.durationSeconds);
  const credits = formatCredits(estimate.credits);
  return duration ? `${t("cost.credits", { credits })} · ${duration}` : t("cost.credits", { credits });
}

function templateGenerateLabel(templateId) {
  return t("template.generate", { cost: templateCostLabel(templateId) });
}

function templateActionLabel(template = {}) {
  if (template.action === "advanced" || template.targetTab === "advanced") {
    return template.buttonLabel || "Advanced";
  }
  return templateGenerateLabel(template.id);
}

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const bounds = advancedDurationBounds(advancedCaseProvider(item));
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, duration));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return DEFAULT_ADVANCED_PROVIDER;
  if (["papaya", "papaya10", "carrothubpapaya10"].includes(normalized) || normalized.includes("carrothubpapaya")) return "papaya";
  if (["bytepluslanguage", "arklanguage", "ep202608271225548fsgw"].includes(normalized)) return "byteplus-language";
  if (["qwen37flash", "qwen3.7flash", "qwen3.7flash20260715"].includes(normalized) || normalized.includes("qwen37flash") || normalized.includes("qwen3.7flash")) return "qwen37-flash";
  if (["qwenimage3", "qwenimage30", "qwenimage3pro", "qwenimage30pro"].includes(normalized) || normalized.includes("qwenimage3.0")) return "qwen-image3";
  if (["seedream", "seedream5", "seedream50", "seedreamimage", "seedream5image", "seedream50image", "seedream5img", "seedream5imageedit"].includes(normalized) || normalized.includes("seedream5") || normalized.includes("seedream50")) return "seedream5-image";
  if (["seedancensfw", "seedance25nsfw", "seedance2.5nsfw"].includes(normalized) || (normalized.includes("seedance") && normalized.includes("nsfw"))) return "seedance-nsfw";
  if (["seedance20vega", "seedance2.0vega", "vega10pro", "vega1.0pro", "vega10", "vega1.0"].includes(normalized) || (normalized.includes("seedance20") && normalized.includes("vega")) || (normalized.includes("seedance2.0") && normalized.includes("vega"))) return "seedance20-vega";
  if (["seedance25vega", "seedance2.5vega"].includes(normalized) || (normalized.includes("seedance25") && normalized.includes("vega")) || (normalized.includes("seedance2.5") && normalized.includes("vega"))) return "seedance25-vega";
  if (["h3vega", "h3"].includes(normalized) || normalized.includes("h3vega")) return "h3-vega";
  if (["vega10lite", "vega1.0lite", "10lite"].includes(normalized) || normalized.includes("vega10lite") || normalized.includes("vega1.0lite")) return "vega10-lite";
  if (["seedance25", "seedance2.5", "seedancev25"].includes(normalized) || normalized.includes("seedance25") || normalized.includes("seedance2.5")) return "seedance25";
  if (["zimagespicypro", "zimagespicy", "zimage", "zimagepro", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return "z-image-spicy-pro";
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicypro"].includes(normalized) || normalized.includes("qwenimageedit")) return "qwen-image-edit-spicy";
  if (["wan27imageedit", "wan2.7imageedit", "wanimageedit", "imageedit", "wan27image", "vipeak1image", "vipeak1imageedit"].includes(normalized)) return "wan27-image-edit";
  if (["wan30", "wan3", "wan3.0", "wan3video", "wan3.0video"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return "wan30";
  if (normalized.includes("happyhorse") || normalized === "horse" || normalized === "hh") return "happyhorse";
  if (normalized.startsWith("wananimate") || normalized === "wanlegacy") return "wan27";
  if (["wan27", "wan2.7", "wan", "vipeak1", "vp1"].includes(normalized)) return "wan27";
  if (["seedance", "vipeak2", "vp2"].includes(normalized)) return "seedance";
  return normalized.includes("vipeak1") || normalized.includes("wan27") || normalized.includes("wan2.7") ? "wan27" : "seedance";
}

function advancedProviderLabel(provider = currentAdvancedProvider()) {
  const normalized = normalizeAdvancedProvider(provider);
  const capability = currentAdvancedVideoCapability(provider);
  if (normalized === "papaya") return "Papaya 1.0";
  if (normalized === "byteplus-language") return "BytePlus Language";
  if (normalized === "qwen37-flash") return "Qwen3.7 Flash";
  if (normalized === "qwen-image3") return "Qwen Image 3.0";
  if (normalized === "seedream5-image") return "Seedream 5.0 Image";
  if (normalized === "z-image-spicy-pro") return "Z-Image Spicy Pro";
  if (normalized === "qwen-image-edit-spicy") return "Qwen Image Edit Spicy";
  if (normalized === "wan27-image-edit") return "Wan 2.7 Image";
  if (normalized === "wan30") {
    const labels = {
      "wan30-video": "W3.0",
      "wan30-video-pro": "W3.0-Pro",
      "wan30-video-prime": "W3.0-Prime",
      "wan30-video-prime-pro": "W3.0-VSR-Prime",
    };
    return labels[capability] || "W3.0";
  }
  if (normalized === "seedance-nsfw") return "Seedance 2.5";
  if (VEGA_MODEL_LABELS[normalized]) return VEGA_MODEL_LABELS[normalized];
  if (normalized === "seedance25") return "Seedance 2.5";
  const labels = {
    "wan27-t2v": "Wan 2.7 - Text to Video",
    "wan27-i2v": "Wan 2.7 - Image to Video",
    "wan27-r2v": "Wan 2.7 - Reference to Video",
    "wan27-video-edit": "Wan 2.7 - Video Edit",
    "wan-legacy": "Wan Legacy",
    "wan-animate-move": "Wan Animate - Image Animation",
    "wan-animate-mix": "Wan Animate - Character Replacement",
    "happyhorse-t2v": "HappyHorse - Text to Video",
    "happyhorse-i2v": "HappyHorse - Image to Video",
    "happyhorse-r2v": "HappyHorse - Reference to Video",
    "happyhorse-video-edit": "HappyHorse - Video Edit",
  };
  if (labels[capability]) return labels[capability];
  if (normalized === "happyhorse") return "HappyHorse";
  return normalized === "wan27" ? "Wan 2.7" : "Seedance 2.0";
}

function prepareModalOpen() {
  closeMobileDrawer();
  closeAccountMenu();
}

const ADVANCED_ALIYUN_VIDEO_CAPABILITIES = new Set([
  "wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro",
  "wan27-t2v", "wan27-i2v", "wan27-r2v", "wan27-video-edit", "wan-legacy",
  "wan-animate-move", "wan-animate-mix", "happyhorse-t2v", "happyhorse-i2v",
  "happyhorse-r2v", "happyhorse-video-edit",
]);

const ADVANCED_VIDEO_CAPABILITY_GROUPS = Object.freeze({
  wan30: Object.freeze([
    Object.freeze({ value: "wan30-video", label: "W3.0" }),
    Object.freeze({ value: "wan30-video-pro", label: "W3.0-Pro" }),
  ]),
  "wan30-prime": Object.freeze([
    Object.freeze({ value: "wan30-video-prime", label: "W3.0-Prime" }),
    Object.freeze({ value: "wan30-video-prime-pro", label: "W3.0-VSR-Prime" }),
  ]),
  wan27: Object.freeze([
    Object.freeze({ value: "wan27-i2v", label: "Image to Video" }),
    Object.freeze({ value: "wan27-t2v", label: "Text to Video" }),
    Object.freeze({ value: "wan27-r2v", label: "Reference to Video" }),
    Object.freeze({ value: "wan27-video-edit", label: "Video Edit" }),
  ]),
  "wan-legacy": Object.freeze([
    Object.freeze({ value: "wan-legacy", label: "Legacy Model" }),
  ]),
  "wan-animate": Object.freeze([
    Object.freeze({ value: "wan-animate-move", label: "Image Animation" }),
    Object.freeze({ value: "wan-animate-mix", label: "Character Replacement" }),
  ]),
  happyhorse: Object.freeze([
    Object.freeze({ value: "happyhorse-i2v", label: "First Frame" }),
    Object.freeze({ value: "happyhorse-t2v", label: "Text Prompt" }),
    Object.freeze({ value: "happyhorse-r2v", label: "Reference Images" }),
    Object.freeze({ value: "happyhorse-video-edit", label: "Source Video + References" }),
  ]),
});

// An engine the picker does not offer must not be restored into the select, or
// the field comes back blank when an older record is reopened.
function advancedEngineOptionExists(value = "") {
  const target = String(value || "").trim().toLowerCase();
  if (!target || !els.advancedProvider) return true;
  return Array.from(els.advancedProvider.options).some((option) => option.value === target);
}

function advancedEngineValue(provider = els.advancedProvider?.value || "", capability = "") {
  const resolved = advancedEngineValueResolved(provider, capability);
  return advancedEngineOptionExists(resolved) ? resolved : DEFAULT_ADVANCED_PROVIDER;
}

function advancedEngineValueResolved(provider = els.advancedProvider?.value || "", capability = "") {
  const normalizedCapability = String(capability || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalizedCapability === "wan30-video-prime" || normalizedCapability === "wan30-video-prime-pro") return "wan30-prime";
  if (normalizedCapability === "wan30-video" || normalizedCapability === "wan30-video-pro") return "wan30";
  if (normalizedCapability === "wan-legacy") return "wan-legacy";
  if (["wan-animate-move", "wan-animate-mix"].includes(normalizedCapability)) return "wan-animate";
  if (normalizedCapability.startsWith("happyhorse-")) return "happyhorse";
  if (normalizedCapability.startsWith("wan30-")) return "wan30";
  if (normalizedCapability.startsWith("wan27-")) return "wan27";
  const raw = String(provider || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["wan-legacy", "wan-animate", "happyhorse", "seedance", "seedance25", "seedance-nsfw", "wan30", "wan30-prime", "wan27", "wan27-image-edit", "seedream5-image", "qwen-image3", "qwen37-flash", "byteplus-language", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(raw)) return raw;
  if (ADVANCED_ALIYUN_VIDEO_CAPABILITIES.has(raw)) return advancedEngineValue("", raw);
  return normalizeAdvancedProvider(provider);
}

function advancedVideoCapabilityOptions(engine = advancedEngineValue()) {
  return ADVANCED_VIDEO_CAPABILITY_GROUPS[advancedEngineValue(engine)] || [];
}

function syncAdvancedVideoCapabilityOptions(preferredCapability = "") {
  if (!els.advancedVideoCapability) return;
  const options = advancedVideoCapabilityOptions();
  const current = String(preferredCapability || els.advancedVideoCapability.value || "").trim();
  els.advancedVideoCapability.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  els.advancedVideoCapability.value = options.some((item) => item.value === current) ? current : (options[0]?.value || "");
  const field = els.advancedVideoCapability.closest(".field");
  field?.toggleAttribute("hidden", options.length <= 1);
  const label = field?.querySelector(":scope > span");
  if (label) label.textContent = "Mode";
}

const ADVANCED_SEEDANCE_MODE_OPTIONS = Object.freeze({
  seedance: Object.freeze([
    Object.freeze({ value: "reference_video", label: "Multimodal References" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  seedance25: Object.freeze([
    Object.freeze({ value: "omini", label: "Multimodal References" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  "seedance-nsfw": Object.freeze([
    Object.freeze({ value: "omini", label: "Multimodal References" }),
    Object.freeze({ value: "edit", label: "Video Edit" }),
    Object.freeze({ value: "extend", label: "Video Extend" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  wan30: Object.freeze([
    Object.freeze({ value: "reference_video", label: "Multimodal References" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
  ]),
  ...Object.fromEntries(VEGA_PROVIDER_IDS.map((id) => [id, Object.freeze([
    Object.freeze({ value: "reference_video", label: "Multimodal References" }),
    Object.freeze({ value: "first_frame", label: "First Frame" }),
    Object.freeze({ value: "last_frame", label: "Last Frame" }),
    Object.freeze({ value: "first_last_frame", label: "First + Last Frame" }),
    Object.freeze({ value: "text_to_video", label: "Text to Video" }),
    ...(VEGA_MODEL_CAPABILITIES[id]?.draft ? [Object.freeze({ value: "draft_followup", label: "Draft to Final" })] : []),
  ])])),
});

function syncAdvancedSeedanceModeOptions(provider = currentAdvancedProvider()) {
  if (!els.advancedSeedanceMediaMode) return;
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const options = ADVANCED_SEEDANCE_MODE_OPTIONS[normalizedProvider] || [];
  const current = isVegaProviderId(normalizedProvider) ? normalizeVegaUiMediaMode(els.advancedSeedanceMediaMode.value || "") : normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode.value || "");
  els.advancedSeedanceMediaMode.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  els.advancedSeedanceMediaMode.value = options.some((item) => item.value === current)
    ? current
    : (options[0]?.value || "reference_video");
}

function currentAdvancedVideoCapability(value = els.advancedProvider?.value || "") {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  // Capability ids identify the exact model and remain valid when reopening an
  // older record. Engine ids, however, are authoritative: W3.0 and
  // W3.0-Prime share provider wan30, so a stale Mode value from the previous
  // engine must never select the other engine's capability or price table.
  if (ADVANCED_ALIYUN_VIDEO_CAPABILITIES.has(raw)) return raw;
  const currentEngine = String(els.advancedProvider?.value || "").trim().toLowerCase();
  const engine = raw === "wan30" && ADVANCED_VIDEO_CAPABILITY_GROUPS[currentEngine]
    ? currentEngine
    : advancedEngineValue(raw);
  const options = advancedVideoCapabilityOptions(engine);
  const selected = String(els.advancedVideoCapability?.value || "").trim();
  if (options.some((item) => item.value === selected)) return selected;
  if (options.length) return options[0].value;
  return "";
}

function advancedVideoEditUsesSourceDuration(capability = currentAdvancedVideoCapability()) {
  return String(capability || "").trim() === "wan27-video-edit";
}

function advancedVideoInputDurationRule(provider = currentAdvancedProvider(), capability = currentAdvancedVideoCapability()) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (["seedance25", "seedance-nsfw"].includes(normalizedProvider)) return null;
  if (normalizedProvider === "seedance") {
    return { min: 1.8, max: 15.2, displayMin: 2, displayMax: 15 };
  }
  const rules = {
    "wan30-video": { min: 1, max: 15.2, displayMin: 1, displayMax: 15 },
    "wan30-video-pro": { min: 1, max: 15.2, displayMin: 1, displayMax: 15 },
    "wan30-video-prime": { min: 1, max: 15.2, displayMin: 1, displayMax: 15 },
    "wan30-video-prime-pro": { min: 1, max: 15.2, displayMin: 1, displayMax: 15 },
    "wan27-i2v": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan27-r2v": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan27-video-edit": { min: 1.8, max: 10.2, displayMin: 2, displayMax: 10 },
    "wan-animate-move": { min: 1.8, max: 30.2, displayMin: 2, displayMax: 30 },
    "wan-animate-mix": { min: 1.8, max: 30.2, displayMin: 2, displayMax: 30 },
    "happyhorse-video-edit": { min: 2.8, max: 60.2, displayMin: 3, displayMax: 60 },
    "wan-legacy": { min: 1.8, max: ADVANCED_WAN_CLIP_MAX_SECONDS, displayMin: 2, displayMax: 5 },
  };
  return rules[String(capability || "").trim()] || null;
}

function advancedVideoInputDurationMessage(durationSeconds, provider = currentAdvancedProvider(), capability = currentAdvancedVideoCapability(), { allowUnknown = false } = {}) {
  const seconds = Number(durationSeconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return allowUnknown ? "" : t("advanced.clipDurationUnreadable");
  }
  const rule = advancedVideoInputDurationRule(provider, capability);
  if (!rule || (seconds >= rule.min && seconds <= rule.max)) return "";
  return t("advanced.clipDurationRange", {
    min: rule.displayMin,
    max: rule.displayMax,
  });
}

function publicModelText(value = "") {
  return String(value ?? "");
}

function publicModelKey(key = "") {
  return String(key || "");
}

function advancedCaseProvider(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider);
}

function normalizeAdvancedResolution(value = "", provider = "seedance") {
  const raw = String(value || "").trim().toLowerCase();
  if (isVegaProviderId(normalizeAdvancedProvider(provider))) {
    const normalized = String(raw || "").toUpperCase();
    return vegaCapabilities(normalizeAdvancedProvider(provider))?.resolutions.includes(normalized) ? normalized : "1080P";
  }
  if (normalizeAdvancedProvider(provider) === "qwen-image3") return raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "seedream5-image") return raw === "1k" ? "1K" : "2K";
  if (["wan27-image-edit", "z-image-spicy-pro", "qwen-image-edit-spicy"].includes(normalizeAdvancedProvider(provider))) return raw === "4k" ? "4K" : raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "wan30") {
    const allowed = advancedVideoResolutionOptions(provider);
    if (allowed.includes(raw)) return raw;
    return allowed[0] || "1080p";
  }
  if (["wan27", "happyhorse"].includes(normalizeAdvancedProvider(provider))) return raw === "1080p" ? "1080p" : "720p";
  if (raw === "480p") return "480p";
  if (raw === "4k" || raw === "2160p") return "4k";
  return raw === "1080p" ? "1080p" : "720p";
}

function advancedDurationBounds(provider = "seedance", capability = "") {
  const normalized = normalizeAdvancedProvider(provider);
  if (["qwen37-flash", "byteplus-language", "papaya"].includes(normalized)) return { min: 1, max: 1, fallback: 1 };
  if (normalized === "qwen-image3") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "seedream5-image") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "wan27-image-edit" || normalized === "z-image-spicy-pro" || normalized === "qwen-image-edit-spicy") return { min: 1, max: 1, fallback: 1 };
  if (normalized === "wan30") return { min: -1, max: 30, fallback: 5 };
  if (isVegaProviderId(normalized)) return { ...(VEGA_DURATION_BOUNDS[normalized] || VEGA_DURATION_BOUNDS["seedance25-vega"]) };
  if (["seedance25", "seedance-nsfw"].includes(normalized)) return { min: 4, max: 30, fallback: 4 };
  const resolvedCapability = capability || (
    typeof currentAdvancedVideoCapability === "function"
    && typeof currentAdvancedProvider === "function"
    && normalizeAdvancedProvider(currentAdvancedProvider()) === normalized
      ? currentAdvancedVideoCapability()
      : ""
  );
  if (resolvedCapability === "wan27-video-edit") return { min: 2, max: 10, fallback: 5 };
  if (resolvedCapability === "wan27-r2v"
    && typeof state !== "undefined"
    && (state.advancedWanClipAssetId || state.advancedWanClipDataUrl || String(els.advancedWanClipUrl?.value || "").trim())) {
    return { min: 2, max: 10, fallback: 5 };
  }
  if (["wan-animate-move", "wan-animate-mix"].includes(resolvedCapability)) return { min: 2, max: 30, fallback: 5 };
  if (normalized === "happyhorse") return { min: 3, max: 15, fallback: 5 };
  return normalized === "wan27"
    ? { min: 2, max: 15, fallback: 5 }
    : { min: 5, max: 15, fallback: 5 };
}

function normalizeVideoRatio(value = "") {
  if (String(value || "").trim().toLowerCase() === "adaptive") return "adaptive";
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

