// Outils audio côté navigateur : décodage, rééchantillonnage, assemblage, encodage WAV.

const Ctx = () => window.AudioContext || window.webkitAudioContext;

/** Décode n'importe quel fichier audio lisible par le navigateur en mono Float32 à `sr` Hz. */
export async function decodeToMono(blobOrBuffer, sr = 24000, maxSeconds = Infinity) {
  const buf = blobOrBuffer instanceof ArrayBuffer ? blobOrBuffer : await blobOrBuffer.arrayBuffer();
  const ctx = new (Ctx())();
  let decoded;
  try { decoded = await ctx.decodeAudioData(buf.slice(0)); } finally { ctx.close?.(); }
  const seconds = Math.min(decoded.duration, maxSeconds);
  const length = Math.max(1, Math.ceil(seconds * sr));
  const off = new OfflineAudioContext(1, length, sr);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination); // le mixage stéréo -> mono est automatique
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0).slice();
}

/** Retire le silence au début et à la fin (seuil en amplitude). */
export function trimSilence(samples, sr, threshold = 0.01) {
  const win = Math.floor(sr * 0.02);
  let start = 0, end = samples.length;
  const loud = (i) => { let m = 0; for (let j = i; j < Math.min(i + win, samples.length); j++) m = Math.max(m, Math.abs(samples[j])); return m > threshold; };
  while (start < end && !loud(start)) start += win;
  while (end > start && !loud(Math.max(0, end - win))) end -= win;
  const pad = Math.floor(sr * 0.08);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

export function concat(parts, sr, pauseSeconds = 0) {
  const gap = Math.floor(sr * pauseSeconds);
  const total = parts.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, parts.length - 1);
  const out = new Float32Array(total);
  let o = 0;
  parts.forEach((p, i) => { if (i) o += gap; out.set(p, o); o += p.length; });
  return out;
}

export function normalize(samples, peakTarget = 0.95) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak > peakTarget) { const k = peakTarget / peak; for (let i = 0; i < samples.length; i++) samples[i] *= k; }
  return samples;
}

/** Encode en WAV PCM 16 bits mono. */
export function encodeWav(samples, sr) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Prépare un échantillon de clonage : mono 24 kHz, silences retirés, 30 s max. */
export async function prepareSample(blob) {
  const sr = 24000;
  const raw = await decodeToMono(blob, sr, 40);
  const trimmed = trimSilence(raw, sr).subarray(0, sr * 30);
  return { blob: encodeWav(normalize(Float32Array.from(trimmed)), sr), seconds: trimmed.length / sr };
}

/** Découpe un texte en blocs ≤ limit caractères, en respectant les phrases. */
export function chunkText(text, limit = 280) {
  const parts = text.split(/(?<=[.!?…;:])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (let p of parts) {
    while (p.length > limit) {
      let cut = Math.max(p.lastIndexOf(",", limit), p.lastIndexOf(" ", limit));
      if (cut < 40) cut = limit;
      if (cur) { chunks.push(cur); cur = ""; }
      chunks.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1).trim();
    }
    if (!p) continue;
    if (cur.length + p.length + 1 <= limit) cur = `${cur} ${p}`.trim();
    else { if (cur) chunks.push(cur); cur = p; }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
