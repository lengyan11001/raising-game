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
    normalizeDelivery,
    speechDelivery,
    speechSsml,
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

test("component speech parses controlled delivery and keeps ambiguous flirt signals out of happy", () => {
  const speech = splitComponentSpeech('{"say":"再靠近一点。","action":"","emotion":"暧昧","delivery":"暧昧","rate":1,"volume":50,"pitch":1}');
  assert.equal(speech.emotion, "neutral");
  assert.equal(speech.delivery, "flirty");
  assert.equal(normalizeDelivery("flirting"), "flirty");
  assert.equal(normalizeDelivery("亲密"), "intimate");
  assert.equal(normalizeDelivery("前戏"), "foreplay");
  assert.equal(normalizeDelivery("aftercare"), "aftercare");
});

test("intimate stage forces an intimate TTS performance over a generic model delivery", () => {
  const delivery = speechDelivery({ emotion: "happy", delivery: "casual", stage: "intimate", rate: 1, volume: 50, pitch: 1 });
  assert.equal(delivery.delivery, "intimate");
  assert.equal(delivery.emotion, "happy");
  assert.match(delivery.instruction, /亲密场景/);
  assert.match(delivery.instruction, /耳边/);
  assert.match(delivery.instruction, /低声/);
  assert.match(delivery.instruction, /气息/);
  assert.match(delivery.instruction, /停顿/);
  assert.match(delivery.instruction, /暧昧/);
  assert.doesNotMatch(delivery.instruction, /你正在进行闲聊互动|客服式闲聊/);
  assert.ok(delivery.rate <= 0.9);
  assert.ok(delivery.pitch <= 0.98);
  assert.ok(delivery.volume <= 52);
});

test("intimate component speech uses supported root SSML controls and natural pauses", () => {
  const ssml = speechSsml("再靠近一点，别躲。\n你听得到吗……", { stage: "intimate" });
  assert.match(ssml, /^<speak rate="0\.86" pitch="0\.95" volume="46">/);
  assert.match(ssml, /再靠近一点，<break time="260ms"\/>别躲。/);
  assert.match(ssml, /你听得到吗……<break time="208ms"\/>/);
  assert.doesNotMatch(ssml, /<prosody/);
  assert.match(ssml, /<\/speak>$/);
});

test("SSML escapes user text instead of interpreting it", () => {
  const ssml = speechSsml('她说 "<你好>" & 笑了一下。', { stage: "flirty" });
  assert.match(ssml, /&quot;&lt;你好&gt;&quot; &amp;/);
  assert.doesNotMatch(ssml, /<你好>/);
});

test("component TTS never sends unsupported instruction or silently falls back", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /text_type: "PlainText"/);
  assert.match(source, /enable_ssml: true/);
  assert.doesNotMatch(source, /instruction\s*:/);
  assert.doesNotMatch(source, /instruction fallback|speak\(requested, false\)/);
  assert.match(source, /SSML 模式只允许发送一次 continue-task/);
});

test("flirty and foreplay stages have distinct seductive delivery instructions", () => {
  const flirty = speechDelivery({ stage: "flirty" });
  const foreplay = speechDelivery({ stage: "foreplay" });
  assert.equal(flirty.delivery, "flirty");
  assert.equal(foreplay.delivery, "foreplay");
  assert.match(flirty.instruction, /暧昧撩拨/);
  assert.match(flirty.instruction, /耳边/);
  assert.match(foreplay.instruction, /前戏/);
  assert.match(foreplay.instruction, /呼吸/);
  assert.doesNotMatch(flirty.instruction, /你正在进行闲聊互动|普通闲聊/);
  assert.doesNotMatch(foreplay.instruction, /闲聊互动/);
});

test("casual delivery remains plain and emotional fallback no longer calls itself casual chat", () => {
  const casual = speechDelivery({ delivery: "casual", emotion: "neutral" });
  assert.equal(casual.delivery, "casual");
  assert.equal(casual.instruction, "");
  const happy = speechDelivery({ delivery: "casual", emotion: "happy" });
  assert.match(happy.instruction, /私下聊天/);
  assert.doesNotMatch(happy.instruction, /闲聊互动/);
});

test("component reply prompt asks the model for a controlled delivery style", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /\\"delivery\\":\\"casual\\"/);
  assert.match(source, /delivery 只能是 casual、tender、flirty、foreplay、intimate、aftercare/);
  assert.match(source, /stage: options\.stage \|\| session\.liveStoryStage/);
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
    speechPcm: async (text, voice, options) => {
      spoken.push(text);
      assert.equal(voice, "longanhuan");
      assert.equal(options.stage, "intimate");
      return Buffer.alloc(2400);
    },
    stage: "intimate",
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
