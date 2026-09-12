"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const config = fs.readFileSync(path.resolve(__dirname, "..", "platform.config.js"), "utf8");
const ui = fs.readFileSync(path.resolve(__dirname, "..", "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");
const main = fs.readFileSync(path.resolve(__dirname, "..", "platform.main.js"), "utf8");
const copy = fs.readFileSync(path.resolve(__dirname, "..", "platform.copy.js"), "utf8");

test("123vip.fans is a platform site profile, not a tool tenant", () => {
  assert.match(server, /const DEFAULT_PLATFORM_SITE_HOSTS = "123vip\.fans"/);
  assert.match(server, /id: "custom-workflow"/);
  assert.match(server, /defaultTab: String\(process\.env\.PLATFORM_SITE_DEFAULT_TAB \|\| "home"\)/);
  assert.match(server, /defaultRoute: String\(process\.env\.PLATFORM_SITE_DEFAULT_ROUTE \|\| ""\)/);
  assert.match(server, /hiddenNavTabs: parseCsvList\(process\.env\.PLATFORM_SITE_HIDDEN_NAV_TABS \|\| "advanced"\)/);
  assert.match(server, /allowedTabs: parseCsvList\(process\.env\.PLATFORM_SITE_ALLOWED_TABS \|\| "home,advanced,workflow,assets,history,topups,spending,pricing,referral,access"\)/);
  assert.match(server, /disabledTabs: parseCsvList\(process\.env\.PLATFORM_SITE_DISABLED_TABS \|\| "gallery,characters,chat"\)/);
});

test("the profile keeps the shared platform tenant while changing the default tab", () => {
  const descriptor = server.slice(
    server.indexOf("function tenantDescriptorFromHostname("),
    server.indexOf("function tenantDescriptorFromOrigin("),
  );
  assert.match(descriptor, /const siteProfile = tool \? null : platformSiteProfileForHostname\(host\)/);
  assert.match(descriptor, /defaultTab: tool\?\.defaultTab \|\| siteProfile\?\.defaultTab \|\| "gallery"/);
  assert.match(descriptor, /allowedTabs: Array\.isArray\(tool\?\.allowedTabs\) \? tool\.allowedTabs : \(siteProfile\?\.allowedTabs \|\| \[\]\)/);
  assert.match(descriptor, /tenantId: normalizeTenantId\(tool\?\.tenantId \|\| DEFAULT_TENANT_ID\)/);
  assert.match(descriptor, /toolOnly: Boolean\(tool\)/);
  assert.match(descriptor, /siteProfile: siteProfile\?\.id \|\| ""/);
});

test("profile hosts get the tenant feature bootstrap and a first paint on the profile tab", () => {
  assert.match(server, /const bootstrapScript = \(tenant\.toolOnly && toolId\) \|\| tenant\.siteProfile/);
  assert.match(server, /if \(tenant\.siteProfile && !toolId\) \{/);
  assert.match(server, /class="top-tab is-active" data-tab="\$\{activeNavTab\}"/);
});

test("a non-tool host honours its explicit default tab before local storage", () => {
  const initialTab = config.slice(
    config.indexOf("function initialPlatformTab()"),
    config.indexOf("function initialGalleryMode()"),
  );
  assert.match(initialTab, /if \(bootstrapTenantFeature\("toolOnly", false\)\) return initialTenantDefaultTab\(\)/);
  assert.match(initialTab, /const siteDefaultTab = bootstrapTenantFeatures\(\)\.defaultTab/);
  assert.match(initialTab, /return normalizePlatformTab\(siteDefaultTab\)/);
  assert.ok(
    initialTab.indexOf("siteDefaultTab") < initialTab.indexOf("localStorage.getItem(TAB_KEY)"),
    "the explicit site default tab must win over the remembered tab",
  );
});

test("gallery shortcut tabs disappear when the profile hides the gallery", () => {
  assert.match(ui, /element\.hidden = !isTabAllowed\(DEFAULT_PLATFORM_TAB\)\s*\n\s*\|\| !isGalleryModeAllowed\(shortcut\)/);
  // The render-time sync must not un-hide them again.
  assert.match(explore, /const galleryAllowed = isTabAllowed\(DEFAULT_PLATFORM_TAB\)/);
  assert.match(explore, /const disabled = !galleryAllowed \|\| !isGalleryModeAllowed\(button\.dataset\.galleryShortcut \|\| ""\)/);
});

test("the profile lands on its own route and can hide a nav entry without disabling the panel", () => {
  assert.match(server, /const activeNavTab = tenant\.defaultRoute === "custom" \? "custom" : profileTab/);
  assert.match(server, /\(tenant\.hiddenNavTabs \|\| \[\]\)\.forEach\(\(tab\) =>/);
  assert.match(ui, /const hiddenNavTabs = tenantListFeature\("hiddenNavTabs"\)/);
  assert.match(ui, /if \(hiddenNavTabs\.includes\(element\.dataset\.tab \|\| ""\)\) element\.hidden = true/);
  assert.match(create, /setTab\(window\.location\.hash \|\| tenantStringFeature\("defaultRoute", ""\) \|\| state\.tab\)/);
});

test("the profile ships its own welcome page, brand and stylesheet", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
  assert.match(html, /<section class="home-panel" data-panel="home" hidden>/);
  assert.match(html, /class="w-title"/);
  assert.match(html, /class="w-hero" id="wHero"/);
  assert.match(html, /data-home-action="login"/);
  assert.match(html, /data-home-action="signup"/);
  assert.match(html, /data-home-action="create"/);
  assert.match(html, /assets\/brand\/123vipfans-hero\.svg/);
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-logo.png")), "logo asset should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-favicon.png")), "favicon asset should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero.svg")), "own hero illustration should exist");
  assert.ok(!fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero.png")), "the copied reference hero must not ship");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "site-123vipfans.css")), "profile stylesheet should exist");
  assert.match(server, /stylesheet: "site-123vipfans\.css"/);
  assert.match(server, /logo: "\/assets\/brand\/123vipfans-logo\.png"/);
  assert.match(server, /favicon: "\/assets\/brand\/123vipfans-favicon\.png"/);
  assert.match(server, /bodyClass: "site-custom-workflow"/);
  assert.match(server, /\(<a class="brand" href="\)\[\^"\]\*\("\)/);
});

test("the welcome page swaps its call to action after login and its custom tab is called Create", () => {
  assert.match(config, /const ALL_TABS = new Set\(\["home",/);
  assert.match(config, /function isSiteProfile\(id = ""\)/);
  assert.match(ui, /function renderHomePanel\(\)/);
  assert.match(ui, /button\.hidden = \(button\.dataset\.homeAction \|\| ""\) === "create" \? !loggedIn : loggedIn/);
  assert.match(ui, /element\.dataset\.i18n = "nav\.create"/);
  assert.match(ui, /renderHomePanel\(\);\n\}/);
  assert.match(main, /const homeAction = event\.target\.closest\("\[data-home-action\]"\)/);
  assert.match(main, /if \(typeof openLogin === "function"\) openLogin\(\)/);
  assert.match(explore, /document\.body\.classList\.toggle\("home-active", state\.tab === "home"\)/);
  assert.match(copy, /"nav\.create": "Create"/);
});

test("the profile paints the welcome page first instead of the workspace navigation", () => {
  assert.match(server, /const extra = \[PLATFORM_SITE_PROFILE\.bodyClass, profileTab === "home" \? "home-active" : ""\]/);
  assert.ok(
    server.includes('withTenantShell.replace(/<section\\b[^>]*data-panel="[^"]+"[^>]*>/gi'),
    "the shell should rewrite panel visibility for the first paint",
  );
  assert.match(server, /return panel === profileTab \? withoutHidden : withoutHidden\.replace\(\/>\$\/, " hidden>"\)/);
});

test("the workspace can return to the welcome page", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
  assert.match(html, /<button class="top-tab" data-tab="home" type="button" hidden>/);
  assert.match(server, /navHome: true/);
  assert.match(server, /if \(tenant\.navHome\) \{/);
  assert.ok(
    server.includes("withTenantShell.replace(\n        /<button\\b[^>]*data-tab=\"home\"[^>]*>/i"),
    "nav home button should be revealed for the profile",
  );
  assert.match(ui, /element\.hidden = !tenantFeature\("navHome", false\) \|\| !isTabAllowed\("home"\)/);
  assert.match(copy, /"nav\.home": "Home"/);
  assert.match(copy, /"nav\.home": "返回主页"/);
});

test("the profile keeps pink buttons but ships its own palette, layout and motion", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "..", "site-123vipfans.css"), "utf8");
  const html = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
  const js = fs.readFileSync(path.resolve(__dirname, "..", "site-123vipfans.js"), "utf8");

  // buttons stay pink
  assert.match(css, /--cyan: #f038a8;/);
  assert.match(css, /--w-pink: #f038a8;/);
  assert.match(css, /\.w-btn\.primary \{[^}]*linear-gradient\(120deg, var\(--w-pink\), #ff6a9d\)/);

  // but the rest of the palette, surfaces and motion are the profile's own
  assert.match(css, /--w-bg: #08060f;/);
  assert.match(css, /--w-ink: #f6f2ff;/);
  assert.match(css, /backdrop-filter: blur\(18px\) saturate\(140%\)/);
  for (const kf of ["wDrift", "wTwinkle", "wShine", "wScan", "wFill", "wMarquee", "wPlayhead", "wNode"]) {
    assert.ok(css.includes("@keyframes " + kf), "missing motion: " + kf);
  }

  // landing structure (nav, hero, marquee, features, carousel, steps, cta)
  assert.match(html, /class="w-nav" id="welcomeNav"/);
  assert.match(html, /class="w-hero" id="wHero"/);
  assert.match(html, /class="w-art" src="\.\/assets\/brand\/123vipfans-hero\.svg"/);
  assert.match(html, /class="w-marquee"/);
  assert.equal((html.match(/class="w-card w-reveal"/g) || []).length, 4);
  assert.equal((html.match(/class="w-slide[" ]/g) || []).length, 5);
  assert.match(html, /class="w-carousel" id="wCarousel"/);
  assert.match(html, /class="w-steps"/);
  assert.match(html, /class="w-cta w-reveal"/);

  // interactions live in their own profile script, injected only for this host
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "site-123vipfans.js")), "profile script should exist");
  assert.match(js, /new IntersectionObserver/);
  assert.match(js, /classList\.toggle\("is-scrolled"/);
  assert.match(js, /setProperty\("--w-mx"/);
  assert.match(js, /AUTOPLAY_MS = 5500/);
  assert.match(server, /"site-123vipfans\.js",/);
  assert.match(server, /site-123vipfans\.js\?v=\$\{SITE_PROFILE_SCRIPT_VERSION\}/);

  // full-bleed hero loop (own render) with poster + reduced-motion handling
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero-loop.mp4")), "hero loop video should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero-poster.jpg")), "hero loop poster should exist");
  assert.match(html, /<video class="w-hero-video"/);
  assert.match(html, /123vipfans-hero-loop\.mp4/);
  assert.match(html, /poster="\.\/assets\/brand\/123vipfans-hero-poster\.jpg"/);
  assert.match(html, /autoplay muted loop playsinline/);
  assert.match(css, /\.w-hero-video \{[^}]*object-fit: cover/);
  assert.match(css, /\.w-hero-scrim \{/);
  assert.match(js, /video\.pause\(\)/);

  // copy ships in both languages
  for (const key of ["welcome.navFeatures", "welcome.title2", "welcome.featTitle", "welcome.showTitle", "welcome.ctaTitle"]) {
    assert.ok(copy.includes(`"${key}"`), "missing copy key: " + key);
  }
});
