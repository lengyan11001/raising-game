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
    COMPONENT_INTIMATE_PREVIEW_TEXT,
    componentRichVoiceConfig,
    qwenRichInstruction,
    qwenRichProsody,
    richPerformanceText,
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
  assert.deepEqual({ rate: speech.rate, volume: speech.volume, pitch: speech.pitch }, { rate: 1, volume: 50, pitch: 1 });
  const leaked = splitComponentSpeech('{"say":"别躲。","rate":0.5,"volume":100,"pitch":2}');
  assert.deepEqual({ rate: leaked.rate, volume: leaked.volume, pitch: leaked.pitch }, { rate: 1, volume: 50, pitch: 1 });
  assert.equal(normalizeDelivery("flirting"), "flirty");
  assert.equal(normalizeDelivery("亲密"), "intimate");
  assert.equal(normalizeDelivery("前戏"), "foreplay");
  assert.equal(normalizeDelivery("aftercare"), "aftercare");
});

test("delivery keeps every cloned voice control fixed and ignores model prosody fields", () => {
  const delivery = speechDelivery({ emotion: "happy", delivery: "casual", stage: "intimate", rate: 1, volume: 50, pitch: 1 });
  assert.equal(delivery.delivery, "intimate");
  assert.equal(delivery.emotion, "happy");
  assert.match(delivery.instruction, /亲密场景/);
  assert.match(delivery.instruction, /气息/);
  assert.match(delivery.instruction, /停顿/);
  assert.match(delivery.instruction, /中段“别这么快，我还没缓过来”/);
  assert.match(delivery.instruction, /一句话被真实换气切开/);
  assert.match(delivery.instruction, /同一发声位置/);
  assert.doesNotMatch(delivery.instruction, /语速慢|音量压低|声音轻一点|声音软一点/);
  assert.deepEqual({ rate: delivery.rate, pitch: delivery.pitch, volume: delivery.volume }, { rate: 1, pitch: 1, volume: 50 });

  const extreme = speechDelivery({ stage: "intimate", rate: 0.5, volume: 100, pitch: 2 });
  assert.deepEqual({ rate: extreme.rate, pitch: extreme.pitch, volume: extreme.volume }, { rate: 1, pitch: 1, volume: 50 });
});

test("intimate SSML pins 嗯 and 唔 with tone-bearing pinyin", () => {
  const ssml = speechSsml("再靠近一点，嗯……别躲。\n你听得到吗……唔。", { stage: "intimate" });
  assert.match(ssml, /^<speak rate="1" pitch="1" volume="50">/);
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

test("CosyVoice TTS never sends unsupported instruction or silently falls back", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  const cosyStart = source.indexOf("function openCosyvoicePcmStream");
  const cosyEnd = source.indexOf("const QWEN_RICH_VOICE_PROVIDER", cosyStart);
  const cosy = source.slice(cosyStart, cosyEnd);
  assert.match(cosy, /text_type: "PlainText"/);
  assert.match(cosy, /enable_ssml: true/);
  assert.doesNotMatch(cosy, /instruction\s*:/);
  assert.doesNotMatch(source, /instruction fallback|speak\(requested, false\)/);
  assert.match(cosy, /SSML 模式只允许发送一次 continue-task/);
});

test("flirty and foreplay stages have distinct seductive delivery instructions", () => {
  const flirty = speechDelivery({ stage: "flirty" });
  const foreplay = speechDelivery({ stage: "foreplay" });
  assert.equal(flirty.delivery, "flirty");
  assert.equal(foreplay.delivery, "foreplay");
  assert.match(flirty.instruction, /暧昧撩拨/);
  assert.match(flirty.instruction, /暧昧|试探/);
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

test("component reply prompt requests one continuous tagged intimate performance", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /delivery 只能是 casual、tender、flirty、foreplay、intimate、aftercare/);
  assert.doesNotMatch(source, /\\"rate\\":1,\\"volume\\":50,\\"pitch\\":1/);
  assert.match(source, /音色、音高、响度由系统固定/);
  assert.match(source, /stage: options\.stage \|\| session\.liveStoryStage/);
  assert.match(source, /整段必须是同一次连续表演/);
  assert.match(source, /用 \[gasp\] 标在自然换气处/);
  assert.match(source, /用 \[very fast\] 标在仓促漏出的短句前/);
  assert.match(source, /用 \[sighing\] 标在最后的余韵处/);
  assert.match(source, /不能出现清楚咬字的“哈”/);
  assert.match(source, /不能改变角色原本的音色和共鸣/);
  assert.match(source, /preserve those in[\s\S]{0,120}intimate modes/);
  assert.match(source, /const unsupportedTags = intimate/);
  assert.match(source, /very fast/);
});

test("rich voice binding is explicit and cannot reuse a CosyVoice id", () => {
  assert.equal(componentRichVoiceConfig({ name: "普通角色", componentVoiceType: "longanyang" }), null);
  const rich = componentRichVoiceConfig({
    name: "乔安瑜",
    richVoiceProvider: "dashscope_qwen_audio_tts",
    richVoiceModel: "qwen-audio-3.1-tts-flash",
    richVoiceType: "qwen-audio-3.1-tts-flash-jprobe-test",
    richVoiceInstruction: "贴近耳边低声说。",
  });
  assert.equal(rich.model, "qwen-audio-3.1-tts-flash");
  assert.equal(rich.instruction, "贴近耳边低声说。");
  assert.throws(() => componentRichVoiceConfig({
    richVoiceProvider: "dashscope_qwen_audio_tts",
    richVoiceModel: "qwen-audio-3.1-tts-flash",
    richVoiceType: "longyingtao_v3",
  }), /模型不匹配/);
});

test("rich intimate performance preserves the accepted continuous-scene tags", () => {
  const script = richPerformanceText("啊……[gasp]\n嗯……[very fast]别松手，抱紧我……[sighing]", { stage: "intimate" });
  assert.equal(script, "啊……[gasp]\n嗯……[very fast]别松手，抱紧我……[sighing]");
  assert.match(script, /\[gasp\]/);
  assert.match(script, /\[very fast\]/);
  assert.match(script, /\[sighing\]/);
  assert.doesNotMatch(script, /我、我还没缓过来/);
});

test("rich non-intimate modes still strip performance-only tags", () => {
  const script = richPerformanceText("你好。[gasp] 今天怎么样？[very fast]", { stage: "casual" });
  assert.equal(script, "你好。 今天怎么样？");
});

test("rich intimate mode removes wanted voice-change and tremor tags only", () => {
  const script = richPerformanceText("别动。[whisper][trembling][gasp] 嗯……[sighing]", { stage: "foreplay" });
  assert.equal(script, "别动。[gasp] 嗯……[sighing]");
});

test("intimate preview remains one continuous performance without per-syllable splitting", () => {
  assert.equal(COMPONENT_INTIMATE_PREVIEW_TEXT, "嗯，别……先别动，我还没缓过来，慢一点。");
  assert.deepEqual(splitComponentAudioParts(COMPONENT_INTIMATE_PREVIEW_TEXT), [
    { kind: "performance", text: COMPONENT_INTIMATE_PREVIEW_TEXT },
  ]);
});

test("intimate Rich prosody preserves cloned timbre instead of pitch-shifting the voice", () => {
  assert.deepEqual(qwenRichProsody({ stage: "intimate" }), { rate: 1, pitch: 1, volume: 50 });
  assert.deepEqual(qwenRichProsody({ stage: "foreplay" }), { rate: 1, pitch: 1, volume: 50 });
  assert.deepEqual(qwenRichProsody({ stage: "casual" }), { rate: 1, pitch: 1, volume: 50 });
  assert.deepEqual(qwenRichProsody({ stage: "intimate", rate: 0.5, pitch: 2, volume: 100 }), { rate: 1, pitch: 1, volume: 50 });
});

test("rich instruction locks speaker identity instead of applying emotional prosody", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /const CLONED_VOICE_IDENTITY_LOCK =/);
  assert.match(source, /不要为了暧昧压低或抬高嗓音/);
  assert.match(source, /不要改变语速或音量/);
  assert.match(source, /rate: 1,\n\s+volume: 50,\n\s+pitch: 1,/);
});

