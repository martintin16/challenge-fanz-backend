/**
 * Script de scraping + embeddings
 * Correlo UNA sola vez: npm run scrape
 *
 * Lo que hace:
 * 1. Scrapea ayuda.fanz.com.ar y páginas clave de fanz.com.ar con Firecrawl
 * 2. Divide cada página en chunks de ~400 palabras
 * 3. Genera un embedding por chunk (Voyage AI)
 * 4. Guarda todo en la tabla `documentos` de Supabase
 */

import 'dotenv/config'
import FirecrawlApp from '@mendable/firecrawl-js'
import { createClient } from '@supabase/supabase-js'

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

// ── Helpers ──────────────────────────────────────────────

async function generarEmbedding(texto: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: 'voyage-3', input: texto }),
  })

  if (!res.ok) throw new Error(`Voyage API error: ${res.statusText}`)

  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

function dividirEnChunks(texto: string, tamaño: number = 400): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < palabras.length; i += tamaño) {
    const chunk = palabras.slice(i, i + tamaño).join(' ')
    if (chunk.length > 100) chunks.push(chunk)
  }
  return chunks
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generarEmbeddingConRetry(texto: string, intentos = 3): Promise<number[]> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await generarEmbedding(texto)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Too Many Requests') && i < intentos - 1) {
        const espera = 60_000 * (i + 1)
        console.log(`  ⏳ Rate limit de Voyage AI, esperando ${espera / 1000}s...`)
        await sleep(espera)
      } else {
        throw err
      }
    }
  }
  throw new Error('No se pudo generar el embedding tras varios intentos')
}

async function procesarPagina(url: string, contenido: string): Promise<void> {
  const chunks = dividirEnChunks(contenido)
  console.log(`  → ${chunks.length} chunks`)

  for (const chunk of chunks) {
    const embedding = await generarEmbeddingConRetry(chunk)
    const { error } = await supabase.from('documentos').insert({
      contenido: chunk,
      url_origen: url,
      embedding,
    })
    if (error) console.error('Error insertando chunk:', error.message)
    await sleep(500)
  }
}

// ── Main ─────────────────────────────────────────────────

interface Sitio {
  url: string
  crawl: boolean
}

async function main(): Promise<void> {
  console.log('🕷️  Iniciando scraping de Fanz...\n')

  await supabase.from('documentos').delete().neq('id', 0)
  console.log('🗑️  Documentos anteriores eliminados\n')

  const sitios: Sitio[] = [
    { url: 'https://ayuda.fanz.com.ar', crawl: true },
    { url: 'https://fanz.com.ar',        crawl: false },
    { url: 'https://fanz.com.ar/precio', crawl: false },
    { url: 'https://fanz.com.ar/fanz-ai', crawl: false },
  ]

  for (const sitio of sitios) {
    if (sitio.crawl) {
      console.log(`📚 Crawleando: ${sitio.url}`)
      const resultado = await firecrawl.crawlUrl(sitio.url, {
        limit: 150,
        scrapeOptions: { formats: ['markdown'] },
      })

      for (const pagina of resultado.data ?? []) {
        if (!pagina.markdown || pagina.markdown.length < 200) continue
        const url = (pagina.metadata as { sourceURL?: string })?.sourceURL ?? sitio.url
        console.log(`  Procesando: ${url}`)
        await procesarPagina(url, pagina.markdown)
      }
    } else {
      console.log(`📄 Scrapeando: ${sitio.url}`)
      const resultado = await firecrawl.scrapeUrl(sitio.url, {
        formats: ['markdown'],
      })
      if (resultado.data?.markdown) {
        await procesarPagina(sitio.url, resultado.data.markdown)
      }
    }
  }

  console.log('\n✅ Scraping completado. Documentos listos en Supabase.')
}

main().catch(console.error)
