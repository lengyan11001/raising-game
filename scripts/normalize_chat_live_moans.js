"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.resolve(__dirname, "..", "assets", "chat-live", "moans");
const RATE = 24000;

function readPcm(file) {
  const wav = fs.readFileSync(file);
  if (wav.toString("ascii", 0, 4) !== "RIFF") throw new Error(`bad WAV ${file}`);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") return wav.slice(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`missing data ${file}`);
}

function writeWav(file, pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

function targetMs(name) {
  const shape = /-(open|nasal|breath|gasp)-/.exec(name)?.[1] || "open";
  const level = Number(/-(1|2|3)\.wav$/.exec(name)?.[1] || 1);
  return shape === "gasp" ? 1450 + level * 180 : shape === "breath" ? 1750 + level * 220 : shape === "nasal" ? 2200 + level * 250 : 2050 + level * 250;
}

function fit(pcm, ms) {
  const current = pcm.length / 2 / RATE * 1000;
  if (current >= ms * 0.88 && current <= 3000) return pcm;
  if (current < 450) {
    const input = pcm.length / 2;
    const output = Math.round(ms * RATE / 1000);
    const out = Buffer.alloc(output * 2);
    for (let i = 0; i < output; i += 1) {
      const u = i / Math.max(1, output - 1);
      const source = u * (input - 1);
      const left = Math.min(input - 1, Math.floor(source));
      const right = Math.min(input - 1, left + 1);
      const mix = source - left;
      const value = pcm.readInt16LE(left * 2) * (1 - mix) + pcm.readInt16LE(right * 2) * mix;
      out.writeInt16LE(Math.round(value), i * 2);
    }
    return out;
  }
  const samples = pcm.length / 2;
  const desired = Math.round(ms * RATE / 1000);
  if (desired <= samples) {
    const out = Buffer.alloc(desired * 2);
    for (let i = 0; i < desired; i += 1) {
      const source = i * samples / desired;
      const left = Math.min(samples - 1, Math.floor(source));
      const right = Math.min(samples - 1, left + 1);
      const mix = source - left;
      out.writeInt16LE(Math.round(pcm.readInt16LE(left * 2) * (1 - mix) + pcm.readInt16LE(right * 2) * mix), i * 2);
    }
    return out;
  }
  const tailStart = Math.floor(samples * 0.46);
  const tail = pcm.slice(tailStart * 2);
  const tailSamples = tail.length / 2;
  const repeatSamples = desired - samples;
  const out = Buffer.alloc(desired * 2);
  pcm.copy(out, 0, 0, tailStart * 2);
  for (let i = 0; i < tailSamples + Math.max(0, repeatSamples); i += 1) {
    const u = i / Math.max(1, tailSamples + Math.max(0, repeatSamples) - 1);
    const index = Math.min(tailSamples - 1, Math.round((1 - u) * (tailSamples - 1)));
    out.writeInt16LE(Math.round(tail.readInt16LE(index * 2) * (0.82 - u * 0.28)), (tailStart + i) * 2);
  }
  return out;
}

for (const name of fs.readdirSync(DIR).filter((n) => n.endsWith(".wav"))) {
  const file = path.join(DIR, name);
  writeWav(file, fit(readPcm(file), targetMs(name)));
}
