"""
Voxa Engine — moteur de voix off auto-hébergé.

Basé sur Chatterbox Multilingual (Resemble AI, licence MIT).
Lancement : python server.py   (ou start.bat / start.sh)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("VOXA_DATA", ROOT / "data"))
VOICES_DIR = DATA / "voices"
OUTPUTS_DIR = DATA / "outputs"
LIBRARY_DIR = ROOT / "library"  # voix premium fournies avec le moteur
_dist = ROOT.parent / "app" / "dist"
# L'interface n'a pas besoin de compilation : sans dist/, on sert directement app/.
WEB_DIR = Path(os.environ.get("VOXA_WEB", _dist if _dist.exists() else ROOT.parent / "app"))
API_KEY = os.environ.get("VOXA_API_KEY", "").strip()
HOST = os.environ.get("VOXA_HOST", "0.0.0.0")
PORT = int(os.environ.get("VOXA_PORT", "8000"))
MOCK = os.environ.get("VOXA_MOCK", "0") == "1"  # tests de l'interface sans modèle
MAX_CHARS = int(os.environ.get("VOXA_MAX_CHARS", "20000"))

for d in (VOICES_DIR, OUTPUTS_DIR, LIBRARY_DIR):
    d.mkdir(parents=True, exist_ok=True)

LANGUAGES = {
    "fr": "Français", "en": "English", "es": "Español", "de": "Deutsch",
    "it": "Italiano", "pt": "Português", "nl": "Nederlands", "pl": "Polski",
    "ru": "Русский", "ar": "العربية", "zh": "中文", "ja": "日本語", "ko": "한국어",
    "hi": "हिन्दी", "tr": "Türkçe", "sv": "Svenska", "da": "Dansk", "no": "Norsk",
    "fi": "Suomi", "el": "Ελληνικά", "he": "עברית", "ms": "Bahasa Melayu",
    "sw": "Kiswahili",
}

FFMPEG = shutil.which("ffmpeg")


# ---------------------------------------------------------------------------
# Modèle
# ---------------------------------------------------------------------------
class Engine:
    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        self.sr = 24000
        self.lock = threading.Lock()
        self.status = "loading"
        self.error: Optional[str] = None

    def pick_device(self) -> str:
        import platform
        import torch

        forced = os.environ.get("VOXA_DEVICE", "").strip()
        if forced:
            return forced
        if platform.system() == "Darwin" and platform.machine() == "x86_64":
            return "cpu"  # Mac Intel : MPS (puce AMD) trop instable pour ce modèle

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def load(self) -> None:
        if MOCK:
            self.status, self.device = "ready", "mock"
            return
        try:
            import torch

            self.device = self.pick_device()
            if self.device != "cuda":
                # Les poids sont publiés pour CUDA : on les remappe pour Mac / CPU.
                original = torch.load

                def patched(*args, **kwargs):
                    kwargs.setdefault("map_location", torch.device(self.device))
                    return original(*args, **kwargs)

                torch.load = patched
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
            self.sr = self.model.sr
            self.status = "ready"
        except Exception as exc:  # noqa: BLE001
            self.status, self.error = "error", str(exc)
            print(f"[voxa] Échec du chargement du modèle : {exc}")

    def synthesize(self, text: str, lang: str, prompt: Optional[str],
                   exaggeration: float, cfg: float, temperature: float):
        """Retourne un tableau numpy float32 mono."""
        import numpy as np

        if MOCK:
            dur = max(0.6, len(text) * 0.055)
            t = np.linspace(0, dur, int(self.sr * dur), endpoint=False)
            env = 0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)
            return (0.15 * env * np.sin(2 * np.pi * 220 * t)).astype("float32")

        kwargs = dict(language_id=lang, exaggeration=exaggeration,
                      cfg_weight=cfg, temperature=temperature)
        if prompt:
            kwargs["audio_prompt_path"] = prompt
        with self.lock:
            wav = self.model.generate(text, **kwargs)
        return wav.squeeze(0).detach().cpu().numpy().astype("float32")


engine = Engine()


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------
SENT_RE = re.compile(r"(?<=[.!?…;:])\s+|\n+")


def chunk_text(text: str, limit: int = 280) -> list[str]:
    """Découpe en phrases puis regroupe en blocs ≤ limit caractères."""
    parts = [p.strip() for p in SENT_RE.split(text) if p and p.strip()]
    chunks: list[str] = []
    cur = ""
    for p in parts:
        while len(p) > limit:  # phrase trop longue : coupe sur une virgule ou un espace
            cut = max(p.rfind(",", 0, limit), p.rfind(" ", 0, limit))
            cut = cut if cut > 40 else limit
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(p[: cut + 1].strip())
            p = p[cut + 1:].strip()
        if not p:
            continue
        if len(cur) + len(p) + 1 <= limit:
            cur = f"{cur} {p}".strip()
        else:
            if cur:
                chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return chunks


def write_wav(path: Path, audio, sr: int) -> None:
    import numpy as np
    import soundfile as sf

    sf.write(str(path), np.clip(audio, -1, 1), sr, subtype="PCM_16")


def ffmpeg_post(src: Path, dst: Path, speed: float, fmt: str) -> bool:
    if not FFMPEG:
        return False
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-i", str(src)]
    if abs(speed - 1.0) > 0.01:
        cmd += ["-filter:a", f"atempo={speed:.3f}"]
    if fmt == "mp3":
        cmd += ["-codec:a", "libmp3lame", "-b:a", "192k"]
    cmd.append(str(dst))
    return subprocess.run(cmd).returncode == 0


def voice_meta(folder: Path, builtin: bool) -> Optional[dict]:
    meta_f = folder / "meta.json"
    if not meta_f.exists():
        return None
    meta = json.loads(meta_f.read_text("utf-8"))
    meta["id"] = folder.name if not builtin else f"lib-{folder.name}"
    meta["builtin"] = builtin
    meta["previewUrl"] = f"/api/voices/{meta['id']}/sample"
    return meta


def find_voice(voice_id: str) -> Optional[Path]:
    if voice_id.startswith("lib-"):
        folder = LIBRARY_DIR / voice_id[4:]
    else:
        folder = VOICES_DIR / voice_id
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", folder.name):
        return None
    return folder if (folder / "sample.wav").exists() else None


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
app = FastAPI(title="Voxa Engine", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["X-Voxa-Note"])


def auth(x_api_key: Optional[str] = Header(default=None), key: Optional[str] = None):
    if API_KEY and (x_api_key or key) != API_KEY:
        raise HTTPException(401, "invalid_key")


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=engine.load, daemon=True).start()


@app.get("/api/health")
def health():
    return {"status": engine.status, "device": engine.device, "error": engine.error,
            "auth": bool(API_KEY), "ffmpeg": bool(FFMPEG), "maxChars": MAX_CHARS,
            "languages": LANGUAGES}


@app.get("/api/voices", dependencies=[Depends(auth)])
def list_voices():
    voices = [{"id": "default", "name": "Voxa", "builtin": True, "previewUrl": None,
               "description": "default"}]
    for root, builtin in ((LIBRARY_DIR, True), (VOICES_DIR, False)):
        for f in sorted(root.iterdir()):
            if f.is_dir() and (m := voice_meta(f, builtin)):
                voices.append(m)
    return voices


@app.post("/api/voices", dependencies=[Depends(auth)])
async def clone_voice(name: str = Form(...), consent: bool = Form(...),
                      description: str = Form(""), sample: UploadFile = File(...)):
    if not consent:
        raise HTTPException(400, "consent_required")
    name = name.strip()[:60]
    if not name:
        raise HTTPException(400, "name_required")
    vid = uuid.uuid4().hex[:12]
    folder = VOICES_DIR / vid
    folder.mkdir()
    raw = folder / f"upload{Path(sample.filename or 'a.wav').suffix or '.wav'}"
    raw.write_bytes(await sample.read())
    target = folder / "sample.wav"
    ok = False
    if FFMPEG:  # normalise : mono 24 kHz, 30 s max, silence de début retiré
        ok = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(raw),
                             "-af", "silenceremove=start_periods=1:start_threshold=-45dB",
                             "-ac", "1", "-ar", "24000", "-t", "30", str(target)]).returncode == 0
    if not ok:
        try:
            import librosa

            audio, _ = librosa.load(str(raw), sr=24000, mono=True, duration=30)
            write_wav(target, audio, 24000)
        except Exception:  # noqa: BLE001
            shutil.rmtree(folder, ignore_errors=True)
            raise HTTPException(400, "bad_audio")
    raw.unlink(missing_ok=True)
    try:
        import soundfile as sf

        dur = sf.info(str(target)).duration
    except Exception:  # noqa: BLE001
        dur = 0
    if dur < 4:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(400, "sample_too_short")
    meta = {"name": name, "description": description.strip()[:140],
            "created": time.time(), "seconds": round(dur, 1), "consent": True}
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    return voice_meta(folder, False)


@app.get("/api/voices/{voice_id}/sample", dependencies=[Depends(auth)])
def voice_sample(voice_id: str):
    folder = find_voice(voice_id)
    if not folder:
        raise HTTPException(404, "voice_not_found")
    return FileResponse(folder / "sample.wav", media_type="audio/wav")


@app.delete("/api/voices/{voice_id}", dependencies=[Depends(auth)])
def delete_voice(voice_id: str):
    if voice_id.startswith("lib-") or voice_id == "default":
        raise HTTPException(400, "builtin_voice")
    folder = find_voice(voice_id)
    if not folder:
        raise HTTPException(404, "voice_not_found")
    shutil.rmtree(folder)
    return {"ok": True}


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = "default"
    language: str = "fr"
    exaggeration: float = Field(0.5, ge=0.25, le=2.0)
    stability: float = Field(0.5, ge=0.0, le=1.0)   # cfg_weight
    temperature: float = Field(0.8, ge=0.05, le=1.5)
    speed: float = Field(1.0, ge=0.7, le=1.3)
    pause: float = Field(0.25, ge=0.0, le=1.5)
    format: str = Field("wav", pattern="^(wav|mp3)$")
    title: str = ""


@app.post("/api/tts", dependencies=[Depends(auth)])
def tts(req: TTSRequest):
    import numpy as np

    if engine.status != "ready":
        raise HTTPException(503, f"engine_{engine.status}")
    text = req.text.strip()
    if len(text) > MAX_CHARS:
        raise HTTPException(400, "text_too_long")
    if req.language not in LANGUAGES:
        raise HTTPException(400, "bad_language")
    prompt = None
    voice_name = "Voxa"
    if req.voice != "default":
        folder = find_voice(req.voice)
        if not folder:
            raise HTTPException(404, "voice_not_found")
        prompt = str(folder / "sample.wav")
        meta = json.loads((folder / "meta.json").read_text("utf-8"))
        voice_name = meta.get("name", voice_name)

    started = time.time()
    gap = np.zeros(int(engine.sr * req.pause), dtype="float32")
    pieces = []
    for i, chunk in enumerate(chunk_text(text)):
        if i:
            pieces.append(gap)
        pieces.append(engine.synthesize(chunk, req.language, prompt,
                                        req.exaggeration, req.stability, req.temperature))
    audio = np.concatenate(pieces)
    peak = float(np.abs(audio).max() or 1.0)
    audio = audio * (0.95 / peak) if peak > 0.95 else audio  # évite la saturation

    gid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    raw = OUTPUTS_DIR / f"{gid}.raw.wav"
    write_wav(raw, audio, engine.sr)
    note = ""
    final = OUTPUTS_DIR / f"{gid}.{req.format}"
    needs_post = req.format == "mp3" or abs(req.speed - 1.0) > 0.01
    if needs_post and ffmpeg_post(raw, final, req.speed, req.format):
        raw.unlink()
    else:
        if needs_post:
            note = "ffmpeg_missing"
        final = OUTPUTS_DIR / f"{gid}.wav"
        raw.rename(final)

    import soundfile as sf

    duration = round(sf.info(str(final)).duration, 2) if final.suffix == ".wav" \
        else round(len(audio) / engine.sr / req.speed, 2)
    meta = {"id": gid, "file": final.name, "title": (req.title or text[:60]).strip(),
            "text": text, "voice": req.voice, "voiceName": voice_name,
            "language": req.language, "format": final.suffix[1:],
            "duration": duration, "created": time.time(),
            "renderSeconds": round(time.time() - started, 1)}
    (OUTPUTS_DIR / f"{gid}.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    meta["audioUrl"] = f"/api/audio/{gid}"
    return JSONResponse(meta, headers={"X-Voxa-Note": note} if note else None)


@app.get("/api/history", dependencies=[Depends(auth)])
def history(limit: int = 100):
    items = []
    for f in sorted(OUTPUTS_DIR.glob("*.json"), reverse=True)[:limit]:
        m = json.loads(f.read_text("utf-8"))
        m["audioUrl"] = f"/api/audio/{m['id']}"
        items.append(m)
    return items


def _history_item(gid: str) -> dict:
    if not re.fullmatch(r"[0-9A-Za-z\-]+", gid):
        raise HTTPException(404, "not_found")
    f = OUTPUTS_DIR / f"{gid}.json"
    if not f.exists():
        raise HTTPException(404, "not_found")
    return json.loads(f.read_text("utf-8"))


@app.get("/api/audio/{gid}", dependencies=[Depends(auth)])
def audio(gid: str):
    m = _history_item(gid)
    media = "audio/mpeg" if m["format"] == "mp3" else "audio/wav"
    safe = re.sub(r"[^\w\- ]", "", m["title"])[:40].strip() or "voxa"
    return FileResponse(OUTPUTS_DIR / m["file"], media_type=media,
                        filename=f"{safe}.{m['format']}")


@app.delete("/api/history/{gid}", dependencies=[Depends(auth)])
def delete_history(gid: str):
    m = _history_item(gid)
    (OUTPUTS_DIR / m["file"]).unlink(missing_ok=True)
    (OUTPUTS_DIR / f"{gid}.json").unlink(missing_ok=True)
    return {"ok": True}


# Version web : le moteur sert aussi l'interface compilée.
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    print(f"[voxa] Moteur sur http://localhost:{PORT}  (données : {DATA})")
    uvicorn.run(app, host=HOST, port=PORT)
