// Refleja las columnas de la tabla `eventos` en Supabase
export interface Evento {
  id: number
  nombre: string
  emoji: string
  fecha: string
  precio: number
  capacidad: number
  vendidos: number
  estado: 'activo' | 'finalizado'
}

// Refleja las columnas de la tabla `ventas` en Supabase
export interface Venta {
  id: number
  evento_id: number
  comprador: string
  monto: number
  fecha: string
  estado: 'confirmada' | 'cancelada' | 'pendiente'
}

// Refleja las columnas de la tabla `cuenta` en Supabase
export interface Cuenta {
  id: number
  nombre: string
  email: string
  plan: string
}

// Resultado de la función buscar_documentos en Supabase (RPC)
export interface DocumentoMatch {
  id: number
  contenido: string
  url_origen: string
  similarity: number
}
