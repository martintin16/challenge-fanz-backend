// Nombres de las tools disponibles — string literal union
export type ToolName =
  | 'buscar_documentacion'
  | 'ver_eventos'
  | 'ver_ventas_evento'
  | 'actualizar_precio_evento'
  | 'resumen_cuenta'

// Input de cada tool
export interface BuscarDocumentacionInput {
  query: string
}

export interface VerVentasEventoInput {
  evento_id: number
}

export interface ActualizarPrecioEventoInput {
  evento_id: number
  nuevo_precio: number
}

// Union de todos los inputs posibles
export type ToolInput =
  | BuscarDocumentacionInput
  | VerVentasEventoInput
  | ActualizarPrecioEventoInput
  | Record<string, never> // para tools sin input (ver_eventos, resumen_cuenta)

// Resultados de cada tool
export interface BuscarDocumentacionResult {
  encontrado: boolean
  resultados?: Array<{ contenido: string; url: string; similitud: number }>
  mensaje?: string
}

export interface VerEventosResult {
  eventos: import('./db.js').Evento[]
}

export interface VerVentasResult {
  evento: string
  total_recaudado: number
  tickets_vendidos: number
  capacidad: number
  ocupacion_pct: number
  ultimas_ventas: import('./db.js').Venta[]
}

export interface ActualizarPrecioResult {
  ok: boolean
  evento: string
  precio_anterior: number
  precio_nuevo: number
}

export interface ResumenCuentaResult {
  eventos_activos: number
  total_tickets_vendidos: number
  ingresos_totales: number
  ticket_promedio: number
  evento_top: string
}

export interface ErrorResult {
  error: string
}

export type ToolResult =
  | BuscarDocumentacionResult
  | VerEventosResult
  | VerVentasResult
  | ActualizarPrecioResult
  | ResumenCuentaResult
  | ErrorResult
