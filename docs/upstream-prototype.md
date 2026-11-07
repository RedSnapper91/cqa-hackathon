> Historical upstream notes. Startup, model and storage descriptions below are superseded by the root README and the shared FastAPI integration.

# CQA — Conversation Quality Analytics

Прототип для хакатона Freedom Broker: оценка работы операторов по чек-листу, обоснования с переходом к репликам, апелляции и пересмотр. Интерфейс на чистом HTML/CSS/JS, сервер на Node.js **без внешних зависимостей**.

## Запуск

Нужен Node.js 18+.

1. Скопируйте `config.local.example.json` в `config.local.json` и вставьте в `api_url` ссылку с кнопки «Открыть GET для DEV» из PDF организаторов. Ссылка подписана (`sig=…`), поэтому `config.local.json` в git не попадает. Вместо файла можно задать переменную `CQA_API_URL`.
2. Запустите сервер:

```bash
npm start
```

Откройте http://localhost:3210. При первом старте сервер сам загрузит набор DEV (65 диалогов) и сохранит снимок в `data/dataset-DEV.json`, после чего демо работает и без сети. Снимок тоже не коммитится: в нём подписанные ссылки на записи звонков.

Порт можно сменить: `node server.js --port 8080` или `PORT=8080 npm start`.

Тесты арифметики чек-листа: `npm test`.

## Что умеет

| Раздел | Возможности |
|---|---|
| **Дашборд** | средний балл, распределение итогов, выполнение каждого критерия, разрез RU/KZ/EN, зона риска (грубые ошибки и худшие диалоги), «Оценить все» |
| **Диалоги** | фильтры по языку, каналу, статусу, набору; поиск; массовая оценка выбранных или показанных диалогов выбранным чек-листом с прогресс-баром |
| **Карточка диалога** | транскрипт (оператор, клиент, бот и система как контекст); у звонков — плеер с переходом к моменту реплики (▶) с учётом пауз записи; итог, секции, по каждому критерию — ответ, баллы, эффективный вес, обоснование, чипы-доказательства (клик → прокрутка к реплике), «Проверено #a–#b» для пропущенных действий, причина N/A; история оценок по версиям чек-листа; «Оспорить» |
| **Чек-листы** | редактор критериев (формулировка, вес, тип Да/Нет · шкала · флаг, N/A и его правило, ступени шкалы, секция), порядок, копирование, удаление; живой предпросмотр перераспределения веса при N/A; версии; «Применить к диалогам» |
| **Апелляции** | открытые и решённые; проверяющий видит спорную оценку, обоснование, комментарий и фрагмент диалога, подтверждает или меняет оценку с причиной; итог пересчитывается, в карточке видны исходная оценка, решение и финальный балл |
| **Импорт** | загрузка по `group_id` из API организаторов (через сервер, без CORS), JSON-файл, вставка транскрипта текстом; описание контракта модели |
| Ещё | RU / KZ / EN интерфейс, тёмная и светлая тема, адаптивная вёрстка, экспорт CSV |

## Расчёт баллов (`lib/scoring.js`)

Реализует правила со стр. 2 чек-листа и используется и сервером, и браузером:

1. N/A — только там, где он разрешён.
2. «Да» — полный вес, «Нет» — 0; шкала — пропорционально, верхняя ступень даёт полный вес.
3. Критерии с N/A исключаются, их вес пропорционально перераспределяется: `итог = Σ заработанное / Σ веса применимых × 100`.
4. Итог округляется до 2 знаков; если применимых взвешенных критериев нет, итог не считается.
5. Грубые ошибки — флаг без баллов, показываются отдельно.

Апелляции не меняют исходную оценку: финальный результат = исходные ответы + решения проверяющих.

## Модель оценки — сейчас заглушка

Пока работает офлайн-движок правил (`lib/rules-engine.js`): детекторы для RU/KZ/EN по каждому из 8 критериев и детектор по ключевым словам для новых критериев. Он выдаёт ответ, обоснование, номера реплик-доказательств, проверенный участок и уверенность.

Рабочая модель подключается одной переменной окружения, без правки интерфейса:

```bash
CQA_MODEL_URL=https://my-model/evaluate CQA_MODEL_NAME="my-model" npm start
```

Сервер отправляет `POST` на этот адрес для каждого диалога (формат запроса и ответа — в `lib/model-adapter.js` и на странице «Импорт»). Ответы модели проверяются и приводятся к допустимым значениям чек-листа. Если модель недоступна или ответила с ошибкой, оценку делает офлайн-движок, а в карточке видна причина. Дополнительно: `CQA_MODEL_TOKEN` (Bearer), `CQA_MODEL_TIMEOUT_MS`, `CQA_CONCURRENCY`.

## Контрольный набор (через 23 часа)

1. **Импорт** → введите выданный `group_id` → «Загрузить».
2. «Оценить набор» (или **Чек-листы** → «Применить к диалогам» → нужный набор).

Замена критерия: **Чек-листы** → раскройте критерий → измените название, формулировку, вес, тип или N/A → «Сохранить как новую версию» (она сразу становится активной) → «Применить к диалогам». Старые оценки остаются в истории диалога.

## Структура

```
server.js               HTTP API + статика (только встроенные модули Node)
lib/scoring.js          арифметика чек-листа (общая для сервера и браузера)
lib/default-checklist.js  8 критериев из PDF
lib/rules-engine.js     офлайн-движок (заглушка модели)
lib/model-adapter.js    точка подключения рабочей модели
lib/dataset.js          API организаторов, нормализация, аудио, смещения звонков
lib/store.js            JSON-хранилище data/db.json
public/                 интерфейс: index.html, css/app.css, js/*.js, js/views/*.js
tests/scoring.test.js   проверки расчёта
```

