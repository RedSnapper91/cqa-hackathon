import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8011',
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'cd .. && mkdir -p .private && rm -f .private/e2e.db .private/e2e.db-shm .private/e2e.db-wal && CQA_E2E_TEST=1 .venv/bin/python scripts/e2e_server.py',
      url: 'http://127.0.0.1:8011/api/health',
      timeout: 30000,
      reuseExistingServer: false,
    },
    {
      command:
        'cd .. && mkdir -p .private && rm -f .private/team-e2e.db .private/team-e2e.db-shm .private/team-e2e.db-wal && CQA_E2E_TEST=1 CQA_E2E_TARGET=team .venv/bin/python scripts/e2e_server.py',
      url: 'http://127.0.0.1:8012/api/health',
      timeout: 30000,
      reuseExistingServer: false,
    },
    {
      command: 'cd .. && CQA_BACKEND_URL=http://127.0.0.1:8012 PORT=3211 node server.js',
      url: 'http://127.0.0.1:3211/api/health',
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
});
