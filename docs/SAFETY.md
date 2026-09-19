# Safety and clinical content

Sanjeevani Voice is a **triage and navigation aid**. It helps someone decide how urgent
their situation is and where to go. It does not diagnose, does not prescribe, and does not
replace clinical judgement. Everything below describes what the software actually enforces
and where that enforcement lives, so it can be reviewed rather than trusted.

---

## The three rules the code enforces

**1. A model can never create or raise an emergency.**
The circuit breaker (`packages/medical-safety/src/emergency/`) is deterministic
TypeScript. It runs before any generation, on the raw utterance plus every symptom
gathered so far. If it fires, the engine returns immediately with a fixed instruction set
and the verified contact list; no generated text reaches the screen. When the AI layer
*suspects* an emergency the rules missed, its urgency is capped below `emergency` and the
only thing it can do is make the app ask one specific deterministic question
(`ai_emergency_confirm`) whose answer goes back through the rules.

**2. Nothing generated reaches a user unchecked.**
Whichever model is configured — Gemini or Claude — it is called with a forced tool or
function call and its arguments are parsed with Zod; anything that fails validation is
dropped and the turn continues on rules alone. The safety properties are identical for
both providers because the caps and the guard live above them, in the engine. Whatever survives is
then run through the output guard (`packages/medical-safety/src/guard/output-guard.ts`),
which rejects text that:

| Violation | Example it blocks |
|---|---|
| `claims_to_be_doctor` | "As your doctor, …", "मैं डॉक्टर हूं" |
| `definitive_diagnosis` | "You have dengue", "aapko pakka typhoid hai" |
| `medication_dosing` | "500 mg", "do goli" |
| `prescribes_medication` | "take azithromycin", any named antibiotic or steroid |
| `discourages_care` | "no need to see a doctor", "nothing to worry", "डॉक्टर की ज़रूरत नहीं" |
| `unverified_phone_number` | any dialable number not on the verified helpline list or the facility's own published numbers |
| `too_long` / `empty` | replies that stop being usable as speech |

A rejected phrasing is silently replaced by the deterministic template. The user sees a
good answer; they never see the guard fire.

**3. Only verified numbers are ever shown or spoken.**
`packages/config/src/emergency.ts` is the single source, and every entry carries the URL
it was verified against:

| Number | What it is | Source |
|---|---|---|
| **112** | National emergency number — police, fire, ambulance | <https://112.gov.in/about/> |
| **108** | Haryana ambulance helpline | <https://haryana.gov.in/helpline/> |
| **14416** | Tele-MANAS, national mental-health helpline | <https://telemanas.mohfw.gov.in/> |

Facility phone numbers come only from the facility's own published record and are passed
to the guard per call. No number is ever inferred, generated or guessed.

---

## What triage does and does not claim

Urgency is one of `emergency`, `urgent`, `routine` or `self_care`, derived from symptom
profiles plus duration, age group and severity. Each result carries:

