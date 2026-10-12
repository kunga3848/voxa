const KEY = "voxa.settings";

function defaultServer() {
  const { protocol, origin } = window.location;
  // Version web servie par le moteur : même origine.
  if (protocol === "http:" || protocol === "https:") {
    if (!window.Capacitor?.isNativePlatform?.()) return origin;
  }
  return "http://localhost:8000";
}

export const settings = {
  server: defaultServer(), apiKey: "", uiLang: "", theme: "auto",
  ...(() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })(),
};

export function saveSettings(patch) {
  Object.assign(settings, patch);
  settings.server = settings.server.trim().replace(/\/+$/, "");
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
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
