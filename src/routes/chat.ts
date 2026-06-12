import { Router, Request, Response } from 'express'
import type Anthropic from '@anthropic-ai/sdk'
import anthropic from '../lib/anthropic.js'
import SYSTEM_PROMPT from '../lib/prompt.js'
import { toolDefinitions, ejecutarTool } from '../tools/index.js'
import type { ChatRequestBody, StreamEvent } from '../types/chat.js'
import type { ToolName, ToolInput } from '../types/tools.js'

const router = Router()

// Labels visibles en el stream por cada tool
const TOOL_LABELS: Record<ToolName, string> = {
  buscar_documentacion:     '🔍 Buscando en documentación...',
  ver_eventos:              '⚙️  Obteniendo eventos...',
  ver_ventas_evento:        '⚙️  Cargando ventas del evento...',
  actualizar_precio_evento: '⚙️  Actualizando precio...',
  resumen_cuenta:           '⚙️  Calculando resumen de cuenta...',
}

router.post('/', async (req: Request<object, object, ChatRequestBody>, res: Response) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'El campo messages es requerido.' })
    return
  }

  // Configurar SSE para streaming
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (data: StreamEvent): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // ── Agentic loop ─────────────────────────────────────
    // Claude corre hasta que llega a 'end_turn'.
    // En cada iteración puede llamar una tool, recibir el resultado
    // y decidir si llama otra o ya responde.

    let conversacion: Anthropic.MessageParam[] = messages
    let sourceUrl: string | undefined

    while (true) {
      send({ type: 'step', text: '🤔 Pensando...' })

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages: conversacion,
      })

      // Respuesta final — salimos del loop
      if (response.stop_reason === 'end_turn') {
        const texto = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')

        send({ type: 'response', text: texto, source: sourceUrl })
        break
      }

      // Claude quiere usar una tool
      if (response.stop_reason === 'tool_use') {
        const toolCall = response.content.find(
          (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } =>
            b.type === 'tool_use'
        )

        if (!toolCall) break

        const toolName = toolCall.name as ToolName
        const label = TOOL_LABELS[toolName] ?? `⚙️  Ejecutando ${toolCall.name}...`
        send({ type: 'step', text: label })

        const resultado = await ejecutarTool(toolName, toolCall.input as ToolInput)

        // Guardamos la URL de fuente si vino de documentación
        if (
          toolName === 'buscar_documentacion' &&
          'resultados' in resultado &&
          resultado.resultados?.[0]?.url
        ) {
          sourceUrl = resultado.resultados[0].url
        }

        send({ type: 'step', text: '✅ Listo, armando respuesta...' })

        // Agregamos el resultado al historial para continuar el loop
        conversacion = [
          ...conversacion,
          { role: 'assistant' as const, content: response.content },
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: JSON.stringify(resultado),
              },
            ],
          },
        ]
      } else {
        // stop_reason inesperado (max_tokens, stop_sequence, etc.)
        break
      }
    }
  } catch (err) {
    console.error('Error en el agente:', err)
    send({ type: 'error', text: 'Ocurrió un error interno. Intentá de nuevo.' })
  } finally {
    res.end()
  }
})

export default router
