(() => {
  const TOKEN_KEY = "raisingGameToken";
  const state = { config:null, characters:[], query:"", filter:"", selected:null, user:null, theme:"light", onboardingStep:0, onboardingAnswers:[] };
  const app = document.querySelector("#app");
  const loginDialog = document.querySelector("#loginDialog");
  const unlockDialog = document.querySelector("#unlockDialog");
  const emailDialog = document.querySelector("#emailDialog");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  async function api(url, options = {}) {
    const headers = { "content-type":"application/json", ...(options.headers || {}) };
    const token = getToken(); if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || `Request failed (${response.status})`); Object.assign(error, payload, { status:response.status }); throw error; }
    return payload;
  }
  function imageFor(item) { return item.characterImageUrl || item.referenceImageUrl || item.posterUrl || item.localImageUrl || item.imageUrl || "/assets/brand/logo-mark.svg"; }
  function filteredCharacters() { const query = state.query.toLowerCase(); return state.characters.filter((item) => (!query || `${item.name} ${item.title} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query)) && (!state.filter || String(item.gender || "").toLowerCase() === state.filter)); }
  function renderModels() {
    const items = filteredCharacters();
    app.innerHTML = `<section class="models-page"><div class="models-intro"><span class="eyebrow">DISCOVER</span><h1>Our Models</h1><p>Browse through our verified creators and find your perfect match.</p></div><div class="filter-bar"><input data-search placeholder="Search models..." value="${esc(state.query)}" /><select data-filter><option value="">All Locations</option><option value="female" ${state.filter === "female" ? "selected" : ""}>Female</option><option value="male" ${state.filter === "male" ? "selected" : ""}>Male</option></select><button class="search-button" data-search-button aria-label="Search">⌕</button></div><div class="model-grid">${items.length ? items.map(modelCard).join("") : `<div class="empty-state">No models match your search.</div>`}</div></section>`;
    app.querySelector("[data-search]")?.addEventListener("input", (event) => { state.query = event.target.value; renderModels(); });
    app.querySelector("[data-filter]")?.addEventListener("change", (event) => { state.filter = event.target.value; renderModels(); });
    app.querySelectorAll("[data-model-id]").forEach((card) => card.addEventListener("click", () => openDetail(card.dataset.modelId)));
  }
  function onboardingSteps() {
    const images = state.characters.slice(0, 12).map((item) => ({ image:imageFor(item), name:item.name || "Creator" }));
    return [
      { label:"Welcome", title:"Are you 18 or older?", kind:"binary", options:["I’m 18 or older", "I’m under 18"], blockedIndex:1 },
      { label:"Intent", title:"What are you looking for?", kind:"binary", options:["A private conversation", "Just browsing"] },
      { label:"Vibe", title:"Pick a vibe", kind:"binary", options:["Playful and flirty", "Warm and romantic"] },
      { label:"Style", title:"Choose a style", kind:"images", options:images.slice(0,3) },
      { label:"Energy", title:"What energy do you like?", kind:"images", options:images.slice(3,6) },
      { label:"Mood", title:"Set the mood", kind:"images", options:images.slice(6,9) },
      { label:"Ready", title:"Your private space is ready", kind:"ready" }
    ];
  }
  function showOnboarding() {
    const previewOnly = new URLSearchParams(location.search).get("onboarding") === "1";
    if (!previewOnly && localStorage.getItem("vipsChatOnboardingDone") === "1") return false;
    const steps = onboardingSteps();
    state.onboardingAnswers = [];
    const hero = state.characters.length ? imageFor(state.characters[0]) : "";
    const overlay = document.createElement("div"); overlay.className = "standalone-onboarding"; if (hero) overlay.style.backgroundImage = `url("${hero.replace(/"/g, "%22")}")`;
    overlay.innerHTML = `<div class="onboarding-card" data-onboarding-card><div class="onboarding-countdown" data-onboarding-countdown></div><div class="onboarding-intro" data-onboarding-intro><h1>A quick heads-up</h1><h2>This space pairs you with verified creators for private conversations. Please keep it private and respectful.</h2><p>Before we curate your matches we need to ask a few short questions.</p><button class="onboarding-pill" type="button" data-onboarding-agree>I agree</button><button class="onboarding-pill" type="button" data-onboarding-refuse>Decline</button><div class="onboarding-error" data-onboarding-error hidden></div></div><div class="onboarding-loading" data-onboarding-loading hidden><h2 data-onboarding-loading-title>》》》 Curating your matches 》》》</h2><h3 data-onboarding-loading-copy>Please answer honestly so the system can recommend</h3><div class="onboarding-progress"><i data-onboarding-progress></i></div></div><ul class="onboarding-chips" data-onboarding-chips></ul><div class="onboarding-step" data-onboarding-step hidden><h2 data-onboarding-title></h2><div class="onboarding-options" data-onboarding-options></div></div><div class="onboarding-done" data-onboarding-done hidden><h2>Congratulations!</h2><h4>Access granted</h4><p>We matched you with verified creators who are online right now.</p><ul><li>Keep the conversation private — never share anyone’s details outside this space.</li><li>Say hello first; the first message to every creator is free.</li><li>Unlock private media or longer sessions whenever you are ready.</li></ul><button class="onboarding-pill" type="button" data-onboarding-start>Start chatting</button></div><button class="onboarding-skip" type="button" data-onboarding-skip>Skip and browse models</button></div>`;
    document.body.appendChild(overlay);
    const card = overlay.querySelector("[data-onboarding-card]"), intro = overlay.querySelector("[data-onboarding-intro]"), error = overlay.querySelector("[data-onboarding-error]"), loading = overlay.querySelector("[data-onboarding-loading]"), loadingTitle = overlay.querySelector("[data-onboarding-loading-title]"), loadingCopy = overlay.querySelector("[data-onboarding-loading-copy]"), bar = overlay.querySelector("[data-onboarding-progress]"), chips = overlay.querySelector("[data-onboarding-chips]"), stepBox = overlay.querySelector("[data-onboarding-step]"), title = overlay.querySelector("[data-onboarding-title]"), options = overlay.querySelector("[data-onboarding-options]"), done = overlay.querySelector("[data-onboarding-done]"), countdown = overlay.querySelector("[data-onboarding-countdown]");
    let remaining = 5 * 60, countdownTimer = null;
    const finish = () => { localStorage.setItem("vipsChatOnboardingDone", "1"); if (countdownTimer) clearInterval(countdownTimer); if (previewOnly) { const url = new URL(location.href); url.searchParams.delete("onboarding"); history.replaceState(null, "", url); } overlay.remove(); location.hash = "models"; route(); };
    const pad = (value) => String(value).padStart(2, "0");
    const paintCountdown = () => { if (remaining < 0) { countdown.innerHTML = "<strong>00 : 00</strong>"; if (countdownTimer) clearInterval(countdownTimer); return; } countdown.innerHTML = `<strong>${pad(Math.floor(remaining / 60))} : ${pad(remaining % 60)}</strong>`; remaining -= 1; };
    paintCountdown(); countdownTimer = setInterval(paintCountdown, 1000);
    const runProgress = (onDone) => { bar.style.width = "0%"; loading.hidden = false; let progress = 0; const loop = setInterval(() => { progress += Math.random() * 10; bar.style.width = `${Math.min(progress, 100)}%`; if (progress >= 100) { clearInterval(loop); setTimeout(() => { loading.hidden = true; onDone(); }, 120); } }, 120); };
    const paintChips = (activeStep) => { chips.innerHTML = steps.map((item, index) => { const answer = state.onboardingAnswers[index]; const classes = `onboarding-chip ${index === activeStep ? "is-active" : ""} ${answer ? "is-answered" : ""}`; if (!answer) return `<li class="${classes}"><h4>${esc(item.label)}</h4></li>`; const text = typeof answer === "object" ? "" : esc(answer); const thumb = typeof answer === "object" && answer.image ? `<img class="onboarding-chip-image" src="${esc(answer.image)}" alt="" />` : ""; return `<li class="${classes}"><h4>${esc(item.label)}</h4>${thumb}${text ? `<span class="onboarding-chip-answer">${text}</span>` : ""}</li>`; }).join(""); };
    // Keep the active chip inside the card: the column slides with the flow instead of
    // running off the bottom edge on the last questions.
    const alignChips = (activeStep) => { if (window.innerWidth <= 575) { chips.style.transform = ""; return; } const center = (steps.length - 1) / 2; chips.style.transform = `translateY(calc(-50% + ${Math.round((center - activeStep) * 104)}px))`; };
    const renderStep = (stepIndex) => {
      if (stepIndex >= steps.length) { finish(); return; }
      const current = steps[stepIndex];
      state.onboardingStep = stepIndex;
      if (current.kind === "ready") { intro.hidden = true; stepBox.hidden = true; chips.classList.remove("is-visible"); chips.classList.add("is-hidden"); card.classList.remove("is-stepped"); loadingTitle.textContent = "》》》 Preparing your private space 》》》"; loadingCopy.textContent = "Almost there, please wait a moment"; runProgress(() => { done.hidden = false; }); return; }
      intro.hidden = true; stepBox.hidden = false; card.classList.add("is-stepped"); chips.classList.add("is-visible"); chips.classList.remove("is-hidden"); alignChips(stepIndex);
      paintChips(stepIndex); title.textContent = current.title; error.hidden = true;
      if (current.kind === "images") options.innerHTML = current.options.map((item, index) => `<button class="onboarding-option-image" type="button" data-onboarding-option="${index}"><span class="image"><img src="${esc(item.image)}" alt="" /></span><span class="name">${esc(item.name)}</span></button>`).join("");
      else options.innerHTML = current.options.map((item, index) => `<button class="onboarding-option-text ${index ? "is-decline" : "is-accept"}" type="button" data-onboarding-option="${index}">${esc(item)}</button>`).join("");
      options.querySelectorAll("[data-onboarding-option]").forEach((button) => button.addEventListener("click", () => {
        const optionIndex = Number(button.dataset.onboardingOption);
        if (current.blockedIndex === optionIndex) { error.textContent = "You must be 18 or older to continue."; error.hidden = false; return; }
        state.onboardingAnswers[stepIndex] = current.kind === "images" ? { ...current.options[optionIndex] } : current.options[optionIndex];
        paintChips(stepIndex);
        renderStep(stepIndex + 1);
      }));
    };
    const startQuestions = () => { intro.hidden = true; chips.classList.add("is-visible"); runProgress(() => renderStep(0)); };
    overlay.querySelector("[data-onboarding-agree]").addEventListener("click", startQuestions);
    overlay.querySelector("[data-onboarding-refuse]").addEventListener("click", startQuestions);
    overlay.querySelector("[data-onboarding-start]").addEventListener("click", finish);
    overlay.querySelector("[data-onboarding-skip]").addEventListener("click", finish);
    return true;
  }
  function modelCard(item) { return `<article class="model-card" data-model-id="${esc(item.id)}"><span class="country-badge">🌐</span><span class="free-badge">Free Chat</span><img src="${esc(imageFor(item))}" alt="${esc(item.name || "Model")}" loading="lazy" /><div class="model-card-body"><h3>${esc(item.name || "Model")}</h3><p>${esc((item.tags || []).slice(0,2).join(" · ") || item.style || "Verified creator")}</p></div></article>`; }
  function openDetail(id) { const item = state.characters.find((entry) => String(entry.id) === String(id)); if (!item) return; state.selected = item; location.hash = `model/${encodeURIComponent(item.id)}`; renderDetail(item); }
  function renderDetail(item) {
    const image = imageFor(item); const tags = (item.tags || []).slice(0,3); const media = (item.homeSceneVideos ? Object.values(item.homeSceneVideos) : []).filter((entry) => entry.posterUrl || entry.cdnPosterUrl).slice(0,2);
    app.innerHTML = `<section class="detail-page"><div class="detail-shell"><a class="back-link" href="#models">← Back to models</a><div class="profile-card"><img class="profile-avatar" src="${esc(image)}" alt="${esc(item.name)}" /><div class="profile-copy"><h1>${esc(item.name || "Model")} <span class="verified">✓</span></h1><div class="tag-row">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div><div class="profile-actions"><button class="solid-button" data-detail-chat>◌ Chat</button><button class="outline-button" data-detail-love>♡ Love</button></div></div><div class="profile-features"><div class="feature-card"><span class="feature-icon">✓</span><strong>Private chat</strong><small>Personal replies</small></div><div class="feature-card"><span class="feature-icon" style="color:#5d9cff;background:#edf4ff">☏</span><strong>Free preview</strong><small>Message first</small></div><div class="feature-card"><span class="feature-icon" style="color:#a45cff;background:#f5edff">▣</span><strong>Paid content</strong><small>Exclusive media</small></div></div></div><div class="content-grid"><div class="media-card">${media.length ? media.map((entry) => `<div class="media-item"><img src="${esc(entry.posterUrl || entry.cdnPosterUrl || image)}" alt="Preview" /><strong>${esc(entry.sceneName || "Exclusive preview")}</strong><b>$45,00</b></div>`).join("") : `<div class="media-item"><img src="${esc(image)}" alt="Preview" /><strong>Private preview</strong><b>$45,00</b></div>`}</div><div class="unlock-box"><div class="unlock-lock">♙</div><h2>Unlock Exclusive Content</h2><p>Subscribe to access private chats, exclusive media, and special content from this creator.</p><div class="plans"><button class="plan is-selected" data-plan="tool-usd-10"><small>1 Month</small><strong>$9.99<small>/mo</small></strong></button><button class="plan" data-plan="tool-usd-20"><small>3 Months</small><strong>$8.99<small>/mo</small></strong><em>-10%</em></button><button class="plan" data-plan="tool-usd-50"><small>6 Months</small><strong>$7.99<small>/mo</small></strong><em>-20%</em></button><button class="plan" data-plan="tool-usd-50"><small>12 Months</small><strong>$6.99<small>/mo</small></strong><em>-30%</em></button></div><button class="solid-button subscribe-button" data-subscribe>Subscribe Now</button></div></div></div></section>`;
    const loveButton = app.querySelector("[data-detail-love]");
    const loved = localStorage.getItem(`vipsChatLove:${item.id}`) === "1";
    loveButton?.classList.toggle("is-loved", loved); if (loveButton) loveButton.textContent = loved ? "♥ Loved" : "♡ Love";
    app.querySelector("[data-detail-chat]")?.addEventListener("click", (event) => { event.preventDefault(); startChat(); });
    loveButton?.addEventListener("click", (event) => { event.preventDefault(); const next = localStorage.getItem(`vipsChatLove:${item.id}`) !== "1"; localStorage.setItem(`vipsChatLove:${item.id}`, next ? "1" : "0"); loveButton.classList.toggle("is-loved", next); loveButton.textContent = next ? "♥ Loved" : "♡ Love"; });
    app.querySelector("[data-subscribe]")?.addEventListener("click", (event) => { event.preventDefault(); openUnlock(); }); app.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => { app.querySelectorAll("[data-plan]").forEach((entry) => entry.classList.remove("is-selected")); button.classList.add("is-selected"); }));
  }
  async function startChat() { if (!state.selected) return; if (!getToken()) { loginDialog.showModal(); return; } try { const result = await api("/api/chat/conversations", { method:"POST", body:JSON.stringify({ characterId:state.selected.id }) }); location.hash = `chat/${encodeURIComponent(result.conversation.id)}`; window.alert("Chat unlocked. Your conversation is ready."); } catch (error) { if (error.status === 402 || error.code === "CHAT_UNLOCK_REQUIRED") openUnlock(); else window.alert(error.message); } }
  function openUnlock() { if (!getToken()) { loginDialog.showModal(); return; } unlockDialog.showModal(); renderUnlockOptions(); }
  let unlockPackageId = "tool-usd-10";
  let unlockPaymentMethod = "stripe";
  function renderUnlockOptions() { const root = unlockDialog.querySelector("[data-unlock-options]"); root.innerHTML = [10,20,50].map((amount, index) => `<button class="plan ${index === 0 ? "is-selected" : ""}" type="button" data-unlock-package="tool-usd-${amount}"><small>${index === 0 ? "Starter" : index === 1 ? "Creator" : "Studio"}</small><strong>$${amount}</strong><span>${amount * 100} credits</span></button>`).join(""); root.querySelectorAll("[data-unlock-package]").forEach((button) => button.addEventListener("click", () => { unlockPackageId = button.dataset.unlockPackage; root.querySelectorAll("[data-unlock-package]").forEach((entry) => entry.classList.remove("is-selected")); button.classList.add("is-selected"); })); renderUnlockPaymentMethods(); }
  function renderUnlockPaymentMethods() { const root = unlockDialog.querySelector("[data-unlock-payment-methods]"); root.innerHTML = `<button type="button" role="tab" data-unlock-method="stripe" class="${unlockPaymentMethod === "stripe" ? "is-active" : ""}">Pay with Stripe</button><button type="button" role="tab" data-unlock-method="usdt" class="${unlockPaymentMethod === "usdt" ? "is-active" : ""}">Pay with USDT</button>`; root.querySelectorAll("[data-unlock-method]").forEach((button) => button.addEventListener("click", () => { unlockPaymentMethod = button.dataset.unlockMethod; if (unlockPaymentMethod === "stripe") beginStripe(); else createUnlockUsdtOrder(); })); unlockDialog.querySelector("[data-unlock-usdt-payment]").hidden = unlockPaymentMethod !== "usdt"; }
  async function beginStripe(packageId = unlockPackageId) { const message = unlockDialog.querySelector("[data-unlock-message]"); message.textContent = "Opening secure Stripe checkout..."; try { const result = await api("/api/pay/stripe/checkout-sessions", { method:"POST", body:JSON.stringify({ packageId, returnUrl:`${location.origin}${location.pathname}#model/${encodeURIComponent(state.selected?.id || "")}`, cancelUrl:location.href }) }); if (result.checkoutUrl) { unlockDialog.close(); location.href = result.checkoutUrl; } else message.textContent = "Stripe checkout page is unavailable."; } catch (error) { message.textContent = error.message; } }
  function usdtQrUrl(value) { return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`; }
  async function createUnlockUsdtOrder() { const message = unlockDialog.querySelector("[data-unlock-message]"); const panel = unlockDialog.querySelector("[data-unlock-usdt-payment]"); message.textContent = "Creating USDT order..."; panel.hidden = false; panel.innerHTML = "<span>Loading secure USDT payment...</span>"; try { const result = await api("/api/pay/orders", { method:"POST", body:JSON.stringify({ packageId: unlockPackageId }) }); const order = result.order || {}; const amount = order.payableAmountText || order.payableAmount || order.amount || ""; const asset = order.asset || "USDT"; const network = order.network || "TRC20"; const address = order.address || ""; panel.innerHTML = `<strong>Pay exactly ${esc(amount)} ${esc(asset)}</strong><small>Network: ${esc(network)}</small>${address ? `<img src="${esc(usdtQrUrl(`${asset}:${address}?amount=${amount}`))}" alt="USDT QR" /><code>${esc(address)}</code>` : ""}<input data-unlock-tx-hash placeholder="Transaction hash" /><button type="button" data-unlock-confirm>I've paid, confirm transaction</button>`; panel.querySelector("[data-unlock-confirm]")?.addEventListener("click", async () => { const hash = panel.querySelector("[data-unlock-tx-hash]")?.value || ""; if (!hash.trim()) { message.textContent = "Enter the transaction hash first."; return; } try { await api(`/api/pay/orders/${encodeURIComponent(order.id)}/confirm`, { method:"POST", body:JSON.stringify({ confirmationHash:hash.trim(), transactionHash:hash.trim() }) }); message.textContent = "Payment submitted. Credits will be added after confirmation."; } catch (error) { message.textContent = error.message; } }); message.textContent = "Send USDT using the exact amount, then submit the transaction hash."; } catch (error) { panel.innerHTML = ""; message.textContent = error.message; } }
  async function load() { try { const result = await api("/api/config/public"); state.config = result.config; state.characters = result.config?.homeVideo?.items || []; const token = getToken(); if (token) { try { const me = await api("/api/auth/me"); state.user = me.user; document.querySelector("[data-account-label]").textContent = me.user?.username || me.user?.email || "My Account"; } catch {} } if (!showOnboarding()) route(); } catch (error) { app.innerHTML = `<div class="empty-state">Unable to load models: ${esc(error.message)}</div>`; } }
  function route() { const match = location.hash.match(/^#model\/(.+)$/); if (match) { const id = decodeURIComponent(match[1]); const item = state.characters.find((entry) => String(entry.id) === id); if (item) return renderDetail(item); } renderModels(); }
  document.addEventListener("click", (event) => { const action = event.target.closest("[data-action]")?.dataset.action; if (action === "models") { location.hash = "models"; route(); } if (action === "categories") { document.querySelector("[data-search]")?.focus(); } if (action === "account") { if (getToken()) { localStorage.removeItem(TOKEN_KEY); location.reload(); } else loginDialog.showModal(); } if (action === "theme") { document.body.classList.toggle("dark"); } if (action === "email-login") { loginDialog.close(); emailDialog.showModal(); } if (action === "request-email") requestEmailCode(); });
  document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); button.closest("dialog")?.close(); }));
  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const message = form.querySelector("[data-login-message]"); try { const result = await api("/api/auth/login-or-register", { method:"POST", body:JSON.stringify({ username:form.username.value.trim(), password:form.password.value }) }); localStorage.setItem(TOKEN_KEY, result.token); loginDialog.close(); location.reload(); } catch (error) { message.textContent = error.message; } });
  async function requestEmailCode() { const form = document.querySelector("[data-email-form]"); const message = form.querySelector("[data-email-message]"); try { await api("/api/auth/email/request", { method:"POST", body:JSON.stringify({ email:form.email.value.trim() }) }); message.textContent = "Verification code sent."; } catch (error) { message.textContent = error.message; } }
  document.querySelector("[data-email-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const message = form.querySelector("[data-email-message]"); try { const result = await api("/api/auth/email/verify", { method:"POST", body:JSON.stringify({ email:form.email.value.trim(), code:form.code.value.trim() }) }); localStorage.setItem(TOKEN_KEY, result.token); emailDialog.close(); location.reload(); } catch (error) { message.textContent = error.message; } });
  function chatLiveSectionHTML() {
    if (!window.ChatLive || !window.ChatLive.available()) return "";
    const price = window.ChatLive.saleCreditsPerMinute();
    const cards = window.ChatLive.characters().map((item) => `
      <article class="model-card" data-live-character="${esc(item.id)}">
        <span class="free-badge">LIVE</span>
        <img src="${esc(item.portraitUrl || item.avatarUrl || "")}" alt="${esc(item.name || "Live")}" loading="lazy" />
        <div class="model-card-body">
          <h3>${esc(item.name || "Live")}</h3>
          <p>${esc(item.intro || "在线语音视频聊天")}</p>
          <button class="solid-button" type="button" data-live-start="${esc(item.id)}">在线聊天 · ${esc(String(price))} 积分/分钟</button>
        </div>
      </article>`).join("");
    return `<section class="models-page" data-chat-live-section style="padding-bottom:0"><div class="models-intro"><span class="eyebrow">LIVE</span><h1>在线聊天</h1><p>数字人实时视频对话：你说话，她回应（单向视频，支持语音与文字）。</p></div><div class="model-grid">${cards}</div></section>`;
  }
  function injectChatLiveSection() {
    if (document.querySelector("[data-chat-live-section]")) return;
    const modelsPage = document.querySelector("#app .models-page");
    const html = chatLiveSectionHTML();
    if (!modelsPage || !html) return;
    modelsPage.insertAdjacentHTML("beforebegin", html);
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("hashchange", () => window.setTimeout(injectChatLiveSection, 30));
  /* 先等首页数据加载完，再用后台「在线聊天配置」的角色覆盖 model 列表，
     否则两个请求竞争，老的 homeVideo 列表会把配置好的角色盖回去。 */
  load().then(async () => {
    if (!window.ChatLive) return;
    await window.ChatLive.loadConfig().catch(() => {});
    const configured = window.ChatLive?.characters?.() || [];
    if (configured.length) {
      state.characters = configured.map((item) => ({
        id: item.id,
        name: item.name,
        title: item.intro || "",
        description: item.intro || "",
        tags: item.tags || [],
        characterImageUrl: item.portraitUrl || item.avatarUrl || "",
        referenceImageUrl: item.avatarUrl || "",
      }));
      if (!document.querySelector(".standalone-onboarding")) route();
    }
    injectChatLiveSection();
  }).catch(() => {});
  document.addEventListener("click", (event) => {
    const startButton = event.target.closest?.("[data-live-start]");
    if (startButton) {
      event.preventDefault();
      if (window.ChatLive) window.ChatLive.open(startButton.dataset.liveStart).catch((error) => window.alert(error.message || String(error)));
      return;
    }
    const card = event.target.closest?.("[data-live-character]");
    if (card) {
      event.preventDefault();
      if (window.ChatLive) window.ChatLive.open(card.dataset.liveCharacter).catch((error) => window.alert(error.message || String(error)));
    }
  });
})();
