import { useMutation } from '@tanstack/react-query'
import { api, type Payload, unwrap } from '@/lib/api'

export type ChatTurn = Payload<typeof api.assistant.chat.post>
export type ToolActivity = ChatTurn['toolActivity'][number]

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (input: { message: string; history?: ChatHistoryItem[]; context?: string[] }) =>
      unwrap(api.assistant.chat.post(input)),
  })
}
