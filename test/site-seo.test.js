const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSitemapXml,
  canonicalHostname,
  canonicalizeOrigin,
  collectionUpdatedAt,
  renderDiscoveryLinks,
} = require("../site-seo");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("canonical aliases consolidate base and tool domains", () => {
  assert.equal(canonicalHostname("www.123vips.com"), "123vips.com");
  assert.equal(canonicalHostname("www.667zui.video"), "667zui.video");
  assert.equal(canonicalHostname("video.123tops.com"), "123tops.com");
  assert.equal(canonicalizeOrigin("https://www.123tops.com"), "https://123tops.com");
});

test("collection timestamps use the latest stored content timestamp", () => {
  assert.equal(collectionUpdatedAt([
    { createdAt: "2026-07-01T00:00:00.000Z" },
    { updatedAt: "2026-07-22T10:20:30.000Z" },
  ]), "2026-07-22T10:20:30.000Z");
});

test("main sitemap contains public content with stable lastmod values", () => {
  const xml = buildSitemapXml({
    origin: "https://123vips.com",
    updatedAt: "2026-07-20T00:00:00.000Z",
    toolOnly: false,
    categories: [{
      url: "https://123vips.com/categories/video",
      updatedAt: "2026-07-19T00:00:00.000Z",
      characters: [],
    }],
    tags: [],
    characters: [{
      geoUrl: "https://123vips.com/characters/test",
      geoUpdatedAt: "2026-07-18T00:00:00.000Z",
      geoPosterAbsolute: "https://123vips.com/assets/test.jpg",
    }],
  });
  assert.match(xml, /<loc>https:\/\/123vips\.com\/<\/loc>/);
  assert.match(xml, /2026-07-19T00:00:00\.000Z/);
  assert.match(xml, /\/characters\/test/);
  assert.match(xml, /\/characters\//);
  assert.match(xml, /\/tags\//);
  assert.match(xml, /\/categories\//);
  assert.doesNotMatch(xml, /llms\.txt/);
  assert.doesNotMatch(xml, /changefreq|priority/);
});

test("tool sitemap and discovery links do not expose base content", () => {
  const snapshot = {
    origin: "https://123tops.com",
    updatedAt: "2026-07-20T00:00:00.000Z",
    toolOnly: true,
    categories: [{ url: "https://123tops.com/categories/video" }],
    tags: [{ url: "https://123tops.com/tags/demo" }],
    characters: [{ geoUrl: "https://123tops.com/characters/demo" }],
  };
  const xml = buildSitemapXml(snapshot);
  assert.equal((xml.match(/<url>/g) || []).length, 1);
  assert.doesNotMatch(xml, /categories|tags|characters/);
  assert.equal(renderDiscoveryLinks(snapshot), "");
});

test("base discovery links expose crawlable category, tag, and character paths", () => {
  const html = renderDiscoveryLinks({
    toolOnly: false,
    categories: [{ label: "Videos", path: "/categories/videos" }],
    tags: [{ label: "Portrait", path: "/tags/portrait" }],
    characters: [{ name: "Aria", geoPath: "/characters/aria" }],
  });
  assert.match(html, /href="\/categories\/videos"/);
  assert.match(html, /href="\/tags\/portrait"/);
  assert.match(html, /href="\/characters\/aria"/);
  assert.match(html, /href="\/characters\/"/);
  assert.match(html, /href="\/tags\/"/);
  assert.match(html, /href="\/categories\/"/);
});

test("public directories link every sitemap collection without an arbitrary tag cap", () => {
  assert.doesNotMatch(serverSource, /sort\(\(a, b\) => b\.characters\.length[\s\S]{0,160}\.slice\(0, 80\)/);
  assert.match(serverSource, /renderGeoDirectoryHtml/);
  assert.match(serverSource, /geoDirectoryMatch = url\.pathname\.match/);
});

test("public character pages do not emit missing local media URLs", () => {
  assert.match(serverSource, /function publicGeoMediaUrl/);
  assert.match(serverSource, /!fs\.existsSync\(localPath\)/);
  assert.match(serverSource, /posterUrl: publicGeoMediaUrl\(posterUrl, fallbackPosterUrl\)/);
});
