"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const readServerSource = () => require("../server-source").readServerSource();

function loadSupportTicketHelpers(dbSource) {
  const start = dbSource.indexOf("function supportTicketFromRow(");
  const end = dbSource.indexOf("function systemNotificationFromRow(", start);
  assert.ok(start >= 0 && end > start, "support ticket helpers should exist");
  const source = `"use strict";\n${dbSource.slice(start, end)}\n;globalThis.__helpers={supportTicketFromRow,supportTicketMessageFromRow};`;
  const sandbox = { globalThis: {} };
  vm.runInNewContext(source, sandbox, { filename: "db.js#support-ticket-helpers" });
  return sandbox.__helpers || sandbox.globalThis.__helpers;
}

function loadNotificationHelpers(dbSource) {
  const start = dbSource.indexOf("function systemNotificationFromRow(");
  const end = dbSource.indexOf("async function listSystemNotificationsForUserFromDb(", start);
  assert.ok(start >= 0 && end > start, "system notification helper should exist");
  const sandbox = { globalThis: {} };
  vm.runInNewContext(`"use strict";\n${dbSource.slice(start, end)}\n;globalThis.__helper=systemNotificationFromRow;`, sandbox, { filename: "db.js#system-notification-helper" });
  return sandbox.__helper || sandbox.globalThis.__helper;
}

test("support ticket views preserve unread counts and sender metadata", () => {
  const { supportTicketFromRow, supportTicketMessageFromRow } = loadSupportTicketHelpers(read("db.js"));
  const ticket = supportTicketFromRow({
    id: "ticket-1",
    user_id: "user-1",
    username: "alice",
    user_email: "alice@example.com",
    status: "pending",
    priority: "high",
    last_message_at: "2026-11-09T10:00:00Z",
    created_at: "2026-11-09T09:00:00Z",
    updated_at: "2026-11-09T10:00:00Z",
    message_count: 3,
    user_unread_count: 1,
    admin_unread_count: 2,
    last_message: "Please check",
    last_sender_type: "user",
  });
  assert.equal(ticket.userUnreadCount, 1);
  assert.equal(ticket.adminUnreadCount, 2);
  assert.equal(ticket.username, "alice");
  assert.equal(ticket.userEmail, "alice@example.com");
  assert.equal(ticket.priority, "high");
  const message = supportTicketMessageFromRow({ id: "m1", ticket_id: "ticket-1", sender_type: "admin", sender_name: "Support", body: "Done", created_at: "2026-11-09T10:00:00Z" });
  assert.equal(message.senderType, "admin");
  assert.equal(message.senderName, "Support");
  assert.equal(message.body, "Done");
});

test("system notification view keeps pin, publish, expiry and read version", () => {
  const toView = loadNotificationHelpers(read("db.js"));
  const item = toView({
    id: "notice-1",
    title: "Maintenance",
    body: "Tonight",
    pinned: true,
    active: true,
    publish_at: "2026-11-09T10:00:00Z",
    expires_at: "2026-11-10T10:00:00Z",
    created_at: "2026-11-09T09:00:00Z",
    updated_at: "2026-11-09T09:30:00Z",
    read_at: "2026-11-09T09:40:00Z",
    read_version: "2026-11-09T09:30:00Z",
  });
  assert.equal(item.pinned, true);
  assert.equal(item.active, true);
  assert.equal(item.publishAt, "2026-11-09T10:00:00.000Z");
  assert.equal(item.expiresAt, "2026-11-10T10:00:00.000Z");
  assert.equal(item.readVersion, "2026-11-09T09:30:00Z");
});

test("database query contracts enforce unread isolation, ordering and notification update semantics", () => {
  const db = read("db.js");
  assert.match(db, /tm\.sender_type = 'admin'[\s\S]*?user_last_read_at/);
  assert.match(db, /tm\.sender_type = 'user'[\s\S]*?admin_last_read_at/);
  assert.match(db, /ORDER BY n\.pinned DESC, n\.publish_at DESC, n\.created_at DESC/);
  assert.match(db, /unread: !item\.readAt \|\| item\.readVersion !== item\.updatedAt/);
  assert.match(db, /expires_at = CASE WHEN \$8::boolean THEN \$7::timestamptz ELSE expires_at END/);
  assert.match(db, /hasExpiresAt = Object\.prototype\.hasOwnProperty\.call\(patch, "expiresAt"\)/);
});

