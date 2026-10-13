"""
Crée les voix de départ de la bibliothèque Voxa avec Kokoro (modèle libre, licence Apache 2.0).

Ce sont des voix de synthèse : aucune ne copie une personne réelle. Chaque voix
produit un échantillon de référence de ~15 s que Chatterbox utilise ensuite pour
parler n'importe quelle langue avec ce timbre.

Usage : .venv-kokoro/bin/python tools/make_starter_voices.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

LIB = Path(__file__).resolve().parent.parent / "library"

FR_TEXT = ("Bonjour et bienvenue ! Aujourd'hui, j'ai une excellente nouvelle pour vous. "
           "Toute l'équipe vous attend dès maintenant, avec des offres que vous ne trouverez nulle part ailleurs. "
           "Alors n'attendez plus : venez nous rendre visite, on s'occupe de tout.")
EN_TEXT = ("Hello and welcome! Today, I have some great news for you. "
           "Our whole team is waiting for you right now, with offers you simply won't find anywhere else. "
           "So don't wait any longer: come and see us, we'll take care of everything.")

# slug, nom, genre, origine, langue, voix Kokoro, code langue Kokoro, description, licence
VOICES = [
    ("claire", "Claire", "femme", "francaise", "fr", "ff_siwis", "f",
     "Française, claire et chaleureuse. Idéale pour la pub et l'institutionnel.",
     "Kokoro (Apache 2.0), voix issue du corpus SIWIS (CC BY 4.0)"),
    ("hugo", "Hugo", "homme", "francaise", "fr", "bm_george", "f",
     "Voix d'homme posée en français, timbre mûr et rassurant.",
     "Kokoro (Apache 2.0)"),
    ("grace", "Grace", "femme", "anglaise-us", "en", "af_heart", "a",
     "Américaine, souriante et naturelle. Pub, réseaux sociaux.", "Kokoro (Apache 2.0)"),
    ("michael", "Michael", "homme", "anglaise-us", "en", "am_michael", "a",
     "Américain, dynamique et direct. Spots radio, annonces.", "Kokoro (Apache 2.0)"),
    ("nathan", "Nathan", "homme", "anglaise-us", "en", "am_onyx", "a",
     "Voix grave et profonde. Bandes-annonces, documentaire.", "Kokoro (Apache 2.0)"),
    ("emma", "Emma", "femme", "anglaise-uk", "en", "bf_emma", "b",
     "Britannique, élégante et posée. Luxe, institutionnel.", "Kokoro (Apache 2.0)"),
    ("george", "George", "homme", "anglaise-uk", "en", "bm_george", "b",
     "Britannique, narrateur classique et crédible.", "Kokoro (Apache 2.0)"),
]

# Variantes robotiques : même timbre, effet appliqué au rendu
ROBOTS = [
    ("robot-alpha", "Robot Alpha", "homme", "michael", "en", "Voix robotique masculine, effet métallique."),
    ("robot-nova", "Robot Nova", "femme", "claire", "fr", "Voix robotique féminine, effet métallique."),
]


def main() -> int:
    from kokoro import KPipeline

    pipelines: dict[str, KPipeline] = {}
    made = 0
    for slug, name, gender, origin, lang, kvoice, kcode, desc, lic in VOICES:
        folder = LIB / slug
        if (folder / "sample.wav").exists():
            print(f"= {name} existe déjà")
            continue
        print(f"→ {name} ({kvoice})…", flush=True)
        if kcode not in pipelines:
            pipelines[kcode] = KPipeline(lang_code=kcode, repo_id="hexgrad/Kokoro-82M")
        text = FR_TEXT if lang == "fr" else EN_TEXT
        parts = [audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio)
                 for _, _, audio in pipelines[kcode](text, voice=kvoice, speed=1.0)]
        audio = np.concatenate(parts).astype("float32")
        peak = float(np.abs(audio).max() or 1)
        audio = audio * (0.9 / peak)
        folder.mkdir(parents=True, exist_ok=True)
        sf.write(folder / "sample.wav", audio, 24000, subtype="PCM_16")
        meta = {"name": name, "description": desc, "gender": gender, "origin": origin,
                "language": lang, "style": "naturelle", "effect": None, "tags": ["voix de départ"],
                "source": "kokoro", "license": lic, "created": time.time(),
                "seconds": round(len(audio) / 24000, 1), "consent": True}
        (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
        made += 1
        print(f"  ok, {meta['seconds']} s", flush=True)

    for slug, name, gender, base, lang, desc in ROBOTS:
        folder = LIB / slug
        folder.mkdir(parents=True, exist_ok=True)
        meta = {"name": name, "description": desc, "gender": gender, "origin": "autre",
                "language": lang, "style": "robotique", "effect": "robot", "base": f"lib-{base}",
                "tags": ["robot"], "source": "voxa", "license": "Kokoro (Apache 2.0)",
                "created": time.time(), "consent": True}
        (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")

    print(f"== {made} voix créées, {len(ROBOTS)} variantes robotiques ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
