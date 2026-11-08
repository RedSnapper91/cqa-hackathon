.PHONY: setup build run dev test frontend-test e2e check
setup:
	python3 -m venv .venv
	.venv/bin/python -m pip install -r backend/requirements.txt
	npm ci --prefix frontend
build:
	npm run build --prefix frontend
run:
	.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
dev:
	./scripts/dev.sh
test:
	.venv/bin/python -m pytest -q
frontend-test:
	npm test --prefix frontend
e2e: build
	npm run test:e2e --prefix frontend
check: test frontend-test
	.venv/bin/ruff check backend scripts --select F
	npm run typecheck --prefix frontend
	npm run lint --prefix frontend
	npm run build --prefix frontend
