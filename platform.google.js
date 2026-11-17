"use strict";

const GOOGLE_LOGIN_VISIBLE = true;

let googleLoginSdkPromise = null;
let googleLoginConfigured = false;
let googleLoginRenderedWidth = 0;
let googleLoginClickTimer = null;

function ensureGoogleLoginSdk() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (googleLoginSdkPromise) return googleLoginSdkPromise;
  googleLoginSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity-services="true"]');
    const script = existing || document.createElement("script");
    const finish = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error("Google login SDK is unavailable."));
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google login SDK could not be loaded.")), { once: true });
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentityServices = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleLoginSdkPromise = null;
    throw error;
  });
  return googleLoginSdkPromise;
}

function googleButtonLocale() {
  const locales = { zh: "zh-CN", ja: "ja", ko: "ko", vi: "vi", id: "id", en: "en" };
  return locales[String(state.lang || "en")] || "en";
}

function googleLoginButtonWidth() {
  const available = Math.floor(els.googleLoginBtn?.getBoundingClientRect?.().width || 0);
  return Math.max(200, Math.min(400, available || googleLoginRenderedWidth || 320));
}

function setGoogleLoginBusy(busy) {
  if (!els.googleLoginBtn) return;
  els.googleLoginBtn.classList.toggle("is-busy", Boolean(busy));
  els.googleLoginBtn.setAttribute("aria-busy", busy ? "true" : "false");
}

function clearGoogleLoginClickTimer() {
  if (googleLoginClickTimer) {
    window.clearTimeout(googleLoginClickTimer);
    googleLoginClickTimer = null;
  }
}

function showGoogleLoginStatus(message = "") {
  if (!els.googleLoginStatus) return;
  const text = String(message || "").trim();
  els.googleLoginStatus.textContent = text;
  els.googleLoginStatus.hidden = !text;
}

function beginGoogleLoginFeedback() {
  clearGoogleLoginClickTimer();
  showGoogleLoginStatus(t("auth.googleStarting"));
  setGoogleLoginBusy(true);
  googleLoginClickTimer = window.setTimeout(() => {
    googleLoginClickTimer = null;
    if (els.googleLoginBtn?.getAttribute("aria-busy") !== "true") return;
    setGoogleLoginBusy(false);
    showGoogleLoginStatus(t("auth.googleNoResponse"));
  }, 15000);
}

function resetGoogleLoginFeedback() {
  clearGoogleLoginClickTimer();
  setGoogleLoginBusy(false);
  showGoogleLoginStatus("");
}

function renderGoogleLoginButton(googleId = window.google?.accounts?.id) {
  if (!GOOGLE_LOGIN_VISIBLE) {
    if (els.googleLoginBtn) els.googleLoginBtn.hidden = true;
    return false;
  }
  if (!googleLoginConfigured || !els.googleLoginBtn || !googleId?.renderButton) return false;
  const container = els.googleLoginBtn;
  // GSI One Tap renders into the normal document layer, where a native
  // <dialog> top layer can cover it on mobile. An inline GIS button is clicked
  // directly and opens the browser's own authorization window instead.
  container.hidden = false;
  container.innerHTML = "";
  const width = googleLoginButtonWidth();
  googleLoginRenderedWidth = width;
  googleId.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    locale: googleButtonLocale(),
    width,
    click_listener: beginGoogleLoginFeedback,
  });
  container.dataset.renderedWidth = String(width);
  return true;
}

function configureGoogleLogin() {
  if (!GOOGLE_LOGIN_VISIBLE) {
    googleLoginConfigured = false;
    if (els.googleLoginBtn) els.googleLoginBtn.hidden = true;
    return;
  }
  const clientId = String(state.config?.auth?.google?.clientId || "").trim();
  googleLoginConfigured = Boolean(state.config?.auth?.google?.enabled && clientId);
  if (els.googleLoginBtn) els.googleLoginBtn.hidden = !googleLoginConfigured;
  if (!googleLoginConfigured) return;
  ensureGoogleLoginSdk().then((googleId) => {
    googleId.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    if (els.loginDialog?.open) renderGoogleLoginButton(googleId);
  }).catch(() => {
    if (els.googleLoginBtn) els.googleLoginBtn.hidden = true;
  });
}

async function handleGoogleCredential(response = {}) {
  clearGoogleLoginClickTimer();
  const credential = String(response.credential || "").trim();
  if (!credential) {
    showGoogleLoginStatus(t("auth.googleFailed", { message: "No credential was returned." }));
    setGoogleLoginBusy(false);
    return;
  }
  try {
    const payload = await requestJson("/api/google/login", {
      method: "POST",
      body: {
        credential,
        referralCode: localStorage.getItem(REFERRAL_CODE_KEY) || "",
        deviceId: sessionDeviceId(),
        attribution: (() => { try { return JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {}; } catch { return {}; } })(),
      },
    });
    await completeLogin(payload);
  } catch (error) {
    showGoogleLoginStatus(t("auth.googleFailed", { message: String(error?.message || error || "Authorization failed.") }));
  } finally {
    clearGoogleLoginClickTimer();
    setGoogleLoginBusy(false);
  }
}
