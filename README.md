# Resonance

A multi-tenant SaaS platform for AI text-to-speech and custom voice creation,
built on a **self-hosted Chatterbox** TTS model.

Every voice, generation, byte of audio and unit of usage belongs to a Clerk
organization. Nothing crosses a workspace boundary.

```
Browser
  └─ Next.js 16 (App Router, RSC)
       ├─ Clerk            authentication + organizations
       ├─ Prisma 7 ─ PostgreSQL
       ├─ Chatterbox       self-hosted GPU inference (./chatterbox)
       ├─ Cloudflare R2    private object storage (S3-compatible)
       ├─ Polar            usage-based billing
       └─ Sentry           error monitoring
```

The browser never talks to Chatterbox or to the storage bucket directly. Both
are reached only through the Next.js server, which holds the credentials.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and the two Clerk keys
npm run db:push               # or: npm run db:migrate
npm run db:seed               # creates the system voice library
npm run dev
```

Open <http://localhost:3000>.

Only **PostgreSQL** and **Clerk** are required to run locally. Storage, speech
and billing each fall back to a clearly-labelled development adapter; see
[Development adapters](#development-adapters).

### Requirements

- Node.js 20.9+ (developed on 22)
- PostgreSQL 14+
- A Clerk application with **Organizations enabled**

---

## Configuration

Every variable is validated at boot by [`src/lib/environment.ts`](src/lib/environment.ts)
(T3 Env + Zod). An invalid configuration fails fast rather than surfacing later
as a confusing runtime error. See [`.env.example`](.env.example) for the full
annotated list.

### PostgreSQL — required

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/resonance?schema=public"
```

```bash
docker run -d --name resonance-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
npm run db:push     # push the schema without creating a migration
npm run db:migrate  # or create a migration
npm run db:seed
```

### Clerk — required

1. Create an application at <https://dashboard.clerk.com>.
2. **Configure → Organizations → Enable.** The app is unusable without this:
   every dashboard route requires an active organization.
3. Copy the keys from **API keys**:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_…"
CLERK_SECRET_KEY="sk_test_…"
```

New users are sent to `/organization-selection` to create or pick a workspace
before they can reach the dashboard.

### Chatterbox — required in production

The GPU service lives in [`chatterbox/`](chatterbox/) and has its own
[README](chatterbox/README.md). Run it, then:

```env
CHATTERBOX_API_URL="https://your-gpu-host"
CHATTERBOX_API_KEY="…"   # must match the service's own CHATTERBOX_API_KEY
```

Generate the shared key with `openssl rand -hex 32`. It is server-side only and
is never exposed to the browser.

### Cloudflare R2 (or any S3-compatible bucket) — required in production

```env
R2_ACCOUNT_ID="…"
R2_ACCESS_KEY_ID="…"
R2_SECRET_ACCESS_KEY="…"
R2_BUCKET_NAME="resonance"
```

Create the bucket in the Cloudflare dashboard under **R2**, then an API token
under **Manage API tokens** with Object Read & Write.

**Keep the bucket private.** Audio is served through `/api/audio/{generationId}`,
which authenticates the request and checks organization ownership. Set
`R2_PUBLIC_URL` only if you have deliberately made the bucket public.

Other providers work by overriding the endpoint:

| Provider | Settings |
| --- | --- |
| AWS S3 | `R2_ENDPOINT=https://s3.<region>.amazonaws.com`, `R2_REGION=<region>` |
| MinIO | `R2_ENDPOINT=http://localhost:9000`, `R2_REGION=us-east-1` |

Object layout:

```
organizations/{organizationId}/voices/{voiceId}/source.{ext}
organizations/{organizationId}/generations/{generationId}.wav
system/voices/{voiceId}/source.wav
```

### Polar — required in production

```env
POLAR_ACCESS_TOKEN="…"
POLAR_WEBHOOK_SECRET="…"
POLAR_PRODUCT_ID="…"
POLAR_SERVER="sandbox"       # or "production"
```

1. Create an organization at <https://polar.sh>.
2. **Settings → Developers → New token.**
3. Create a product; put its id in `POLAR_PRODUCT_ID`.
4. Add a webhook pointing at `https://your-app/api/webhooks/polar` and copy the
   signing secret.

The Clerk organization id is used as Polar's `externalCustomerId`, so billing is
per workspace with no mapping table.

### Sentry — optional

```env
NEXT_PUBLIC_SENTRY_DSN="https://…"
SENTRY_AUTH_TOKEN="…"     # additionally uploads source maps at build time
SENTRY_ORG="…"
SENTRY_PROJECT="…"
```

Only identifiers (organization, generation, voice) are attached to events.
Prompt text, audio, cookies, headers and request bodies are stripped — see
[`src/lib/observability/index.ts`](src/lib/observability/index.ts).

