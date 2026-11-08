import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Isolated qualification: no application Vite plugins or service startup.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) } },
  test: {
    include: ['src/screens/playground/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
})
