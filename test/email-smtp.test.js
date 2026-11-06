"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  EMAIL_NOT_CONFIGURED,
  EMAIL_RECIPIENT_INVALID,
  EMAIL_SMTP_UNSUPPORTED,
  sendSmtpMail,
  smtpConfig,
  smtpConfigured,
  verifySmtp,
} = require("../email-smtp");

const ALIYUN_ENV = {
  EMAIL_SMTP_HOST: "smtpdm.aliyun.com",
  EMAIL_SMTP_PORT: "465",
  EMAIL_SMTP_SECURE: "1",
  EMAIL_SMTP_USER: "sender@example.com",
  EMAIL_SMTP_PASSWORD: "secret",
  EMAIL_FROM: "Vipeak <no-reply@example.com>",
};

test("SMTP configuration uses Alibaba Direct Mail implicit TLS", () => {
  const config = smtpConfig(ALIYUN_ENV);
  assert.equal(config.host, "smtpdm.aliyun.com");
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.user, "sender@example.com");
  assert.equal(config.from, "Vipeak <no-reply@example.com>");
  assert.equal(smtpConfigured(config), true);
});

test("missing SMTP credentials fail clearly instead of falling back", async () => {
  const config = smtpConfig({});
  assert.equal(smtpConfigured(config), false);
  await assert.rejects(() => verifySmtp(config), (error) => error.code === EMAIL_NOT_CONFIGURED);
  await assert.rejects(
    () => sendSmtpMail({ to: "user@example.com", subject: "Code", text: "123456" }, config),
    (error) => error.code === EMAIL_NOT_CONFIGURED,
  );
});

test("non-implicit TLS SMTP mode fails before connecting", async () => {
  const config = smtpConfig({ ...ALIYUN_ENV, EMAIL_SMTP_PORT: "587", EMAIL_SMTP_SECURE: "0" });
  await assert.rejects(() => verifySmtp(config), (error) => error.code === EMAIL_SMTP_UNSUPPORTED);
});

test("invalid recipients are rejected before opening an SMTP connection", async () => {
  await assert.rejects(
    () => sendSmtpMail({ to: "not-an-email", subject: "Code", text: "123456" }, smtpConfig(ALIYUN_ENV)),
    (error) => error.code === EMAIL_RECIPIENT_INVALID && error.statusCode === 400,
  );
});

test("custom SMTP client supports multiline replies and DATA escaping", () => {
  const fake = new EventEmitter();
  fake.write = () => true;
  return new Promise((resolve, reject) => {
    fake.once("data", () => {});
    const { readSmtpResponse, escapeDataLine } = loadInternal();
    const promise = readSmtpResponse(fake, 1000).then((response) => {
      assert.equal(response.code, 250);
      assert.deepEqual([...response.lines], ["250-first", "250 second"]);
      assert.equal(escapeDataLine(".hello"), "..hello");
      assert.equal(escapeDataLine("hello"), "hello");
      resolve();
    }, reject);
    setImmediate(() => fake.emit("data", Buffer.from("250-first\r\n250 second\r\n")));
    return promise;
  });
});

function loadInternal() {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const source = fs.readFileSync(require("node:path").join(__dirname, "..", "email-smtp.js"), "utf8")
    .replace(/\nmodule\.exports = \{[\s\S]*?\};\s*$/, "\nmodule.exports = { readSmtpResponse, escapeDataLine };\n");
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require,
    Buffer,
    process,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(source, context, { filename: "email-smtp.js" });
  return module.exports;
}
