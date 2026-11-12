"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const tenants = fs.readFileSync(path.resolve(__dirname, "..", "lib-tenants.js"), "utf8");
const tenantRuntime = require(path.resolve(__dirname, "..", "lib-tenants.js"));
const config = fs.readFileSync(path.resolve(__dirname, "..", "platform.config.js"), "utf8");
const html = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
const ui = fs.readFileSync(path.resolve(__dirname, "..", "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");
const main = fs.readFileSync(path.resolve(__dirname, "..", "platform.main.js"), "utf8");
const copy = fs.readFileSync(path.resolve(__dirname, "..", "platform.copy.js"), "utf8");
const platformCss = fs.readFileSync(path.resolve(__dirname, "..", "platform.css"), "utf8");

// server.js is a single module, so a pure helper is lifted out of the real
// source text and exercised directly.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("navigation and page sub-tabs share the Character pink tab system", () => {
  const selectors = [
    ".top-tabs .top-tab",
    ".top-tabs .top-tab-child",
    ".top-nav-group-toggle",
    ".gallery-mode-tabs .gallery-mode-tab",
    ".case-category-tab",
    ".advanced-create-kind",
    ".advanced-create-mode",
    ".advanced-preset-source-tab",
    ".advanced-case-tab",
    ".advanced-mobile-tab",
    ".advanced-side-tab",
    ".auth-method-tab",
    ".topup-method-tab",
    ".playflux-template-tab",
    ".playflux-source-modes button",
    ".creator-segment button",
    ".access-mode-tab",
    ".access-tab",
    ".workflow-node-tabs button",
    ".undress-case-tab",
  ];

  assert.match(platformCss, /--tab-pink:\s*#ff4fa3;/);
  for (const selector of selectors) {
    assert.ok(platformCss.includes(selector), `shared tab styles are missing ${selector}`);
  }
  assert.match(platformCss, /\)\.is-active \{\s*border-color: var\(--tab-pink-border\);\s*color: #fff;\s*background: linear-gradient\(135deg, rgba\(255, 79, 163, \.28\), var\(--tab-pink-surface\)\);\s*box-shadow: var\(--tab-pink-glow\);/);
});

test("site-specific themes keep the shared pink navigation state", () => {
  for (const file of ["tool-video.css", "tool-undress.css", "site-123vipfans.css"]) {
    const css = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
    const marker = file === "tool-undress.css" ? "Shared tab language" : "Shared navigation tab language";
    const sharedStart = css.indexOf(marker);
    const sharedCss = file === "site-123vipfans.css" ? css : css.slice(Math.max(sharedStart, 0));
    assert.ok(sharedStart >= 0 || file === "site-123vipfans.css", `${file} has no shared tab block`);
    assert.match(sharedCss, /\.top-tab\.is-active[\s\S]*?border-color: rgba\(255,79,163,\.72\);[\s\S]*?color: #fff;[\s\S]*?background: linear-gradient\(135deg, rgba\(255,79,163,\.28\)/, `${file} overrides the pink tab state`);
  }
});


test("only 123vipeak.com uses the standalone landing page", () => {
  assert.equal(tenantRuntime.defaultPageForHostname("123vipeak.com"), "/site-landing.html");
  assert.equal(tenantRuntime.defaultPageForHostname("www.123vipeak.com"), "/site-landing.html");
  assert.equal(tenantRuntime.defaultPageForHostname("live.123vipeak.com"), "/platform.html");
  assert.equal(tenantRuntime.defaultPageForHostname("123vips.com"), "/platform.html");
  assert.equal(tenantRuntime.defaultPageForHostname("www.123vips.com"), "/platform.html");
  assert.equal(tenantRuntime.defaultPageForHostname("123vip.fans"), "/platform.html");
  assert.equal(tenantRuntime.defaultPageForHostname("667zui.video"), "/platform.html");
});

test("123vip.fans reuses the shared Generate surface without profile overrides", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "platform.html"), "utf8");
  const profileCss = fs.readFileSync(path.resolve(__dirname, "..", "site-123vipfans.css"), "utf8");

  assert.equal(tenantRuntime.defaultPageForHostname("123vip.fans"), "/platform.html");
  assert.equal(tenantRuntime.defaultPageForHostname("www.123vip.fans"), "/platform.html");
  assert.match(html, /id="advancedWorkspace"/);
  assert.match(html, /id="advancedParameterChips"/);
  assert.match(html, /id="advancedSubmitBtn"/);

  for (const selector of [
    "advanced-generator-toolbar",
    "advanced-parameter",
    "advanced-form-card",
    "advanced-workspace",
    "advancedSubmitBtn",
  ]) {
    assert.doesNotMatch(profileCss, new RegExp(selector), `profile CSS must not override shared Generate selector: ${selector}`);
  }
});

