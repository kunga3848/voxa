#!/usr/bin/env bash
# Lance le moteur Voxa (macOS / Linux). Premier lancement : installation (~5 Go avec le modèle).
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3.11}
command -v "$PY" >/dev/null || PY=python3
if [ ! -d .venv ]; then
  echo "Installation de l'environnement Python..."
  "$PY" -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/python server.py