test("rich intimate instruction is the exact accepted continuous-scene score", () => {
  const instruction = qwenRichInstruction({ instruction: "角色本身偏害羞。" }, { stage: "intimate" });
  assert.equal(instruction, "整段是连续、真实的亲密场景反应，以叫声、喘息和换气为主，不是朗读。整段禁止出现清楚咬字的“哈”或“哈啊”。中段“别这么快，我还没缓过来”和“别松手，抱紧我”这两处独白明显加快、轻一点，像仓促从气息里漏出来。其他台词不要一个字一个字断开，也不要在短词之间制造机械抖动或硬停顿；应像气息接不上时自然形成的连续断续，一句话被真实换气切开。后半段保持喘息、短叫和发虚的气息，不能干。声音真声、轻软、羞、贴近，避免播报腔、耳语腔和机械颤音。");
  assert.doesNotMatch(instruction, /角色本身偏害羞|同一发声位置|不要改变语速或音量/);
  assert.doesNotMatch(instruction, /不要夸张叫床|短促的鼻音起音/);
  assert.doesNotMatch(instruction, /再从“我”继续/);
});

test("rich performance route never silently falls back to CosyVoice", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.doesNotMatch(source, /tts retry/);
  assert.doesNotMatch(source, /pcm = await componentSpeechPcm\(reply, componentVoice, ttsOptions\)/);
  assert.match(source, /log\("tts failed"/);
  assert.match(source, /throw error/);
  assert.match(source, /enable_ssml: false/);
  assert.match(source, /continue-task[\s\S]{0,300}input: \{ text: script \}/);
});

test("rich request keeps the resolved delivery stage instead of reverting to generic instruction", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "chat-live-component.js"), "utf8");
  assert.match(source, /const prosody = qwenRichProsody\(options\);/);
  assert.match(source, /return await qwenRichWsPcm\(script, richVoice, \{[\s\S]{0,160}delivery: speechDelivery\(options\)\.delivery/);
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


test("rich voice preview uses the saved Rich route rather than the catalog route", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
  assert.match(server, /handleAdminChatLiveVoicePreview/);
  assert.match(server, /COMPONENT_INTIMATE_PREVIEW_TEXT[\s\S]{0,160}\{ richVoice, stage: "intimate" \}/);
  assert.match(server, /\/api\/admin\/chat-live\/voice-preview/);
  assert.match(admin, /richVoiceProvider: root\.querySelector\("#chatLiveRichVoiceEnabled"\)\?\.checked === true \? "dashscope_qwen_audio_tts" : ""/);
  assert.match(admin, /chatLiveRichVoicePreview/);
});