test("Generate parameter pickers close after selection and duration uses a slider", () => {
  const createSource = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.parts", "part-02.js"), "utf8");
  const start = createSource.indexOf("function renderAdvancedParameterPanel(");
  const end = createSource.indexOf("function openAdvancedParameterPanel(", start);
  assert.ok(start >= 0 && end > start);
  const picker = createSource.slice(start, end);
  assert.match(picker, /data-advanced-parameter-duration-range/);
  assert.doesNotMatch(picker, /advanced-parameter-duration-shortcuts/);
  assert.doesNotMatch(picker, /data-advanced-parameter-option-kind="duration"/);
  assert.doesNotMatch(picker, /advanced-parameter-panel-head/);
  assert.doesNotMatch(picker, /advanced-parameter-panel-close/);
  assert.doesNotMatch(picker, /advanced-parameter-option-check/);
  assert.match(createSource, /dataset\.advancedParameterPlacement = openUp \? "up" : "down"/);

  const setter = createSource.slice(
    createSource.indexOf("function setAdvancedParameterValue("),
    createSource.indexOf("function handleAdvancedParameterTriggerClick("),
  );
  assert.match(setter, /select\.value = String\(value\);\s*closeAdvancedParameterPanel\(\);/);
  assert.doesNotMatch(setter, /keepPanelOpen/);
});

test("the www host serves the same site profile as the apex", () => {
  const lookup = tenantRuntime.platformSiteProfileForHostname;
  const profile = tenantRuntime.PLATFORM_SITE_PROFILE;
  assert.equal(lookup("123vip.fans"), profile);
  assert.equal(lookup("www.123vip.fans"), profile);
  assert.equal(lookup("123vip.fans:443"), profile);
  assert.equal(lookup("https://WWW.123vip.fans/landing"), profile);
  assert.equal(lookup("123vips.com"), null);
  assert.equal(lookup(""), null);
  assert.match(tenants, /const bareHost = host\.replace\(\/\^www\\\.\/, ""\);/);
});

test("123vip.fans is a platform site profile, not a tool tenant", () => {
  assert.match(tenants, /const DEFAULT_PLATFORM_SITE_HOSTS = "123vip\.fans"/);
  assert.match(tenants, /id: "custom-workflow"/);
  assert.match(tenants, /defaultTab: String\(process\.env\.PLATFORM_SITE_DEFAULT_TAB \|\| "home"\)/);
  assert.match(tenants, /defaultRoute: String\(process\.env\.PLATFORM_SITE_DEFAULT_ROUTE \|\| ""\)/);
  assert.match(tenants, /hiddenNavTabs: parseCsvList\(process\.env\.PLATFORM_SITE_HIDDEN_NAV_TABS \|\| "advanced"\)/);
  assert.match(tenants, /allowedTabs: parseCsvList\(process\.env\.PLATFORM_SITE_ALLOWED_TABS \|\| "home,cases,advanced,workflow,assets,history,topups,spending,pricing,referral,access"\)/);
  assert.match(tenants, /disabledTabs: parseCsvList\(process\.env\.PLATFORM_SITE_DISABLED_TABS \|\| "gallery,characters,chat"\)/);
});

test("the fans profile exposes Same style even when an older process omits cases", () => {
  const allowedTabs = config.slice(
    config.indexOf("function tenantAllowedTabs()"),
    config.indexOf("function tenantDefaultTabCandidate()"),
  );
  assert.match(allowedTabs, /isSiteProfile\("custom-workflow"\)/);
  assert.match(allowedTabs, /!allowed\.includes\("cases"\)/);
  assert.match(allowedTabs, /allowed\.push\("cases"\)/);
});

