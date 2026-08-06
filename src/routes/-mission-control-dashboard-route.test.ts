import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Mission Control primary navigation', () => {
  it('routes the start page and Dashboard bookmarks to the operational insights dashboard', () => {
    const indexRoute = readFileSync(
      resolve(process.cwd(), 'src/routes/index.tsx'),
      'utf8',
    )
    const dashboardRoute = readFileSync(
      resolve(process.cwd(), 'src/routes/dashboard.tsx'),
      'utf8',
    )
    const sidebar = readFileSync(
      resolve(process.cwd(), 'src/screens/chat/components/chat-sidebar.tsx'),
      'utf8',
    )

    expect(indexRoute).toContain("@/screens/dashboard/dashboard-screen")
    expect(indexRoute).toContain('<DashboardScreen />')
    expect(indexRoute).not.toContain('MissionControlHome')
    expect(dashboardRoute).toContain("redirect({ to: '/' })")
    expect(sidebar).toContain("to: '/'")
    expect(sidebar).toContain("label: 'Mission Control'")
    expect(sidebar).toContain("to: '/marketing'")
    expect(sidebar).toContain("label: 'Marketing'")
    expect(sidebar).toContain("to: '/training'")
    expect(sidebar).toContain("label: 'Training'")
    expect(sidebar).not.toContain("to: '/dashboard'")
  })
})
