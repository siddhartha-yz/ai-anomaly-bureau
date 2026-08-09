import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

const localChrome = resolve('.tooling/chrome/opt/google/chrome/chrome')
const localLibs = resolve('.tooling/chrome-libs/root/usr/lib/x86_64-linux-gnu')
const localFontConfig = resolve('.tooling/fontconfig/fonts.conf')
const useLocalChrome = existsSync(localChrome) && existsSync(localLibs)
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseURL ?? 'http://127.0.0.1:4174'

if (useLocalChrome) {
  process.env.LD_LIBRARY_PATH = [localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  process.env.HOME = resolve('.tooling/home')
  process.env.TMPDIR = resolve('.tooling/tmp')
  if (existsSync(localFontConfig)) process.env.FONTCONFIG_FILE = localFontConfig
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(useLocalChrome ? { executablePath: localChrome } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
    },
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4174',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
