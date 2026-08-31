const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.resolve(__dirname, "..", "admin.js"), "utf8");

test("Stripe orders persist provider details and support historical GET hydration", () => {
  assert.match(server, /stripeChargeId/);
  assert.match(server, /stripeCustomerEmail/);
  assert.match(server, /stripePaymentMethodType/);
  assert.match(server, /stripeFailureMessage/);
  assert.match(server, /stripeRefundedAmount/);
  assert.match(server, /stripeRequest\(`\/v1\/checkout\/sessions/);
  assert.match(server, /"checkout.session.async_payment_failed"/);
  assert.match(server, /"payment_intent.payment_failed"/);
  assert.match(server, /"charge.refunded"/);
  assert.match(admin, /<th>Charge ID<\/th>/);
  assert.doesNotMatch(admin, /<th>ID<\/th><th>Charge ID<\/th>/);
  assert.match(admin, /data-act="stripe-details"/);
  assert.doesNotMatch(admin, /data-act="mark-paid"/);
});
