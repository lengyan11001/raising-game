import { Editor, Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

function normalizeText(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function contentFromText(value = "") {
  return {
    type: "doc",
    content: normalizeText(value).split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

function mentionPattern(tokens = []) {
  const values = [...new Set(tokens.filter(Boolean))].sort((left, right) => right.length - left.length);
  if (!values.length) return null;
  const escaped = values.map((value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${escaped.join("|")})(?=$|[\\s.,;:!?()\\[\\]{}<>\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])`, "g");
}

function inlineContentFromText(value = "") {
  return normalizeText(value).split("\n").flatMap((line, index) => {
    const nodes = index ? [{ type: "hardBreak" }] : [];
    if (line) nodes.push({ type: "text", text: line });
    return nodes;
  });
}

function createMentionDecorationExtension(getMentionTokens) {
  return Extension.create({
    name: "vipeakPromptMentions",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("vipeakPromptMentions"),
          props: {
            decorations(state) {
              const pattern = mentionPattern(typeof getMentionTokens === "function" ? getMentionTokens() : []);
              if (!pattern) return null;
              const decorations = [];
              state.doc.descendants((node, position) => {
                if (!node.isText || !node.text) return;
                pattern.lastIndex = 0;
                let match = pattern.exec(node.text);
                while (match) {
                  decorations.push(Decoration.inline(
                    position + match.index,
                    position + match.index + match[0].length,
                    { class: "advanced-prompt-mention-token" },
                  ));
                  match = pattern.exec(node.text);
                }
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

class PromptEditor {
  constructor(options = {}) {
    this.options = options;
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    this.onSubmit = typeof options.onSubmit === "function" ? options.onSubmit : () => {};
    this.onEscape = typeof options.onEscape === "function" ? options.onEscape : () => {};
    this.editor = new Editor({
      element: options.mount,
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        createMentionDecorationExtension(options.getMentionTokens),
      ],
      content: contentFromText(options.value || ""),
      editorProps: {
        attributes: {
          class: "advanced-prompt-editor",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": String(options.ariaLabel || "Prompt"),
          "data-placeholder": String(options.placeholder || ""),
          autocapitalize: "sentences",
          autocomplete: "off",
          spellcheck: "true",
        },
        handlePaste: (_view, event) => {
          if (typeof options.onPaste === "function") options.onPaste(event);
          if (event?.defaultPrevented) return true;
          const clipboard = event?.clipboardData;
          const hasMedia = Array.from(clipboard?.items || []).some((item) => (
            String(item?.kind || "").toLowerCase() === "file"
            && /^(?:image|video|audio)\//.test(String(item?.type || ""))
          )) || Array.from(clipboard?.files || []).some((file) => (
            /^(?:image|video|audio)\//.test(String(file?.type || ""))
          ));
          if (hasMedia) return true;
          const text = clipboard?.getData?.("text/plain");
          if (text === undefined) return false;
          event.preventDefault();
          this.insertText(text);
          return true;
        },
        handleKeyDown: (_view, event) => {
          if (typeof options.onKeyDown === "function" && options.onKeyDown(event)) return true;
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            this.onSubmit(event);
            return true;
          }
          if (event.key === "Escape") this.onEscape(event);
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        this.syncEmptyState(editor);
        this.onChange(this.getValue(), editor);
      },
    });
    this.syncEmptyState(this.editor);
  }

  syncEmptyState(editor = this.editor) {
    const element = editor?.view?.dom;
    if (!element) return;
    element.dataset.empty = editor.isEmpty ? "true" : "false";
  }

  getElement() {
    return this.editor.view.dom;
  }

  getValue() {
    return this.editor.getText({ blockSeparator: "\n" });
  }

  contentFromValue(value = "") {
    return contentFromText(value);
  }

  setValue(value = "", { emitUpdate = false } = {}) {
    const text = normalizeText(value);
    if (text === this.getValue()) return false;
    this.editor.commands.setContent(contentFromText(text), { emitUpdate });
    this.syncEmptyState();
    return true;
  }

  focus(position = "end") {
    if (position === "end") this.editor.commands.focus("end");
    else this.editor.commands.focus();
  }

  insertText(value = "") {
    const text = normalizeText(value);
    if (!text) return;
    const { from, to } = this.editor.state.selection;
    this.editor.chain().focus().insertContentAt({ from, to }, inlineContentFromText(text)).run();
  }

  plainTextOffsetForPosition(position = 0) {
    const max = this.editor.state.doc.content.size;
    const pos = Math.max(0, Math.min(Number(position) || 0, max));
    return this.editor.state.doc.textBetween(0, pos, "\n", "\n").length;
  }

  positionForPlainTextOffset(offset = 0) {
    const target = Math.max(0, Number(offset) || 0);
    let remaining = target;
    let result = null;
    this.editor.state.doc.forEach((node, nodeOffset) => {
      if (result !== null) return;
      const length = node.textContent.length;
      if (remaining <= length) {
        result = nodeOffset + 1 + remaining;
        return;
      }
      remaining -= length + 1;
    });
    if (result === null) {
      const last = this.editor.state.doc.lastChild;
      result = Math.max(1, this.editor.state.doc.content.size - (last ? last.nodeSize - 1 : 0));
    }
    return Math.max(1, Math.min(result, this.editor.state.doc.content.size - 1));
  }

  getSelection() {
    const { from, to } = this.editor.state.selection;
    const start = this.plainTextOffsetForPosition(from);
    const end = this.plainTextOffsetForPosition(to);
    return {
      start,
      end,
      from,
      to,
      text: this.editor.state.doc.textBetween(from, to, "\n", "\n"),
    };
  }

  setSelection(start = 0, end = start) {
    const from = this.positionForPlainTextOffset(start);
    const to = this.positionForPlainTextOffset(end);
    this.editor.commands.setTextSelection({ from, to });
  }

  replaceText(from = 0, to = from, value = "") {
    const start = this.positionForPlainTextOffset(from);
    const end = this.positionForPlainTextOffset(to);
    this.editor.chain().focus().insertContentAt({ from: start, to: end }, inlineContentFromText(value)).run();
  }

  coordsAtPosition(position = 0) {
    return this.editor.view.coordsAtPos(position);
  }

  coordsAtTextOffset(offset = 0) {
    return this.coordsAtPosition(this.positionForPlainTextOffset(offset));
  }

  coordsAtSelection() {
    return this.coordsAtPosition(this.editor.state.selection.from);
  }

  setHeight(height) {
    const element = this.getElement();
    element.style.height = `${Math.max(0, Math.round(Number(height) || 0))}px`;
  }

  isEmpty() {
    return this.editor.isEmpty;
  }

  getHTML() {
    return this.editor.getHTML();
  }

  destroy() {
    this.editor.destroy();
  }
}

window.VipeakPromptEditor = {
  create(options) {
    return new PromptEditor(options);
  },
};
