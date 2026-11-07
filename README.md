# CQA Intelligence — connected frontend and backend

Freedom Broker / CQA hackathon application for RU/KZ/EN conversations. The existing team interface in `public/` now connects through the Node API gateway to the full FastAPI backend. The React interface in `frontend/` uses that same backend directly. Both interfaces share one SQLite database, immutable checklist versions, validated scores, evidence and appeal history.

**Gemini remains a placeholder, as requested.** Without a configured provider, evaluation returns HTTP 503 and creates no evaluation or invented score. Automated workflow tests use a clearly labeled, isolated test provider; normal startup cannot enable it.

## Run the integrated application

Requires Python 3.11+ and Node.js 22.12+.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm ci --prefix frontend
# Fresh checkout only: preserve an existing configured .env.
cp .env.example .env
npm run build --prefix frontend
npm start
```

`npm start` starts FastAPI if it is not already running, waits for its health endpoint and starts the team frontend gateway. Ctrl+C stops the processes owned by the launcher.

| Component | URL / source |
|---|---|
| Team frontend | **http://127.0.0.1:3210** — `public/` |
| React frontend | **http://127.0.0.1:8000** — built from `frontend/` |
| Shared FastAPI/OpenAPI | **http://127.0.0.1:8000/docs** — `backend/app/` |
| API gateway | `server.js` and `lib/backend-client.js` |
| Provider boundary | `backend/app/services/llm_provider.py` |

To run processes separately, use `make run` for FastAPI and `npm run start:frontend` for the team UI. `make dev` runs FastAPI plus the React Vite development server on port 5173. `CQA_BACKEND_URL` selects an already-running backend for the Node gateway; `PORT` changes the frontend port. Credentials stay in the backend `.env`, never in either frontend or in `CQA_BACKEND_URL`.

Windows: create the environment with `py -3 -m venv .venv`, install with `.venv\Scripts\python.exe -m pip install -r requirements.txt`, and use `Copy-Item .env.example .env` on a fresh checkout. `npm start` selects the Windows virtualenv executable automatically. The optional Playwright server harness uses POSIX shell commands; run it under WSL on Windows.

## First HTTP API test

With `npm start` running, open a second terminal:

```sh
npm run test:first-api
```

This tests the **team frontend API → Node gateway → FastAPI → organizer API → shared database** connection. It imports/reimports DEV, verifies conversations, roles, raw timestamps, checklist configuration and dashboard counts, and checks that placeholder evaluation returns HTTP 503 without creating a run. It prints aggregate results only, never credentials or transcript text. It makes **zero paid model calls**, even if a provider is later configured.

On a fresh checkout without organizer credentials, it uses the labeled synthetic demo. To force a fully offline import test:

```sh
npm run test:first-api -- --demo
```

The full business workflow is exercised independently by browser tests: import → evaluation using an explicit test-only provider → exact evidence → appeal → human decision → deterministic recomputation with original preserved → checklist v2 → re-evaluation. One browser test now runs this entire flow through the existing team UI and Node/FastAPI API connection; the other tests cover the React UI, version comparison, batches and responsive navigation.

## Verification commands

```sh
npm test                                      # original scoring checks + 5 gateway tests
.venv/bin/python -m pytest -q                  # 62 backend tests
npm test --prefix frontend                    # 8 frontend tests
npm run typecheck --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
npx --prefix frontend playwright install chromium  # first run only
npm run test:e2e --prefix frontend             # 3 browser workflows, both frontends
.venv/bin/ruff check backend scripts main.py --select F
```

Browser tests use separate ignored databases on backend ports 8011/8012 and a test gateway on 3211. They never write fake assessments to the normal DEV database. See [the integration test record](docs/first-integration-test.md) for the actual results and model-placeholder boundary, and [the original verification record](docs/verification.md) for the underlying implementation checks.

## Data, model replacement and privacy

The actual DEV dataset was imported locally: **65 conversations, 35 RU / 15 KZ / 15 EN, 60 chats and 5 calls**. Source records and recording links remain in ignored `cqa.db`; a fresh checkout starts empty. Import through the team Import page or the React Import dataset dialog. A new control `group_id` and new checklist criteria need no source change.

Set `ORGANIZER_DEV_API_URL` in backend `.env` using the signed PDF hyperlink, or run `scripts/extract_dev_api_url.py`. The connector preserves the signature and changes only `group_id`; neither frontend receives the signed endpoint. Repeated import is idempotent; changed records require a new dataset group so old evidence stays valid. JSON upload and pasted transcripts go through backend validation.

The live Gemini adapter is isolated behind `LLMProvider`. `GEMINI_MODEL` changes the Gemini model ID; another provider can replace the adapter without changing either UI or the scoring/review services. Leave `GEMINI_API_KEY` blank while the model is a placeholder. Real provider accuracy, cost and latency have not been measured. Configure per-million rates if cost estimates are needed later; blank rates mean unknown.

The seeded v1 has the exact eight Russian criteria. Scoring uses backend Decimal arithmetic, N/A denominator redistribution and two-decimal half-up rounding. C04 accepts only 0/5/10/15/20; C06 only 0/4/7/10; C08 is a separate flag without a numeric penalty. The gateway maps the existing UI's payloads to this strict contract and never snaps an invalid model answer to a permitted score. The old keyword evaluator and JSON store remain as historical source files but **are not imported or used by the integrated server**. The browser's checklist weight sandbox is only a preview; persisted totals and review recomputation come from FastAPI.

Real call transcripts may contain personal data. External processing of calls stays blocked unless explicitly authorized with `ALLOW_EXTERNAL_LLM_FOR_REAL_CALLS=true`. No ASR or acoustic model is used. Both UIs preserve original timestamps and do not claim exact recording seek alignment without a known origin. The team frontend opens recording links directly rather than fetching arbitrary audio URLs server-side.

This is a local hackathon prototype, not a deployed banking service. SQLite and one in-process bounded worker are intentional tradeoffs. Reviewer mode is a demonstration control, not authentication. Keep `.env`, databases, private snapshots and exported real evaluations out of public source control.

## Further documentation

- [API contract](docs/api.md) and [scoring/evidence rules](docs/evaluation_rules.md)
- [Architecture and Dynamics 365 adaptation](docs/architecture.md)
- [Five-minute demo script](docs/demo.md)
- [Secrets and local prototype boundaries](docs/security_notes.md)
- [React workspace setup and implementation details](docs/react-workspace.md)
- [Historical upstream prototype notes](docs/upstream-prototype.md) — superseded startup/model contracts
