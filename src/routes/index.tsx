import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DashboardScreen } from '@/screens/dashboard/dashboard-screen'

export const Route = createFileRoute('/')({
  ssr: false,
  component: MissionControlDashboardRoute,
})

function MissionControlDashboardRoute() {
  usePageTitle('Mission Control')
  return <DashboardScreen />
}
