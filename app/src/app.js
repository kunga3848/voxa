import { t, setLang, getLang, applyStatic, errorText } from "./i18n.js";
import { api, url, settings, saveSettings, ApiError } from "./api.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DRAFT_KEY = "voxa.draft";
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

const state = { health: null, voices: [], history: [], format: "wav", sample: null, recorder: null };

/* ---------------------------------------------------------------- utilitaires */
function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 3200);
}
function showError(e) {
  if (e?.name === "AbortError") return;
  toast(e instanceof ApiError ? errorText(e.code) : errorText(String(e?.message || e)), "error");
}
function fmtTime(s) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
function fmtDate(ts) {
  return new Intl.DateTimeFormat(getLang(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts * 1000));
}
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...children.flat().filter((c) => c != null));
  return n;
}
const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path class="fill" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect class="fill" x="6.5" y="5" width="4" height="14" rx="1.2"/><rect class="fill" x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  reuse: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/></svg>',
};
const icon = (name) => { const s = document.createElement("span"); s.style.display = "contents"; s.innerHTML = ICONS[name]; return s; };

/* ---------------------------------------------------------------- thème & langue */
function applyTheme() {
  if (settings.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = settings.theme;
}
function applyLanguage(l) {
  setLang(l);
  applyStatic();
  $$(".lang-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
  updateCounters();
  renderStatus();
  renderVoiceSelect();
  renderVoiceLists();
  renderHistory();
  if (state.lastResult) renderResult(state.lastResult);
  else $("#result").innerHTML = `<p class="empty">${t("resultEmpty")}</p>`;
  if (state.sample) renderSample();
}

/* ---------------------------------------------------------------- navigation */
function showTab(name) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  $$(".view").forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  if (name === "history") loadHistory();
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- statut moteur */
let healthTimer;
async function pollHealth() {
  clearTimeout(healthTimer);
  const before = state.health?.status;
  try {
    state.health = await api("/api/health");
  } catch {
    state.health = { status: "offline" };
  }
  renderStatus();
  if (state.health.status !== before && state.health.status === "ready") { loadVoices(); }
  if (state.health.languages && !$("#language").options.length) renderLanguages();
  healthTimer = setTimeout(pollHealth, state.health.status === "ready" ? 15000 : 4000);
}
function renderStatus() {
  const s = state.health?.status || "loading";
  const box = $("#status");
  box.dataset.s = s;
  const label = { ready: t("statusReady", { device: (state.health?.device || "").toUpperCase() }),
    loading: t("statusLoading"), offline: t("statusOffline"), error: t("statusError") }[s];
  box.querySelector("span").textContent = label;
  box.title = label;
  const banner = $("#banner");
  banner.hidden = s === "ready" || !state.health;
  banner.dataset.kind = s;
  banner.textContent = s === "offline" ? t("offlineHelp") : s === "loading" ? t("loadingHelp")
    : s === "error" ? `${t("errors.engine_error")} ${state.health?.error || ""}` : "";
}

/* ---------------------------------------------------------------- studio */
const SLIDERS = {
  exaggeration: (v) => v.toFixed(2), stability: (v) => v.toFixed(2), temperature: (v) => v.toFixed(2),
  speed: (v) => `${v.toFixed(2)}×`, pause: (v) => `${v.toFixed(2)} s`,
};
function paintSlider(input) {
  const v = parseFloat(input.value), min = parseFloat(input.min), max = parseFloat(input.max);
  input.style.setProperty("--p", `${((v - min) / (max - min)) * 100}%`);
  $(`#o-${input.id}`).textContent = SLIDERS[input.id](v);
}
function updateCounters() {
  const text = $("#script").value;
  const n = text.trim().length;
  $("#chars").textContent = t("chars", { n: n.toLocaleString(getLang()) });
  const secs = n / 14.5 / parseFloat($("#speed").value) + Math.max(0, text.split(/[.!?…]+/).length - 1) * parseFloat($("#pause").value);
  $("#estimate").textContent = n ? t("estimate", { d: fmtTime(secs) }) : "";
}
function saveDraft() {
  const d = { title: $("#title").value, script: $("#script").value, format: state.format,
    voice: $("#voice").value, language: $("#language").value };
  for (const id of Object.keys(SLIDERS)) d[id] = $(`#${id}`).value;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
function loadDraft() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { /* ignore */ }
  $("#title").value = d.title || "";
  $("#script").value = d.script || "";
  for (const id of Object.keys(SLIDERS)) if (d[id]) $(`#${id}`).value = d[id];
  if (d.format) setFormat(d.format);
  state.draft = d;
}
function setFormat(v) {
  state.format = v;
  $$("#format button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v)));
}
function renderLanguages() {
  const langs = state.health?.languages || { fr: "Français", en: "English" };
  const sel = $("#language");
  const current = sel.value || state.draft?.language || (getLang() === "fr" ? "fr" : "en");
  sel.innerHTML = "";
  for (const [code, name] of Object.entries(langs)) sel.append(el("option", { value: code }, name));
  sel.value = langs[current] ? current : "fr";
}
function renderVoiceSelect() {
  const sel = $("#voice");
  const current = sel.value || state.draft?.voice || "default";
  sel.innerHTML = "";
  const lib = state.voices.filter((v) => v.builtin);
  const mine = state.voices.filter((v) => !v.builtin);
  const g1 = el("optgroup", { label: t("library") });
  g1.append(el("option", { value: "default" }, t("defaultVoice")));
  lib.filter((v) => v.id !== "default").forEach((v) => g1.append(el("option", { value: v.id }, v.name)));
  sel.append(g1);
  if (mine.length) {
    const g2 = el("optgroup", { label: t("myVoices") });
    mine.forEach((v) => g2.append(el("option", { value: v.id }, v.name)));
    sel.append(g2);
  }
  sel.value = state.voices.some((v) => v.id === current) ? current : "default";
}

async function generate() {
  const text = $("#script").value.trim();
  if (!text) return toast(errorText("empty_text"), "error");
  const btn = $("#generate");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span><span>${t("generating")}</span>`;
  const slow = setTimeout(() => toast(t("generatingLong")), 6000);
  try {
    const res = await api("/api/tts", { method: "POST", json: {
      text, title: $("#title").value.trim(), voice: $("#voice").value, language: $("#language").value,
      exaggeration: +$("#exaggeration").value, stability: +$("#stability").value,
      temperature: +$("#temperature").value, speed: +$("#speed").value, pause: +$("#pause").value,
      format: state.format,
    } });
    if (res._note === "ffmpeg_missing") toast(t("ffmpegNote"));
    state.lastResult = res;
    renderResult(res, true);
    state.history.unshift(res);
  } catch (e) {
    showError(e);
  } finally {
    clearTimeout(slow);
    btn.disabled = false;
    btn.innerHTML = `<span>${t("generate")}</span>`;
  }
}
function renderResult(item, autoplay = false) {
  const box = $("#result");
  box.innerHTML = "";
  const p = player(item);
  box.append(p.node);
  if (autoplay) { box.scrollIntoView({ behavior: "smooth", block: "nearest" }); p.play(); }
}

/* ---------------------------------------------------------------- lecteur + forme d'onde */
let currentAudio = null;
function stopOthers(a) {
  if (currentAudio && currentAudio !== a) currentAudio.pause();
  currentAudio = a;
}
async function computePeaks(src, bars) {
  const buf = await (await fetch(src)).arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close?.();
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bars));
  const peaks = new Float32Array(bars);
  let max = 0;
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const start = i * step;
    for (let j = 0; j < step && start + j < data.length; j++) sum += data[start + j] ** 2;
    peaks[i] = Math.sqrt(sum / step);
    max = Math.max(max, peaks[i]);
  }
  return peaks.map((p) => (max ? p / max : 0));
}
function drawWave(canvas, peaks, progress) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim(), base = css.getPropertyValue("--wave").trim();
  const gap = 2, bw = 3, n = Math.floor(w / (bw + gap));
  for (let i = 0; i < n; i++) {
    const p = peaks ? peaks[Math.floor((i / n) * peaks.length)] : 0.12;
    const bh = Math.max(3, p * (h - 4));
    c.fillStyle = i / n < progress ? accent : base;
    const x = i * (bw + gap), y = (h - bh) / 2;
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, bw, bh, 1.5) : c.rect(x, y, bw, bh);
    c.fill();
  }
}
function player(item, { compact = false } = {}) {
  const src = url(item.audioUrl);
  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = src;
  const playBtn = el("button", { class: "play", "aria-label": "Play" });
  playBtn.innerHTML = ICONS.play;
  const canvas = el("canvas", { class: "wave" });
  const time = el("span", { class: "time" }, `0:00 / ${fmtTime(item.duration)}`);
  let peaks = null, raf;
  const redraw = () => drawWave(canvas, peaks, audio.duration ? audio.currentTime / audio.duration : 0);
  const tick = () => { redraw(); time.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration || item.duration)}`; if (!audio.paused) raf = requestAnimationFrame(tick); };
  audio.addEventListener("play", () => { stopOthers(audio); playBtn.innerHTML = ICONS.pause; tick(); });
  audio.addEventListener("pause", () => { playBtn.innerHTML = ICONS.play; cancelAnimationFrame(raf); tick(); });
  audio.addEventListener("ended", () => { audio.currentTime = 0; tick(); });
  playBtn.addEventListener("click", () => (audio.paused ? audio.play().catch(showError) : audio.pause()));
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    if (audio.duration) { audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; tick(); }
  });
  new ResizeObserver(redraw).observe(canvas);
  computePeaks(src, 400).then((p) => { peaks = p; redraw(); }).catch(() => {});

  const actions = el("div", { class: "actions" },
    el("button", { class: "ghost", onclick: () => saveAudio(item) }, icon(isNative() ? "share" : "download"),
      el("span", {}, isNative() ? t("share") : t("download"))));
  const meta = el("div", { class: "player-meta" },
    el("strong", {}, item.title || "Voxa"),
    el("span", {}, item.voiceName),
    el("span", {}, (item.language || "").toUpperCase()),
    el("span", {}, (item.format || "").toUpperCase()),
    item.renderSeconds != null && !compact ? el("span", {}, t("renderedIn", { s: item.renderSeconds })) : null,
    compact ? null : actions);
  const node = el("div", { class: `player${compact ? " compact" : ""}` },
    el("div", { class: "player-main" }, playBtn, canvas, time), compact ? null : meta);
  return { node, play: () => audio.play().catch(() => {}), audio, actions };
}

