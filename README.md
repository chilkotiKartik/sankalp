# Sanjeevani Voice

**Speak naturally. Get the right next step.**

A voice-first medical triage and hyper-local hospital navigation assistant for India.
Someone describes what's wrong in Hindi, English or Hinglish; Sanjeevani asks the few
follow-up questions that matter, tells them how urgent it is in plain language, and
points them at a specific, suitable hospital — with a reason, a distance and directions.

It is **not a doctor**, never gives a diagnosis, and never prescribes. When what it
hears looks like an emergency, a deterministic safety layer takes over the screen
before anything else runs.

---

## What's in the box

| | |
|---|---|
| **Voice pipeline** | mic → STT → language detection → safety engine → triage → facilities → reply → TTS, with barge-in and turn-taking |
| **Languages** | Hindi (Devanagari), English, Hinglish (romanised Hindi), auto-detected and switchable mid-conversation |
| **Emergency circuit breaker** | Deterministic rules, independent of any model, that pre-empt normal triage and show one dominant call action to **112** |
| **Triage** | Rule-based urgency (emergency / urgent / routine / self-care), red-flag screens first, explicit rationale |
| **Hospital discovery** | Pluggable `FacilityProvider` — Google Places (New) + Routes, or a curated, source-attributed Gurugram directory |
| **Transparent ranking** | Published weights over relevance, distance, operational status and required department — never "just the nearest" |
| **AI** | Google Gemini (or Anthropic Claude) for understanding and phrasing only; every output is schema-validated and safety-capped server-side |
| **Persistence** | PostgreSQL + Prisma, field-level AES-256-GCM encryption, coarse (geohash) location, automatic retention purge |
| **Offline triage** | The safety rules, emergency circuit breaker and triage run **in the browser** when the server is unreachable — the same engine, not a copy |
| **Measured safety** | 47 labelled vignettes across three languages — 100% emergency recall, 0% false alarms, 0 under-triage, enforced in CI (`npm run eval`) |
| **Emergency contact** | One trusted person, stored only on the device, offered as a one-tap call and a pre-written location SMS on the emergency screen |
| **Care card** | A printable, shareable card for the hospital desk — including the red flags already ruled out |
| **Answer trace** | Per-stage timings showing the safety rules really did run before anything was generated |
| **Re-check** | Continue an earlier conversation; "worse" genuinely raises severity and can escalate urgency |
| **Data saver** | Skips downloaded audio and map tiles on a metered connection |
| **Motion** | A spring-based system — page transitions, staggered reveals, counted numbers, sweep skeletons — every piece of which collapses under reduced motion |
| **Accessibility** | Large targets, text scaling, high contrast, reduced motion, screen-reader semantics, spoken-first flows, a live preview to tune them |
| **Demo mode** | Runs fully with zero API keys, using deterministic local providers — without ever looking like a mockup |

---

## Quick start

No Docker, no database, no keys required.

```bash
git clone <this repo> sanjeevani-voice && cd sanjeevani-voice
npm install      # also generates the Prisma client
npm run setup    # writes .env, generates secrets, asks for a Gemini key (optional)
npm run dev      # API on :4000, web on :3000
```

Open <http://localhost:3000> in Chrome, Edge or Safari.

`npm run setup` is safe to re-run — it never overwrites a value you already have.
If you prefer to do it by hand, `cp .env.example .env` works too; the defaults run.

### Add your Gemini key

One key turns on all three AI features — understanding, speech-to-text and
text-to-speech. Get one free at <https://aistudio.google.com/apikey>, then either
paste it when `npm run setup` asks, or put it in `.env`:

```bash
GEMINI_API_KEY=your-key-here
```

Restart, and the Settings screen will show "Gemini" as the live engine. Nothing else
changes — the safety rules, the triage and the hospital ranking are the same code
either way.

### Add a database (optional)

Only needed if you want conversation history to survive a restart.

```bash
createdb sanjeevani     # local PostgreSQL
npm run db:migrate      # applies prisma/migrations
npm run db:seed         # loads the curated facilities
```

Without one, everything runs in memory and the app tells you so.

### Other providers (all optional)

