import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/*
 * End-to-end tests: the real API (serving the committed dataset snapshot) and the Vite dev server.
 * Locally, servers already running (`job-analyzer serve`, `npm run dev`) are reused.
 */
const CI = Boolean(process.env.CI)

// The backend's virtualenv when there is one (local dev), else the PATH (CI installs globally).
const venvBin = process.platform === 'win32' ? '.venv\\Scripts\\' : '.venv/bin/'
const apiCommand = `${existsSync(`../backend/${venvBin}`) ? venvBin : ''}job-analyzer serve`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: [
    {
      command: apiCommand,
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: { VITE_API_BASE_URL: 'http://localhost:8000' },
    },
  ],
})
