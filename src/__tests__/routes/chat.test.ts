import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import chatRouter from '../../routes/chat.js'
import anthropic from '../../lib/anthropic.js'
import { ejecutarTool } from '../../tools/index.js'

vi.mock('../../lib/anthropic.js', () => ({
  default: { messages: { create: vi.fn() } },
}))

vi.mock('../../tools/index.js', () => ({
  toolDefinitions: [],
  ejecutarTool: vi.fn(),
}))

vi.mock('../../lib/prompt.js', () => ({
  default: 'System prompt de test',
}))

const mockCreate = vi.mocked(anthropic.messages.create)
const mockEjecutar = vi.mocked(ejecutarTool)

const app = express()
app.use(express.json())
app.use('/', chatRouter)

function parseSseEvents(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const line = chunk.replace(/^data: /, '')
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /chat', () => {
  it('devuelve 400 si no se envían messages', async () => {
    const res = await request(app).post('/').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El campo messages es requerido.' })
  })

  it('devuelve 400 si messages no es un array', async () => {
    const res = await request(app).post('/').send({ messages: 'hola' })
    expect(res.status).toBe(400)
  })

  it('envía eventos SSE correctos en respuesta directa (end_turn)', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '¡Hola! ¿En qué te puedo ayudar?' }],
    } as any)

    const res = await request(app)
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hola' }] })

    const events = parseSseEvents(res.text)
    const stepEvents = events.filter((e) => e.type === 'step')
    const responseEvent = events.find((e) => e.type === 'response')

    expect(stepEvents.length).toBeGreaterThanOrEqual(1)
    expect(responseEvent).toMatchObject({
      type: 'response',
      text: '¡Hola! ¿En qué te puedo ayudar?',
    })
  })

  it('ejecuta el tool y continúa el loop hasta end_turn', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_abc123', name: 'ver_eventos', input: {} }],
      } as any)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Tenés 2 eventos activos.' }],
      } as any)

    mockEjecutar.mockResolvedValue({ eventos: [] })

    const res = await request(app)
      .post('/')
      .send({ messages: [{ role: 'user', content: '¿Cuántos eventos tengo?' }] })

    const events = parseSseEvents(res.text)

    expect(mockEjecutar).toHaveBeenCalledWith('ver_eventos', {})
    expect(events.find((e) => e.type === 'response')).toMatchObject({ text: 'Tenés 2 eventos activos.' })
  })

  it('captura la URL de fuente cuando usa buscar_documentacion', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_doc1', name: 'buscar_documentacion', input: { query: 'crear evento' } }],
      } as any)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Para crear un evento...' }],
      } as any)

    mockEjecutar.mockResolvedValue({
      encontrado: true,
      resultados: [{ contenido: 'Información', url: 'https://ayuda.fanz.com.ar/crear', similitud: 0.9 }],
    })

    const res = await request(app)
      .post('/')
      .send({ messages: [{ role: 'user', content: '¿Cómo creo un evento?' }] })

    const events = parseSseEvents(res.text)
    const responseEvent = events.find((e) => e.type === 'response')

    expect(responseEvent?.source).toBe('https://ayuda.fanz.com.ar/crear')
  })

  it('corta el loop ante stop_reason inesperado (max_tokens)', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'Respuesta cortada...' }],
    } as any)

    const res = await request(app)
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hola' }] })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })

  it('envía evento de error cuando Anthropic lanza una excepción', async () => {
    mockCreate.mockRejectedValue(new Error('API unavailable'))

    const res = await request(app)
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hola' }] })

    const events = parseSseEvents(res.text)
    const errorEvent = events.find((e) => e.type === 'error')

    expect(errorEvent).toMatchObject({ type: 'error', text: 'Ocurrió un error interno. Intentá de nuevo.' })
  })
})
