# Verification record — 7 November 2026 (Asia/Almaty)

| Check actually run | Result |
|---|---|
| `.venv/bin/python -m pytest -q` | 61 passed |
| `npm test --prefix frontend` | 8 passed |
| `npm run test:e2e --prefix frontend` | 2 passed; complete review/version workflow and batch/responsive workflow |
| `npm run typecheck --prefix frontend` | Passed |
| `npm run lint --prefix frontend` | Passed |
| `npm run build --prefix frontend` | Passed; Vite production HTML/CSS/JS and local fonts |
| `.venv/bin/ruff check backend scripts --select F` | Passed |
| `.venv/bin/ruff format --check backend scripts` | Passed |
| `npm audit --prefix frontend --json` | Zero vulnerabilities across runtime and development dependencies |
| `.venv/bin/python -m pip check` | No broken requirements |
| Actual organizer DEV import | 65 inserted; 35 RU, 15 KZ, 15 EN; 60 chats and 5 voice calls |
| Normal production-server browser smoke | Six pages, actual DEV count, original KZ transcript, no TEST MODE or fake evaluation, key-needed feedback, zero browser errors |
| Source credential scan + Git exclusions | Passed; endpoint/signature absent from source candidates; `.env`, DB, test DB, build/caches excluded |

The complete Playwright flow imports the synthetic fixture, evaluates using an explicitly injected **test-only** provider, highlights exact evidence, submits an appeal, changes a criterion, verifies the finalized total changes 100.00 → 90.00 with original 100.00 preserved, replaces a criterion in the UI, saves v2, re-evaluates and compares v1/v2. Another test runs a nine-chat batch and checks desktop/mobile navigation without document overflow. A frontend regression test prevents a previously loaded run from appearing as the result of a newly selected run. Backend tests also cover precise 81.88 rounding, unknown/invalid scales, N/A constraints, exact original-script quotes, voice timestamps, three-attempt failures, bounded workers, interrupted-job recovery, immutable audit records, and review persistence across app restarts.

All model output in those automated flows is visibly labeled TEST MODE, not real AI judgment. The test harness uses a separate ignored database and port 8011; normal app port 8000 uses the actual local DEV database.

No Gemini API key was available. Genuine provider scoring/latency/cost and human agreement on 3 RU + 3 KZ + 3 EN samples were not measured. No call recordings were downloaded or sent externally. Signed recording playback depends on remote access/URL lifetime; the synthetic call's example recording is intentionally unavailable. These limitations are explicit in the app, README and demo instructions.

SQLite and an in-process worker are intentional local-prototype tradeoffs. The schema has version 1, and is initialized idempotently; this is not a PostgreSQL/distributed-worker deployment. No public hosting, remote push, or authentication claims are made.
