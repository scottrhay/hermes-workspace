import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { CategoryScreen } from '@/screens/mission-control/category-screen'

export const Route = createFileRoute('/training')({
  ssr: false,
  component: TrainingRoute,
})

function TrainingRoute() {
  usePageTitle('Training Courses')
  return (
    <CategoryScreen
      category="training"
      title="Training Courses"
      description="Telegram workstreams tagged as training"
    />
  )
}

