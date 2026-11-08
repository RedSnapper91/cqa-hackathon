# First repository/API integration test

The local repository is connected to `https://github.com/RedSnapper91/cqa-hackathon.git`, based on the existing team history. The team UI is preserved and its payloads are translated by `lib/backend-client.js` to the authoritative FastAPI API. `server.js` serves only public UI assets and compatibility routes; it does not import the legacy rule engine or JSON store. The existing Python module entrypoint now starts the complete backend.

Both UIs use the same SQLite conversation/message IDs, immutable checklist versions, evaluation runs, appeals and reviewer decisions. Active checklist selection from the team UI is stored in a small backend preferences table. Internal conversation IDs remain navigation keys; external organizer IDs are shown to people.

Gemini remains unconfigured by explicit user request. A normal evaluation request returns HTTP 503 and leaves the run count unchanged. No real model evaluation, model agreement, price or latency claim is made.

The automated team-UI browser workflow uses its own ignored `team-e2e.db`, backend on 8012 and gateway on 3211. It verifies a completed fixture evaluation, original transcript evidence, an appeal, a required reviewer reason, a recomputation from 100.00 to 90.00 with original 100.00 preserved, a replacement criterion saved as v2 and a new evaluation against that version. The UI displays TEST MODE throughout. React browser workflows use a different isolated database on 8011.

Run `npm start`, then `npm run test:first-api` for a normal-mode HTTP check. This imports DEV through the organizer connector when configured; `--demo` chooses local synthetic data. Output contains aggregate counts only. The script never initiates a paid model call.

Final command results and normal-mode DEV import counts are recorded after verification below.

## Results actually run

| Check | Result |
|---|---|
| `npm run test:first-api` | PASS against actual organizer DEV API: 65 conversations; RU 35 / KZ 15 / EN 15; 60 chats / 5 calls |
| Placeholder evaluation through gateway | Expected HTTP 503, no new evaluation run, zero paid model calls |
| Normal-mode browser smoke on team UI | All five routes loaded; 65 records visible; placeholder feedback shown; no fake reports or browser errors |
| CSV gateway export | 65 data rows; no organizer signatures or recording URLs |
| `npm test` | Original scoring checks and 5 new gateway/API adapter tests passed |
| `.venv/bin/python -m pytest -q` | 62 passed |
| `npm test --prefix frontend` | 8 passed |
| `npm run test:e2e --prefix frontend` | All 3 workflows passed: team UI/API integration, React appeal/version comparison, React batch/mobile |
| Additional team browser check | Voice player present, original ISO timestamp with offset preserved, no guessed seek controls |
| Frontend typecheck, lint and production build | Passed |
| Python Ruff checks and dependency consistency | Passed |

The real model is deliberately left as a placeholder. Automated scoring in the full workflow is a deterministic test fixture in an isolated database, not evidence of model accuracy.
