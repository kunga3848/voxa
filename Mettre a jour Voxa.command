#!/bin/bash
# Met à jour Voxa sur ce Mac : moteur, voix de départ, extraits d'écoute et app.
# Laisse cette fenêtre ouverte : à la fin, elle fait tourner le moteur.
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
exec > >(tee "$ROOT/update.log") 2>&1
export PATH="$HOME/.local/bin:$ROOT/app/.node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
step() { echo; echo "=== $* ==="; }

step "Arrêt du moteur"
pkill -f "server.py" 2>/dev/null; sleep 2

step "FFmpeg (MP3 et vitesse)"
if [ ! -x engine/bin/ffmpeg ] && ! command -v ffmpeg >/dev/null; then
  mkdir -p engine/bin
  curl -fL "https://evermeet.cx/ffmpeg/getrelease/zip" -o /tmp/voxa-ffmpeg.zip \
    && unzip -o -q /tmp/voxa-ffmpeg.zip -d engine/bin && chmod +x engine/bin/ffmpeg \
    && echo "FFmpeg installé" || echo "FFmpeg non installé (MP3 et vitesse resteront indisponibles)"
else
  echo "déjà présent"
fi

step "Voix de départ (Kokoro)"
if ls engine/library/*/sample.wav >/dev/null 2>&1 && [ "$(ls engine/library/*/sample.wav | wc -l)" -ge 7 ]; then
  echo "déjà créées"
else
  CONS=$(mktemp); printf 'torch==2.2.2\ntorchaudio==2.2.2\nnumpy<2\n' > $CONS
  [ -d engine/.venv-kokoro ] || uv venv --python 3.11 engine/.venv-kokoro
  KPY=engine/.venv-kokoro/bin/python
  uv pip install --python $KPY pip
  uv pip install --python $KPY -c $CONS torch "kokoro>=0.9.4" soundfile \
    && (cd engine && PYTHONUNBUFFERED=1 ../$KPY tools/make_starter_voices.py) \
    || echo "ÉCHEC des voix de départ (le reste de la mise à jour continue)"
fi

step "Application Voxa"
if [ -d app/node_modules/electron-builder ]; then
  (cd app && npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --x64 --publish never) \
    && { APP=$(find app/release -maxdepth 2 -name "Voxa.app" | head -1)
         osascript -e 'quit app "Voxa"' 2>/dev/null; sleep 1
         rm -rf /Applications/Voxa.app && ditto "$APP" /Applications/Voxa.app && echo "App mise à jour"; } \
    || echo "ÉCHEC de la mise à jour de l'app"
else
  echo "Lance d'abord « Installer Voxa.command »"
fi

step "Démarrage du moteur"
cd engine
export PYTORCH_ENABLE_MPS_FALLBACK=1
.venv/bin/python -u server.py > ../engine.log 2>&1 &
SERVER=$!
step "Extraits d'écoute (environ 1 minute par voix)"
PYTHONUNBUFFERED=1 .venv/bin/python tools/make_previews.py
open /Applications/Voxa.app 2>/dev/null
echo
echo "=== Voxa est à jour. Laisse cette fenêtre ouverte : elle fait tourner le moteur. ==="
wait $SERVER
