"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

// server.js is a single module, so the image sniffers are lifted out of the real
// source text and exercised directly. None of the lifted functions use braces
// inside string literals, which keeps the brace scan exact.
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

const sniffers = new Function(
  "Buffer",
  [
    extractFunction(server, "readLittleEndian24"),
    extractFunction(server, "imageDimensionsFromBuffer"),
    extractFunction(server, "imageMimeFromBuffer"),
    "return { imageDimensionsFromBuffer, imageMimeFromBuffer };",
  ].join("\n"),
)(Buffer);

function pngBuffer(width, height) {
  const bytes = Buffer.alloc(26);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpegBuffer(width, height) {
  const bytes = Buffer.alloc(40);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  bytes.writeUInt16BE(16, 4);
  bytes.write("JFIF", 6, "ascii");
  bytes[20] = 0xff;
  bytes[21] = 0xc0;
  bytes.writeUInt16BE(17, 22);
  bytes[24] = 8;
  bytes.writeUInt16BE(height, 25);
  bytes.writeUInt16BE(width, 27);
  return bytes;
}

function webpBuffer(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  const encode24 = (value, offset) => {
    const size = value - 1;
    bytes[offset] = size & 0xff;
    bytes[offset + 1] = (size >> 8) & 0xff;
    bytes[offset + 2] = (size >> 16) & 0xff;
  };
  encode24(width, 24);
  encode24(height, 27);
  return bytes;
}

function bmpBuffer(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write("BM", 0, "ascii");
  bytes.writeInt32LE(width, 18);
  bytes.writeInt32LE(height, 22);
  return bytes;
}

test("reference images are identified from their bytes, not from the caller", () => {
  assert.equal(sniffers.imageMimeFromBuffer(pngBuffer(320, 240)), "image/png");
  assert.equal(sniffers.imageMimeFromBuffer(jpegBuffer(1024, 768)), "image/jpeg");
  assert.equal(sniffers.imageMimeFromBuffer(webpBuffer(512, 512)), "image/webp");
  assert.equal(sniffers.imageMimeFromBuffer(bmpBuffer(64, 64)), "image/bmp");

  const dimensions = sniffers.imageDimensionsFromBuffer(pngBuffer(320, 240));
  assert.deepEqual(dimensions, { width: 320, height: 240, type: "png" });
  assert.deepEqual(
    sniffers.imageDimensionsFromBuffer(jpegBuffer(1024, 768)),
    { width: 1024, height: 768, type: "jpeg" },
  );
});

test("an unsupported or unreadable reference stays unsupported", () => {
  const gif = Buffer.alloc(64);
  gif.write("GIF89a", 0, "ascii");
  assert.equal(sniffers.imageMimeFromBuffer(gif), "");
  assert.equal(sniffers.imageMimeFromBuffer(Buffer.alloc(0)), "");
  assert.equal(sniffers.imageMimeFromBuffer(Buffer.from("not an image")), "");
  assert.equal(sniffers.imageDimensionsFromBuffer(Buffer.from("not an image")), null);
});

test("a reference sent as a bare url keeps its real format and size", () => {
  // The URL is matched back to the studio's own asset record first...
  assert.match(server, /asset = findUserAssetBySourceUrl\(db, user, url\);/);
  // ...and anything else is read from the file itself.
  assert.match(server, /async function publicImageFactsForUrl\(url, \{ label = "Reference image" \} = \{\}\)/);
  assert.match(server, /if \(!asset && input\.mediaKind === "image" && \(!mime \|\| !width \|\| !height\)\) \{/);
  assert.match(server, /const facts = await publicImageFactsForUrl\(url, \{ label \}\);/);
  assert.match(server, /if \(!mime\) mime = facts\.mime;/);
  assert.match(server, /if \(!width\) width = facts\.width;/);
  assert.match(server, /detectedMime \|\| extensionMime \|\| \(headerMime\.startsWith\("image\/"\) \? headerMime : ""\)/);
});

test("the Wan 3.0 format complaint still exists for genuinely wrong files", () => {
  assert.match(
    server,
    /throw advancedValidationError\("WAN30_IMAGE_FORMAT_INVALID", `\$\{label\} must be JPG, JPEG, PNG, BMP, or WebP\.`\)/,
  );
});
