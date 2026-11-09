"use strict";

(() => {
  const MODE_KEY = "vipeakPromptEditorMode";
  const DEFAULT_MODE = "rich";
  const richClassName = "prompt-editor-rich";
  let editor = null;
  let activeMode = "legacy";
  let initializing = false;

  function textareaElement() {
    return document.querySelector("#advancedPrompt");
  }

  function mountElement() {
    return document.querySelector("#advancedPromptEditorMount");
  }

  function highlightElement() {
    return document.querySelector("#advancedPromptHighlight");
  }

  function normalizeMode(value) {
    return String(value || "").trim().toLowerCase() === "legacy" ? "legacy" : "rich";
  }

  function requestedMode() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("promptEditor")) return normalizeMode(url.searchParams.get("promptEditor"));
    } catch (_error) {}
    try {
      const saved = window.localStorage?.getItem(MODE_KEY);
      if (saved) return normalizeMode(saved);
    } catch (_error) {}
    return normalizeMode(window.VIPEAK_PROMPT_EDITOR_MODE || DEFAULT_MODE);
  }

  function dispatchPromptInput() {
    textareaElement()?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function syncTextarea(value) {
    const textarea = textareaElement();
    if (!textarea) return;
    if (textarea.value !== value) textarea.value = value;
  }

  function legacyPromptSelection(textarea) {
    return {
      start: Number.isFinite(textarea?.selectionStart) ? textarea.selectionStart : String(textarea?.value || "").length,
      end: Number.isFinite(textarea?.selectionEnd) ? textarea.selectionEnd : String(textarea?.value || "").length,
    };
  }

  function setTextareaSelection(selection = {}) {
    const textarea = textareaElement();
    if (!textarea) return;
    const length = String(textarea.value || "").length;
    const start = Math.max(0, Math.min(Number(selection.start) || 0, length));
    const end = Math.max(start, Math.min(Number(selection.end ?? start) || start, length));
    try {
      textarea.setSelectionRange(start, end, textarea.selectionDirection || "none");
    } catch (_error) {}
  }

  function emitChange() {
    if (editor) syncTextarea(editor.getValue());
    dispatchPromptInput();
  }

  function showLegacyPath() {
    const textarea = textareaElement();
    const mount = mountElement();
    const highlight = highlightElement();
    document.body?.classList.remove(richClassName);
    if (mount) {
      mount.hidden = true;
      mount.replaceChildren();
    }
    if (textarea) textarea.hidden = false;
    if (highlight) highlight.hidden = false;
  }

  function showRichPath() {
    const textarea = textareaElement();
    const mount = mountElement();
    const highlight = highlightElement();
    if (!textarea || !mount) throw new Error("Prompt editor mount is unavailable");
    document.body?.classList.add(richClassName);
    if (textarea) textarea.hidden = true;
    if (highlight) highlight.hidden = true;
    mount.hidden = false;
  }

  function handleEditorChange(_value) {
    emitChange();
  }

  // Safari can dispatch paste from a descendant of the Tiptap host after
  // ProseMirror has already started handling it. Capture at document level so
  // the platform uploader sees the original clipboard payload first. Keep the
  // scope to the rich mount; the legacy textarea has its own handler in
  // platform.main.js and must not upload the same paste twice.
  function handleDocumentPaste(event) {
    if (!event?.target?.closest?.("#advancedPromptEditorMount")) return;
    handleEditorPaste(event);
  }

  function handleEditorPaste(event) {
    if (typeof window.handleAdvancedPromptPaste === "function") {
      try {
        const pending = window.handleAdvancedPromptPaste(event);
        Promise.resolve(pending).catch((error) => {
          const note = document.querySelector("#advancedNote");
          if (note) note.textContent = error?.message || String(error);
        });
      } catch (error) {
        const note = document.querySelector("#advancedNote");
        if (note) note.textContent = error?.message || String(error);
      }
    }
  }

  function handleEditorKeyDown(event) {
    if (typeof window.handleAdvancedPromptMentionKeydown === "function") {
      window.handleAdvancedPromptMentionKeydown(event);
      if (event.defaultPrevented) return true;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      if (typeof window.submitAdvancedGenerate === "function") window.submitAdvancedGenerate();
      return true;
    }
    return false;
  }

  function handleEditorEscape() {
    if (typeof window.closeAdvancedPromptMentions === "function") window.closeAdvancedPromptMentions();
  }

  function handleNativeInput() {
    if (!editor) return;
    syncTextarea(editor.getValue());
  }

  function createEditor() {
    const textarea = textareaElement();
    const mount = mountElement();
    if (!textarea || !mount) return false;
    if (!window.VipeakPromptEditor?.create) throw new Error("Prompt editor bundle is unavailable");
    showRichPath();
    const getMentionTokens = () => {
      const tokens = typeof window.advancedPromptMentionSnapshot === "function"
        ? window.advancedPromptMentionSnapshot().map((entry) => `@${entry.label}`)
        : [];
      const value = editor?.getValue?.() || "";
      value.replace(/@[A-Za-z][A-Za-z0-9_-]*/g, (match) => {
        tokens.push(match);
        return match;
      });
      return tokens;
    };
    editor = window.VipeakPromptEditor.create({
      mount,
      value: textarea.value || "",
      placeholder: textarea.getAttribute("placeholder") || "",
      ariaLabel: textarea.getAttribute("aria-label") || "Prompt",
      onChange: handleEditorChange,
      onPaste: handleEditorPaste,
      onKeyDown: handleEditorKeyDown,
      getMentionTokens,
      onEscape: handleEditorEscape,
      onSubmit: () => {
        if (typeof window.submitAdvancedGenerate === "function") window.submitAdvancedGenerate();
      },
    });
    syncTextarea(editor.getValue());
    const editorElement = editor.getElement?.();
    editorElement?.addEventListener("input", handleNativeInput);
    document.dispatchEvent(new CustomEvent("platform-prompt-editor-ready"));
    return true;
  }

  function destroyEditor() {
    if (!editor) return;
    try {
      editor.destroy();
    } finally {
      editor = null;
    }
  }

  function initialize(mode = requestedMode()) {
    if (initializing) return false;
    initializing = true;
    try {
      activeMode = normalizeMode(mode);
      destroyEditor();
      if (activeMode === "legacy" || !window.VipeakPromptEditor?.create) {
        activeMode = "legacy";
        showLegacyPath();
        return false;
      }
      createEditor();
      return true;
    } catch (error) {
      console.warn("Rich prompt editor unavailable; using legacy textarea", error);
      activeMode = "legacy";
      destroyEditor();
      showLegacyPath();
      return false;
    } finally {
      initializing = false;
    }
  }

  function getAdvancedPromptValue() {
    return editor ? editor.getValue() : String(textareaElement()?.value || "");
  }

  function setAdvancedPromptValue(value = "", options = {}) {
    const text = String(value ?? "").replace(/\r\n?/g, "\n");
    const textarea = textareaElement();
    if (!textarea) return false;
    const previousSelection = options.selectionStart !== undefined || options.selectionEnd !== undefined
      ? { start: options.selectionStart, end: options.selectionEnd }
      : legacyPromptSelection(textarea);
    if (editor) {
      editor.setValue(text, { emitUpdate: false });
      syncTextarea(text);
      if (options.selectionStart !== undefined || options.selectionEnd !== undefined) {
        editor.setSelection(
          options.selectionStart ?? previousSelection.start,
          options.selectionEnd ?? options.selectionStart ?? previousSelection.end,
        );
      }
      if (options.focus) editor.focus(options.focus === "start" ? "start" : "end");
    } else {
      textarea.value = text;
      if (options.selectionStart !== undefined || options.selectionEnd !== undefined) {
        setTextareaSelection({ start: options.selectionStart, end: options.selectionEnd });
      }
      if (options.focus) {
        textarea.focus?.();
        setTextareaSelection({ start: options.selectionStart, end: options.selectionEnd });
      }
    }
    if (options.emitInput !== false) dispatchPromptInput();
    return true;
  }

  function getAdvancedPromptSelection() {
    if (editor) return editor.getSelection();
    return legacyPromptSelection(textareaElement());
  }

  function getAdvancedPromptEditorElement() {
    return editor?.getElement?.() || null;
  }

  function coordsAtAdvancedPromptSelection() {
    return editor?.coordsAtSelection?.() || null;
  }

  function replaceAdvancedPromptText(from, to, replacement) {
    if (!editor) return false;
    editor.replaceText(from, to, replacement);
    syncTextarea(editor.getValue());
    return true;
  }

  function setVipeakPromptEditorMode(mode, { persist = true } = {}) {
    const next = normalizeMode(mode);
    try {
      if (persist) window.localStorage?.setItem(MODE_KEY, next);
    } catch (_error) {}
    return initialize(next);
  }

  window.VipeakPromptEditorAdapter = {
    get mode() { return activeMode; },
    get rich() { return Boolean(editor); },
    initialize,
    getElement: getAdvancedPromptEditorElement,
    getSelection: getAdvancedPromptSelection,
    coordsAtSelection: coordsAtAdvancedPromptSelection,
    replaceText: replaceAdvancedPromptText,
    setHeight(height) { editor?.setHeight?.(height); },
    focus(position) { editor?.focus?.(position); },
    isEmpty() { return editor ? editor.isEmpty() : !textareaElement()?.value; },
  };
  window.getAdvancedPromptValue = getAdvancedPromptValue;
  window.setAdvancedPromptValue = setAdvancedPromptValue;
  window.getAdvancedPromptSelection = getAdvancedPromptSelection;
  window.replaceAdvancedPromptText = replaceAdvancedPromptText;
  window.coordsAtAdvancedPromptSelection = coordsAtAdvancedPromptSelection;
  window.setVipeakPromptEditorMode = setVipeakPromptEditorMode;
  window.initializeAdvancedPromptEditor = initialize;

  document.addEventListener("paste", handleDocumentPaste, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initialize(), { once: true });
  } else {
    initialize();
  }
})();
