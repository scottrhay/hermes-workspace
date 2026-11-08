import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) } }, esbuild: { jsx: 'automatic' }, test: { environment: 'node', include: ['src/screens/swarm2/*.test.ts', 'src/screens/swarm2/*.test.tsx', 'src/server/swarm-roster.test.ts'] } })