- a **recommended action** in plain language ("Please visit a General Medicine OPD within
  the next day or two"),
- the **specialty** to ask for,
- **home care** that is comfort-and-hydration advice only — never a medicine, never a dose,
- **warning signs** that should prompt immediate help,
- a **confidence** level, and
- an explicit list of **rationale codes**, which is what the "Why this advice" panel
  renders. The explanation is the data that produced the decision, not a retelling of it.

Red-flag screens are asked before routine questions, so the dangerous case is ruled out
before the convenient one is refined. Questioning stops as soon as further answers cannot
change the outcome — an anxious person is not interrogated.

`self_harm` has a separate path: Tele-MANAS leads, hospital navigation is not offered, and
no triage level is presented.

---

## What the hospital data does and does not claim

- A department is listed only when the facility's own source lists it
  (`specialty_verified`). When the source is silent, the card says **"not confirmed"**
  (`specialty_unverified`) rather than implying either way.
- Opening hours the source does not publish show as **"hours not confirmed"**, never as
  "open".
- Travel times without a routing provider are straight-line estimates and are labelled
  **"approx."** every time they appear.
- Coordinates that were not published are marked approximate, and the directions link
  searches by name and address instead of dropping a false pin.
- Curated entries carry `sourceUrl` and `verifiedOn`, both shown in the UI.

Ranking weights are published in [ARCHITECTURE.md](ARCHITECTURE.md#facility-ranking) and
surfaced per result as reason codes. The nearest facility is not automatically the
recommendation; a closer hospital without the needed department will lose to a slightly
further one that has it.

---

## What the user can verify for themselves

Two of the claims above are checkable from inside the app rather than taken on trust.

**The answer trace.** Every reply carries a per-stage record — which stages ran, in
what order, and how long each took — rendered under "How this answer was produced".
The emergency check appears before triage and before any wording, because that is the
order it executed in. The trace is built from a fixed vocabulary of stage names and
short labels, so nothing clinical can appear in it; `packages/ai/test/engine.test.ts`
asserts that a set of symptom words never occurs anywhere in the payload.

**The emergency contact never leaves the device.** It lives in `localStorage` and is
read directly by the components that use it. `e2e/journey.spec.ts` watches every
network request the page makes while the contact is saved and used, and fails if the
name or number appears in any request body.

---

## Data minimisation

- Message text: AES-256-GCM at rest, server-held key.
- Location: geohash precision 5 (≈5 km cells). Raw coordinates are used for the query and
  then discarded.
- IP addresses: keyed HMAC only, for rate limiting and abuse review.
- Audit events: the action, never the content.
- Everything expires after `RETENTION_DAYS`; `DELETE /v1/privacy/data` removes it at once.
- Logs never contain message text — only its length and language.
- The emergency contact is stored in browser storage and never transmitted; deleting
  the user's data removes it with everything else.

---

## Limits you should hold in mind

- **Coverage is Gurugram.** The `FacilityProvider` abstraction is region-agnostic and a
  Google Places key makes it global, but the curated fallback is one city and the
  emergency numbers are India's.
- **Triage rules are conservative by construction**, which means false positives: it will
  sometimes send someone to a doctor who did not need one. That trade is deliberate.
- **Speech recognition is imperfect**, especially for code-switched Hinglish and in noise.
  Extraction is tolerant of spelling, but a badly misheard utterance produces a bad turn.
  The keyboard is always one tap away.
- **Facility data goes stale.** `verifiedOn` is shown so a user can weigh it. Re-verify
  before any real deployment and on a schedule after it.
- **This is not a medical device** and has not been clinically validated. Any real
  deployment needs clinical review of `packages/medical-safety/src/triage/profiles.ts` and
  `emergency/rules.ts` by qualified practitioners, and should carry local regulatory review.

---

## Measured performance

`npm run eval` runs the engine over 47 labelled cases — 27 emergencies, 20 not — across
English, Hindi and Hinglish, and fails the build if the numbers move the wrong way.

| | Result |
|---|---|
| Emergency detection recall | **27/27 — 100%** |
| Wrong category | 0 |
| False alarms on non-emergencies | **0/20 — 0%** |
| Under-triaged (dangerous) | **0** |
| Over-triaged (costly, tolerated) | 0 |

The thresholds the build enforces: recall must be 100%, under-triage must be zero, and
false alarms must stay at or below 5%. Recall is absolute because a missed emergency is
the failure this system exists to prevent. The false-alarm ceiling is looser but real —
an app that cries wolf gets ignored, and being ignored is itself a safety failure.

**What these numbers are not.** They are engineering regression cases, not clinical
validation. No clinician has reviewed them, they are not sampled from real
presentations, and emergencies are deliberately over-represented. They answer "did this
change break something" and "how often do we send someone who did not need to go" — not
"is this safe to deploy". A real deployment needs a set built and reviewed by
practitioners. `eval/vignettes.ts` says the same thing at the top of the file.

**What building it found.** The first run failed: 7 missed emergencies and 2 false
alarms. All were real defects, not bad test cases —

- Hindi and Hinglish chest pain missed entirely, because "seene mein **bahut tez** dard"
  put two words between parts of a lexicon phrase and the matcher allowed only one.
- "swallowed kerosene", "hot oil spilled", "do not want to live", "jeene ka mann nahi"
  and "wanted to die" were all absent from the phrase lists — ordinary ways of saying
  the most serious things in the system.
- Past and hypothetical mentions of chest pain fired the composite rules, so "I had
  chest pain last year" and "what should I do if someone has chest pain" both triggered
  a full emergency takeover.
- A "yes" to the compound fever screen — which bundles rash, stiff neck, confusion and
  difficulty breathing — raised urgency to *urgent* and stopped there, even though two
  of those four are emergency-grade. It now queues the fixed confirmation question.

Each was fixed and is now pinned by a test. This is the argument for the harness: none
of these were visible by reading the code, and two of them would have shown someone a
false emergency screen the first time they asked the app a general question.

---

## Tests that guard these properties

| File | What it pins down |
|---|---|
| `packages/medical-safety/test/emergency.test.ts` | 62 cases: every rule fires on its phrases in three languages; does **not** fire on negated, past or hypothetical mentions; and the framing detector never suppresses an explicit emergency phrase |
| `eval/` | 47 labelled vignettes with enforced thresholds — see **Measured performance** above |
| `packages/medical-safety/test/extraction.test.ts` | 53 cases: phonetic matching, directional negation, duration, age and severity parsing |
| `packages/medical-safety/test/triage.test.ts` | Urgency mapping, red-flag ordering, question stopping |
| `packages/ai/test/engine.test.ts` | AI output cannot escalate to emergency; invalid tool input degrades cleanly; guard rejections fall back to templates |
| `packages/ai/test/gemini.test.ts` | Forced function call, schema narrowing, both response shapes, typed errors, timeout, and that the key never reaches the URL |
| `packages/voice/test/gemini-voice.test.ts` | Provider selection, inline audio encoding, PCM→WAV framing, per-language voice, and rejection of unsupported audio |
| `packages/medical-safety/test/triage.test.ts` (worsening) | "Worse" raises severity one step and never past severe, in three languages; "better" never lowers it |
| `packages/maps/test/maps.test.ts` | Ranking weights, eligibility filters, reason codes, unverified-department handling |
| `apps/api/test/api.test.ts` | Validation, auth, ownership, rate limits, error shape |
| `e2e/journey.spec.ts` | The emergency takeover appears before any generated text, on mobile and desktop |

Run `npm test` and `npm run test:e2e`. If a change to the rules is intended, the test that
breaks is the review conversation — do not delete it to make a build pass.