| Key | What it adds |
|---|---|
| `GEMINI_API_KEY` | Understanding, speech-to-text and text-to-speech |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | A dedicated low-latency voice, preferred over Gemini's when set |
| `ANTHROPIC_API_KEY` | Claude instead of Gemini for understanding (`AI_PROVIDER=anthropic` to force it) |
| `GOOGLE_MAPS_API_KEY` | Live hospital search instead of the curated Gurugram directory |

Each is picked up independently — there is no all-or-nothing switch, and
`GET /v1/capabilities` reports exactly which provider is live.

> Docker is **not** required. `Dockerfile.api`, `Dockerfile.web` and
> `docker-compose.yml` are included for anyone who wants them, but every command in
> this README runs without Docker installed.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run setup` | Writes `.env`, generates secrets, prepares the database if one is reachable |
| `npm run dev` | API + web in watch mode |
| `npm run build` | Generate Prisma client, typecheck, build API and web |
| `npm run build:vercel-api` / `build:vercel-web` | Build for a serverless host — see [DEPLOYMENT.md](docs/DEPLOYMENT.md#serverless-vercel) |
| `npm start` | Run both built servers |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run lint` | ESLint (flat config) over the repo |
| `npm test` | Vitest — unit, rules and API integration |
| `npm run test:e2e` | Playwright — the full journey, mobile + desktop |
| `npm run db:migrate` / `db:seed` / `db:reset` | Schema and demo data |
| `npm run db:purge` | Delete data past `RETENTION_DAYS` (run on a schedule) |
| `npm run eval` | Measure the triage engine against the labelled vignettes; fails below thresholds |
| `npm run check:secrets` | Fail if any server secret name appears in client bundles |

---

## Repository layout

```
apps/
  web/     Next.js 16 (App Router) — 17 screens, the orb, the motion system, the voice client
  api/     Express 5 — validation, auth, rate limits, routes, repositories
packages/
  types/           Zod-first domain + API contracts shared by both sides
  config/          Env schema, verified emergency contacts, region config
  medical-safety/  Language detection, symptom extraction, emergency rules, triage, output guard
  ai/              Conversation orchestrator + Gemini and Anthropic providers (validated tool calls)
  maps/            FacilityProvider abstraction, ranking, Google + curated providers
  voice/           VoiceProvider abstraction, Gemini + ElevenLabs + browser fallback
  ui/              Design tokens and shared primitives
  db/              Prisma client wrapper
prisma/    schema.prisma, hand-written migrations, seed
docs/      ARCHITECTURE.md, API.md, DEPLOYMENT.md, DEMO.md, SAFETY.md
e2e/       Playwright journey specs
eval/      Labelled triage vignettes and the measurement runner
scripts/   migrate, seed helpers, retention purge, client-secret scanner
```

---

## Safety model, in one paragraph

Nothing a language model produces can raise or create an emergency on its own. The
emergency circuit breaker is plain TypeScript: phrase rules plus composite rules over
the symptoms accumulated in the conversation. It runs *before* triage, and if it fires,
generation is skipped entirely and a fixed, localised instruction set is shown. When the
AI *suspects* an emergency the deterministic rules missed, it cannot escalate — it can
only cause the app to ask one specific confirming question. Everything the AI writes
passes an output guard that blocks doctor claims, diagnoses, dosing, prescriptions,
discouragement from seeking care and any phone number that isn't on the verified list.
See [docs/SAFETY.md](docs/SAFETY.md).

## Data and privacy, in one paragraph

Message text is encrypted at rest with AES-256-GCM using a server-held key. Location is
stored only as a geohash (≈±2.4 km), never as coordinates. IP addresses are stored only
as a keyed HMAC, for rate limiting and abuse review. Audit events record *that*
something happened, never its clinical content. Everything expires after
`RETENTION_DAYS` and `DELETE /v1/privacy/data` removes it immediately. No secret ever
reaches the browser — `npm run check:secrets` enforces this in CI.

---

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how a turn flows through the system
- [docs/API.md](docs/API.md) — every endpoint, request and response
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environment, migrations, operations (Docker optional)
- [docs/DEMO.md](docs/DEMO.md) — demo mode, scripted scenarios, what to show
- [docs/SAFETY.md](docs/SAFETY.md) — the clinical-content policy and where it lives in code

## Licence and clinical disclaimer

Sanjeevani Voice provides general health information and navigation help. It does not
diagnose, prescribe, or replace professional medical care. In an emergency in India,
call **112**.
# sankalp
