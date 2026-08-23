"use strict";

let telegramSdkPromise = null;
let telegramLoginSdkPromise = null;

function telegramMiniApp() {
  return window.Telegram?.WebApp || null;
}

function ensureTelegramMiniAppSdk() {
  if (window.location.hostname.toLowerCase() !== "undress.14vips.com") return Promise.resolve(null);
  if (telegramMiniApp()) return Promise.resolve(telegramMiniApp());
  if (telegramSdkPromise) return telegramSdkPromise;
  telegramSdkPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-telegram-web-app-sdk="true"]');
    const script = existing || document.createElement("script");
    const finish = () => resolve(telegramMiniApp());
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    if (!existing) {
      script.src = "https://telegram.org/js/telegram-web-app.js?63";
      script.dataset.telegramWebAppSdk = "true";
      document.head.appendChild(script);
    }
  });
  return telegramSdkPromise;
}

function ensureTelegramLoginSdk() {
  if (window.Telegram?.Login?.auth) return Promise.resolve(window.Telegram.Login);
  if (telegramLoginSdkPromise) return telegramLoginSdkPromise;
  telegramLoginSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-telegram-login-sdk="true"]');
    const script = existing || document.createElement("script");
    const finish = () => {
      if (window.Telegram?.Login?.auth) resolve(window.Telegram.Login);
      else reject(new Error("Telegram login SDK is unavailable."));
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Telegram login SDK could not be loaded.")), { once: true });
    if (!existing) {
      script.src = "https://oauth.telegram.org/js/telegram-login.js?5";
      script.async = true;
      script.dataset.telegramLoginSdk = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    telegramLoginSdkPromise = null;
    throw error;
  });
  return telegramLoginSdkPromise;
}

function telegramLoginResult(options = {}) {
  return new Promise((resolve, reject) => {
    window.Telegram.Login.auth(options, (result = {}) => {
      if (result.error) {
        reject(new Error(String(result.error || "Authorization was cancelled.")));
        return;
      }
      const idToken = String(result.id_token || "").trim();
      if (!idToken) {
        reject(new Error("Telegram did not return an ID token."));
        return;
      }
      resolve(idToken);
    });
  });
}

async function authorizeTelegramLogin() {
  if (!els.telegramLoginBtn || els.telegramLoginBtn.disabled) return;
  els.telegramLoginBtn.disabled = true;
  if (els.telegramLoginStatus) els.telegramLoginStatus.textContent = t("auth.telegramStarting");
  if (els.loginMessage) els.loginMessage.textContent = "";
  try {
    if (telegramMiniApp() && String(telegramMiniApp().initData || "").trim()) {
      const authenticated = await loadTelegramMiniAppAuth();
      if (!authenticated || !state.token) throw new Error("Telegram Mini App authorization is unavailable.");
      els.loginDialog?.close();
      await refreshAfterLogin();
      return;
    }

    const [login, options] = await Promise.all([
      ensureTelegramLoginSdk(),
      requestJson("/api/telegram/login/options"),
    ]);
    if (!login?.auth) throw new Error("Telegram login SDK is unavailable.");
    const clientId = Number(options.clientId);
    if (!Number.isSafeInteger(clientId) || clientId <= 0 || !String(options.nonce || "").trim()) {
      throw new Error("Telegram login configuration is invalid.");
    }
    const idToken = await telegramLoginResult({
      client_id: clientId,
      scope: ["profile"],
      lang: String(state.lang || "en"),
      nonce: String(options.nonce),
    });
    const payload = await requestJson("/api/telegram/login", {
      method: "POST",
      body: {
        idToken,
        referralCode: localStorage.getItem(REFERRAL_CODE_KEY) || "",
      },
    });
    await completeLogin(payload);
  } catch (error) {
    const message = String(error?.message || error || "Authorization failed.");
    if (els.telegramLoginStatus) els.telegramLoginStatus.textContent = t("auth.telegramFailed", { message });
  } finally {
    if (els.telegramLoginBtn) els.telegramLoginBtn.disabled = false;
  }
}

function telegramMiniAppView() {
  const params = new URLSearchParams(window.location.search || "");
  const value = String(params.get("tg_view") || "create").trim().toLowerCase();
  return ["create", "history", "topups", "support", "account"].includes(value) ? value : "create";
}

function telegramMiniAppTaskId() {
  return String(new URLSearchParams(window.location.search || "").get("tg_task") || "").trim();
}

function applyTelegramTheme() {
  const app = telegramMiniApp();
  if (!app) return;
  const theme = app.themeParams || {};
  const root = document.documentElement;
  const colors = {
    "--tg-bg-color": theme.bg_color,
    "--tg-secondary-bg-color": theme.secondary_bg_color,
    "--tg-text-color": theme.text_color,
    "--tg-hint-color": theme.hint_color,
    "--tg-button-color": theme.button_color,
    "--tg-button-text-color": theme.button_text_color,
  };
  Object.entries(colors).forEach(([name, value]) => {
    if (value) root.style.setProperty(name, value);
  });
  if (theme.bg_color) root.style.setProperty("color-scheme", app.colorScheme === "light" ? "light" : "dark");
}

function applyTelegramMiniAppRoute() {
  if (!state.telegramMiniApp) return;
  const view = state.telegramView || telegramMiniAppView();
  if (view === "support") {
    if (typeof openSupportDialog === "function") window.setTimeout(() => openSupportDialog(), 80);
    return;
  }
  if (view === "account") {
    if (typeof openAccount === "function") window.setTimeout(() => openAccount(), 80);
    return;
  }
  const tab = view === "create" ? "gallery" : view;
  if (typeof setTab === "function") setTab(tab);
  const taskId = telegramMiniAppTaskId();
  if (taskId && tab === "history" && typeof loadHistory === "function") {
    window.setTimeout(() => loadHistory({ focusTaskId: taskId }).catch(() => {}), 120);
  }
}

async function loadTelegramMiniAppAuth() {
  await ensureTelegramMiniAppSdk();
  const app = telegramMiniApp();
  if (!app || !String(app.initData || "").trim()) return false;
  state.telegramMiniApp = true;
  state.telegramView = telegramMiniAppView();
  state.telegramStartParam = String(app.initDataUnsafe?.start_param || "").trim();
  app.ready?.();
  app.expand?.();
  applyTelegramTheme();
  app.onEvent?.("themeChanged", applyTelegramTheme);
  const payload = await requestJson("/api/telegram/webapp-auth", {
    method: "POST",
    body: { initData: String(app.initData || "") },
  });
  state.token = String(payload.token || "");
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  if (payload.user) setUser(payload.user);
  return true;
}

window.addEventListener("telegram-mini-app-ready", applyTelegramMiniAppRoute);
