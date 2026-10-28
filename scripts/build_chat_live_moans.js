"use strict";

/*
 * Build per-voice long vocal samples for the component live chat.
 * The visible reply text is not changed. These files are selected at runtime by
 * character.componentVoiceType + vocal shape + intensity.
 *
 * Usage:
 *   node scripts/build_chat_live_moans.js
 *
 * Requires the same DashScope credentials as component TTS. Writes 24kHz mono
 * 16-bit WAV files into assets/chat-live/moans.
 */
const fs = require("node:fs");
const path = require("node:path");
const { __test } = require("../chat-live-component.js");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "chat-live", "moans");
const CACHE_DIR = path.join(ROOT, ".tmp-moan-build");
const SAMPLE_RATE = 24000;

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

const SHAPES = [
  {
    id: "open",
    candidates: ["啊。", "啊……", "啊——"],
    rate: 1.06,
    pitch: 0.98,
    instruction: "短促自然的一声，只发出这一小声，不要拖长，不要念字，不要播音腔，不要机械颤音",
  },
  {
    id: "nasal",
    candidates: ["嗯。", "唔……", "嗯——"],
    rate: 1.04,
    pitch: 0.96,
    instruction: "短促自然的闭口鼻音，只发出这一小声，不要拖长，不要念字，不要播音腔，不要机械颤音",
  },
  {
    id: "breath",
    candidates: ["哈。", "哈啊……", "哈——"],
    rate: 1.06,
    pitch: 1.0,
    instruction: "短促自然的喘息轻叫，只发出这一小声，气息真实，不要拖长，不要念字，不要播音腔",
  },
  {
    id: "gasp",
    candidates: ["呃。", "呃——", "呃……"],
    rate: 1.06,
    pitch: 1.0,
    instruction: "短促自然的抽气声，只发出这一小声，不要拖长，不要念字，不要播音腔",
  },
];

function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function wavToPcm(wav) {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("not WAV");
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") return wav.slice(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data not found");
}

function trimSilence(pcm, threshold = 260) {
  let start = 0;
  let end = pcm.length / 2 - 1;
  const loud = (index) => Math.abs(pcm.readInt16LE(index * 2)) >= threshold;
  while (start < end && !loud(start)) start += 1;
  while (end > start && !loud(end)) end -= 1;
  const pad = Math.round(SAMPLE_RATE * 0.04);
  start = Math.max(0, start - pad);
  end = Math.min(pcm.length / 2 - 1, end + pad);
  return pcm.slice(start * 2, (end + 1) * 2);
}

function envelope(pcm, attackMs = 45, releaseMs = 180) {
  const samples = pcm.length / 2;
  const attack = Math.max(1, Math.round(SAMPLE_RATE * attackMs / 1000));
  const release = Math.max(1, Math.round(SAMPLE_RATE * releaseMs / 1000));
  const out = Buffer.from(pcm);
  for (let i = 0; i < samples; i += 1) {
    const gain = Math.min(1, i / attack, (samples - 1 - i) / release);
    if (gain < 1) out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * gain), i * 2);
  }
  return out;
}

function normalize(pcm, targetPeak = 14500) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  if (!peak) return pcm;
  const gain = targetPeak / peak;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i);
  return out;
}

function durationMs(pcm) {
  return Math.round(pcm.length / 2 / SAMPLE_RATE * 1000);
}

async function synth(voice, shape, text, index) {
  const cache = path.join(CACHE_DIR, `${voice}-${shape.id}-${index}.wav`);
  if (fs.existsSync(cache)) return trimSilence(wavToPcm(fs.readFileSync(cache)));
  const pcm = await __test.componentSpeechPcm(text, voice, {
    emotion: "happy",
    rate: shape.rate,
    volume: 58,
    pitch: shape.pitch,
    instruction: shape.instruction,
  });
  fs.writeFileSync(cache, pcmToWav(pcm));
  return trimSilence(pcm);
}

function bestCandidate(items) {
  const scored = items.map((pcm, index) => {
    const ms = durationMs(pcm);
    let energy = 0;
    for (let i = 0; i < pcm.length; i += 2) energy += Math.abs(pcm.readInt16LE(i));
    const rms = energy / Math.max(1, pcm.length / 2);
    const target = 650;
    const score = Math.min(ms, 1200) / 100 + Math.min(rms, 5000) / 160 - Math.abs(ms - target) / 120 - index * 0.1;
    return { pcm, ms, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].pcm;
}

function fitDuration(pcm, shapeId) {
  // Long synthetic tails sound mechanical and create the "乌拉乌拉" effect.
  // Keep the natural utterance short instead of padding it to a fixed length.
  const maxMs = shapeId === "gasp" ? 720 : shapeId === "nasal" ? 780 : 900;
  if (durationMs(pcm) <= maxMs) return pcm;
  return pcm.slice(0, Math.round(maxMs * SAMPLE_RATE / 1000) * 2);
}

function composeIntensity(base, level, shapeId) {
  const gains = [0, 0.78, 0.92, 1.08];
  let pcm = fitDuration(base, shapeId);
  const peak = normalize(pcm, 14500);
  const out = Buffer.from(peak);
  const gain = gains[level] || 1;
  for (let i = 0; i < out.length; i += 2) {
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out.readInt16LE(i) * gain))), i);
  }
  return envelope(out, 18, 90);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const voice of VOICES) {
    for (let shapeIndex = 0; shapeIndex < SHAPES.length; shapeIndex += 1) {
      const shape = SHAPES[shapeIndex];
      const candidates = [];
      for (let index = 0; index < shape.candidates.length; index += 1) {
        try {
          candidates.push(await synth(voice, shape, shape.candidates[index], index));
        } catch (error) {
          console.error(`[moan-build] ${voice}/${shape.id}/${index}`, error.message);
        }
      }
      if (!candidates.length) throw new Error(`No usable moan samples for ${voice}/${shape.id}`);
      const base = bestCandidate(candidates);
      for (let level = 1; level <= 3; level += 1) {
        const file = path.join(OUT_DIR, `${voice}-${shape.id}-${level}.wav`);
        const output = composeIntensity(base, level, shape.id);
        fs.writeFileSync(file, pcmToWav(output));
        console.log(`[moan-build] ${path.relative(ROOT, file)} ${durationMs(output)}ms`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