test("the profile keeps the shared platform tenant while changing the default tab", () => {
  const descriptor = tenants.slice(
    tenants.indexOf("function tenantDescriptorFromHostname("),
    tenants.indexOf("function tenantDescriptorFromOrigin("),
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
  assert.match(initialTab, /return publicTab\(siteDefaultTab\)/);
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

test("advanced stays available internally but its user-facing route is hidden", () => {
  assert.match(html, /<button class="top-tab" data-tab="advanced" type="button" hidden>/);
  assert.match(config, /return tab === "advanced" \? "custom" : tab;/);
  assert.match(explore, /platformHashParts\(tab\)\.tab === "advanced"\) tab = "custom"/);
  assert.match(explore, /const customActive = state\.tab === "advanced";/);
  assert.match(ui, /element\.hidden = tab === "advanced" \|\| hiddenByToolGallery \|\| !isTabAllowed\(tab\)/);
});

test("the profile lands on its own route and can hide a nav entry without disabling the panel", () => {
  assert.match(server, /const activeNavTab = tenant\.defaultRoute === "custom" \? "custom" : profileTab/);
  assert.match(server, /\(tenant\.hiddenNavTabs \|\| \[\]\)\.forEach\(\(tab\) =>/);
  assert.match(ui, /const hiddenNavTabs = tenantListFeature\("hiddenNavTabs"\)/);
  assert.match(ui, /if \(hiddenNavTabs\.includes\(element\.dataset\.tab \|\| ""\)\) element\.hidden = true/);
  assert.match(ui, /element\.hidden = tab === "advanced" \|\| hiddenByToolGallery \|\| !isTabAllowed\(tab\)/);
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
  assert.match(html, /assets\/brand\/hero-clips\/urban-rise\.mp4/);
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-logo.png")), "logo asset should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-favicon.png")), "favicon asset should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero.svg")), "own hero illustration should exist");
  assert.ok(!fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero.png")), "the copied reference hero must not ship");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "site-123vipfans.css")), "profile stylesheet should exist");
  assert.match(tenants, /stylesheet: "site-123vipfans\.css"/);
  assert.match(tenants, /logo: "\/assets\/brand\/123vipfans-logo\.png"/);
  assert.match(tenants, /favicon: "\/assets\/brand\/123vipfans-favicon\.png"/);
  assert.match(tenants, /bodyClass: "site-custom-workflow"/);
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
  assert.match(tenants, /navHome: true/);
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
  assert.match(html, /id="wFrameBody"/);
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
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero-loop-v2.mp4")), "hero loop video should exist");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "123vipfans-hero-poster-v2.jpg")), "hero loop poster should exist");
  assert.match(html, /<video class="w-hero-video"/);
  assert.match(html, /123vipfans-hero-loop-v2\.mp4/);
  assert.match(html, /poster="\.\/assets\/brand\/123vipfans-hero-poster-v2\.jpg"/);
  assert.match(html, /autoplay muted loop playsinline/);
  assert.match(css, /\.w-hero-video \{[^}]*object-fit: cover/);
  assert.match(css, /\.w-hero-scrim \{/);
  assert.match(js, /video\.pause\(\)/);

  // the hero frame plays a rotation of generated clips instead of a still mock
  assert.equal((html.match(/class="w-frame-video/g) || []).length, 4, "hero reel should ship four clips");
  for (const clip of ["urban-rise", "cyber-scifi", "campus-sweet", "wuxia"]) {
    assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "hero-clips", clip + ".mp4")), "missing hero clip: " + clip);
    assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "brand", "hero-clips", clip + ".jpg")), "missing hero clip poster: " + clip);
    assert.match(html, new RegExp("hero-clips/" + clip + "\\.mp4"));
    assert.match(html, new RegExp("hero-clips/" + clip + "\\.jpg"));
  }
  assert.match(html, /role="tablist" aria-label="Shots"/);
  assert.match(js, /querySelectorAll\("\.w-frame-video"\)/);
  assert.match(js, /addEventListener\("ended"/);
  assert.match(css, /\.w-frame-video \{[^}]*object-fit: cover/);

  // the showcase carousel shows real generated key art instead of flat gradients
  const showcaseSlides = {
    "w-art-a": "urban-rise",
    "w-art-b": "campus-sweet",
    "w-art-c": "mystery",
    "w-art-d": "cyber-scifi",
    "w-art-e": "wuxia",
  };
  for (const [slideClass, file] of Object.entries(showcaseSlides)) {
    for (const ext of ["webp", "jpg"]) {
      const asset = path.resolve(__dirname, "..", "assets", "brand", "showcase", `${file}.${ext}`);
      assert.ok(fs.existsSync(asset), "missing showcase asset: " + file + "." + ext);
      assert.ok(fs.statSync(asset).size > 20000, "showcase asset looks empty: " + file + "." + ext);
    }
    assert.match(html, new RegExp(`class="w-slide-art ${slideClass}"[^>]*><picture>`));
    assert.match(html, new RegExp(`showcase/${file}\\.webp`));
    assert.match(html, new RegExp(`showcase/${file}\\.jpg`));
  }
  assert.equal((html.match(/<picture>/g) || []).length, 5, "each slide art should ship a picture element");
  assert.match(css, /\.w-slide-art img \{[^}]*object-fit: cover/);
  assert.match(css, /\.w-slide-art > picture \{[^}]*display: block/);

  // copy ships in both languages
  for (const key of ["welcome.navFeatures", "welcome.title2", "welcome.featTitle", "welcome.showTitle", "welcome.ctaTitle"]) {
    assert.ok(copy.includes(`"${key}"`), "missing copy key: " + key);
  }
});
