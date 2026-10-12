// Deux moteurs derrière la même interface :
//  - local : le moteur Voxa auto-hébergé (engine/server.py)
//  - cloud : moteur de test, l'espace public Chatterbox Multilingual sur Hugging Face
//            (quota GPU gratuit limité, 300 caractères par appel => découpage automatique)
import { api, url, settings, ApiError } from "./api.js";
import { chunkText, concat, decodeToMono, encodeWav, normalize } from "./audio.js";
import { store } from "./store.js";

export const LANGUAGES = {
  fr: "Français", en: "English", es: "Español", de: "Deutsch", it: "Italiano", pt: "Português",
  nl: "Nederlands", pl: "Polski", ru: "Русский", ar: "العربية", zh: "中文", ja: "日本語", ko: "한국어",
  hi: "हिन्दी", tr: "Türkçe", sv: "Svenska", da: "Dansk", no: "Norsk", fi: "Suomi", el: "Ελληνικά",
  he: "עברית", ms: "Bahasa Melayu", sw: "Kiswahili",
};
const SR = 24000;

/* ------------------------------------------------------------------ moteur local */
const local = {
  kind: "local",
  caps: { mp3: true, speed: true },
  async health() { return api("/api/health"); },
  async voices() {
    const list = await api("/api/voices");
    return list.map((v) => ({ ...v, previewSrc: v.previewUrl ? url(v.previewUrl) : "" }));
  },
  async createVoice({ name, description, blob, filename }) {
    const form = new FormData();
    form.append("name", name);
    form.append("description", description);
    form.append("consent", "true");
    form.append("sample", blob, filename);
    return api("/api/voices", { method: "POST", form });
  },
  deleteVoice: (id) => api(`/api/voices/${id}`, { method: "DELETE" }),
  async tts(p) {
    const r = await api("/api/tts", { method: "POST", json: p });
    return { ...r, src: url(r.audioUrl) };
  },
  async history() {
    return (await api("/api/history")).map((m) => ({ ...m, src: url(m.audioUrl) }));
  },
  deleteItem: (id) => api(`/api/history/${id}`, { method: "DELETE" }),
};

/* ------------------------------------------------------------------ moteur de test cloud */
const blobUrls = new Map();
const srcFor = (id, blob) => {
  if (!blobUrls.has(id)) blobUrls.set(id, URL.createObjectURL(blob));
  return blobUrls.get(id);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function authHeaders() {
  return settings.hfToken ? { Authorization: `Bearer ${settings.hfToken}` } : {};
}

async function cloudFetch(path, init = {}) {
  let res;
  try {
    res = await fetch(settings.cloudUrl + path, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("cloud_unreachable", 0);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError("hf_token", res.status);
  if (res.status === 429) throw new ApiError("quota", 429);
  if (!res.ok) throw new ApiError("cloud_error", res.status);
  return res;
}

async function upload(blob) {
  const form = new FormData();
  form.append("files", blob, "voice.wav");
  const [path] = await (await cloudFetch("/gradio_api/upload", { method: "POST", body: form })).json();
  return { path, orig_name: "voice.wav", meta: { _type: "gradio.FileData" } };
}

function classifyError(message) {
  const m = String(message || "").toLowerCase();
  if (/quota|exceeded|zerogpu|gpu task/.test(m)) return "quota";
  if (/token|unauthor|login|sign/.test(m)) return "hf_token";
  return message ? `cloud_error:${message}` : "cloud_error";
}

/** Appel Gradio (protocole /call + flux SSE). Renvoie la liste des sorties. */
async function callSpace(fn, data, signal) {
  const { event_id: eid } = await (await cloudFetch(`/gradio_api/call/${fn}`, {
    method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
  })).json();
  const res = await cloudFetch(`/gradio_api/call/${fn}/${eid}`, { signal });
  const text = await res.text();
  let event = "", result = null, error = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      let parsed = null;
      try { parsed = JSON.parse(payload); } catch { parsed = payload; }
      if (event === "complete") result = parsed;
      if (event === "error") error = parsed?.message ?? parsed ?? "";
    }
  }
  if (result) return result;
  throw new ApiError(classifyError(error), 0);
}

async function fileToSamples(file) {
  const fileUrl = file?.url || (file?.path ? `${settings.cloudUrl}/gradio_api/file=${file.path}` : null);
  if (!fileUrl) throw new ApiError("cloud_error", 0);
  const abs = fileUrl.startsWith("http") ? fileUrl : settings.cloudUrl + fileUrl;
  let res;
  try { res = await fetch(abs, { headers: authHeaders() }); } catch { throw new ApiError("cloud_unreachable", 0); }
  if (!res.ok) throw new ApiError("cloud_error", res.status);
  return decodeToMono(await res.arrayBuffer(), SR);
}

const cloud = {
  kind: "cloud",
  caps: { mp3: false, speed: false },
  async health() {
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 10000);
      await cloudFetch("/config", { signal: ctl.signal });
      return { status: "ready", device: "cloud", languages: LANGUAGES };
    } catch {
      return { status: "offline", device: "cloud", languages: LANGUAGES };
    }
  },
  async voices() {
    const mine = (await store.all("voices")).sort((a, b) => b.created - a.created);
    return [
      { id: "default", name: "Voxa", builtin: true, description: "default", previewSrc: "" },
      ...mine.map((v) => ({ id: v.id, name: v.name, description: v.description, created: v.created / 1000,
        builtin: false, previewSrc: srcFor(`v-${v.id}`, v.blob) })),
    ];
  },
  async createVoice({ name, description, blob }) {
    const v = { id: uid(), name, description, created: Date.now(), blob };
    await store.put("voices", v);
    return { id: v.id, name };
  },
  async deleteVoice(id) { await store.del("voices", id); },
  async tts(p, { onProgress, signal } = {}) {
    const started = performance.now();
    const chunks = chunkText(p.text, 280);
    let ref = null, voiceName = "Voxa";
    if (p.voice !== "default") {
      const v = await store.get("voices", p.voice);
      if (!v) throw new ApiError("voice_not_found", 404);
      voiceName = v.name;
      ref = await upload(v.blob);
    }
    const seed = Math.floor(Math.random() * 1e6); // même graine pour tous les blocs = voix homogène
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i + 1, chunks.length);
      const out = await callSpace("generate_tts_audio",
        [chunks[i], p.language, ref, p.exaggeration, p.temperature, seed, Math.max(0.2, p.stability)], signal);
      parts.push(await fileToSamples(out[0]));
    }
    const samples = normalize(concat(parts, SR, p.pause));
    const blob = encodeWav(samples, SR);
    const meta = {
      id: uid(), title: (p.title || p.text.slice(0, 60)).trim(), text: p.text, voice: p.voice, voiceName,
      language: p.language, format: "wav", duration: +(samples.length / SR).toFixed(2),
      created: Date.now() / 1000, renderSeconds: +((performance.now() - started) / 1000).toFixed(1),
    };
    try { await store.put("items", { ...meta, blob }); } catch { /* stockage plein : on garde le résultat à l'écran */ }
    return { ...meta, src: srcFor(meta.id, blob) };
  },
  async history() {
    const items = (await store.all("items")).sort((a, b) => b.created - a.created);
    return items.map(({ blob, ...m }) => ({ ...m, src: srcFor(m.id, blob) }));
  },
  async deleteItem(id) {
    await store.del("items", id);
    if (blobUrls.has(id)) { URL.revokeObjectURL(blobUrls.get(id)); blobUrls.delete(id); }
  },
};

export function engine() {
  return settings.mode === "local" ? local : cloud;
}
