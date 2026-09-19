import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
// Use the preinstalled Chromium when present (CI images / sandboxes); otherwise Playwright's own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    geolocation: { latitude: 28.4952, longitude: 77.0888 },
    permissions: ['geolocation'],
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : {} } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} } },
  ],
  webServer: [
    {
      command: 'npx tsx apps/api/src/index.ts',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { PORT: String(API_PORT), PERSISTENCE: 'memory', PROVIDER_MODE: 'mock', DEMO_MODE: 'true', LOG_LEVEL: 'warn', RATE_LIMIT_MAX: '5000' },
    },
    {
      command: 'npm run dev -w @sanjeevani/web',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { PORT: String(WEB_PORT), API_INTERNAL_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
