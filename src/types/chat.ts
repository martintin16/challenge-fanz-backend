// Roles posibles en una conversación con Claude
export type MessageRole = 'user' | 'assistant'

// Mensaje del historial de conversación
export interface ChatMessage {
  role: MessageRole
  content: string
}

// Eventos SSE que el backend manda al frontend
export type StreamEventType = 'step' | 'response' | 'error'

export interface StreamEvent {
  type: StreamEventType
  text: string
  source?: string
}

// Body esperado en POST /api/chat
export interface ChatRequestBody {
  messages: ChatMessage[]
}
