> React workspace details. For the connected team UI, shared backend and current launch commands, use the root README.

# CQA Intelligence

Conversation quality analytics for the Freedom Broker / CQA hackathon. A local prototype for RU/KZ/EN text chats and voice-call transcripts, with configurable checklists, verifiable evidence, deterministic weighted scoring, appeals, human review and version comparison. It is not an officially deployed banking system.

## Quick start

Requires Python 3.11+ and Node.js 22.12+ (verified here with Python 3.14 and Node 26).

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci --prefix frontend
# On a fresh checkout only; preserve an existing configured .env:
cp .env.example .env
# Edit .env: add GEMINI_API_KEY and optionally ORGANIZER_DEV_API_URL.
npm run build --prefix frontend
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. Interactive backend docs: **http://127.0.0.1:8000/docs**. The production build is served by FastAPI, so a second server is unnecessary. `make setup`, `make build`, `make run` provide the same workflow. Keep one backend worker for this SQLite job queue.

For development, `make dev` runs FastAPI on 8000 and Vite on **http://127.0.0.1:5173** with `/api` proxying. Or run `uvicorn backend.app.main:app --reload` via the virtualenv and `npm run dev --prefix frontend` in separate terminals. Vite has a narrow backend proxy and FastAPI permits only the two local frontend origins.

Windows PowerShell: use `py -3 -m venv .venv`, `.venv\Scripts\python.exe -m pip install -r backend/requirements.txt`, `Copy-Item .env.example .env` on a fresh checkout, then `.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`. npm commands are unchanged. The optional Makefile/bash helper is not required.

The optional Playwright server harness uses a POSIX shell; run end-to-end tests in WSL on Windows.

## Organizer data and local import

The actual official PDFs were inspected during implementation. Their DEV hyperlink was extracted into the ignored local `.env`, and the connector successfully imported **65 DEV conversations: 35 RU, 15 KZ, 15 EN; 60 chats, 5 calls**. Those source records are only in the ignored local SQLite database; a fresh checkout starts empty.

To configure another checkout, copy the signed GET hyperlink from page 3 of the guide into backend `.env` as `ORGANIZER_DEV_API_URL`. Never put it in frontend code, a screenshot, README, logs, or a public repository. Alternatively:

```sh
.venv/bin/python scripts/extract_dev_api_url.py /path/to/CQA_Hackathon_Student_Guide_v3.pdf
```

The helper preserves an existing configured endpoint and prints no secret. Import dataset → enter DEV or the announced control group → Import group. Only `group_id` changes; the rest of the signed query is retained byte-for-byte. The frontend never receives that endpoint. Ingestion is server-side to avoid organizer CORS problems. Check backend connectivity/credential lifetime if the connector reports an upstream error.

Import dataset also supports organizer-format UTF-8 JSON (20 MB maximum) and a **clearly labeled synthetic demo**. The fixture has 9 multilingual chats and one call transcript; it is not organizer data. `scripts/seed_demo_data.py` imports it locally without creating evaluations. Repeated imports are idempotent on group + external ID. Changed content within the same group is rejected atomically to preserve historical evidence; use a new dataset group for revised source records.

## Live model and reproducibility

The live adapter uses the maintained `google-genai` SDK with **`gemini-3.8-flash`**, configurable via `GEMINI_MODEL`. It uses a system instruction, a server-supplied immutable checklist, original transcript message IDs, and a Pydantic structured JSON response schema. Configuration was checked against the installed SDK and [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output). No sampling/thinking options are assumed.

**No Gemini key was available during implementation.** Real model scoring, multilingual model agreement and real provider latency/cost have therefore not been measured. The normal app shows setup-needed and never substitutes fake scores. Import, transcript browsing, checklist editing and saved-report navigation work without a key. Set `GEMINI_API_KEY` and restart to enable new evaluations.

At most three calls per evaluation, including bounded retries. Usage stores measured input, visible output, reasoning and total tokens, attempts and latency. If rates are configured, estimated USD = `(all measured input × input rate + all measured output/reasoning × output rate) / 1,000,000`. Set `MODEL_INPUT_USD_PER_MILLION` and `MODEL_OUTPUT_USD_PER_MILLION` from your provider billing tier; blank means **unknown**, not free. Prices may change. Failed network/provider requests may have unreported billable usage; the UI flags incomplete usage. No unsupported fixed price claim is made.