async function saveAudio(item) {
  try {
    const res = await fetch(url(item.audioUrl));
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    const blob = await res.blob();
    const name = `${(item.title || "voxa").replace(/[^\w\- ]+/g, "").trim().slice(0, 40) || "voxa"}.${item.format}`;
    if (isNative()) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
      const saved = await Filesystem.writeFile({ path: name, data: b64, directory: "CACHE" });
      await Share.share({ title: item.title, url: saved.uri });
      return;
    }
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { showError(e); }
}

/* ---------------------------------------------------------------- voix */
async function loadVoices() {
  try { state.voices = await api("/api/voices"); } catch (e) { if (e.code !== "network") showError(e); return; }
  renderVoiceSelect();
  renderVoiceLists();
}
const previewAudio = new Audio();
function renderVoiceLists() {
  const box = $("#voice-lists");
  box.innerHTML = "";
  const row = (v) => el("div", { class: "voice-row" },
    el("span", { class: "avatar", "aria-hidden": "true" }, (v.name || "?").slice(0, 1).toUpperCase()),
    el("div", { class: "voice-info" }, el("b", {}, v.id === "default" ? t("defaultVoice") : v.name),
      el("span", {}, [v.description && v.description !== "default" ? v.description : "", v.created ? fmtDate(v.created) : ""].filter(Boolean).join(" — "))),
    v.previewUrl ? el("button", { class: "icon-btn", "aria-label": t("preview"), title: t("preview"), onclick: () => {
      stopOthers(previewAudio); previewAudio.src = url(v.previewUrl); previewAudio.play().catch(showError);
    } }, icon("play")) : null,
    el("button", { class: "ghost", onclick: () => { $("#voice").value = v.id; saveDraft(); showTab("studio"); } }, t("use")),
    !v.builtin ? el("button", { class: "icon-btn danger", "aria-label": t("delete"), title: t("delete"), onclick: async () => {
      if (!confirm(t("deleteVoiceConfirm", { name: v.name }))) return;
      try { await api(`/api/voices/${v.id}`, { method: "DELETE" }); await loadVoices(); } catch (e) { showError(e); }
    } }, icon("trash")) : null);

  const mine = state.voices.filter((v) => !v.builtin);
  box.append(el("h3", {}, t("myVoices")));
  box.append(mine.length ? el("div", {}, mine.map(row)) : el("p", { class: "list-empty" }, t("noVoices")));
  box.append(el("h3", {}, t("library")));
  const lib = state.voices.filter((v) => v.builtin);
  box.append(el("div", {}, (lib.length ? lib : [{ id: "default", name: "Voxa", builtin: true }]).map(row)));
}

