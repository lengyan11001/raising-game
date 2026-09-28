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
const standaloneChat = read("chat.js");

test("character chat persists user-scoped conversations and messages in PostgreSQL", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_chat_conversations/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_chat_messages/);
  assert.match(db, /WHERE id = \$1 AND user_id = \$2/);
  assert.match(db, /conversation_id TEXT NOT NULL REFERENCES app_chat_conversations/);
});

test("character chat uses the BytePlus language endpoint with roleplay context and billing", () => {
  assert.match(server, /CHAT_MESSAGE_CREDITS/);
  assert.match(server, /model: BYTEPLUS_LANGUAGE_MODEL/);
  assert.match(server, /chatSystemPrompt\(conversation, responseLanguage, latestUserMessage\)/);
  assert.match(server, /chatResponseLanguage/);
  assert.match(server, /IMPORTANT LANGUAGE RULE/);
  assert.match(server, /TURN FOCUS/);
  assert.match(server, /GREETING OVERRIDE/);
  assert.match(server, /LATEST USER MESSAGE/);
  assert.match(server, /isSimpleChatGreeting/);
  assert.match(server, /你好\|您好\|嗨\|哈喽\|哈啰/);
  assert.match(server, /啊\|呀\|哦\|喔/);
  assert.match(server, /HUMAN CHAT DEFAULT/);
  assert.match(server, /real text-message conversation/);
  assert.match(server, /direct spoken message/);
  assert.match(server, /withoutStageDirections/);
  assert.match(server, /quoted\.slice\(0, 2\)/);
  assert.match(server, /function normalizeChatReply/);
  assert.match(server, /sentences\.slice\(0, 3\)/);
  assert.match(server, /short\.slice\(0, 240\)/);
  assert.match(server, /temperature: simpleGreeting \? 0\.45 : expandedScene \? 0\.68 : 0\.62/);
  assert.match(server, /max_tokens: simpleGreeting \? 180 : expandedScene \? 720 : 300/);
  assert.match(server, /const modelMessages = simpleGreeting/);
  assert.match(server, /one clear immediate response/);
  assert.match(chat, /language: els\.languageSelect\?\.value \|\| state\.lang/);
  assert.match(server, /type: "character_chat"/);
  assert.match(server, /character_chat_refund/);
  assert.match(server, /\/api\/chat\/conversations/);
});

test("standalone chat opens the created conversation and sends messages", () => {
  assert.match(standaloneChat, /location\.hash\.match\(\/\^#chat\\\//);
  assert.match(standaloneChat, /api\(`\/api\/chat\/conversations\/\$\{encodeURIComponent\(conversationId\)\}`\)/);
  assert.match(standaloneChat, /\/messages`/);
  assert.match(standaloneChat, /data-chat-composer/);
  assert.match(standaloneChat, /renderStandaloneChat\(conversationId\)/);
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
  assert.match(chat, /syncChatViewportHeight/);
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
  assert.match(server, /"platform\.chat\.js"/);
});
