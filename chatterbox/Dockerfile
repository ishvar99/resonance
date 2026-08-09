# Resonance Chatterbox inference service.
#
# Built for CUDA 12.4 + Python 3.11, which matches the torch 2.6.0 pin that
# chatterbox-tts 0.1.7 requires. Deploy on any GPU host (Railway, Runpod,
# Modal, a bare EC2 g5) — nothing here is platform specific.

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Keep model weights on a mounted volume so a redeploy does not re-download
    # several GB from Hugging Face.
    HF_HOME=/models

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-dev \
        python3-pip \
        ffmpeg \
        libsndfile1 \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

WORKDIR /app

# CUDA wheels first, so the chatterbox-tts install does not resolve to CPU torch.
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install \
        --index-url https://download.pytorch.org/whl/cu124 \
        torch==2.6.0 torchaudio==2.6.0

COPY requirements.txt .
RUN python -m pip install -r requirements.txt

COPY main.py .

RUN mkdir -p /models && useradd --create-home --uid 10001 resonance \
    && chown -R resonance:resonance /app /models
USER resonance

EXPOSE 8000

# The model loads during startup; give the platform time before it starts
# failing health checks. /health reports `model_loaded: false` while warming.
HEALTHCHECK --interval=30s --timeout=10s --start-period=600s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# One worker only: each worker would load its own copy of the model onto the GPU.
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "75"]
