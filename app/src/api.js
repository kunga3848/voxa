const KEY = "voxa.settings";
export const CLOUD_SPACE = "https://resembleai-chatterbox-multilingual-tts.hf.space";

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const servedOverHttp = () => /^https?:$/.test(window.location.protocol) && !isNative();

function stored() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export const settings = {
  mode: "",                       // "cloud" (moteur de test) ou "local" (mon moteur) ; vide = à déterminer
  server: servedOverHttp() ? window.location.origin : "http://localhost:8000",
  apiKey: "", hfToken: "", cloudUrl: CLOUD_SPACE, uiLang: "", theme: "auto",
  ...stored(),
};

export function saveSettings(patch) {
  Object.assign(settings, patch);
  settings.server = (settings.server || "").trim().replace(/\/+$/, "");
  settings.cloudUrl = (settings.cloudUrl || CLOUD_SPACE).trim().replace(/\/+$/, "");
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
}

/** Premier lancement : si la page est servie par un moteur Voxa, on l'utilise ; sinon, moteur de test cloud. */
export async function resolveMode() {
  if (settings.mode) return settings.mode;
  let mode = "cloud";
  if (servedOverHttp()) {
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(`${window.location.origin}/api/health`, { signal: ctl.signal });
      if (r.ok && (await r.json()).status) mode = "local";
    } catch { /* pas de moteur à cette adresse */ }
  }
  saveSettings({ mode, server: mode === "local" ? window.location.origin : settings.server });
  return mode;
}

export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

export function url(path) {
  if (!path) return "";
  const u = settings.server + path;
  return settings.apiKey ? `${u}${u.includes("?") ? "&" : "?"}key=${encodeURIComponent(settings.apiKey)}` : u;
}

export async function api(path, { method = "GET", json, form, signal } = {}) {
  const headers = {};
  if (settings.apiKey) headers["X-API-Key"] = settings.apiKey;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(settings.server + path, { method, headers, body, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("network", 0);
  }
  if (!res.ok) {
    let code = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      code = typeof d.detail === "string" ? d.detail : (d.detail?.[0]?.msg || code);
    } catch { /* corps non JSON */ }
    throw new ApiError(code, res.status);
  }
  const note = res.headers.get("X-Voxa-Note");
  const data = await res.json();
  if (note && data && typeof data === "object") data._note = note;
  return data;
}
