import supabase from './supabase.js'
import type { DocumentoMatch } from '../types/db.js'

async function generarEmbedding(texto: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: texto,
    }),
  })

  if (!response.ok) {
    throw new Error(`Voyage API error: ${response.statusText}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

export async function buscarDocumentacion(
  query: string,
  topK: number = 4
): Promise<DocumentoMatch[]> {
  const embedding = await generarEmbedding(query)

  const { data, error } = await supabase.rpc('buscar_documentos', {
    query_embedding: embedding,
    match_count: topK,
  })

  if (error) {
    console.error('Error buscando en documentación:', error)
    return []
  }

  return data as DocumentoMatch[]
}