test("customer support routes require authentication and admin routes require admin role", () => {
  const server = readServerSource();
  for (const handler of ["handleCreateSupportTicket", "handleListSupportTickets", "handleGetSupportTicket", "handleReplySupportTicket", "handleListSystemNotifications"]) {
    const block = server.match(new RegExp(`async function ${handler}\\([\\s\\S]*?\\n}`));
    assert.ok(block, `${handler} should exist`);
    assert.match(block[0], /await requireUser\(req, res\)/, `${handler} must require user auth`);
  }
  const db = read("db.js");
  assert.match(db, /FROM app_support_tickets t[\s\S]*?WHERE t\.id = \$1 AND t\.user_id = \$2/);
  assert.match(server, /url\.pathname === "\/api\/admin\/support-tickets"[\s\S]*?handleAdminListSupportTickets/);
  assert.match(server, /url\.pathname === "\/api\/admin\/system-notifications"[\s\S]*?handleAdminListSystemNotifications/);
});

test("platform UI exposes one left messages entry, unread dots, notification detail and ticket chat", () => {
  const html = read("platform.html");
  const js = read("platform.explore.js");
  const main = read("platform.main.js");
  const css = read("platform.css");
  assert.match(html, /id="supportNavBtn"[^>]*aria-label="消息通知"/);
  assert.match(html, /id="supportNavBtn"[\s\S]*?<span>消息通知<\/span>/);
  assert.doesNotMatch(html, /id="supportFab"/);
  assert.doesNotMatch(html, /id="mobileNotificationBellBtn"/);
  assert.match(html, /id="notificationBellBtn"[^>]*hidden/);
  assert.match(html, /id="notificationPanel"/);
  assert.match(html, /id="notificationDetailDialog"/);
  assert.match(html, /id="supportMessages"/);
  assert.match(js, /totalUnreadCount/);
  assert.match(js, /supportUnreadCount/);
  assert.match(js, /data-notification-id/);
  assert.match(js, /supportUnreadCount/);
  assert.match(js, /data-support-ticket-id/);
  assert.match(js, /senderType === "admin"/);
  assert.match(main, /supportNavBtn\?\.addEventListener[\s\S]*?toggleNotificationPanel\("nav"\)/);
  assert.match(main, /notificationSupportEntry\?\.addEventListener/);
  assert.match(css, /\.notification-bell\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /\.notification-dot[^{]*\{[^}]*background:/);
  assert.match(css, /\.support-ticket-unread[^{]*\{/);
  assert.match(css, /\.support-message\.is-admin/);
});

test("notification loading avoids ticket-list unread scans and full message aggregation", () => {
  const serverParts = fs.readdirSync(path.join(root, "server.parts"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => read(path.join("server.parts", name)))
    .join("\n");
  const db = read("db.js");
  const block = serverParts.match(/async function handleListSystemNotifications[\s\S]*?\n}/);
  assert.ok(block, "notification endpoint should exist");
  assert.match(block[0], /countUserSupportUnreadFromDb/);
  assert.doesNotMatch(block[0], /listUserSupportTicketsInDb/);
  assert.match(db, /async function countUserSupportUnreadFromDb/);
  assert.match(db, /LEFT JOIN LATERAL \([\s\S]*?ORDER BY tm\.created_at DESC, tm\.id DESC[\s\S]*?LIMIT 1/);
  assert.doesNotMatch(db, /ARRAY_AGG\(tm\.(body|sender_type)/);
  assert.match(db, /app_support_ticket_messages_ticket_sender_created_idx/);
});

test("admin UI provides ticket workstation and notification configuration", () => {
  const html = read("admin.html");
  const js = read("admin.js");
  const css = read("admin.css");
  assert.match(html, /data-route="support-tickets"/);
  assert.match(html, /data-route="system-notifications"/);
  assert.match(html, /历史站内信/);
  assert.match(js, /id: "support-tickets", title: "客服工单", render: renderSupportTickets/);
  assert.match(js, /id: "system-notifications", title: "系统通知", render: renderSystemNotifications/);
  assert.match(js, /\/api\/admin\/support-tickets\?\$\{params\.toString\(\)\}/);
  assert.match(js, /\/api\/admin\/support-tickets\/\$\{encodeURIComponent\(ticket\.id\)\}\/messages/);
  assert.match(js, /\/api\/admin\/system-notifications/);
  const supportStart = js.indexOf("async function renderSupportTickets(");
  const supportEnd = js.indexOf("async function renderSystemNotifications(", supportStart);
  assert.ok(supportStart >= 0 && supportEnd > supportStart);
  const supportBlock = js.slice(supportStart, supportEnd);
  assert.match(supportBlock, /ticketStatusSelect/);
  assert.match(supportBlock, /ticketPrioritySelect/);
  assert.match(supportBlock, /ticketReplyForm/);
  assert.match(supportBlock, /adminUnreadCount/);
  assert.match(supportBlock, /querySelector\("#ticketThread"\)/);
  assert.match(supportBlock, /submit\.disabled = true/);
  assert.match(css, /\.adm-ticket-shell/);
  assert.match(css, /\.adm-ticket-bubble/);
  assert.match(css, /\.adm-notice-preview-panel/);
});
