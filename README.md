# Fanzly — Backend

API Express + TypeScript del agente Fanzly.

## Setup

```bash
npm install
cp .env.example .env
# completar las variables en .env
```

## Variables de entorno

| Variable | Dónde conseguirla |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `VOYAGE_API_KEY` | dash.voyageai.com (free tier disponible) |
| `FIRECRAWL_API_KEY` | firecrawl.dev (500 créditos gratis) |

## Base de datos

Ejecutar el contenido de `supabase.sql` en el SQL Editor de Supabase.

## Scraping (una sola vez)

```bash
npm run scrape
```

## Desarrollo

```bash
npm run dev
```

## Endpoints

**GET** `/health` — verifica que el server esté vivo

**POST** `/api/chat` — stream SSE del agente

Body:
```json
{
  "messages": [
    { "role": "user", "content": "¿Cómo creo un evento?" }
  ]
}
```

Responde con SSE:
```
data: { "type": "step",     "text": "🔍 Buscando en documentación..." }
data: { "type": "response", "text": "Para crear un evento...", "source": "https://..." }
data: { "type": "error",    "text": "..." }
```