function renderSample() {
  const s = $("#v-sample");
  s.hidden = !state.sample;
  if (!state.sample) return;
  s.innerHTML = "";
  const a = el("audio", { controls: true, src: state.sample.url });
  s.append(el("span", {}, t("sampleReady", { name: state.sample.name })), a);
}
function setSample(blob, name) {
  if (state.sample?.url) URL.revokeObjectURL(state.sample.url);
  state.sample = blob ? { blob, name, url: URL.createObjectURL(blob) } : null;
  renderSample();
}
async function toggleRecord() {
  const btn = $("#v-record");
  if (state.recorder) { state.recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return toast(errorText("mic"), "error"); }
  const rec = new MediaRecorder(stream);
  const chunks = [];
  let secs = 0;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const label = btn.querySelector("span");
  const timer = setInterval(() => { secs++; label.textContent = t("recording", { s: secs }); if (secs >= 30) rec.stop(); }, 1000);
  rec.onstop = () => {
    clearInterval(timer);
    stream.getTracks().forEach((tr) => tr.stop());
    state.recorder = null;
    btn.classList.remove("recording");
    label.textContent = t("record");
    const type = rec.mimeType || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
    setSample(new Blob(chunks, { type }), `recording.${ext}`);
  };
  state.recorder = rec;
  rec.start(250);
  btn.classList.add("recording");
  label.textContent = t("recording", { s: 0 });
}
async function createVoice(e) {
  e.preventDefault();
  const name = $("#v-name").value.trim();
  if (!name) return toast(errorText("name_required"), "error");
  if (!state.sample) return toast(errorText("no_sample"), "error");
  if (!$("#v-consent").checked) return toast(errorText("consent_required"), "error");
  const btn = $("#v-create");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span><span>${t("creatingVoice")}</span>`;
  const form = new FormData();
  form.append("name", name);
  form.append("description", $("#v-desc").value.trim());
  form.append("consent", "true");
  form.append("sample", state.sample.blob, state.sample.name);
  try {
    const v = await api("/api/voices", { method: "POST", form });
    toast(t("voiceCreated", { name: v.name }));
    $("#clone-form").reset();
    setSample(null);
    await loadVoices();
  } catch (err) { showError(err); }
  finally { btn.disabled = false; btn.innerHTML = `<span>${t("createVoice")}</span>`; }
}

/* ---------------------------------------------------------------- historique */
async function loadHistory() {
  try { state.history = await api("/api/history"); } catch (e) { if (e.code !== "network") showError(e); }
  renderHistory();
}
function renderHistory() {
  const list = $("#history");
  list.innerHTML = "";
  if (!state.history.length) { list.append(el("li", { class: "empty-state" }, t("historyEmpty"))); return; }
  for (const item of state.history) {
    const p = player(item, { compact: true });
    const head = el("div", { class: "player-meta", style: "padding:14px 16px 0;margin:0" },
      el("strong", {}, item.title || "Voxa"),
      el("span", {}, `${item.voiceName} · ${(item.language || "").toUpperCase()} · ${(item.format || "").toUpperCase()}`),
      el("span", {}, item.created ? fmtDate(item.created) : ""),
      el("div", { class: "actions" },
        el("button", { class: "icon-btn", title: t("reuse"), "aria-label": t("reuse"), onclick: () => {
          $("#script").value = item.text; $("#title").value = item.title || "";
          if (state.voices.some((v) => v.id === item.voice)) $("#voice").value = item.voice;
          $("#language").value = item.language; updateCounters(); saveDraft(); showTab("studio");
        } }, icon("reuse")),
        el("button", { class: "icon-btn", title: isNative() ? t("share") : t("download"), "aria-label": t("download"), onclick: () => saveAudio(item) }, icon(isNative() ? "share" : "download")),
        el("button", { class: "icon-btn danger", title: t("delete"), "aria-label": t("delete"), onclick: async () => {
          if (!confirm(t("deleteItemConfirm"))) return;
          try { await api(`/api/history/${item.id}`, { method: "DELETE" }); state.history = state.history.filter((h) => h.id !== item.id); renderHistory(); }
          catch (e) { showError(e); }
        } }, icon("trash"))));
    list.append(el("li", {}, head, p.node, el("p", { class: "h-text" }, item.text)));
  }
}

/* ---------------------------------------------------------------- réglages */
function fillSettings() {
  $("#s-server").value = settings.server;
  $("#s-key").value = settings.apiKey;
  $$("#s-theme button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === settings.theme)));
}

/* ---------------------------------------------------------------- démarrage */
function init() {
  const nav = (navigator.language || "fr").slice(0, 2);
  applyTheme();
  loadDraft();
  renderLanguages();
  $$(".controls input[type=range]").forEach((i) => { paintSlider(i); i.addEventListener("input", () => { paintSlider(i); updateCounters(); saveDraft(); }); });
  applyLanguage(settings.uiLang || (nav === "fr" ? "fr" : "en"));
  fillSettings();

  $$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $$(".lang-switch button").forEach((b) => b.addEventListener("click", () => { saveSettings({ uiLang: b.dataset.lang }); applyLanguage(b.dataset.lang); }));
  $("#script").addEventListener("input", () => { updateCounters(); saveDraft(); });
  $("#title").addEventListener("input", saveDraft);
  $("#voice").addEventListener("change", saveDraft);
  $("#language").addEventListener("change", saveDraft);
  $$("#format button").forEach((b) => b.addEventListener("click", () => { setFormat(b.dataset.v); saveDraft(); }));
  $("#generate").addEventListener("click", generate);
  $("#script").addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); });

  $("#v-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) setSample(f, f.name); e.target.value = ""; });
  $("#v-record").addEventListener("click", toggleRecord);
  $("#clone-form").addEventListener("submit", createVoice);

  $$("#s-theme button").forEach((b) => b.addEventListener("click", () => {
    $$("#s-theme button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  }));
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const theme = $("#s-theme [aria-checked=true]")?.dataset.v || "auto";
    saveSettings({ server: $("#s-server").value || "http://localhost:8000", apiKey: $("#s-key").value.trim(), theme });
    applyTheme(); fillSettings(); toast(t("saved"));
    state.voices = []; pollHealth(); loadVoices(); loadHistory();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => $$("canvas.wave").forEach((c) => c.dispatchEvent(new Event("resize"))));

  pollHealth();
  loadVoices();
  loadHistory();
}
init();
