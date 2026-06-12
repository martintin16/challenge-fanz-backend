import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ejecutarTool } from '../tools/index.js'
import supabase from '../lib/supabase.js'
import { buscarDocumentacion } from '../lib/rag.js'

vi.mock('../lib/supabase.js', () => ({
  default: { from: vi.fn() },
}))

vi.mock('../lib/rag.js', () => ({
  buscarDocumentacion: vi.fn(),
}))

const mockFrom = vi.mocked(supabase.from)
const mockBuscar = vi.mocked(buscarDocumentacion)

const eventoBase = {
  id: 1,
  nombre: 'Fiesta',
  emoji: '🎉',
  fecha: '2026-08-01',
  precio: 5000,
  capacidad: 200,
  vendidos: 80,
  estado: 'activo' as const,
}

const ventaBase = {
  id: 1,
  evento_id: 1,
  comprador: 'Ana García',
  monto: 5000,
  fecha: '2026-07-20',
  estado: 'confirmada' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── buscar_documentacion ─────────────────────────────────

describe('buscar_documentacion', () => {
  it('devuelve resultados cuando la búsqueda encuentra documentos', async () => {
    mockBuscar.mockResolvedValue([
      { id: 1, contenido: 'Cómo crear un evento', url_origen: 'https://ayuda.fanz.com.ar/crear', similarity: 0.92 },
    ])

    const result = await ejecutarTool('buscar_documentacion', { query: 'crear evento' })

    expect(result).toEqual({
      encontrado: true,
      resultados: [{ contenido: 'Cómo crear un evento', url: 'https://ayuda.fanz.com.ar/crear', similitud: 0.92 }],
    })
  })

  it('devuelve encontrado:false cuando no hay resultados', async () => {
    mockBuscar.mockResolvedValue([])

    const result = await ejecutarTool('buscar_documentacion', { query: 'algo inexistente' })

    expect(result).toEqual({
      encontrado: false,
      mensaje: 'No encontré información sobre ese tema en la documentación de Fanz.',
    })
  })
})

// ── ver_eventos ──────────────────────────────────────────

describe('ver_eventos', () => {
  it('devuelve lista de eventos correctamente', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [eventoBase], error: null }),
      }),
    } as any)

    const result = await ejecutarTool('ver_eventos', {})

    expect(result).toEqual({ eventos: [eventoBase] })
  })

  it('devuelve error si Supabase falla', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    } as any)

    const result = await ejecutarTool('ver_eventos', {})

    expect(result).toEqual({ error: 'No pude obtener los eventos.' })
  })
})

// ── ver_ventas_evento ────────────────────────────────────

describe('ver_ventas_evento', () => {
  it('devuelve resumen de ventas de un evento', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: eventoBase, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [ventaBase], error: null }),
            }),
          }),
        }),
      } as any)

    const result = await ejecutarTool('ver_ventas_evento', { evento_id: 1 })

    expect(result).toMatchObject({
      evento: 'Fiesta',
      total_recaudado: 5000,
      tickets_vendidos: 80,
      capacidad: 200,
      ocupacion_pct: 40,
    })
  })

  it('devuelve error si el evento no existe', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any)

    const result = await ejecutarTool('ver_ventas_evento', { evento_id: 99 })

    expect(result).toEqual({ error: 'No encontré el evento con ID 99.' })
  })
})

// ── actualizar_precio_evento ─────────────────────────────

describe('actualizar_precio_evento', () => {
  it('actualiza el precio correctamente', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { nombre: 'Fiesta', precio: 5000 }, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any)

    const result = await ejecutarTool('actualizar_precio_evento', { evento_id: 1, nuevo_precio: 7000 })

    expect(result).toEqual({ ok: true, evento: 'Fiesta', precio_anterior: 5000, precio_nuevo: 7000 })
  })

  it('devuelve error si el evento no existe', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any)

    const result = await ejecutarTool('actualizar_precio_evento', { evento_id: 99, nuevo_precio: 7000 })

    expect(result).toEqual({ error: 'No encontré el evento con ID 99.' })
  })

  it('devuelve error si Supabase falla al actualizar', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { nombre: 'Fiesta', precio: 5000 }, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'update failed' } }),
        }),
      } as any)

    const result = await ejecutarTool('actualizar_precio_evento', { evento_id: 1, nuevo_precio: 7000 })

    expect(result).toEqual({ error: 'No pude actualizar el precio.' })
  })
})

// ── resumen_cuenta ───────────────────────────────────────

describe('resumen_cuenta', () => {
  it('calcula el resumen correctamente', async () => {
    const eventos = [
      { ...eventoBase, estado: 'activo' as const, vendidos: 80, precio: 5000 },
      { ...eventoBase, id: 2, nombre: 'Rock en vivo', estado: 'finalizado' as const, vendidos: 200, precio: 3000 },
    ]

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: eventos, error: null }),
    } as any)

    const result = await ejecutarTool('resumen_cuenta', {})

    expect(result).toMatchObject({
      eventos_activos: 1,
      total_tickets_vendidos: 280,
      ingresos_totales: 80 * 5000 + 200 * 3000,
      evento_top: 'Rock en vivo',
    })
  })

  it('devuelve ticket_promedio 0 cuando no hay ventas', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ ...eventoBase, vendidos: 0, precio: 5000, estado: 'activo' as const }],
        error: null,
      }),
    } as any)

    const result = await ejecutarTool('resumen_cuenta', {})

    expect(result).toMatchObject({ ticket_promedio: 0 })
  })

  it('devuelve error si Supabase falla', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    } as any)

    const result = await ejecutarTool('resumen_cuenta', {})

    expect(result).toEqual({ error: 'No pude obtener los datos de la cuenta.' })
  })
})
