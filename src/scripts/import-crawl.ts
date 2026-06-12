/**
 * Script para importar los JSONs descargados de Firecrawl
 * Correlo con: npm run import
 *
 * Ponés todos los JSONs en una carpeta llamada `crawl-data` dentro del backend
 * y este script los procesa, limpia el contenido y los sube a Supabase
 */

import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Limpiar el markdown ──────────────────────────────────
// Cada archivo tiene el menú de navegación repetido 2 veces antes del contenido.
// El contenido real empieza después del segundo bloque de navegación,
// justo donde aparece el título principal (# Título)

function limpiarMarkdown(markdown: string): string {
  // Encontrar el índice del primer H1 real (# Título del artículo)
  const h1Index = markdown.indexOf("\n# ");
  if (h1Index !== -1) {
    markdown = markdown.slice(h1Index).trim();
  }

  // Eliminar links de imágenes (no aportan info al RAG)
  markdown = markdown.replace(/!\[.*?\]\(.*?\)/g, "");

  // Eliminar links de navegación tipo [Anterior...] y [Siguiente...]
  markdown = markdown.replace(/\[Anterior.*?\]\(.*?\)/g, "");
  markdown = markdown.replace(/\[Siguiente.*?\]\(.*?\)/g, "");

  // Eliminar links repetidos de idioma [EN] [ES]
  markdown = markdown.replace(/\[EN\]\(.*?\)/g, "");
  markdown = markdown.replace(/\[ES\]\(.*?\)/g, "");

  // Limpiar líneas vacías múltiples
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  return markdown;
}

function dividirEnChunks(texto: string, tamaño: number = 400): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < palabras.length; i += tamaño) {
    const chunk = palabras.slice(i, i + tamaño).join(" ");
    if (chunk.length > 150) chunks.push(chunk);
  }
  return chunks;
}

async function generarEmbedding(texto: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: "voyage-3", input: texto }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function generarEmbeddingConRetry(
  texto: string,
  intentos = 3,
): Promise<number[]> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await generarEmbedding(texto);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") && i < intentos - 1) {
        const espera = 60_000 * (i + 1);
        console.log(`  Rate limit, esperando ${espera / 1000}s...`);
        await sleep(espera);
      } else {
        throw err;
      }
    }
  }
  throw new Error("No se pudo generar el embedding tras varios intentos");
}

interface FirecrawlJSON {
  markdown?: string;
  metadata?: {
    sourceURL?: string;
    title?: string;
    language?: string;
  };
}

async function main(): Promise<void> {
  const carpeta = join(process.cwd(), "crawl-data");

  console.log(`Leyendo archivos de: ${carpeta}\n`);

  // Listar todos los JSONs
  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith(".json"));
  console.log(`Encontrados ${archivos.length} archivos JSON\n`);

  // Limpiar documentos anteriores
  await supabase.from("documentos").delete().neq("id", 0);
  console.log("Documentos anteriores eliminados\n");

  let totalChunks = 0;
  let paginasProcesadas = 0;
  let paginasOmitidas = 0;

  for (const archivo of archivos) {
    const ruta = join(carpeta, archivo);
    const contenidoRaw = await readFile(ruta, "utf-8");

    let json: FirecrawlJSON;
    try {
      json = JSON.parse(contenidoRaw);
    } catch {
      console.log(`  Saltando ${archivo} (JSON inválido)`);
      paginasOmitidas++;
      continue;
    }

    const markdown = json.markdown;
    const url = json.metadata?.sourceURL ?? archivo;
    const titulo = json.metadata?.title ?? archivo;
    const idioma = json.metadata?.language ?? "";

    // Solo procesar páginas en español para el agente
    // (los archivos en inglés son duplicados del mismo contenido)
    if (idioma === "en" || url.includes("/en/")) {
      paginasOmitidas++;
      continue;
    }

    if (!markdown || markdown.length < 200) {
      paginasOmitidas++;
      continue;
    }

    const textoLimpio = limpiarMarkdown(markdown);
    const chunks = dividirEnChunks(textoLimpio);

    if (chunks.length === 0) {
      paginasOmitidas++;
      continue;
    }

    console.log(`Procesando: ${titulo}`);
    console.log(`  URL: ${url}`);
    console.log(`  Chunks: ${chunks.length}`);

    for (const chunk of chunks) {
      const embedding = await generarEmbeddingConRetry(chunk);

      const { error } = await supabase.from("documentos").insert({
        contenido: chunk,
        url_origen: url,
        embedding,
      });

      if (error) {
        console.error(`  Error insertando chunk: ${error.message}`);
      } else {
        totalChunks++;
      }

      // Pequeña pausa para no saturar Voyage AI
      await sleep(300);
    }

    paginasProcesadas++;
  }

  console.log("\n─────────────────────────────────");
  console.log(`Paginas procesadas: ${paginasProcesadas}`);
  console.log(`Paginas omitidas:   ${paginasOmitidas}`);
  console.log(`Chunks insertados:  ${totalChunks}`);
  console.log("Listo. Documentos disponibles en Supabase.");
}

main().catch(console.error);
