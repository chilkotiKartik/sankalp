# Demo mode

Sanjeevani runs completely without API keys. Demo mode changes what is *available*, never
what is *claimed*: the guidance, the ranking and the emergency rules are the same code
paths that run in production. Nothing on screen is a static mock, and every source is
labelled honestly — a curated directory says so, an estimated travel time says "approx.".

```bash
npm install && npm run setup && npm run dev
```

No Docker and no database needed. `npm run setup` offers to save a Gemini key; press
Enter to skip it and everything below still works.

`DEMO_MODE=true` (the default) does three things:

1. Offers **"Use sample location (Cyber City, Gurugram)"** next to "Share my location", so
   the hospital flow can be shown without granting a geolocation permission.
2. Allows in-memory persistence when no database is reachable, so nothing has to be
   installed to try it.
3. Shows a small **Demo** badge in the header — the app never pretends to be
   fully provisioned when it is not.

`GET /v1/capabilities` always reports the truth about which provider is live, and the
Settings screen shows the same thing in plain language ("This device's built-in voice ·
Guidance: safety rules · Places: curated directory").

---

## What runs without keys

| | Without a key | With a Gemini key | With an ElevenLabs key |
|---|---|---|---|
| Speech in | Browser Web Speech API (Chrome, Edge, Safari) | Gemini audio understanding | ElevenLabs Scribe |
| Speech out | Browser `speechSynthesis` | Gemini speech generation (WAV) | ElevenLabs streaming TTS |
| Understanding | Deterministic multilingual extraction + rules | Gemini, schema-validated and safety-capped | — |

Hospitals, travel times and storage are independent of all of that:

| | Without a key | With `GOOGLE_MAPS_API_KEY` |
|---|---|---|
| Hospitals | Curated Gurugram directory — six hospitals, each with a source URL and verification date | Google Places API (New) |
| Travel time | Straight-line distance × urban speed factor, labelled "approx." | Google Routes API |
| Storage | PostgreSQL if `DATABASE_URL` is set, otherwise in memory | — |

When both a Gemini and an ElevenLabs key are present, ElevenLabs takes the voice and
Gemini stays as the fallback rung; Gemini still does the understanding.

Firefox has no Web Speech API. With no server-side voice key it offers the keyboard
instead of the microphone — the app detects this rather than failing at the moment of
tapping. A Gemini key is enough to give Firefox full voice.

---

## A five-minute walkthrough

**1. The ordinary case.** Tap the orb (or "Type instead") and say:

> "I've had a high fever and body ache for two days"

It extracts fever and body ache with a duration, then asks the one question that could
change the answer — the red-flag screen for rash, stiff neck, confusion or difficulty
breathing. Answer **No**. You get an urgency level, a plain-language next step, home care,
warning signs to watch for, and an offer to find care nearby.

**2. Hospitals with a reason.** Tap "Use sample location". Six Gurugram hospitals come
back ranked, each with a distance, a travel estimate and the reasons it placed where it
did. Open one: address, phone, the emergency line where one is published, the departments
the hospital itself lists, the map, and a footer naming the source and the date it was
checked. Where the source is silent, the card says "hours not confirmed" — it does not
guess.

**3. Hindi and Hinglish.** Start a new conversation and type:

> "मुझे दो दिन से तेज़ बुखार और बदन दर्द है"

The reply comes back in Hindi. Then answer in Hinglish — "haan, thoda sa" — and it
follows you mid-conversation. Romanised spellings are matched phonetically, so *bukhar*,
*bukhaar* and *bukhaR* all land on the same symptom.

**4. The emergency circuit breaker.** New conversation:

> "my father has severe chest pain and is sweating"

The screen is taken over before any generated text exists: one dominant **Call 112 now**
button, four short instructions, location sharing, the nearest emergency-capable hospital,
and the other verified helplines. There is no diagnosis anywhere on it. "This isn't an
emergency" dismisses it and suppresses that same rule for the rest of the conversation —
a different rule can still fire.

**5. Negation and language edges.** Try "I have a headache but no chest pain": the chest
pain is not recorded. In Hindi, negation runs the other way — "seene mein dard nahi hai" —
and is handled with a backward window.

**6. Accessibility.** Settings → Accessibility. A live preview of a real triage verdict
sits at the top, so text size, contrast and theme are chosen by watching the sentence
change rather than guessing from a label; the speaker button reads it aloud at the chosen
rate. The layout holds at 390 px with no horizontal scroll, the ambient wash and grain
switch off in high contrast, the orb falls back to a static disc under reduced motion,
and every control keeps a 44 px target.

**6b. How it works.** Settings → How Sanjeevani works. Five steps from voice to hospital,
what the app will never do, and the ranking weights drawn live from the same constant the
server ranks with — so the explanation cannot drift from the behaviour.

**7. Privacy.** Privacy → what is stored, and one button that deletes all of it. Check the
database afterwards: message rows are `v1.…` ciphertext, and the only location stored is a
five-character geohash.

---

## Failure paths worth showing

Each of these is a designed state, not an error page:

- Stop the API → the app stays usable, shows an offline banner, and keeps a link to the
  emergency numbers, which are bundled client-side and need no network.
- Deny the location permission → guidance is unchanged; only the hospital list is
  withheld, with a clear way to retry or use the sample location.
- Unset the voice key mid-session → spoken replies fall back down the chain (ElevenLabs →
  Gemini → browser voice) with a single non-blocking notice, and the conversation continues.
- Give Gemini a bad key → the turn still returns, flagged `ai_unavailable`, answered by the
  deterministic rules. Guidance never depends on a model being reachable.
- Stop PostgreSQL → answers still arrive, flagged `persistence_unavailable`; history is
  what is lost, not the guidance.

---

## Seeded data

`npm run db:seed` loads the curated directory: Paras Health Gurugram, Max Hospital
Gurugram, Fortis Memorial Research Institute, Artemis Hospital, Medanta – The Medicity,
and District Civil Hospital Sector 10. Every entry carries a `sourceUrl`, a `verifiedOn`
date, and only the departments its own website lists. Where a coordinate was not published
it is marked approximate and the UI says so.

These are real hospitals with details taken from their official websites on the recorded
date. **Re-verify them before any real use** — phone numbers and departments change.