---

## Development adapters

Resonance runs without every integration configured. Each external service sits
behind an interface with two implementations:

| Service | Production | Development fallback |
| --- | --- | --- |
| Speech | `ChatterboxSpeechGenerator` | `MockSpeechGenerator` — renders a real, playable WAV tone so storage, the audio proxy, the waveform player and downloads all work end to end. Output is labelled as a preview in the UI. |
| Storage | `R2Storage` | `LocalStorage` — writes to `LOCAL_STORAGE_DIR`, with genuine HTTP range reads. |
| Billing | `PolarBillingProvider` | `MockBillingProvider` — free-tier limits are **really enforced** against the local usage ledger, so the upgrade path is testable. Only the checkout redirect is simulated. |

**Development fallbacks are disabled in production.** With `NODE_ENV=production`,
`assertProductionIntegrations()` throws at boot listing every missing credential,
rather than silently degrading. That is intentional — a production deployment
must never quietly serve mock audio or skip billing.

---

## Architecture

```
src/
  app/
    (dashboard)/            home, voices, text-to-speech, history, settings
    sign-in, sign-up, organization-selection
    api/
      audio/[generationId]  authenticated audio proxy with range support
      voices/[voiceId]/sample
      webhooks/polar
  features/
    voices/                 components · data · server · types
    text-to-speech/
    history/
    billing/
    dashboard/
    audio/
  lib/
    auth/                   requireAuthContext — the only source of tenant identity
    billing/                types · polar · mock · usage · checkout
    chatterbox/             types · client · mock
    storage/                types · r2 · local · keys
    audio/                  wav · range · stream-response
    database.ts environment.ts errors.ts rate-limit.ts observability/
chatterbox/                 FastAPI GPU service (Python)
prisma/                     schema.prisma · seed.ts
tests/
```

Business logic lives in `features/*/server` and `features/*/data`, never in
components. Pages are server components; client components are used only where a
browser API is genuinely needed (recording, playback, sliders, dialogs).

### Multi-tenancy

- Organization identity comes **only** from the Clerk session, via
  `requireAuthContext()`. It is never read from a request body, query string or
  form field — Zod schemas strip an injected `organizationId` rather than
  trusting it.
- Voice visibility is expressed once, in `accessibleVoiceFilter()`: system
  voices (`organizationId = null`) are readable by everyone; custom voices only
  by their owner.
- Cross-tenant reads return **404, not 403**, so ids cannot be probed.
- Generation, audio streaming and voice deletion all re-check ownership
  server-side, independently of the proxy.

### The generation flow

1. Authenticate; derive the organization from the session.
2. Validate text and settings with Zod.
3. Verify voice ownership.
4. **Check billing entitlement — before any GPU work.**
5. Persist a `PENDING` generation row.
6. Call Chatterbox with a short-lived signed URL for the reference sample.
7. Upload the audio to R2; mark the row `COMPLETED`.
8. Record usage.

A failure after step 5 marks the row `FAILED` with a user-safe message rather
than deleting it — failed generations stay visible in history.

### Generation settings

The four sliders map one-to-one onto `ChatterboxTurboTTS.generate()`. They are
not decorative.

| UI label | Model argument | Range | Default |
| --- | --- | --- | --- |
| Creativity | `temperature` | 0 – 2 | 0.8 |
| Voice Variety | `top_p` | 0 – 1 | 0.95 |
| Expression Range | `top_k` | 1 – 2000 | 1000 |
| Natural Flow | `repetition_penalty` | 1 – 2 | 1.2 |

Bounds are defined once in `GENERATION_PARAMETERS` and shared by the sliders,
the server-side Zod schema and the tests, so they cannot drift.

---

## Team

`/team` shows who is in the workspace and what they have generated. Member
management itself — invitations, role changes, removal, leaving — is Clerk's
embedded `OrganizationProfile`, so permission rules and invitation emails come
from the identity provider rather than a hand-rolled clone of it.

The activity table attributes generations per member from the `createdBy`
column; API-key traffic appears as a single workspace-level row (keys are
workspace credentials, not people), and usage by people who have since left
the workspace stays visible as "former member" rather than evaporating.

## Developer API

Resonance exposes a REST API at `/api/v1`, authenticated with per-workspace API
keys. Create keys in **Settings → API keys** (workspace admins only). The
secret is shown once and stored as a SHA-256 hash.

```bash
# Discover voices — the ids are what text-to-speech accepts as voice_id
curl https://your-app/api/v1/voices \
  -H "Authorization: Bearer rsn_..."

# Generate speech — returns audio/wav bytes
curl https://your-app/api/v1/text-to-speech \
  -H "Authorization: Bearer rsn_..." \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the Resonance API.",
    "voice_id": "system_aaron",
    "temperature": 0.8,
    "top_p": 0.95,
    "top_k": 1000,
    "repetition_penalty": 1.2
  }' \
  --output speech.wav
```

