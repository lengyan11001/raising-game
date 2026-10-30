"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  __test: {
    splitComponentAudioParts,
    componentReplyPcm,
    componentVoicePreviewWav,
    pcm16MonoWav,
    splitComponentSpeech,
    cleanComponentSay,
    normalizeDelivery,
    speechDelivery,
    speechSsml,
  },
} = require("../chat-live-component.js");

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

test("intimate stage still exposes a controlled delivery profile", () => {
  const delivery = speechDelivery({ emotion: "happy", delivery: "casual", stage: "intimate", rate: 1, volume: 50, pitch: 1 });
  assert.equal(delivery.delivery, "intimate");
  assert.equal(delivery.emotion, "happy");
  assert.match(delivery.instruction, /亲密场景/);
  assert.match(delivery.instruction, /气息/);
  assert.match(delivery.instruction, /停顿/);
  assert.ok(delivery.rate <= 0.9);
  assert.ok(delivery.pitch <= 0.98);
  assert.ok(delivery.volume <= 52);
});

test("intimate SSML pins 嗯 and 唔 with tone-bearing pinyin", () => {
  const ssml = speechSsml("再靠近一点，嗯……别躲。\n你听得到吗……唔。", { stage: "intimate" });
  assert.match(ssml, /^<speak rate="0\.86" pitch="0\.95" volume="46">/);
  assert.match(ssml, /<phoneme alphabet="py" ph="en2">嗯<\/phoneme>/);
  assert.match(ssml, /<phoneme alphabet="py" ph="wu2">唔<\/phoneme>/);
  assert.doesNotMatch(ssml, /ph="(?:en|wu)"/);
  assert.doesNotMatch(ssml, /<prosody/);
  assert.match(ssml, /<\/speak>$/);
});

test("SSML uses varied pauses rather than one fixed gap", () => {
  const ssml = speechSsml("别躲，嗯……听我说。\n你听得到吗？唔。", { stage: "intimate" });
  const pauses = [...ssml.matchAll(/<break time="(\d+)ms"\/>/g)].map((match) => Number(match[1]));
  assert.ok(pauses.length >= 4, ssml);
  assert.ok(new Set(pauses).size >= 3, `expected varied pauses, received ${pauses.join(", ")}`);
  assert.ok(pauses.some((ms) => ms >= 300));
  assert.ok(pauses.some((ms) => ms <= 200));
});

test("only standalone nasal syllables are pinned, not ordinary vocal words", () => {
  const ssml = speechSsml("好啊，我知道。嗯，再说。哈啊……", { stage: "intimate" });
  assert.doesNotMatch(ssml, /<phoneme[^>]*>好<\/phoneme>/);
  assert.doesNotMatch(ssml, /<phoneme[^>]*>啊<\/phoneme>/);
  assert.doesNotMatch(ssml, /<phoneme[^>]*>哈啊<\/phoneme>/);
  assert.match(ssml, /好啊，/);
  assert.match(ssml, /<phoneme alphabet="py" ph="en2">嗯<\/phoneme>/);
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

test("component reply prompt requests one continuous intimate performance", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /\\"delivery\\":\\"casual\\"/);
  assert.match(source, /delivery 只能是 casual、tender、flirty、foreplay、intimate、aftercare/);
  assert.match(source, /stage: options\.stage \|\| session\.liveStoryStage/);
  assert.match(source, /整段必须是同一次连续表演/);
  assert.match(source, /不要把嗯、啊、哈当成可堆叠的独立音效/);
  assert.match(source, /音高和节奏要有起伏/);
});

test("every reply stays as one continuous performance unit", () => {
  const reply = "啊……！\n哈啊……别只顾着快，把你的鸡巴更深一点地灌进来……唔。";
  const parts = splitComponentAudioParts(reply);
  assert.deepEqual(parts, [{ kind: "performance", text: reply }]);
});

test("normal words are not split into canned vocal syllables", () => {
  const parts = splitComponentAudioParts("好啊，我知道。");
  assert.deepEqual(parts, [{ kind: "performance", text: "好啊，我知道。" }]);
});

test("intimate text is synthesized once so breath and pitch remain continuous", async () => {
  const spoken = [];
  const result = await componentReplyPcm("啊……嗯——唔。", "longanhuan", {
    speechPcm: async (text, voice, options) => {
      spoken.push({ text, voice, stage: options.stage });
      return Buffer.alloc(2400);
    },
    stage: "intimate",
  });
  assert.equal(result.segmented, false);
  assert.deepEqual(result.parts, [{ kind: "performance", text: "啊……嗯——唔。" }]);
  assert.deepEqual(spoken, [{ text: "啊……嗯——唔。", voice: "longanhuan", stage: "intimate" }]);
  assert.equal(result.pcm.length, 2400);
});

test("mixed intimate replies are not split into separate TTS calls", async () => {
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
  assert.equal(result.segmented, false);
  assert.deepEqual(spoken, ["啊……！\n哈啊……别只顾着快，再深一点……唔。"]);
  assert.equal(result.pcm.length, 2400);
});

test("turn cancellation prevents synthesis before a new request is started", async () => {
  let speechCalls = 0;
  const result = await componentReplyPcm("啊……别停……啊……", "longanhuan", {
    shouldContinue: () => false,
    speechPcm: async () => {
      speechCalls += 1;
      return Buffer.alloc(2400);
    },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.pcm.length, 0);
  assert.equal(speechCalls, 0);
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
