import { createFileRoute } from '@tanstack/react-router'
import { ChatWorkstreamsScreen } from '../../screens/chat/chat-workstreams-screen'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  component: ChatWorkstreamsScreen,
})
