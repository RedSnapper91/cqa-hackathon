# REST API

Interactive schemas: `http://127.0.0.1:8000/docs`. Error responses use `{ "detail": "message" }` or a list of validation location/message objects. Input bodies and provider/organizer exceptions are not echoed.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health`, `/api/config/status` | Health and non-secret setup status |
| POST | `/api/datasets/import` | Backend connector, `{group_id}` |
| POST | `/api/datasets/import-json` | Multipart `file`, organizer response JSON, 20 MB limit |
| POST | `/api/datasets/demo` | Import clearly synthetic local fixture |
| GET | `/api/datasets`, `/api/dashboard` | Groups and actual latest-run overview |
| GET | `/api/conversations` | Paginated search/filter list |
| GET | `/api/conversations/{id}` | Original transcript and latest report |
| GET | `/api/conversations/{id}/messages` | Stable message IDs, original order/text/timestamps |
| GET | `/api/checklists`, `/api/checklists/{version}` | Immutable versions |
| POST | `/api/checklists` | `{name,parent_id,criteria}` creates a version |
| POST | `/api/checklists/{version}/duplicate` | Duplicate into a new snapshot |
| POST | `/api/evaluations` | `{conversation_id,checklist_version_id}`, returns 202 queued run |
| GET | `/api/evaluations`, `/api/evaluations/{run}` | Paginated runs / full validated report |
| GET | `/api/conversations/{id}/evaluations` | Run history |
| POST | `/api/evaluations/batch` | `{conversation_ids OR group_id,checklist_version_id}` |
| GET | `/api/batches`, `/api/batches/{id}` | Progress and item statuses |
| POST | `/api/batches/{id}/retry` | New batch containing failed items only |
| POST | `/api/appeals` | `{run_id,criterion_id,comment,actor?}` |
| GET | `/api/appeals`, `/api/appeals/{id}` | Queue/history, optional `status`, `run_id` |
| POST | `/api/appeals/{id}/decision` | `{action:confirm\|change,reason,reviewer?,judgment?}` |
| GET | `/api/conversations/{id}/compare?version_a=&version_b=` | Latest actual report for each version |

Conversation filters: `group_id`, `language`, `channel`, `status`, `search`, `checklist_version_id`, `flagged`, `min_score`, `max_score`, `page`, `size` (max 100). Version filter selects the latest run within that version. No version filter selects the latest run overall. Evaluations default to 25 per page.

Every evaluate POST deliberately creates a new run; it is not idempotent. Imports are idempotent on `(group_id,external_id)` and content fingerprint. Reimporting modified content into an existing group is rejected, avoiding evidence corruption. New group IDs accept letters, numbers, underscores and dashes only (1–64 characters). Responses never include the configured organizer endpoint or Gemini key.


## Team frontend gateway

`npm start` also serves the existing `public/` interface on port 3210. Its compatibility routes (`/api/stats`, `/api/evaluate`, `/api/jobs/{id}`, `/api/datasets/load`, `/api/conversations/upload` and existing UI payloads) map to the canonical FastAPI routes above. `lib/backend-client.js` translates response shapes and original/stable evidence IDs; FastAPI remains the authoritative validator, scorer and data store. The gateway never calls the old keyword evaluator, never rounds an invalid score to a nearby scale value and never creates assessments when the provider is unconfigured.

`GET/POST /api/preferences/checklist` on FastAPI stores the active checklist version used by the team interface. POST takes `{checklist_version_id}` and validates that the immutable version exists. The Node frontend uses internal IDs for navigation and displays external organizer IDs. CSV export on the gateway uses stored final results; it does not export signed endpoints or recording URLs.
