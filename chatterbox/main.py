"""Resonance Chatterbox inference service.

A thin, authenticated HTTP wrapper around Resemble AI's Chatterbox TTS. It is
deployed separately from the Next.js application, on GPU hardware, and is only
ever called by the Next.js server — never by a browser.

Design notes
------------
* The model is loaded once, at startup, in the FastAPI lifespan. Loading it per
  request would add tens of seconds to every generation.
* Inference is synchronous and GPU-bound, so it runs in a worker thread with a
  semaphore capping concurrency. Two requests sharing one GPU is usually slower
  than running them back to back, and risks CUDA OOM.
* Reference samples arrive as a short-lived signed URL (`voice_url`) so this
  service does not need bucket credentials. `voice_key` with a locally
  configured bucket is supported as a fallback.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx
import numpy as np
import soundfile as sf
import torch
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("resonance.chatterbox")

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

API_KEY = os.getenv("CHATTERBOX_API_KEY", "")
MODEL_VARIANT = os.getenv("CHATTERBOX_MODEL", "turbo")  # turbo | nano | standard
DEVICE = os.getenv("CHATTERBOX_DEVICE") or (
    "cuda"
    if torch.cuda.is_available()
    else "mps"
    if torch.backends.mps.is_available()
    else "cpu"
)
MAX_CONCURRENCY = int(os.getenv("CHATTERBOX_MAX_CONCURRENCY", "1"))
MAX_PROMPT_CHARACTERS = int(os.getenv("CHATTERBOX_MAX_CHARACTERS", "5000"))
REFERENCE_CACHE_DIR = Path(
    os.getenv("CHATTERBOX_CACHE_DIR", tempfile.gettempdir())
) / "resonance-voice-cache"
REFERENCE_FETCH_TIMEOUT = float(os.getenv("CHATTERBOX_FETCH_TIMEOUT", "30"))
MAX_REFERENCE_BYTES = int(os.getenv("CHATTERBOX_MAX_REFERENCE_BYTES", str(25 * 1024 * 1024)))

# Optional S3-compatible fallback for resolving `voice_key` directly.
S3_ENDPOINT = os.getenv("R2_ENDPOINT") or (
    f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    if os.getenv("R2_ACCOUNT_ID")
    else None
)
S3_BUCKET = os.getenv("R2_BUCKET_NAME")
S3_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")

if not API_KEY:
    raise RuntimeError(
        "CHATTERBOX_API_KEY is required. The service refuses to start unauthenticated."
    )

# --------------------------------------------------------------------------- #
# Model lifecycle
# --------------------------------------------------------------------------- #

state: dict[str, Any] = {"model": None, "sample_rate": None, "loaded_at": None}
inference_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)


def _load_model() -> tuple[Any, int]:
    """Loads Chatterbox onto the configured device. Blocking and slow."""
    logger.info("Loading Chatterbox (%s) onto %s…", MODEL_VARIANT, DEVICE)
    started = time.perf_counter()

    if MODEL_VARIANT in {"turbo", "nano"}:
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        model = ChatterboxTurboTTS.from_pretrained(
            device=DEVICE, nano=MODEL_VARIANT == "nano"
        )
    else:
        from chatterbox.tts import ChatterboxTTS

        model = ChatterboxTTS.from_pretrained(device=DEVICE)

    logger.info(
        "Chatterbox ready in %.1fs (sample rate %s Hz)", time.perf_counter() - started, model.sr
    )
    return model, int(model.sr)


@asynccontextmanager
async def lifespan(_: FastAPI):
    REFERENCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Loading blocks for a long time; keep the event loop responsive so the
    # health check can report `model_loaded: false` while it warms up.
    model, sample_rate = await asyncio.to_thread(_load_model)
    state["model"] = model
    state["sample_rate"] = sample_rate
    state["loaded_at"] = time.time()

    yield

    state["model"] = None
    if DEVICE == "cuda":
        torch.cuda.empty_cache()


app = FastAPI(
    title="Resonance Chatterbox Service",
    version="1.0.0",
    lifespan=lifespan,
    # No docs in production: the schema names the auth header.
    docs_url="/docs" if os.getenv("ENABLE_DOCS") == "1" else None,
    redoc_url=None,
)


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #


async def require_api_key(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    """Constant-time API key check.

    Only the Next.js backend holds this key. `compare_digest` avoids leaking key
    length or a prefix match through response timing.
    """
    import hmac

    if not x_api_key or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARACTERS)

    # Reference sample. Either is enough; `voice_url` is preferred because it
    # keeps bucket credentials out of this service.
    voice_key: str | None = None
    voice_url: str | None = None

    # Mirrors ChatterboxTurboTTS.generate() defaults.
    temperature: float = Field(default=0.8, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    top_k: int = Field(default=1000, ge=1, le=10_000)
    repetition_penalty: float = Field(default=1.2, ge=1.0, le=2.0)

    # Linear output gain applied after Chatterbox's own loudness normalisation.
    loudness: float = Field(default=1.0, ge=0.1, le=2.0)

    request_id: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "loading"]
    model_loaded: bool
    model_variant: str
    device: str
    sample_rate: int | None


# --------------------------------------------------------------------------- #
# Reference audio resolution
# --------------------------------------------------------------------------- #


async def _download(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=REFERENCE_FETCH_TIMEOUT) as client:
        async with client.stream("GET", url) as response:
            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="The reference sample could not be retrieved.",
                )

            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > MAX_REFERENCE_BYTES:
                    raise HTTPException(
                        status_code=413, detail="The reference sample is too large."
                    )
                chunks.append(chunk)
            return b"".join(chunks)


def _download_from_bucket(key: str) -> bytes:
    if not (S3_ENDPOINT and S3_BUCKET and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY):
        raise HTTPException(
            status_code=400,
            detail="No signed URL was supplied and this service has no bucket configured.",
        )

    import boto3  # imported lazily — only needed on the fallback path

    client = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY_ID,
        aws_secret_access_key=S3_SECRET_ACCESS_KEY,
        region_name=os.getenv("R2_REGION", "auto"),
    )
    buffer = io.BytesIO()
    client.download_fileobj(S3_BUCKET, key, buffer)
    return buffer.getvalue()


async def resolve_reference_audio(request: GenerateRequest) -> Path | None:
    """Returns a local path to the reference sample, or None for the default voice.

    Samples are cached on disk by content key: the same voice is normally used
    for many consecutive generations, and re-downloading it each time is pure
    latency.
    """
    if not request.voice_url and not request.voice_key:
        return None

    cache_name = hashlib.sha256(
        (request.voice_key or request.voice_url or "").encode()
    ).hexdigest()
    cached = REFERENCE_CACHE_DIR / f"{cache_name}.wav"
    if cached.exists():
        return cached

    if request.voice_url:
        payload = await _download(request.voice_url)
    else:
        payload = await asyncio.to_thread(_download_from_bucket, request.voice_key)

    # Normalise to mono 24 kHz WAV so Chatterbox never has to guess a container.
    try:
        audio, sample_rate = sf.read(io.BytesIO(payload), dtype="float32")
    except Exception as error:  # noqa: BLE001 - surfaced as a 400 below
        raise HTTPException(
            status_code=400, detail="The reference sample is not decodable audio."
        ) from error

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    sf.write(cached, audio, sample_rate, format="WAV", subtype="PCM_16")
    return cached


# --------------------------------------------------------------------------- #
# Inference
# --------------------------------------------------------------------------- #


def _generate_waveform(request: GenerateRequest, reference: Path | None) -> np.ndarray:
    """Runs Chatterbox. Blocking — always call via `asyncio.to_thread`."""
    model = state["model"]
    if model is None:
        raise HTTPException(status_code=503, detail="The model is still loading.")

    kwargs: dict[str, Any] = {
        "temperature": request.temperature,
        "top_p": request.top_p,
        "repetition_penalty": request.repetition_penalty,
    }
    # `top_k` only exists on the turbo/nano checkpoints.
    if MODEL_VARIANT in {"turbo", "nano"}:
        kwargs["top_k"] = request.top_k
    if reference is not None:
        kwargs["audio_prompt_path"] = str(reference)

    waveform = model.generate(request.prompt, **kwargs)

    audio = waveform.squeeze(0).detach().cpu().numpy().astype(np.float32)

    if request.loudness != 1.0:
        audio = np.clip(audio * request.loudness, -1.0, 1.0)

    return audio


def _encode_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


@app.post("/generate", dependencies=[Depends(require_api_key)])
async def generate(request: GenerateRequest) -> Response:
    if state["model"] is None:
        raise HTTPException(status_code=503, detail="The model is still loading.")

    correlation_id = request.request_id or str(uuid.uuid4())
    started = time.perf_counter()

    reference = await resolve_reference_audio(request)

    # One generation at a time per GPU by default.
    async with inference_semaphore:
        try:
            audio = await asyncio.to_thread(_generate_waveform, request, reference)
        except HTTPException:
            raise
        except torch.cuda.OutOfMemoryError as error:  # type: ignore[attr-defined]
            torch.cuda.empty_cache()
            logger.exception("CUDA OOM [request_id=%s]", correlation_id)
            raise HTTPException(
                status_code=503,
                detail="The voice engine is out of memory. Try a shorter passage.",
            ) from error
        except Exception as error:  # noqa: BLE001 - converted to a safe 500
            logger.exception("Generation failed [request_id=%s]", correlation_id)
            raise HTTPException(
                status_code=500, detail="Generation failed."
            ) from error

    sample_rate = int(state["sample_rate"])
    payload = _encode_wav(audio, sample_rate)
    duration = len(audio) / sample_rate
    elapsed = time.perf_counter() - started

    logger.info(
        "generated request_id=%s characters=%d duration=%.2fs elapsed=%.2fs",
        correlation_id,
        len(request.prompt),
        duration,
        elapsed,
    )

    return Response(
        content=payload,
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(sample_rate),
            "X-Duration-Seconds": f"{duration:.3f}",
            "X-Request-Id": correlation_id,
            "Cache-Control": "no-store",
        },
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Unauthenticated so platform health checks work without the API key.

    It exposes no secrets and no user data — only whether the model is warm.
    """
    loaded = state["model"] is not None
    return HealthResponse(
        status="ok" if loaded else "loading",
        model_loaded=loaded,
        model_variant=MODEL_VARIANT,
        device=DEVICE,
        sample_rate=state["sample_rate"],
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    # Never let a traceback reach the caller.
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
