import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Qualification runner: never load Vite's service-autostart plugins.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: [
      'src/server/openbrain.test.ts',
      'src/routes/api/-openbrain-stats.test.ts',
      'src/screens/dashboard/components/openbrain-card.test.tsx',
    ],
    environment: 'node',
  },
})
