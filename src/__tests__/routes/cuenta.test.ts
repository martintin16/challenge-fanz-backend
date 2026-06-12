import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cuentaRouter from '../../routes/cuenta.js'
import supabase from '../../lib/supabase.js'

vi.mock('../../lib/supabase.js', () => ({
  default: { from: vi.fn() },
}))

const mockFrom = vi.mocked(supabase.from)

const mockCuenta = { id: 1, nombre: 'Promotora XYZ', email: 'hola@xyz.com', plan: 'pro' }
const mockEventos = [
  { id: 1, nombre: 'Fiesta', emoji: '🎉', fecha: '2026-08-01', precio: 5000, capacidad: 200, vendidos: 80, estado: 'activo' },
  { id: 2, nombre: 'Rock', emoji: '🎸', fecha: '2026-09-15', precio: 3000, capacidad: 500, vendidos: 200, estado: 'finalizado' },
]

const app = express()
app.use(express.json())
app.use('/', cuentaRouter)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /cuenta', () => {
  it('devuelve cuenta y eventos correctamente', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCuenta, error: null }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockEventos, error: null }),
        }),
      } as any)

    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ cuenta: mockCuenta, eventos: mockEventos })
  })

  it('devuelve 500 si falla la query de cuenta', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockEventos, error: null }),
        }),
      } as any)

    const res = await request(app).get('/')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'No se pudieron obtener los datos de la cuenta.' })
  })

  it('devuelve 500 si falla la query de eventos', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCuenta, error: null }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } }),
        }),
      } as any)

    const res = await request(app).get('/')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'No se pudieron obtener los datos de la cuenta.' })
  })

  it('ejecuta las dos queries a Supabase en paralelo', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCuenta, error: null }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any)

    await request(app).get('/')

    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenCalledWith('cuenta')
    expect(mockFrom).toHaveBeenCalledWith('eventos')
  })
})
