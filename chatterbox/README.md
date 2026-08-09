# Resonance Chatterbox service

Self-hosted GPU inference for Resonance, wrapping [Chatterbox TTS](https://github.com/resemble-ai/chatterbox)
by Resemble AI in an authenticated FastAPI service.

Only the Resonance Next.js server calls this. The browser never does — it has no
API key, and the key must never be shipped to the client.

```
Browser  →  Next.js server  →  Chatterbox service  →  GPU
```

## Endpoints

### `POST /generate`

Requires `X-API-Key`. Returns `audio/wav` bytes.

```jsonc
{
  "prompt": "Text to speak",
  "voice_key": "organizations/org_123/voices/v_456/source.wav", // optional
  "voice_url": "https://…signed…",                              // preferred
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 1000,
  "repetition_penalty": 1.2,
  "loudness": 1.0,
  "request_id": "gen_789"
}
```

Response headers: `X-Sample-Rate`, `X-Duration-Seconds`, `X-Request-Id`.

Supply either `voice_url` (a short-lived signed URL — what Resonance sends) or
`voice_key` (resolved against this service's own bucket credentials). With
neither, Chatterbox's built-in default voice is used.

### `GET /health`

Unauthenticated, for platform health checks. Reports
`{"status":"loading","model_loaded":false}` while the weights load, which can
take several minutes on a cold start.

## Parameters

These map one-to-one onto `ChatterboxTurboTTS.generate()`:

| API field | Model argument | Range | Default | Shown in the UI as |
| --- | --- | --- | --- | --- |
| `temperature` | `temperature` | 0–2 | 0.8 | Creativity |
| `top_p` | `top_p` | 0–1 | 0.95 | Voice Variety |
| `top_k` | `top_k` | 1–10000 | 1000 | Expression Range |
| `repetition_penalty` | `repetition_penalty` | 1–2 | 1.2 | Natural Flow |
| `loudness` | post-generation gain | 0.1–2 | 1.0 | — |

`top_k` exists only on the turbo/nano checkpoints. With
`CHATTERBOX_MODEL=standard` it is accepted and ignored.

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `CHATTERBOX_API_KEY` | **yes** | — | The service refuses to start without it |
| `CHATTERBOX_MODEL` | no | `turbo` | `turbo`, `nano` or `standard` |
| `CHATTERBOX_DEVICE` | no | auto | `cuda`, `mps` or `cpu` |
| `CHATTERBOX_MAX_CONCURRENCY` | no | `1` | Concurrent generations per GPU |
| `CHATTERBOX_MAX_CHARACTERS` | no | `5000` | Must match the app's limit |
| `HF_HOME` | no | `/models` | Point at a volume to cache the weights |
| `R2_*` | no | — | Only for the `voice_key` fallback path |

## Running locally

Requires an NVIDIA GPU for realistic speed; it will run on CPU, slowly.

```bash
cd chatterbox
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export CHATTERBOX_API_KEY="$(openssl rand -hex 32)"
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then point the Next.js app at it:

```env
CHATTERBOX_API_URL=http://localhost:8000
CHATTERBOX_API_KEY=<the same key>
```

## Docker

```bash
docker build -t resonance-chatterbox .
docker run --gpus all -p 8000:8000 \
  -e CHATTERBOX_API_KEY=... \
  -v chatterbox-models:/models \
  resonance-chatterbox
```

Mount a volume at `/models`, or every redeploy re-downloads several GB of
weights from Hugging Face.

## Deployment notes

- **One worker per GPU.** Each uvicorn worker loads its own copy of the model.
  Scale out with more replicas, not more workers.
- **Cold starts are minutes, not seconds.** Set the platform's health-check
  grace period to at least 10 minutes.
- **Keep it private.** Bind it to a private network where the platform allows.
  The API key is the only thing between a public URL and free GPU time.
- **Gated weights.** If you point `CHATTERBOX_MODEL` at a gated Hugging Face
  repo, set `HF_TOKEN` in the environment. Never bake it into the image.
