# API reference

Base URL: `http://localhost:4000` in development. The web app reaches it through its own
same-origin proxy at `/api/*`, so the browser never needs the API's address or any key.

Every request body and query string is validated with Zod. Unknown fields are rejected,
strings are trimmed and stripped of invisible characters, and failures return `400` with
field-level details.

## Authentication

Anonymous sessions. `POST /v1/auth/session` sets an `HttpOnly`, `SameSite=Lax`,
`Secure`-in-production cookie holding a signed JWT (HS256, `jose`). The token's `jti` is
also written to the `sessions` table, so a session can be revoked server-side — a valid
signature alone is not enough.

Routes marked **auth** require that cookie.

## Errors

Every error has the same shape. Stack traces are logged with the request id, never returned.

```json
{ "error": { "code": "bad_request", "message": "Some fields are invalid.",
             "requestId": "01J…", "details": [{ "path": "text", "message": "Please say or type something." }] } }
```

Codes: `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404),
`payload_too_large` (413), `rate_limited` / `voice_rate_limited` / `session_rate_limited`
(429), `internal_error` (500), `service_unavailable` (503).

## Rate limits

Per client IP, fixed window.

| Scope | Window | Default | 429 code |
|---|---|---|---|
| All requests | `RATE_LIMIT_WINDOW_S` (60 s) | `RATE_LIMIT_MAX` = 120 | `rate_limited` |
| Voice (`/v1/voice/*`) | `RATE_LIMIT_WINDOW_S` | `RATE_LIMIT_VOICE_MAX` = 40 | `voice_rate_limited` |
| Session creation | 10 min | `RATE_LIMIT_SESSION_MAX` = 300 | `session_rate_limited` |

---

## System

### `GET /health`
Liveness. `200 { "status": "ok", "uptimeSeconds": 412 }`. No dependencies touched.

### `GET /health/ready`
Readiness. `200 { "status": "ready", "persistence": "postgres", "database": true }`,
or `503` with `"status": "degraded"` when the store is unreachable.

### `GET|POST /internal/purge`
Runs the retention sweep and returns `200 { "purged": 3 }` — a count, never any content.

Not part of the public API and not reachable with a user session: it exists for hosts
that cannot keep a long-lived timer, where a platform scheduler has to trigger deletion
from outside. Authorisation is `Authorization: Bearer $CRON_SECRET`, compared in constant
time. When `CRON_SECRET` is unset the route returns `404` rather than `401`, so a
deployment that forgets to configure it cannot leave a deletion endpoint standing open.

`GET` is accepted alongside `POST` only because schedulers issue plain `GET` requests.

### `GET /v1/capabilities`
What this deployment can actually do. The web app uses it to decide whether to record
audio itself or call the server, and to label the sources it shows.

```json
{
  "demoMode": true,
  "stt": "browser", "tts": "browser",
  "ai": "rules", "maps": "curated_directory", "routing": "haversine_estimate",
  "persistence": "postgres",
  "region": { "id": "gurugram", "name": "Gurugram",
              "center": { "lat": 28.4595, "lng": 77.0266 },
              "demoLocation": { "lat": 28.4952, "lng": 77.0888 },
              "demoLocationLabel": "Cyber City, Gurugram" },
  "emergencyContacts": [
    { "number": "112", "label": "Emergency", "description": "National emergency number — police, fire and ambulance.",
      "primary": true, "sourceUrl": "https://112.gov.in/about/" }
  ],
  "retentionDays": 7
}
```

### `GET /v1/admin/metrics` — **auth, ADMIN**
Counts only, over a rolling 7-day window:
`{ "windowDays": 7, "emergenciesByCategory": { "cardiac": 3, … }, "feedback": { "helpful": 12, "unhelpful": 1 } }`.
No clinical content, no message text. Needs an ADMIN session from
`POST /v1/auth/admin`, which only works when `ADMIN_ACCESS_KEY` is set.

---

## Auth

### `POST /v1/auth/session`
Body: `{ "languagePreference": "auto" | "en" | "hi" | "hinglish" }` (optional).
Sets the session cookie. Returns `{ userId, anonymous, expiresAt }`.

### `GET /v1/auth/session` — **auth**
Returns the same object for the current session.

### `DELETE /v1/auth/session` — **auth**
Revokes the session server-side and clears the cookie.

### `POST /v1/auth/admin`
Body: `{ "accessKey": "…" }`. Issues an ADMIN session. Only mounted when
`ADMIN_ACCESS_KEY` is set (minimum 24 characters).

---

## Conversations

### `POST /v1/conversations` — **auth**
Body: `{ "languagePreference": "auto" }`. `201` with `{ id, startedAt, language }`.

### `GET /v1/conversations` — **auth**
The caller's own conversations, newest first: id, timestamps, urgency, emergency flag,
and a short structured summary. Message text is decrypted only for
`GET /v1/conversations/:id`.

### `GET /v1/conversations/:id` — **auth**
Full transcript, symptom timeline and the latest triage result. `404` if it isn't yours.

### `DELETE /v1/conversations/:id` — **auth**
Hard-deletes the conversation and everything hanging off it.

### `POST /v1/conversations/:id/turns` — **auth**
The main endpoint. One utterance in, one complete next step out.

```json
{
  "text": "seene mein dard ho raha hai aur paseena aa raha hai",
  "inputMode": "voice",
  "sttLanguage": "hi",
  "languagePreference": "auto",
  "location": { "lat": 28.4952, "lng": 77.0888, "accuracyMeters": 30, "origin": "gps" }
}
```

`text` is 1–1000 characters. `location` is optional; without it, facility results come
back with `facilitiesStatus: "needs_location"` and the guidance is unchanged.

Response:

```json
{
  "conversationId": "c…", "turnId": "t…",
  "phase": "emergency",
  "intent": "symptom_report",
  "language": "hinglish",
  "reply": { "display": "…caption text…", "speech": "…shorter spoken text…" },
  "triage": null,
  "emergency": {
    "category": "cardiac",
    "headline": "Possible heart emergency",
    "instructions": ["Call 112 now.", "Stop all activity and sit or lie in the most comfortable position.", "…"],
    "contacts": [ … ],
    "matchedRuleIds": ["cardiac.chest_pain_sweating"]
  },
  "facilities": [ … ],
  "facilitiesStatus": "ok",
  "quickReplies": [],
  "degraded": [],
  "disclaimer": "Sanjeevani is not a doctor and can't diagnose. In an emergency, call 112.",
  "trace": [
    { "stage": "language", "ran": true, "ms": 0, "detail": "hinglish" },
    { "stage": "extraction", "ran": true, "ms": 6, "detail": "2 new" },
    { "stage": "emergency_check", "ran": true, "ms": 1, "detail": "cardiac" },
    { "stage": "intent", "ran": true, "ms": 0, "detail": "symptom_report" },
    { "stage": "ai_understanding", "ran": false, "ms": 0, "detail": "not needed" },
    { "stage": "follow_up", "ran": false, "ms": 0, "detail": "not reached" },
    { "stage": "triage", "ran": false, "ms": 0, "detail": "fixed instructions" },
    { "stage": "facilities", "ran": true, "ms": 4, "detail": "3 ranked" },
    { "stage": "phrasing", "ran": false, "ms": 0, "detail": "fixed instructions" },
    { "stage": "output_guard", "ran": false, "ms": 0, "detail": "nothing generated" }
  ],
  "totalMs": 12
}
```

- `phase`: `greeting` | `follow_up` | `advice` | `emergency` | `clarify` | `facility_search` | `closing`
- `facilitiesStatus`: `ok` | `not_needed` | `needs_location` | `none_found` | `unavailable`
- `degraded`: any of `ai_unavailable`, `ai_invalid_output`, `maps_unavailable`,
  `routing_estimated`, `persistence_unavailable`. The turn still succeeds; these tell the
  UI what to soften or label.
- `emergency` is non-null **only** when the deterministic circuit breaker fired. When it
  is non-null, `triage` is null and the client must show the emergency screen.
- `trace` always lists all ten pipeline stages in execution order, with `ran: false` for
  those that were not needed. It carries stage names, outcomes and milliseconds drawn
  from a fixed vocabulary — never symptoms, message text or anything else clinical — and
  is safe to display. Its ordering is the point: `emergency_check` precedes `phrasing` on
  every turn.

### `POST /v1/conversations/:id/emergency-actions` — **auth**
Body: `{ "action": "call_initiated" | "location_shared" | "directions_opened" | "dismissed",
         "category": "cardiac", "contactNumber": "112" }`.
Records what the user did on the emergency screen, for safety review. `204`.

### `POST /v1/emergency/events`
Same body, no session required — the SOS button works before any conversation exists.

---

## Facilities

### `GET /v1/facilities`
Query: `lat`, `lng` (required), `type` (`hospital` | `emergency_department` | `clinic` |
`pharmacy` | `diagnostic_lab`, default `hospital`), `specialty`, `urgency`
(default `routine`), `limit` (1–10, default 5), `language`.

```json
{
  "facilities": [{
    "id": "cd_paras-health-gurugram",
    "name": "Paras Health, Gurugram",
    "address": "C-1, Sushant Lok-1, Sector 43, Phase-I, Gurugram, Haryana 122002",
    "lat": 28.4508, "lng": 77.0745, "coordinatesApproximate": false,
    "phone": "+91 124 458 5555", "emergencyPhone": "+91 124 458 5566",
    "types": ["hospital", "emergency_department"],
    "verifiedSpecialties": ["emergency_medicine", "general_medicine", "cardiology", "…"],
    "emergency24x7": true, "openNow": null, "ownership": "private",
    "website": "https://www.parashospitals.com/…",
    "sourceUrl": "https://www.parashospitals.com/…", "verifiedOn": "2026-09-17",
    "straightLineMeters": 3980,
    "travel": { "distanceMeters": 4900, "durationSeconds": 900, "estimated": true, "polyline": null },
    "score": 0.81,
    "factors": { "relevance": 1, "distance": 0.78, "operational": 1, "service": 1 },
    "reasons": ["closest_option", "has_24x7_emergency", "specialty_verified"],
    "directionsUrl": "https://www.google.com/maps/dir/?api=1&destination=…"
  }],
  "status": "ok",
  "provider": "curated_directory",
  "attribution": "Sanjeevani curated directory — details from each hospital's official website"
}
```

`travel.estimated: true` means the duration is a straight-line estimate, not a routed
one; the UI prefixes it with "approx." whenever it is. `openNow: null` means the source
did not say, and the UI shows "hours not confirmed" rather than assuming.

### `GET /v1/facilities/:id`
One facility with full detail, including a route polyline when a routing provider is
configured and `lat`/`lng` are supplied.

---

## Voice

Both routes require a session and are separately rate-limited. If ElevenLabs is not
configured, the API returns `503 service_unavailable` and the client falls back to the
browser's own speech engines — `GET /v1/capabilities` tells it in advance which to use.

### `POST /v1/voice/transcribe` — **auth**
`multipart/form-data` with a single `audio` file (≤ 10 MB) and an optional `language` field.
A larger file returns `413 payload_too_large`.

```json
{ "text": "mujhe do din se bukhar hai", "languageCode": "hi", "languageProbability": 0.97, "provider": "elevenlabs" }
```

### `POST /v1/voice/speak` — **auth**
Body: `{ "text": "…", "language": "hi" }` — up to 800 characters. Responds
`audio/mpeg`, streamed (`Transfer-Encoding: chunked`) so playback can start immediately.

---

## Privacy and feedback

### `GET /v1/privacy/summary` — **auth**
What is held for this session, without returning any of it:

```json
{ "anonymous": true, "conversations": 3, "retentionDays": 7,
  "encryptedAtRest": true, "locationStorage": "coarse-area-only",
  "oldestExpiry": "2026-09-25T09:12:44.001Z" }
```

### `DELETE /v1/privacy/data` — **auth**
Deletes everything for the current user — conversations, messages, symptom events, triage
results, emergency events, feedback and the anonymous identity itself — then revokes the
session and clears the cookie. Returns `{ "deletedConversations": 3 }`.

### `POST /v1/feedback`
Body: `{ "helpful": true, "category": "triage", "comment": "…", "conversationId": "c…" }`.
Works with or without a session; with one, a
`conversationId` is only linked if that conversation belongs to the caller.
`category` is one of `voice`, `triage`, `facilities`, `accessibility`, `language`,
`other`; `comment` is capped at 600 characters. Returns `201 { "received": true }`.
