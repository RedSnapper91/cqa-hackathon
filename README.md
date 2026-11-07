# CQA API connection baseline

This is a first backend scaffold, not a functioning AI evaluator. It does not score conversations. A valid POST /evaluate returns HTTP 503 with status ai_not_connected and score null. This is intentional: it confirms request validation without presenting invented scores as model output.

## Start on Windows

1. Install Python from https://www.python.org/downloads/windows/ if needed. This project requires Python 3.10 or newer; Python 3.12 is a suitable choice. Reopen terminals after installation.
2. Extract this ZIP. Open the extracted folder containing main.py and start.cmd.
3. Double-click start.cmd. It creates a project-only environment, installs dependencies from requirements.txt, and starts the local server. Internet access is needed for the first dependency installation.
4. Leave the black terminal window open. Wait for `Uvicorn running on http://127.0.0.1:8000`.
5. Open http://127.0.0.1:8000/docs.
6. Expand GET /health. Click Try it out, then Execute. Expect HTTP 200 and {"status":"ok","ai_connected":false}.
7. Expand POST /evaluate. Click Try it out. Replace its Request body with the complete contents of example-request.json, then click Execute.
8. Expect HTTP 503 with status ai_not_connected, received_messages 2, received_criteria 1 and score null. A 422 response instead means the request format is invalid.
9. Press Ctrl+C in the server window to stop. Double-click start.cmd to run again.

## Manual alternative

Open the extracted folder in File Explorer. Click the address bar, type powershell and press Enter. Run each command separately:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

No environment activation or execution-policy change is required.

## API contract for the frontend teammate

- GET /health: server availability and AI connection status.
- POST /evaluate: JSON with conversation_id, language (RU/KZ/EN), transcript (timestamp/speaker/text), and checklist (id/instruction/weight).
- The checklist format is deliberately minimal. It still needs answer types, allowed numeric steps, N/A conditions, sections, and separate gross-violation flags to meet the complete brief.
- CORS currently permits localhost and 127.0.0.1 on ports 3000 and 5173. Add the frontend's actual origin to allow_origins when needed.
- The server is local only. A teammate on another computer cannot use your 127.0.0.1 address. Deploy it or configure network access separately.
- No storage, appeals, organiser API import, model call, scoring engine, or audio processing exists yet.

## Next implementation milestone

Choose the model provider and obtain access credentials. Add a real server-side model call, validated criterion results with message references, and a deterministic weighted scoring function. Then compare real results with independently labelled conversations. Do not replace the current 503 with made-up successful assessments.

## Add to GitHub

Upload the source files, not the ZIP, .venv folder, private call data, or API keys. Include .gitignore as well. If you already cloned the team repository, copy these files into that existing project and commit them there. Otherwise download GitHub Desktop, sign in, clone the team repository, copy the source files into it, then commit and push. Creating or uploading the repository does not host this server.

## Troubleshooting

- Port 8000 already in use: stop an older server with Ctrl+C, or change the final command to use --port 8001 and visit http://127.0.0.1:8001/docs.
- Browser cannot connect: confirm the server window is still open and shows the Uvicorn running message.
- Missing modules: rerun start.cmd and inspect dependency installation errors.
- 503 ai_not_connected: expected for this scaffold, not a failed installation.
- Keep API credentials out of public repositories. No credentials are needed to test this baseline.

## Verification

Validation and endpoint-handler checks cover health output, a valid request receiving the explicit unconfigured exception, invalid input rejection and OpenAPI schema generation. Live HTTP startup could not be verified in the restricted test environment; follow the browser checks above on your computer. No model has been connected and no recognition accuracy has been measured.
