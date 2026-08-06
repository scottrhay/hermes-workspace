import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'mission-control-smoke.spec.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001',
  },
})