Texts over the deployment's inline threshold return `202` with `poll_url` and
`audio_url` instead of audio bytes (see Generation queue below).
Success responses carry `X-Generation-Id` and `X-Characters-Billed` headers,
and the generation appears in the workspace's history like any dashboard one.
Errors are JSON `{ "error": { "code", "message" } }`: `401` invalid key,
`400` validation, `404` unknown or foreign voice, `402` out of entitlement,
`429` rate limited. Validation errors add a `details` map keyed by the field
you sent (`top_p`, `text`, …) with per-field messages.

API traffic runs the exact same pipeline as the dashboard — same rate-limit
bucket, same tenant checks, same billing gate — via a single shared service
(`performSpeechGeneration`), so the two surfaces cannot drift.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build (type-checked) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run db:push` / `db:migrate` / `db:deploy` | Schema management |
| `npm run db:seed` | Seed the system voice library |
| `npm run db:studio` | Prisma Studio |

`npm run typecheck` needs Next's generated route types. Run `npx next typegen`
(or any build) first in a clean checkout.

---

## Security

- Authentication and organization membership via Clerk.
- Authorization is resource-based: every page, route handler and server action
  re-derives identity and scopes its own queries. The proxy only redirects.
- All external input validated with Zod.
- `CHATTERBOX_API_KEY`, R2 credentials and `POLAR_ACCESS_TOKEN` are server-only;
  nothing secret is reachable from `NEXT_PUBLIC_*`.
- Private bucket; audio served only through the authenticated proxy.
- Object keys are derived server-side and rejected if they contain traversal.
- Per-organization rate limits on generation, voice creation and audio streaming.
  *(In-process — swap for Redis behind more than one replica.)*
- Errors are mapped to safe messages; stack traces and upstream detail never
  reach the client.

---

## Testing

```bash
npm test
```

Covers tenant isolation, billing entitlement, generation parameter validation,
object-key derivation and traversal rejection, HTTP range parsing, error
redaction, rate limiting, and the development speech generator's WAV output.

---

## Deployment

Two deployables:

1. **Next.js app** — any Node host (Railway, Vercel, Fly, a container).
   Run `npm run db:deploy` on release. Set every production variable; a missing
   one fails the boot deliberately.
2. **Chatterbox service** — GPU host. See [`chatterbox/README.md`](chatterbox/README.md).
   Mount a volume at `/models` and allow a long health-check grace period; cold
   starts take minutes.

Set `APP_URL` to the public origin — checkout return URLs are built from it.

---

## System voice audio

Real recordings are not in the repository (the Chatterbox samples are not
redistributable), so system voice audio is managed operationally:

- **Development:** `npm run db:seed` attaches clearly-marked placeholder
  fixtures — deterministic generated tones, one distinct melody per voice — to
  any system voice without a sample, so preview and the full audio pipeline
  work with zero external assets. `npm run voices:fixtures` re-runs just that
  step (`-- --force` regenerates all of them).
- **Production:** fixtures are refused. Attach licensed recordings with
  `npm run voices:attach -- ./samples`, where filenames match voices by slug
  or id (`aaron.wav` or `system_aaron.wav` → `system_aaron`). Matched voices
  are overwritten; unsupported files are skipped and reported.

Don't point a real Chatterbox deployment at fixture audio: the model
conditions on the reference sample, and a tone is not a voice. Fixtures exist
for the UI and pipeline, not for cloning.

## Generation queue

Generation runs in two modes around one shared pipeline:

- **Inline (default):** texts at or under `GENERATION_INLINE_MAX_CHARS`
  (default 5000 — i.e. everything) generate synchronously in the request, as
  before. No worker required.
- **Queued:** lower the threshold once a worker is deployed and longer texts
  return immediately; the result page polls until the audio lands, and API
  callers get a `202` with `poll_url` / `audio_url` instead of audio bytes.

The queue is Postgres itself — the `Generation` row is the job, claimed with
`FOR UPDATE SKIP LOCKED`, so any number of workers can run without contention
and without adding Redis to the stack.

```bash
npm run worker
```

Deploy it as a second process/service sharing the web app's environment
(Railway-style). Failed jobs retry with exponential backoff (30s → 60s → 120s,
3 attempts); jobs orphaned by a crashed worker are requeued by a stale-claim
reaper after 10 minutes, or failed honestly once their attempts are spent.
Billing entitlement is checked at enqueue time, so a queued job never turns
into a surprise charge gate, and usage is recorded only on completion.

## Known limitations
- **Rate limiting is per process.** Correct for a single instance; use a shared
  store behind multiple replicas.
