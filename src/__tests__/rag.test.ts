import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buscarDocumentacion } from '../lib/rag.js'
import supabase from '../lib/supabase.js'

vi.mock('../lib/supabase.js', () => ({
  default: { rpc: vi.fn() },
}))

const mockRpc = vi.mocked(supabase.rpc)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const embeddingResponse = {
  ok: true,
  statusText: 'OK',
  json: async () => ({ data: [{ embedding: Array(1024).fill(0.1) }] }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buscarDocumentacion', () => {
  it('devuelve documentos cuando hay resultados relevantes', async () => {
    mockFetch.mockResolvedValue(embeddingResponse)
    mockRpc.mockResolvedValue({
      data: [
        { id: 1, contenido: 'Cómo crear un evento en Fanz', url_origen: 'https://ayuda.fanz.com.ar/crear', similarity: 0.93 },
        { id: 2, contenido: 'Configuración de pagos', url_origen: 'https://ayuda.fanz.com.ar/pagos', similarity: 0.87 },
      ],
      error: null,
    } as any)

    const result = await buscarDocumentacion('crear evento')

    expect(result).toHaveLength(2)
    expect(result[0].contenido).toBe('Cómo crear un evento en Fanz')
    expect(result[0].similarity).toBe(0.93)
    expect(result[0].url_origen).toBe('https://ayuda.fanz.com.ar/crear')
  })

  it('llama a Voyage AI con el modelo y texto correctos', async () => {
    mockFetch.mockResolvedValue(embeddingResponse)
    mockRpc.mockResolvedValue({ data: [], error: null } as any)

    await buscarDocumentacion('preguntas sobre pagos', 3)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.voyageai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'voyage-3', input: 'preguntas sobre pagos' }),
      }),
    )
    expect(mockRpc).toHaveBeenCalledWith('buscar_documentos', expect.objectContaining({ match_count: 3 }))
  })

  it('devuelve array vacío cuando el RPC falla', async () => {
    mockFetch.mockResolvedValue(embeddingResponse)
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function not found' } } as any)

    const result = await buscarDocumentacion('algo')

    expect(result).toEqual([])
  })

  it('lanza error inmediato ante error HTTP no retriable (401)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })

    await expect(buscarDocumentacion('algo')).rejects.toThrow('Voyage API error 401: Unauthorized')
  })

  it('reintenta ante rate limit (429) y eventualmente lanza error', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' })

    const promise = buscarDocumentacion('algo')
    // adjuntar el handler ANTES de avanzar los timers para evitar UnhandledRejection
    const assertion = expect(promise).rejects.toThrow()
    await vi.runAllTimersAsync()
    await assertion

    vi.useRealTimers()
  })
})
