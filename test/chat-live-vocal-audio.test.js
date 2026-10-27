"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  __test: {
    splitComponentAudioParts,
    buildComponentVocalPcm,
    componentReplyPcm,
    pcmDurationMs,
  },
} = require("../chat-live-component.js");

test("standalone moan tokens are split without changing visible words", () => {
  const reply = "啊……！\n哈啊……别只顾着快，把你的鸡巴更深一点地灌进来……唔。";
  const parts = splitComponentAudioParts(reply);
  assert.deepEqual(parts.map((part) => part.kind), ["vocal", "vocal", "speech", "vocal"]);
  assert.equal(parts.map((part) => part.text).join("").replace(/\s+/g, ""), reply.replace(/\s+/g, ""));
  assert.equal(parts[0].text, "啊……！");
  assert.equal(parts[3].text, "唔。");
});

test("normal words containing a vocal character stay in speech", () => {
  const parts = splitComponentAudioParts("好啊，我知道。");
  assert.deepEqual(parts, [{ kind: "speech", text: "好啊，我知道。" }]);
});

test("standalone vocal replies generate sustained PCM without CosyVoice", async () => {
  let ttsCalls = 0;
  const result = await componentReplyPcm("啊……嗯——唔。", "longanhuan", {
    speechPcm: async () => {
      ttsCalls += 1;
      return Buffer.alloc(1920);
    },
  });
  assert.equal(ttsCalls, 0);
  assert.equal(result.segmented, true);
  assert.ok(pcmDurationMs(result.pcm.length) >= 1200, "moan audio should be sustained, not a short syllable");
});

test("mixed replies send only spoken text to CosyVoice", async () => {
  const spoken = [];
  const result = await componentReplyPcm("啊……！\n哈啊……别只顾着快，再深一点……唔。", "longanhuan", {
    speechPcm: async (text) => {
      spoken.push(text);
      return Buffer.alloc(2400);
    },
  });
  assert.equal(result.segmented, true);
  assert.deepEqual(spoken, ["别只顾着快，再深一点……"]);
  assert.ok(result.pcm.length > 2400);
});

test("turn cancellation stops before a later speech segment is synthesized", async () => {
  let active = true;
  const spoken = [];
  const result = await componentReplyPcm("啊……别停……啊……", "longanhuan", {
    shouldContinue: () => active,
    speechPcm: async (text) => {
      spoken.push(text);
      active = false;
      return Buffer.alloc(2400);
    },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.pcm.length, 0);
  assert.deepEqual(spoken, ["别停……"]);
});

test("synthetic moan PCM is long and non-silent", () => {
  const pcm = buildComponentVocalPcm({ text: "啊……", shape: "open", intensity: 2 }, "longanhuan");
  assert.ok(pcmDurationMs(pcm.length) >= 1500);
  let energy = 0;
  for (let index = 0; index < pcm.length; index += 2) energy += Math.abs(pcm.readInt16LE(index));
  assert.ok(energy > 0);
});
