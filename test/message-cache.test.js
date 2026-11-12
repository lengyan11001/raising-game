"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const livePath = path.join(root, "live.js");
const htmlPath = path.join(root, "live.html");
const live = fs.existsSync(livePath) ? fs.readFileSync(livePath, "utf8") : null;
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const db = fs.readFileSync(path.join(root, "db.js"), "utf8");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : null;
const liveSurfaceSkip = live && html ? false : "Live frontend files are absent from the platform release.";

test("message list renders cached conversations before checking for updates", { skip: liveSurfaceSkip }, () => {
  assert.match(live, /const MESSAGE_CACHE_PREFIX = "vipeakMessageCacheV1"/);
  assert.match(live, /function readThreadCache\(\)/);
  assert.match(live, /function writeThreadCache\(conversations = \[\]\)/);
  assert.match(live, /function messages\(options = \{\}\) \{\s*if \(!options\.quiet && !state\.conversations\.length\) \{\s*const cached = readThreadCache\(\);\s*if \(cached\.length\) state\.conversations = cached;/);
  assert.match(live, /writeThreadCache\(state\.conversations\)/);
});

test("opening a chat renders cached messages before an incremental update", { skip: liveSurfaceSkip }, () => {
  const showStart = live.indexOf("async function showTextChat(options = {})");
  const showEnd = live.indexOf("\n  async function showReferral", showStart);
  const showBlock = live.slice(showStart, showEnd);
  assert.match(showBlock, /const cached = readConversationCache\(conversationId\)/);
  assert.match(showBlock, /const cachedMessages = Array\.isArray\(cached\.messages\) \? cached\.messages : \[\]/);
  assert.match(showBlock, /if \(cachedMessages\.length\) \{[\s\S]*?renderTextChatThread\(cachedMessages/);
  assert.ok(showBlock.indexOf("renderTextChatThread(cachedMessages") < showBlock.indexOf("refreshTextChatMessages(conversationId"));
  assert.match(live, /\/messages\?\$\{query\.toString\(\)\}/);
  assert.match(live, /new URLSearchParams\(\{ after: cursor\.createdAt \|\| "", afterId: cursor\.id \|\| "", limit: "200" \}\)/);
  assert.match(live, /const merged = result\.full \? incoming : mergeChatMessages\(cachedMessages, incoming\)/);
  assert.match(live, /writeConversationCache\(conversationId, conversation, merged\)/);
});

test("client message caches are user-scoped, bounded, and cleared with authentication state", { skip: liveSurfaceSkip }, () => {
  assert.match(live, /MESSAGE_CACHE_MAX_THREADS = 100/);
  assert.match(live, /MESSAGE_CACHE_MAX_MESSAGES = 300/);
  assert.match(live, /\.slice\(-MESSAGE_CACHE_MAX_MESSAGES\)/);
  assert.match(live, /MESSAGE_CACHE_USER_KEY = "vipeakMessageCacheUserV1"/);
  assert.match(live, /function rememberMessageCacheUser\(user = \{\}\)/);
  assert.match(live, /localStorage\.setItem\(MESSAGE_CACHE_USER_KEY, id\)/);
  assert.match(live, /function clearMessageCache\(\)/);
  assert.match(live, /function handleSessionReplaced[\s\S]*?clearMessageCache\(\)/);
  assert.match(live, /a === "account"[\s\S]*?clearMessageCache\(\)/);
});

test("server exposes a PostgreSQL-backed incremental message cursor", () => {
  assert.match(server, /handleGetChatConversationMessages\(req, res, conversationId, url\)/);
  assert.match(server, /listChatMessagesAfterInDb\(conversation\.id, auth\.user\.id, after, afterId, limit \+ 1\)/);
  assert.match(server, /req\.method === "GET" && chatMessageMatch/);
  assert.match(db, /async function listChatMessagesAfterInDb/);
  assert.match(db, /FROM app_chat_messages/);
  assert.match(db, /created_at > \$3::timestamptz/);
  assert.match(db, /created_at = \$3::timestamptz AND id > \$4/);
  assert.match(db, /ORDER BY created_at ASC, id ASC/);
  assert.match(db, /app_chat_messages_user_conversation_created_id_idx/);
});

test("live message cache assets use the new cache key", { skip: liveSurfaceSkip }, () => {
  assert.match(html, /live\.js\?v=2026110301/);
});