Чтобы сбросить демо-данные, удалите `data/db.json` и перезапустите сервер.

## Dynamics 365

Интерфейс — набор ES-модулей без сборки и фреймворков, монтируется в `#cqa-app`. Для web resource задайте адрес сервиса до загрузки `main.js`:

```html
<script>window.CQA_CONFIG = { apiBase: 'https://cqa.example.com' };</script>
```

CORS настраивается через `CQA_CORS_ORIGIN`. Хранилище `lib/store.js` изолировано и заменяется на таблицы Dataverse без изменения API.

## API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/conversations`, `/api/conversations/:id` | список и карточка (с историей оценок) |
| POST | `/api/datasets/load` `{group_id}` | загрузить набор из API организаторов |
| POST | `/api/conversations/upload` | JSON или текстовый транскрипт |
| GET/POST | `/api/checklists`, `/api/checklists/:id/activate` | версии чек-листа |
| POST | `/api/evaluate` `{conversation_ids \| group_id, checklist_id}` | оценка (1 диалог — синхронно, иначе фоновая задача) |
| GET | `/api/jobs/:id` | прогресс фоновой оценки |
| POST | `/api/evaluations/:id/appeals` | подать апелляцию |
| GET | `/api/appeals` · POST `/api/appeals/:id/decision` | очередь и решение проверяющего |
| GET | `/api/audio/:id` | прямая ссылка на запись звонка |
| GET | `/api/stats`, `/api/export.csv` | дашборд и выгрузка |

---

## Python-сервис модели (baseline команды)

В корне репозитория также лежит заготовка сервиса оценки на FastAPI (`main.py`, `requirements.txt`, `example-request.json`). Сейчас `POST /evaluate` только проверяет запрос и отвечает 503 `ai_not_connected`. Формат его запроса пока отличается от контракта `CQA_MODEL_URL` (см. раздел «Модель оценки»). Чтобы веб-приложение отправляло диалоги в этот сервис, один из форматов нужно привести к другому.

Ниже исходное описание сервиса.

### CQA API connection baseline

This is a first backend scaffold, not a functioning AI evaluator. It does not score conversations. A valid POST /evaluate returns HTTP 503 with status ai_not_connected and score null. This is intentional: it confirms request validation without presenting invented scores as model output.

### Start on Windows

1. Install Python from https://www.python.org/downloads/windows/ if needed. This project requires Python 3.10 or newer; Python 3.12 is a suitable choice. Reopen terminals after installation.
2. Extract this ZIP. Open the extracted folder containing main.py and start.cmd.
3. Double-click start.cmd. It creates a project-only environment, installs dependencies from requirements.txt, and starts the local server. Internet access is needed for the first dependency installation.
4. Leave the black terminal window open. Wait for `Uvicorn running on http://127.0.0.1:8000`.
5. Open http://127.0.0.1:8000/docs.
6. Expand GET /health. Click Try it out, then Execute. Expect HTTP 200 and {"status":"ok","ai_connected":false}.
7. Expand POST /evaluate. Click Try it out. Replace its Request body with the complete contents of example-request.json, then click Execute.
8. Expect HTTP 503 with status ai_not_connected, received_messages 2, received_criteria 1 and score null. A 422 response instead means the request format is invalid.
9. Press Ctrl+C in the server window to stop. Double-click start.cmd to run again.

### Manual alternative

Open the extracted folder in File Explorer. Click the address bar, type powershell and press Enter. Run each command separately:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

No environment activation or execution-policy change is required.

### API contract for the frontend teammate

- GET /health: server availability and AI connection status.
- POST /evaluate: JSON with conversation_id, language (RU/KZ/EN), transcript (timestamp/speaker/text), and checklist (id/instruction/weight).
- The checklist format is deliberately minimal. It still needs answer types, allowed numeric steps, N/A conditions, sections, and separate gross-violation flags to meet the complete brief.
- CORS currently permits localhost and 127.0.0.1 on ports 3000 and 5173. Add the frontend's actual origin to allow_origins when needed.
- The server is local only. A teammate on another computer cannot use your 127.0.0.1 address. Deploy it or configure network access separately.
- No storage, appeals, organiser API import, model call, scoring engine, or audio processing exists yet.

### Next implementation milestone

Choose the model provider and obtain access credentials. Add a real server-side model call, validated criterion results with message references, and a deterministic weighted scoring function. Then compare real results with independently labelled conversations. Do not replace the current 503 with made-up successful assessments.

### Add to GitHub

Upload the source files, not the ZIP, .venv folder, private call data, or API keys. Include .gitignore as well. If you already cloned the team repository, copy these files into that existing project and commit them there. Otherwise download GitHub Desktop, sign in, clone the team repository, copy the source files into it, then commit and push. Creating or uploading the repository does not host this server.

### Troubleshooting

- Port 8000 already in use: stop an older server with Ctrl+C, or change the final command to use --port 8001 and visit http://127.0.0.1:8001/docs.
- Browser cannot connect: confirm the server window is still open and shows the Uvicorn running message.
- Missing modules: rerun start.cmd and inspect dependency installation errors.
- 503 ai_not_connected: expected for this scaffold, not a failed installation.
- Keep API credentials out of public repositories. No credentials are needed to test this baseline.

### Verification

Validation and endpoint-handler checks cover health output, a valid request receiving the explicit unconfigured exception, invalid input rejection and OpenAPI schema generation. Live HTTP startup could not be verified in the restricted test environment; follow the browser checks above on your computer. No model has been connected and no recognition accuracy has been measured.
