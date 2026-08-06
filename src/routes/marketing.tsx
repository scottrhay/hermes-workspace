import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { CategoryScreen } from '@/screens/mission-control/category-screen'

export const Route = createFileRoute('/marketing')({
  ssr: false,
  component: MarketingRoute,
})

function MarketingRoute() {
  usePageTitle('Marketing Ideas')
  return (
    <CategoryScreen
      category="marketing"
      title="Marketing Ideas"
      description="Telegram workstreams tagged as marketing"
    />
  )
}

