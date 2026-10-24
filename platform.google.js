"use strict";

const GOOGLE_LOGIN_VISIBLE = true;

let googleLoginSdkPromise = null;
let googleLoginConfigured = false;
let googleLoginRenderedWidth = 0;

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
  const credential = String(response.credential || "").trim();
  if (!credential) {
    if (els.googleLoginStatus) {
      els.googleLoginStatus.hidden = false;
      els.googleLoginStatus.textContent = t("auth.googleFailed", { message: "No credential was returned." });
    }
    setGoogleLoginBusy(false);
    return;
  }
  try {
    const payload = await requestJson("/api/google/login", {
      method: "POST",
      body: {
        credential,
        referralCode: localStorage.getItem(REFERRAL_CODE_KEY) || "",
        attribution: (() => { try { return JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {}; } catch { return {}; } })(),
      },
    });
    await completeLogin(payload);
  } catch (error) {
    if (els.googleLoginStatus) {
      els.googleLoginStatus.hidden = false;
      els.googleLoginStatus.textContent = t("auth.googleFailed", { message: String(error?.message || error || "Authorization failed.") });
    }
  } finally {
    setGoogleLoginBusy(false);
  }
}
