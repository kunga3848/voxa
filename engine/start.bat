@echo off
REM Lance le moteur Voxa (Windows). Premier lancement : installation (~5 Go avec le modele).
cd /d "%~dp0"
if not exist .venv (
  echo Installation de l'environnement Python...
  py -3.11 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  REM PyTorch avec support NVIDIA (CUDA 12.4). Sans carte NVIDIA, cette ligne installe quand meme une version fonctionnelle.
  .venv\Scripts\pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
  .venv\Scripts\pip install -r requirements.txt
)
.venv\Scripts\python server.py
pause
