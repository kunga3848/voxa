"""
Génère un extrait d'écoute (preview.wav) pour chaque voix de la bibliothèque,
avec le vrai rendu Voxa (Chatterbox + finition spot + effet de la voix).

Le moteur doit tourner : python tools/make_previews.py [http://localhost:8000]
"""
from __future__ import annotations

import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "library"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
TEXTS = {
    "fr": "Bonjour ! Découvrez dès aujourd'hui nos nouvelles offres, pensées pour vous.",
    "en": "Hello! Discover our brand new offers today, made just for you.",
}


def call(path, data=None, method=None):
    req = urllib.request.Request(BASE + path, method=method or ("POST" if data else "GET"),
                                 data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return r.read()


def wait_ready(timeout=900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if json.loads(call("/api/health")).get("status") == "ready":
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(5)
    return False


def main() -> int:
    if not wait_ready():
        print("Moteur indisponible : aperçus non générés.")
        return 1
    for folder in sorted(p for p in LIB.iterdir() if (p / "meta.json").exists()):
        if (folder / "preview.wav").exists():
            continue
        meta = json.loads((folder / "meta.json").read_text("utf-8"))
        lang = meta.get("language") if meta.get("language") in TEXTS else "fr"
        print(f"→ aperçu {meta['name']} ({lang})…", flush=True)
        t0 = time.time()
        item = json.loads(call("/api/tts", {
            "text": TEXTS[lang], "voice": f"lib-{folder.name}", "language": lang,
            "exaggeration": 0.55, "stability": 0.45, "temperature": 0.8, "pause": 0.15,
            "finish": "spot", "format": "wav", "seed": 42, "title": f"Aperçu {meta['name']}",
        }))
        with urllib.request.urlopen(BASE + item["audioUrl"], timeout=120) as r, open(folder / "preview.wav", "wb") as f:
            shutil.copyfileobj(r, f)
        call(f"/api/history/{item['id']}", method="DELETE")
        print(f"  ok en {time.time() - t0:.0f} s", flush=True)
    print("== Aperçus prêts ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
