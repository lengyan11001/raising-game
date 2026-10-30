"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  __test: {
    splitComponentAudioParts,
    buildComponentVocalPcm,
    componentReplyPcm,
    componentVoicePreviewWav,
    pcm16MonoWav,
    splitComponentSpeech,
    cleanComponentSay,
    pcmDurationMs,
  },
} = require("../chat-live-component.js");

const MOAN_DIR = path.join(__dirname, "..", "assets", "chat-live", "moans");
const VOICES = [
  "longanhuan",
  "longhua_v3",
  "longwan_v3",
  "longyingmu_v3",
  "longyingtao_v3",
  "longanli_v3",
  "longanyang",
  "longanya_v3",
  "longanqin_v3",
  "longyingxiao_v3",
];

test("component speech strips leaked channel markers and JSON fields", () => {
  const leaked = '{"say":"好啊，那我们就去洗手间吧。不过……你是不是还没从刚才的余韵里缓过神来？</div> {"action":"","emotion":"happy","rate":1.2,"volume":65,"pitch":1}';
  const speech = splitComponentSpeech(leaked);
  assert.match(speech.say, /^好啊，那我们就去洗手间吧。/);
  assert.doesNotMatch(speech.say, /div|action|emotion|rate|volume|pitch|\{/i);
  assert.equal(speech.emotion, "happy");

  const channelLeak = '<|channel>thought <|channel|>```json {"say":"你过来一点。","action":"","emotion":"happy"} ```';
  const cleaned = splitComponentSpeech(channelLeak);
  assert.equal(cleaned.say, "你过来一点。");
  assert.equal(cleanComponentSay("只是台词。"), "只是台词。");
});

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

test("standalone vocal replies generate short natural PCM without CosyVoice", async () => {
  let ttsCalls = 0;
  const result = await componentReplyPcm("啊……嗯——唔。", "longanhuan", {
    speechPcm: async () => {
      ttsCalls += 1;
      return Buffer.alloc(1920);
    },
  });
  assert.equal(ttsCalls, 0);
  assert.equal(result.segmented, true);
  const parts = splitComponentAudioParts("啊……嗯——唔。");
  assert.deepEqual(parts.map((part) => part.kind), ["vocal", "vocal", "vocal"]);
  assert.ok(pcmDurationMs(result.pcm.length) >= 700);
  assert.ok(pcmDurationMs(result.pcm.length) <= 3100, `moan audio too long: ${pcmDurationMs(result.pcm.length)}ms`);
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

test("synthetic moan PCM is short, smooth, and non-silent", () => {
  const pcm = buildComponentVocalPcm({ text: "啊……", shape: "open", intensity: 2 }, "longanhuan");
  const ms = pcmDurationMs(pcm.length);
  assert.ok(ms >= 250 && ms <= 1000, `unexpected moan duration ${ms}ms`);
  let energy = 0;
  for (let index = 0; index < pcm.length; index += 2) energy += Math.abs(pcm.readInt16LE(index));
  assert.ok(energy > 0);
});

test("every active component voice has a complete short-vocal sample set", () => {
  for (const voice of VOICES) {
    for (const shape of ["open", "nasal", "breath", "gasp"]) {
      for (const level of [1, 2, 3]) {
        const file = path.join(MOAN_DIR, `${voice}-${shape}-${level}.wav`);
        assert.ok(fs.existsSync(file), `missing ${file}`);
        const wav = fs.readFileSync(file);
        assert.equal(wav.toString("ascii", 0, 4), "RIFF");
        assert.equal(wav.readUInt32LE(24), 24000);
        assert.equal(wav.readUInt16LE(22), 1);
        const ms = Math.round((wav.length - 44) / 2 / 24000 * 1000);
        assert.ok(ms >= 250 && ms <= 1000, `${file} duration ${ms}ms`);
      }
    }
  }
});

test("the legacy fallback voice has real samples instead of a generic waveform", () => {
  const file = path.join(MOAN_DIR, "longanyang-open-2.wav");
  assert.ok(fs.existsSync(file));
  assert.ok(fs.readFileSync(file).length > 24000 / 4 * 2);
});

test("moan builder keeps natural clips instead of reversing or padding tails", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "build_chat_live_moans.js"), "utf8");
  assert.doesNotMatch(source, /tailStart|vibrato/);
  assert.match(source, /short instead of padding/);
});

test("voice preview wraps the selected CosyVoice PCM as a playable mono WAV", () => {
  const pcm = Buffer.alloc(2400, 1);
  const wav = pcm16MonoWav(pcm, 24000);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.deepEqual(wav.slice(44), pcm);
  assert.throws(() => pcm16MonoWav(Buffer.alloc(0)), /PCM 音频为空/);
});

test("voice preview uses the requested component voice and does not substitute another", async () => {
  const previous = process.env.ALIYUN_DASHSCOPE_API_KEY;
  delete process.env.ALIYUN_DASHSCOPE_API_KEY;
  await assert.rejects(componentVoicePreviewWav("试听", "longanyang"), /TTS 未配置/);
  if (previous === undefined) delete process.env.ALIYUN_DASHSCOPE_API_KEY;
  else process.env.ALIYUN_DASHSCOPE_API_KEY = previous;
});
