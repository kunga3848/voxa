# Serveur GPU (NVIDIA). Depuis la racine du projet :
#   docker build -t voxa -f engine/Dockerfile .
#   docker run --gpus all -p 8000:8000 -v voxa-data:/app/engine/data -e VOXA_API_KEY=change-moi voxa
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/engine
COPY engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine/ .
COPY app/index.html /app/app/dist/index.html
COPY app/src /app/app/dist/src
COPY app/assets/icon.svg /app/app/dist/assets/icon.svg
ENV VOXA_DATA=/app/engine/data
EXPOSE 8000
CMD ["python", "server.py"]