Voice transcript transmission is blocked by default. Set `ALLOW_EXTERNAL_LLM_FOR_REAL_CALLS=true` only after explicit data-controller/organizer authorization. Importing/reading a voice transcript does not send it to Gemini. For batches with default settings, filter to Agent chat or select chats individually. Recording playback is direct in the browser with an Open recording fallback; access/expiry/CORS may prevent playback. Original ISO timestamps are preserved; the app does not claim precise audio seek alignment without a known recording origin. No ASR or acoustic emotion model is needed for the official checklist.

## Scoring, versions, and human review

The seeded v1 contains the exact official eight Russian criteria. Criteria and scoring logic are dynamic; add/delete/reorder/replace criteria, change labels, scales, weights, sections and N/A rules in Checklist studio. Saving creates an immutable new version; existing reports remain bound to their original version. Choose the new version to evaluate new/control conversations without code edits.

`earned_i = weight_i × raw_score_i / max_score_i`; total = `100 × sum(earned_i) / sum(applicable weights)`. N/A criteria are excluded from the denominator. Zero denominator → null. `Decimal` arithmetic uses no intermediate point rounding and ROUND_HALF_UP for the final two decimals (an engineering tie choice). C04 only accepts 0/5/10/15/20; C06 only 0/4/7/10. C08 is a separate flag, with no points or score penalty. The three-minute threshold, tags and attachments are excluded. Section results normalize within their own applicable weights; the official total uses the global formula.

Every criterion has original-language message evidence; omissions have checked spans and N/A has a reason. Evidence chips scroll/highlight the precise transcript. Structural validation cannot prove semantic correctness or financial policy accuracy. Provisional financial assessments require review/fact-verification flags.

An appeal targets one criterion with a required comment. Reviewer mode allows confirm/change with a required reason, validated against the original scale and N/A rules. A transaction records before/after judgments and totals and recomputes the final score. Original AI results remain unchanged. Re-evaluating deliberately creates a new run; batch retries create new runs/jobs for failed items. Version comparison shows actual reports and explicitly marks missing evaluations.

## Verification

```sh
.venv/bin/python -m pytest -q
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
# First E2E run only:
npx --prefix frontend playwright install chromium
npm run test:e2e --prefix frontend
```

Backend tests cover official seed/scoring/rounding, strict evidence and score validation, imports/timestamps/roles, appeals and immutable originals, dynamic versioning, batches/retries and credential boundaries. Frontend tests cover evidence highlighting/missing anchors, N/A/gross flags, voice UI, editing/version save and appeal/reviewer behavior. Playwright runs against a separate `.private/e2e.db` with an explicitly injected **test-only** provider and visible TEST MODE banner; it exercises import → evaluate → evidence → appeal → changed total → replacement criterion/v2 → re-evaluate → compare, plus batch and responsive navigation. Test output is never presented as real AI quality measurement. The fake provider lives only in `backend/tests/`; the normal server has no fake-provider configuration switch.

Actual results: **61 backend tests, 8 frontend tests and 2 end-to-end tests passed**, plus typecheck, lint, production build, dependency checks, organizer import and normal-server browser smoke. See the [verification record](docs/verification.md) for scope and limits.

## Architecture and handoff

- [Architecture and Dynamics 365 adaptation](docs/architecture.md)
- [API contract](docs/api.md)
- [Exact scoring and validation behavior](docs/evaluation_rules.md)
- [Five-minute demo script and control release](docs/demo.md)
- [Secrets, PII and local prototype boundaries](docs/security_notes.md)

React/Vite/TypeScript, local bundled fonts, semantic controls and keyboard focus states form the frontend. FastAPI/Pydantic, SQLite WAL with foreign keys/unique indexes/immutable-record triggers, `httpx`, a bounded in-process worker and the Gemini adapter form the backend. SQLite is intentionally the only database adapter in this prototype; `DATABASE_URL` selects its file. PostgreSQL/distributed queues, actual authentication/authorization, migrations beyond initial schema v1 and audio analytics are future production work.

Real calls may contain personal data. Keep transcripts, raw model responses, evaluation exports and recording links controlled; they are not repository fixtures. Do not publish the local database or `.env`. The demo role switch is not authentication. The initial local build performed no remote push or deployment; repository integration is documented in the root README.
