"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const config = fs.readFileSync(path.resolve(__dirname, "..", "platform.config.js"), "utf8");
const ui = fs.readFileSync(path.resolve(__dirname, "..", "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");

test("123vip.fans is a platform site profile, not a tool tenant", () => {
  assert.match(server, /const DEFAULT_PLATFORM_SITE_HOSTS = "123vip\.fans"/);
  assert.match(server, /id: "custom-workflow"/);
  assert.match(server, /defaultTab: String\(process\.env\.PLATFORM_SITE_DEFAULT_TAB \|\| "advanced"\)/);
  assert.match(server, /defaultRoute: String\(process\.env\.PLATFORM_SITE_DEFAULT_ROUTE \|\| "custom"\)/);
  assert.match(server, /hiddenNavTabs: parseCsvList\(process\.env\.PLATFORM_SITE_HIDDEN_NAV_TABS \|\| "advanced"\)/);
  assert.match(server, /disabledTabs: parseCsvList\(process\.env\.PLATFORM_SITE_DISABLED_TABS \|\| "gallery,characters,chat,access"\)/);
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
});

test("the profile lands on its own route and can hide a nav entry without disabling the panel", () => {
  assert.match(server, /const activeNavTab = tenant\.defaultRoute === "custom" \? "custom" : profileTab/);
  assert.match(server, /\(tenant\.hiddenNavTabs \|\| \[\]\)\.forEach\(\(tab\) =>/);
  assert.match(ui, /const hiddenNavTabs = tenantListFeature\("hiddenNavTabs"\)/);
  assert.match(ui, /if \(hiddenNavTabs\.includes\(element\.dataset\.tab \|\| ""\)\) element\.hidden = true/);
  assert.match(create, /setTab\(window\.location\.hash \|\| tenantStringFeature\("defaultRoute", ""\) \|\| state\.tab\)/);
});
