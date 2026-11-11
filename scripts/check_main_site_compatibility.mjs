#!/usr/bin/env node
/**
 * Read-only production acceptance for the two main-site domains.
 *
 * This script deliberately never logs in, generates media, opens payment,
 * creates support tickets or writes workflow data. It only navigates public
 * pages, opens local dialogs and reads layout/viewport state.
 */
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(process.env.PLAYWRIGHT_MODULE)
  : require("playwright");
const { chromium, firefox, webkit } = playwright;

const engines = { chromium, firefox, webkit };
const cases = [
  ["123vips.com", 320, 568, true],
  ["123vips.com", 390, 844, true],
  ["123vips.com", 1366, 768, false],
  ["123vip.fans", 320, 568, true],
  ["123vip.fans", 390, 844, true],
  ["123vip.fans", 768, 1024, true],
  ["123vip.fans", 1366, 768, false],
];
const outDir = process.env.COMPAT_EVIDENCE_DIR || "/tmp/main-site-compat";
await fs.mkdir(outDir, { recursive: true });
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const results = [];

for (const [engineName, type] of Object.entries(engines)) {
  const browser = await type.launch({
    headless: true,
    ...(engineName === "chromium" ? { executablePath: chromePath } : {}),
  });
  for (const [host, width, height, mobile] of cases) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      locale: "en-US",
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("raisingGameAgeGateAccepted", "1");
        localStorage.setItem("wan30LaunchDismissed", "1");
      } catch {}
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" &&
          !/Content Security Policy|CSP|googletagmanager|accounts\.google\.com\/gsi/i.test(message.text())) {
        errors.push(`console: ${message.text()}`);
      }
    });
    let menu = { visible: false };
    let nav = [];
    let dialog = { opened: false };
    let landscape = null;
    try {
      const response = await page.goto(`https://${host}/platform.html`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(1800);
      await page.waitForSelector("#mobileDrawerToggle", { state: "attached", timeout: 15_000 }).catch(() => {});
      menu = await page.evaluate(() => {
        const button = document.querySelector("#mobileDrawerToggle");
        if (!button) return { visible: false };
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        if (rect.width === 0 || rect.height === 0 ||
            style.display === "none" || style.visibility === "hidden") return { visible: false };
        button.click();
        return {
          visible: true,
          open: document.body.classList.contains("mobile-drawer-open"),
          expanded: button.getAttribute("aria-expanded"),
        };
      });
      if (menu.visible && !menu.open) {
        await page.waitForTimeout(500);
        menu = await page.evaluate(() => {
          const button = document.querySelector("#mobileDrawerToggle");
          button?.click();
          return {
            visible: true,
            open: document.body.classList.contains("mobile-drawer-open"),
            expanded: button?.getAttribute("aria-expanded"),
            retried: true,
          };
        });
      }
      if (menu.visible) {
        menu.closed = await page.evaluate(() => {
          document.querySelector("#mobileDrawerBackdrop")?.click();
          return !document.body.classList.contains("mobile-drawer-open");
        });
      }
      if (!mobile) {
        for (const tab of ["gallery", "characters", "chat", "cases", "access", "history"]) {
          const button = page.locator(`.top-tab[data-tab="${tab}"]`);
          if (await button.count() === 0 || await button.first().isHidden()) continue;
          await button.first().click();
          await page.waitForTimeout(220);
          const shown = await page.evaluate((name) => {
            const panel = document.querySelector(`[data-panel="${name}"]`);
            const rect = panel?.getBoundingClientRect();
            return Boolean(panel && !panel.hidden && rect && rect.width > 0 && rect.height > 0);
          }, tab);
          nav.push({ tab, shown });
        }
      }
      dialog = await page.evaluate(async () => {
        const button = document.querySelector('[data-legal-doc="privacy"]');
        if (!button) return { opened: false };
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const node = document.querySelector("#legalDialog");
        const rect = node?.getBoundingClientRect();
        return {
          opened: Boolean(node?.open),
          inside: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1 &&
            rect.top >= -1 && rect.bottom <= innerHeight + 1),
          body: document.querySelector("#legalBody")?.textContent.trim().length || 0,
        };
      });
      if (dialog.opened) await page.evaluate(() => document.querySelector("#legalDialog")?.close());
      const metrics = await page.evaluate(() => ({
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        appHeight: getComputedStyle(document.documentElement).getPropertyValue("--app-height"),
        appWidth: getComputedStyle(document.documentElement).getPropertyValue("--app-width"),
        keyboardInset: getComputedStyle(document.documentElement).getPropertyValue("--app-keyboard-inset"),
      }));
      if (mobile) {
        await page.setViewportSize({ width: height, height: width });
        await page.waitForTimeout(450);
        landscape = await page.evaluate(() => ({
          innerWidth,
          innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          appHeight: getComputedStyle(document.documentElement).getPropertyValue("--app-height"),
          appWidth: getComputedStyle(document.documentElement).getPropertyValue("--app-width"),
        }));
      }
      const status = response?.status() || 0;
      const ok = status === 200 &&
        metrics.documentWidth === metrics.innerWidth &&
        metrics.bodyWidth === metrics.innerWidth &&
        (!dialog.opened || (dialog.inside && dialog.body > 0)) &&
        (!menu.visible || (menu.open && menu.closed)) &&
        nav.every((entry) => entry.shown) &&
        (!landscape || (landscape.documentWidth === landscape.innerWidth &&
          landscape.bodyWidth === landscape.innerWidth)) &&
        errors.length === 0;
      results.push({ engine: engineName, host, width, height, mobile, status, ok, menu, nav, dialog, metrics, landscape, errors });
    } catch (error) {
      results.push({ engine: engineName, host, width, height, mobile, ok: false, error: String(error), errors });
    }
    await context.close();
  }
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
const summary = {
  generatedAt: new Date().toISOString(),
  scope: ["123vips.com", "123vip.fans"],
  mutationPolicy: "read-only",
  passed: results.length - failed.length,
  total: results.length,
  failed,
  results,
};
const output = path.join(outDir, "prod-engines-results.json");
await fs.writeFile(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, passed: summary.passed, total: summary.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
