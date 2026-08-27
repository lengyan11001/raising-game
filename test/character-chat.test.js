"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const db = read("db.js");
const html = read("platform.html");
const loader = read("platform.js");
const chat = read("platform.chat.js");

test("character chat persists user-scoped conversations and messages in PostgreSQL", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_chat_conversations/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_chat_messages/);
  assert.match(db, /WHERE id = \$1 AND user_id = \$2/);
  assert.match(db, /conversation_id TEXT NOT NULL REFERENCES app_chat_conversations/);
});

test("character chat uses the BytePlus language endpoint with roleplay context and billing", () => {
  assert.match(server, /CHAT_MESSAGE_CREDITS/);
  assert.match(server, /model: BYTEPLUS_LANGUAGE_MODEL/);
  assert.match(server, /chatSystemPrompt\(conversation\)/);
  assert.match(server, /type: "character_chat"/);
  assert.match(server, /character_chat_refund/);
  assert.match(server, /\/api\/chat\/conversations/);
});

test("chat UI exposes the three-pane workflow and character entry point", () => {
  assert.match(html, /data-tab="chat"/);
  assert.match(html, /data-panel="chat"/);
  assert.match(html, /id="chatConversationList"/);
  assert.match(html, /id="chatThread"/);
  assert.match(html, /id="chatSettingsBody"/);
  assert.match(loader, /"platform\.chat\.js"/);
  assert.match(chat, /function startCharacterChat/);
  assert.match(chat, /data-chat-regenerate/);
  assert.match(chat, /data-chat-edit/);
  assert.match(chat, /Pinned memory/);
  assert.match(chat, /Thinking\.\.\./);
  assert.match(chat, /pending-\$\{Date\.now\(\)\}/);
  assert.match(chat, /chatContinueBtn\.disabled = true/);
  assert.match(html, /data-chat-mode="image"/);
  assert.match(chat, /generateChatImage/);
  assert.match(chat, /pollChatImage/);
  assert.match(chat, /SpeechSynthesisUtterance/);
  assert.match(chat, /SpeechRecognition/);
  assert.match(chat, /data-chat-branch/);
  assert.match(chat, /data-chat-delete/);
});

test("character chat supports generated media, state tracking and conversation branching", () => {
  assert.match(server, /handleCreateChatImage/);
  assert.match(server, /handleRefreshChatImage/);
  assert.match(server, /refreshChatTrackerInBackground/);
  assert.match(server, /handleBranchChatConversation/);
  assert.match(server, /handleDeleteChatMessage/);
  assert.match(server, /kind: "image"/);
  assert.match(db, /updateChatMessageInDb/);
  assert.match(db, /deleteChatMessageInDb/);
});
