"use strict";

let googleLoginSdkPromise = null;
let googleLoginConfigured = false;

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

function configureGoogleLogin() {
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
    if (els.googleLoginBtn) els.googleLoginBtn.disabled = false;
    return;
  }
  try {
    const payload = await requestJson("/api/google/login", {
      method: "POST",
      body: {
        credential,
        referralCode: localStorage.getItem(REFERRAL_CODE_KEY) || "",
      },
    });
    await completeLogin(payload);
  } catch (error) {
    if (els.googleLoginStatus) {
      els.googleLoginStatus.hidden = false;
      els.googleLoginStatus.textContent = t("auth.googleFailed", { message: String(error?.message || error || "Authorization failed.") });
    }
  } finally {
    if (els.googleLoginBtn) els.googleLoginBtn.disabled = false;
  }
}

async function authorizeGoogleLogin() {
  if (!googleLoginConfigured || !els.googleLoginBtn || els.googleLoginBtn.disabled) return;
  els.googleLoginBtn.disabled = true;
  if (els.googleLoginStatus) {
    els.googleLoginStatus.hidden = false;
    els.googleLoginStatus.textContent = t("auth.googleStarting");
  }
  if (els.loginMessage) els.loginMessage.textContent = "";
  try {
    const googleId = await ensureGoogleLoginSdk();
    googleId.prompt((notification) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        if (els.googleLoginStatus) els.googleLoginStatus.textContent = t("auth.googleFailed", { message: "Google authorization was not displayed." });
        if (els.googleLoginBtn) els.googleLoginBtn.disabled = false;
      }
    });
  } catch (error) {
    if (els.googleLoginStatus) els.googleLoginStatus.textContent = t("auth.googleFailed", { message: String(error?.message || error || "Authorization failed.") });
    if (els.googleLoginBtn) els.googleLoginBtn.disabled = false;
  }
}
