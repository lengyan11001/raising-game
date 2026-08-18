const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");
const config = fs.readFileSync(path.resolve(__dirname, "..", "platform.config.js"), "utf8");
const main = fs.readFileSync(path.resolve(__dirname, "..", "platform.main.js"), "utf8");
const platformHtml = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
const payHtml = fs.readFileSync(path.resolve(__dirname, "..", "pay.html"), "utf8");
const payJs = fs.readFileSync(path.resolve(__dirname, "..", "pay.js"), "utf8");

test("PayPal redirect checkout uses a dedicated payment host and keeps the legacy order endpoint", () => {
  assert.match(server, /PAYMENT_HOSTS/);
  assert.match(server, /pay\.seed2\.io/);
  assert.match(server, /\/api\/pay\/paypal\/checkout-sessions/);
  assert.match(server, /\/paypal-return/);
  assert.match(server, /\/paypal-cancel/);
  assert.match(server, /async function handleCreatePayPalOrder/);
  assert.match(server, /paypalOrderId: order\.paypalOrderId/);
  assert.match(server, /"payer-action", "approve"/);
  assert.match(server, /order\.paypalOrderId\s*\? await paypalRequest\(`\/v2\/checkout\/orders\/\$\{encodeURIComponent\(order\.paypalOrderId\)\}`\)/);
  assert.match(server, /billingPlanId/);
});

test("PayPal is the default payment method while USDT remains selectable", () => {
  assert.match(config, /topupMethod: "paypal"/);
  assert.match(main, /setTopupMethod\("paypal"\)/);
  assert.match(explore, /setTopupMethod\("paypal", \{ skipSummary: true \}\)/);
  assert.ok(platformHtml.indexOf('data-topup-method="paypal"') < platformHtml.indexOf('data-topup-method="usdt"'));
});

test("Top-up UI redirects to the payment session page instead of embedding PayPal SDK", () => {
  assert.match(explore, /\/api\/pay\/paypal\/checkout-sessions/);
  assert.match(explore, /Continue to PayPal/);
  assert.match(explore, /paypal-redirect-button/);
  assert.doesNotMatch(explore, /www\.paypal\.com\/sdk\/js/);
});

test("Dedicated payment page exists and can start a PayPal checkout session", () => {
  assert.match(payHtml, /Secure checkout/);
  assert.match(payHtml, /PayPal payment/);
  assert.match(payJs, /checkout-sessions/);
  assert.match(payJs, /Continue to PayPal/);
  assert.match(payJs, /Opening PayPal checkout/);
});
