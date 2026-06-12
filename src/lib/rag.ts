import supabase from "./supabase.js";
import type { DocumentoMatch } from "../types/db.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generarEmbedding(texto: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: texto,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Voyage API error ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

async function generarEmbeddingConRetry(
  texto: string,
  intentos = 4,
): Promise<number[]> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await generarEmbedding(texto);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const esRateLimit =
        msg.includes("429") || msg.includes("Too Many Requests");

      if (esRateLimit && i < intentos - 1) {
        const espera = 5000 * (i + 1); // 5s, 10s, 15s
        console.log(
          `  Voyage rate limit, reintentando en ${espera / 1000}s...`,
        );
        await sleep(espera);
      } else {
        throw err;
      }
    }
  }
  throw new Error("No se pudo generar el embedding tras varios intentos");
}

export async function buscarDocumentacion(
  query: string,
  topK: number = 4,
): Promise<DocumentoMatch[]> {
  const embedding = await generarEmbeddingConRetry(query);

  const { data, error } = await supabase.rpc("buscar_documentos", {
    query_embedding: embedding,
    match_count: topK,
  });

  if (error) {
    console.error("Error buscando en documentación:", error);
    return [];
  }

  return data as DocumentoMatch[];
}
