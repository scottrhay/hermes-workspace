import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Isolated qualification: no service-autostart plugins.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: [
    'src/routes/api/-models.test.ts',
    'src/routes/api/-telegram-topic-create.test.ts',
    'src/routes/api/mcp/-hub-search.test.ts',
    'src/routes/reserve/-confirmation-search.test.ts',
    'src/screens/mcp/-marketplace-install-confirmation.test.tsx',
    'src/server/__tests__/server-hermes-auth.test.ts',
    'src/server/__tests__/server-remote-access.test.ts',
  ] },
})
