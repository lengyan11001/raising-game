"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const fixtures = {
  live: { model: "vidu-s2", callMode: "video", maxMinutes: 10 },
  character: { avatarUrl: "https://example.test/avatar.png" },
  avatar: { name: "test" },
  ARTC_APP_ID: "app",
  pusherId: "pusher",
  channelId: "channel",
  artcToken: () => "test-token",
};

test("component and realtime Vidu creation default to disabled moderation and motion", () => {
  const component = source.match(/viduLiveRequestRetry\("\/live\/s_avatar\/component", \{[\s\S]*?\bbody: (\{[\s\S]*?\n        \}),\n      \}, \{ characterId:/);
  const realtime = source.match(/const realtimeBody = (\{[\s\S]*?\n  \});/);
  assert.ok(component, "component creation body is present");
  assert.ok(realtime, "realtime creation body is present");

  for (const [mode, expression] of [["component", component[1]], ["realtime", realtime[1]]]) {
    const body = vm.runInNewContext(`(${expression})`, fixtures);
    assert.equal(body.extra_motion, false, `${mode} extra_motion`);
    assert.equal(body.moderation, "disabled", `${mode} moderation`);
  }
});
