"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const adapterSource = fs.readFileSync(path.join(root, "platform.prompt-editor.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "vendor/vipeak-prompt-editor.src.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const part04 = fs.readFileSync(path.join(root, "platform.create.parts/part-04.js"), "utf8");
const part05 = fs.readFileSync(path.join(root, "platform.create.parts/part-05.js"), "utf8");
const main = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");

function fakeElement(extra = {}) {
  const events = [];
  return Object.assign({
    hidden: false,
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: "none",
    dataset: {},
    style: {},
    scrollHeight: 180,
    offsetParent: {},
    getClientRects: () => [{ width: 300, height: 140 }],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 140, width: 300, height: 140 }),
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    focus() {},
    replaceChildren() {},
    addEventListener(type, handler) { events.push({ type, handler }); },
    dispatchEvent(event) { return this.dispatchEventResult ?? true; },
    getAttribute(name) { return extra.attributes?.[name] || ""; },
    events,
  }, extra);
}

function setupAdapter({ mode = "rich", withEditor = true } = {}) {
  const textarea = fakeElement({ value: "hello @Image1" });
  const mount = fakeElement();
  const highlight = fakeElement();
  const documentListeners = [];
  const sandbox = {
    console,
    URL,
    Event: class Event {
      constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); this.defaultPrevented = false; }
      preventDefault() { this.defaultPrevented = true; }
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    localStorage: {
      value: mode,
      getItem() { return this.value; },
      setItem(_key, value) { this.value = value; },
    },
    location: { href: "https://example.test/platform.html" },
    document: {
      readyState: "complete",
      body: { classList: { add() {}, remove() {} } },
      querySelector(selector) {
        return { "#advancedPrompt": textarea, "#advancedPromptEditorMount": mount, "#advancedPromptHighlight": highlight }[selector] || null;
      },
      addEventListener(type, handler) { documentListeners.push({ type, handler }); },
      dispatchEvent() {},
    },
  };
  sandbox.window = sandbox;
  sandbox.window.VIPEAK_PROMPT_EDITOR_MODE = mode;
  if (withEditor) {
    sandbox.window.VipeakPromptEditor = {
      create() {
        let value = textarea.value;
        return {
          getValue: () => value,
          setValue(next) { value = next; },
          getElement: () => fakeElement({ value }),
          getSelection: () => ({ start: value.length, end: value.length }),
          setSelection() {},
          replaceText(from, to, replacement) { value = value.slice(0, from) + replacement + value.slice(to); },
          focus() {},
          destroy() {},
        };
      },
    };
  }
  vm.runInNewContext(adapterSource, sandbox, { filename: "platform.prompt-editor.js" });
  return { sandbox, textarea, mount, highlight, documentListeners };
}

test("rich mode mounts the editor but keeps textarea as the value source", () => {
  const { sandbox, textarea, mount } = setupAdapter();
  assert.equal(sandbox.VipeakPromptEditorAdapter.mode, "rich");
  assert.equal(sandbox.VipeakPromptEditorAdapter.rich, true);
  assert.equal(mount.hidden, false);
  assert.equal(textarea.hidden, true);
  assert.equal(sandbox.getAdvancedPromptValue(), "hello @Image1");
  assert.equal(textarea.value, "hello @Image1");
});

test("legacy mode keeps the old textarea path and does not require the bundle", () => {
  const { sandbox, textarea, mount, highlight } = setupAdapter({ mode: "legacy", withEditor: false });
  assert.equal(sandbox.VipeakPromptEditorAdapter.mode, "legacy");
  assert.equal(sandbox.VipeakPromptEditorAdapter.rich, false);
  assert.equal(mount.hidden, true);
  assert.equal(textarea.hidden, false);
  assert.equal(highlight.hidden, false);
});

test("initialization failure falls back to the legacy textarea and preserves its value", () => {
  const { sandbox, textarea, mount } = setupAdapter({ mode: "rich", withEditor: false });
  assert.equal(sandbox.VipeakPromptEditorAdapter.mode, "legacy");
  assert.equal(mount.hidden, true);
  assert.equal(textarea.hidden, false);
  assert.equal(textarea.value, "hello @Image1");
});

test("prompt write points use the synced value helper", () => {
  assert.match(main, /window\.setAdvancedPromptValue\?\.\(""/);
  assert.match(part04, /window\.setAdvancedPromptValue\?\.\(restoredPresetFlow/);
  assert.match(part05, /window\.setAdvancedPromptValue\?\.\(els\.templatePrompt/);
});

test("rich mention support branches on editor selection while keeping textarea fallback", () => {
  assert.match(part05, /window\.VipeakPromptEditorAdapter\?\.rich/);
  assert.match(part05, /richEditor\.coordsAtSelection\(\)/);
  assert.match(part05, /window\.replaceAdvancedPromptText/);
  assert.match(main, /#advancedPromptEditorMount/);
});

test("rich prompt auto-size resets height before measuring so deletion can shrink", () => {
  assert.match(part04, /promptElement\.style\.height = "0px"/);
  assert.match(part04, /promptElement\.style\.overflowY = "hidden"/);
  assert.match(part04, /const contentHeight = Math\.max\(minimumHeight, promptElement\.scrollHeight \+ 2\)/);
  assert.doesNotMatch(part04, /richEditor \? Math\.max\(minimumHeight, promptElement\.scrollHeight \+ 2\)/);
});

test("rich editor captures paste at document level before ProseMirror consumes Safari clipboard media", () => {
  assert.match(adapterSource, /function promptEditorPasteTarget\(event\)/);
  assert.match(adapterSource, /typeof event\?\.composedPath === "function" \? event\.composedPath\(\) : \[\]/);
  assert.match(adapterSource, /path\.includes\(mount\)/);
  assert.match(adapterSource, /target = target\.parentNode \|\| target\.host \|\| null/);
  assert.match(adapterSource, /document\.addEventListener\("paste", handleDocumentPaste, true\)/);
  assert.match(adapterSource, /editorElement\?\.addEventListener\("paste", handleEditorPaste, true\)/);
  assert.match(adapterSource, /mount\.addEventListener\("paste", handleEditorPaste, true\)/);
  assert.match(adapterSource, /try \{\s*const pending = window\.handleAdvancedPromptPaste\(event\);\s*Promise\.resolve\(pending\)/);
});

test("rich editor leaves media paste to the platform handler and keeps plain text paste", () => {
  assert.match(editorSource, /const hasMedia = Array\.from\(clipboard\?\.items \|\| \[\]\)/);
  assert.match(editorSource, /if \(hasMedia\) return true;/);
  assert.match(editorSource, /const text = clipboard\?\.getData\?\.\("text\/plain"\)/);
  assert.match(editorSource, /this\.insertText\(text\)/);
});

test("editor bundle provides document paragraph text and hard break nodes", () => {
  assert.match(editorSource, /Document/);
  assert.match(editorSource, /Paragraph/);
  assert.match(editorSource, /Text/);
  assert.match(editorSource, /HardBreak/);
  assert.match(editorSource, /inlineContentFromText/);
  assert.match(html, /platform\.prompt-editor\.css/);
  assert.match(html, /VIPEAK_PROMPT_EDITOR_MODE = "rich"/);
});
