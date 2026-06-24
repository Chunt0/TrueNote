import { defineConfig, devices } from '@playwright/test'

// E2E against the production-style single process: the API serves the built SPA
// (STATIC_DIR) + the API on one port — same as `docker compose up`. The server
// uses a throwaway DB + docs dir, dev auth, git off, and no LLM key.
const PORT = 4321
const BUN = '/home/chunt/.bun/bin/bun'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      `rm -rf /tmp/tn-e2e.db /tmp/tn-e2e.db-shm /tmp/tn-e2e.db-wal /tmp/tn-e2e-wiki && ` +
      `DATABASE_PATH=/tmp/tn-e2e.db AUTH_TOKEN=e2e-token DOCS_DIR=/tmp/tn-e2e-wiki ` +
      `AUTH_MODE=dev GIT_VERSIONING=off NODE_ENV=development PORT=${PORT} ` +
      `STATIC_DIR=packages/frontend/dist LOG_LEVEL=warn ${BUN} packages/api/src/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
