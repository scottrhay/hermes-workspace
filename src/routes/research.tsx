import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ResearchScreen } from '@/screens/research/research-screen'

export const Route = createFileRoute('/research')({
  ssr: false,
  component: ResearchRoute,
})

function ResearchRoute() {
  usePageTitle('Research')
  return <ResearchScreen />
}
