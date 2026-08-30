const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const pay = fs.readFileSync(path.resolve(__dirname, "..", "pay.js"), "utf8");
const html = fs.readFileSync(path.resolve(__dirname, "..", "pay.html"), "utf8");
const config = fs.readFileSync(path.resolve(__dirname, "..", "platform.config.js"), "utf8");
const main = fs.readFileSync(path.resolve(__dirname, "..", "platform.main.js"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");
const create = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");
const telegram = fs.readFileSync(path.resolve(__dirname, "..", "telegram-bot.js"), "utf8");

test("Stripe checkout uses the dedicated storycut cashier host", () => {
  assert.match(server, /STRIPE_CHECKOUT_BASE_URL/);
  assert.match(server, /https:\/\/pay\.storycut\.club/);
  assert.match(server, /\/api\/pay\/stripe\/checkout-sessions/);
  assert.match(server, /STRIPE_CHECKOUT_REQUIRED/);
  assert.match(server, /isPaymentHostRequest\(req\)/);
  assert.match(server, /stripeRequest\("\/v1\/checkout\/sessions"/);
  assert.match(server, /metadata\[order_id\]/);
});

test("Payment page supports Stripe and PayPal sessions", () => {
  assert.match(pay, /stripe_sid/);
  assert.match(pay, /providerPath = isStripe \? "stripe" : "paypal"/);
  assert.match(pay, /Payment reference:/);
  assert.match(html, /Continue to payment/);
});

test("All web and Telegram recharge entry points default to Stripe with USDT available", () => {
  assert.match(config, /topupMethod: "stripe"/);
  assert.match(main, /setTopupMethod\("stripe"\)/);
  assert.match(explore, /setTopupMethod\("stripe"/);
  assert.match(create, /setTopupMethod\("stripe"/);
  assert.match(telegram, /telegramRechargeMarkup\(packages = \[\], paymentMethod = "stripe"\)/);
  assert.match(telegram, /tg:payment:stripe/);
  assert.match(telegram, /tg:payment:usdt/);
});
