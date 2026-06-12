import type Anthropic from '@anthropic-ai/sdk'
import supabase from '../lib/supabase.js'
import { buscarDocumentacion } from '../lib/rag.js'
import type {
  ToolName,
  ToolInput,
  ToolResult,
  BuscarDocumentacionInput,
  VerVentasEventoInput,
  ActualizarPrecioEventoInput,
} from '../types/tools.js'
import type { Evento, Venta } from '../types/db.js'

// ── Definición de tools para Claude ─────────────────────

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'buscar_documentacion',
    description:
      'Busca en la documentación oficial de Fanz para responder preguntas sobre la plataforma. Usá esto para cualquier pregunta sobre cómo funciona Fanz: crear eventos, pagos, configuración, funcionalidades, precios, etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La búsqueda a realizar. Sé específico para obtener mejores resultados.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'ver_eventos',
    description:
      'Devuelve todos los eventos de la cuenta del organizador con sus datos: nombre, fecha, precio, capacidad, tickets vendidos y estado.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ver_ventas_evento',
    description:
      'Devuelve el detalle de ventas de un evento específico: total recaudado, tickets vendidos, ocupación y listado de compras recientes.',
    input_schema: {
      type: 'object',
      properties: {
        evento_id: {
          type: 'number',
          description:
            'El ID del evento. Si el usuario no lo especificó, primero llamá ver_eventos para obtener los IDs disponibles.',
        },
      },
      required: ['evento_id'],
    },
  },
  {
    name: 'actualizar_precio_evento',
    description:
      'Actualiza el precio de un evento. Confirmá siempre con el usuario antes de ejecutar si no fue completamente explícito.',
    input_schema: {
      type: 'object',
      properties: {
        evento_id: {
          type: 'number',
          description: 'El ID del evento a modificar.',
        },
        nuevo_precio: {
          type: 'number',
          description: 'El nuevo precio en pesos argentinos.',
        },
      },
      required: ['evento_id', 'nuevo_precio'],
    },
  },
  {
    name: 'resumen_cuenta',
    description:
      'Devuelve un resumen general de la cuenta: ingresos totales, tickets vendidos, eventos activos y ticket promedio.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

// ── Ejecución de tools ───────────────────────────────────

export async function ejecutarTool(
  nombre: ToolName,
  input: ToolInput
): Promise<ToolResult> {
  switch (nombre) {

    case 'buscar_documentacion': {
      const { query } = input as BuscarDocumentacionInput
      const resultados = await buscarDocumentacion(query)

      if (!resultados.length) {
        return {
          encontrado: false,
          mensaje: 'No encontré información sobre ese tema en la documentación de Fanz.',
        }
      }

      return {
        encontrado: true,
        resultados: resultados.map((r) => ({
          contenido: r.contenido,
          url: r.url_origen,
          similitud: r.similarity,
        })),
      }
    }

    case 'ver_eventos': {
      const { data, error } = await supabase
        .from('eventos')
        .select('*')
        .order('fecha', { ascending: true })

      if (error) return { error: 'No pude obtener los eventos.' }
      return { eventos: data as Evento[] }
    }

    case 'ver_ventas_evento': {
      const { evento_id } = input as VerVentasEventoInput

      const { data: evento } = await supabase
        .from('eventos')
        .select('*')
        .eq('id', evento_id)
        .single<Evento>()

      if (!evento) return { error: `No encontré el evento con ID ${evento_id}.` }

      const { data: ventas } = await supabase
        .from('ventas')
        .select('*')
        .eq('evento_id', evento_id)
        .order('fecha', { ascending: false })
        .limit(10)

      const totalRecaudado =
        (ventas as Venta[])?.reduce((acc, v) => acc + v.monto, 0) ?? 0
      const ocupacion = Math.round((evento.vendidos / evento.capacidad) * 100)

      return {
        evento: evento.nombre,
        total_recaudado: totalRecaudado,
        tickets_vendidos: evento.vendidos,
        capacidad: evento.capacidad,
        ocupacion_pct: ocupacion,
        ultimas_ventas: (ventas as Venta[]) ?? [],
      }
    }

    case 'actualizar_precio_evento': {
      const { evento_id, nuevo_precio } = input as ActualizarPrecioEventoInput

      const { data: evento } = await supabase
        .from('eventos')
        .select('nombre, precio')
        .eq('id', evento_id)
        .single<Pick<Evento, 'nombre' | 'precio'>>()

      if (!evento) return { error: `No encontré el evento con ID ${evento_id}.` }

      const { error } = await supabase
        .from('eventos')
        .update({ precio: nuevo_precio })
        .eq('id', evento_id)

      if (error) return { error: 'No pude actualizar el precio.' }

      return {
        ok: true,
        evento: evento.nombre,
        precio_anterior: evento.precio,
        precio_nuevo: nuevo_precio,
      }
    }

    case 'resumen_cuenta': {
      const { data: eventos } = await supabase
        .from('eventos')
        .select('*')

      if (!eventos) return { error: 'No pude obtener los datos de la cuenta.' }

      const typedEventos = eventos as Evento[]
      const activos = typedEventos.filter((e) => e.estado === 'activo').length
      const totalVendidos = typedEventos.reduce((acc, e) => acc + e.vendidos, 0)
      const totalIngresos = typedEventos.reduce((acc, e) => acc + e.vendidos * e.precio, 0)
      const ticketPromedio = totalVendidos > 0 ? Math.round(totalIngresos / totalVendidos) : 0
      const eventoTop = [...typedEventos].sort(
        (a, b) => b.vendidos * b.precio - a.vendidos * a.precio
      )[0]

      return {
        eventos_activos: activos,
        total_tickets_vendidos: totalVendidos,
        ingresos_totales: totalIngresos,
        ticket_promedio: ticketPromedio,
        evento_top: eventoTop?.nombre ?? '-',
      }
    }

    default: {
      const _exhaustive: never = nombre
      return { error: `Tool desconocida: ${_exhaustive}` }
    }
  }
}
