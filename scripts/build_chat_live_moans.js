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
    candidates: ["啊——啊……", "啊……嗯——", "啊——", "啊……"],
    rate: 0.72,
    pitch: 0.96,
    instruction: "低声、缓慢、带呼吸的暧昧长音，不要像朗读单字，不要清晰咬字",
  },
  {
    id: "nasal",
    candidates: ["嗯——嗯……", "唔……嗯——", "嗯——", "唔……"],
    rate: 0.7,
    pitch: 0.94,
    instruction: "闭口鼻音、含混、气息连续，不要像朗读语气词，不要清晰咬字",
  },
  {
    id: "breath",
    candidates: ["哈啊——哈……", "啊哈——", "哈啊……", "哈——"],
    rate: 0.74,
    pitch: 1.0,
    instruction: "急促后拖长的喘息和轻叫，气息明显，不要念字，不要清晰咬字",
  },
  {
    id: "gasp",
    candidates: ["嘶——啊……", "呃——嗯……", "嘶——", "呃……"],
    rate: 0.76,
    pitch: 1.0,
    instruction: "受惊般的抽气与短促拖音，气声明显，不要念字，不要播音腔",
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

function resampleLinear(pcm, sourceRate, targetRate = SAMPLE_RATE) {
  const input = pcm.length / 2;
  const output = Math.max(1, Math.round(input * targetRate / sourceRate));
  const out = Buffer.alloc(output * 2);
  for (let i = 0; i < output; i += 1) {
    const source = i * sourceRate / targetRate;
    const left = Math.min(input - 1, Math.floor(source));
    const right = Math.min(input - 1, left + 1);
    const mix = source - left;
    out.writeInt16LE(Math.round(pcm.readInt16LE(left * 2) * (1 - mix) + pcm.readInt16LE(right * 2) * mix), i * 2);
  }
  return out;
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
    const target = 1700;
    const score = Math.min(ms, 2800) / 100 + Math.min(rms, 5000) / 160 - Math.abs(ms - target) / 180 - index * 0.15;
    return { pcm, ms, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].pcm;
}

function fitDuration(pcm, shapeId, level) {
  const targetMs = shapeId === "gasp" ? 1450 + level * 180 : shapeId === "breath" ? 1750 + level * 220 : shapeId === "nasal" ? 2200 + level * 250 : 2050 + level * 250;
  const currentMs = durationMs(pcm);
  if (currentMs > 3000) return resampleLinear(pcm, SAMPLE_RATE, Math.round(SAMPLE_RATE * currentMs / 2920));
  if (currentMs >= targetMs * 0.88) return pcm;
  if (currentMs < 450) {
    const input = pcm.length / 2;
    const output = Math.max(1, Math.round(input * targetMs / currentMs));
    const out = Buffer.alloc(output * 2);
    for (let i = 0; i < output; i += 1) {
      const u = i / Math.max(1, output - 1);
      const source = u * (input - 1);
      const left = Math.min(input - 1, Math.floor(source));
      const right = Math.min(input - 1, left + 1);
      const mix = source - left;
      const value = pcm.readInt16LE(left * 2) * (1 - mix) + pcm.readInt16LE(right * 2) * mix;
      const vibrato = 1 + 0.035 * Math.sin(2 * Math.PI * (3.2 + level * 0.55) * u);
      out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * vibrato))), i * 2);
    }
    return out;
  }
  const samples = pcm.length / 2;
  const tailStart = Math.max(0, Math.floor(samples * 0.46));
  const tail = pcm.slice(tailStart * 2);
  const tailSamples = tail.length / 2;
  const desiredTotal = Math.round(targetMs * SAMPLE_RATE / 1000);
  const extra = Math.max(0, desiredTotal - samples);
  const repeated = Buffer.alloc((tailSamples + extra) * 2);
  for (let i = 0; i < tailSamples + extra; i += 1) {
    const u = i / Math.max(1, tailSamples + extra - 1);
    const sourceIndex = Math.min(tailSamples - 1, Math.round((1 - u) * (tailSamples - 1)));
    const source = tail.readInt16LE(sourceIndex * 2);
    const breath = (Math.sin(i * 12.9898 + level * 7.13) * 43758.5453 % 1) * 180;
    repeated.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(source * (0.82 - u * 0.28) + breath))), i * 2);
  }
  return Buffer.concat([pcm.slice(0, tailStart * 2), repeated]);
}

function composeIntensity(base, level, shapeIndex, shapeId) {
  let pcm = base;
  if (level === 1) pcm = resampleLinear(base, SAMPLE_RATE, SAMPLE_RATE * 0.96);
  if (level === 3) pcm = resampleLinear(base, SAMPLE_RATE, SAMPLE_RATE * 1.035);
  const noiseSeed = 17 + shapeIndex * 31 + level * 7;
  const out = Buffer.from(pcm);
  for (let i = 0; i < out.length; i += 2) {
    const sample = out.readInt16LE(i);
    const breath = (((i / 2 + noiseSeed) * 1103515245) & 0xffff) / 65535 - 0.5;
    const gain = level === 1 ? 0.78 : level === 3 ? 1.0 : 0.88;
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample * gain + breath * (level === 3 ? 320 : 150)))), i);
  }
  return envelope(normalize(fitDuration(out, shapeId, level)), 30, 220);
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
        const output = composeIntensity(base, level, shapeIndex, shape.id);
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
