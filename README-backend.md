# Fanzly — Backend

API Express + TypeScript del agente Fanzly. Maneja el agentic loop con Claude, RAG sobre documentación de Fanz y tools de acción sobre la cuenta mock en Supabase.

🔗 **[challenge-fanz-backend-production.up.railway.app](https://challenge-fanz-backend-production.up.railway.app)**

---

## Arquitectura

```
POST /api/chat
       ↓
Agentic loop (Claude)
       ↓
Claude decide qué tool usar
       ↓
┌─────────────────────────────────┐
│  buscar_documentacion           │ → Voyage AI embedding → Supabase pgvector
│  ver_eventos                    │ → Supabase
│  ver_ventas_evento              │ → Supabase
│  actualizar_precio_evento       │ → Supabase
│  resumen_cuenta                 │ → Supabase
└─────────────────────────────────┘
       ↓
Respuesta por SSE (streaming)
```

---

## Estructura

```
src/
├── index.ts              ← entry point, Express + rate limiter
├── routes/
│   ├── chat.ts           ← agentic loop con streaming SSE
│   └── cuenta.ts         ← endpoint de datos de la cuenta mock
├── tools/
│   └── index.ts          ← definición y ejecución de las 5 tools
├── lib/
│   ├── anthropic.ts      ← cliente de Claude
│   ├── supabase.ts       ← cliente de DB
│   ├── rag.ts            ← búsqueda vectorial con retry
│   └── prompt.ts         ← system prompt del agente
├── scripts/
│   ├── scrape.ts         ← scrapea y guarda directo en Supabase
│   └── import-crawl.ts   ← importa JSONs de Firecrawl ya descargados
└── types/
    ├── chat.ts           ← tipos de mensajes y SSE
    ├── db.ts             ← tipos de tablas de Supabase
    └── tools.ts          ← tipos de inputs y outputs de tools
```

---

## Setup local

```bash
npm install
cp .env.example .env
# completar variables en .env
npm run dev
```

### Variables de entorno

| Variable | Descripción | Dónde conseguirla |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key de Claude | console.anthropic.com |
| `SUPABASE_URL` | URL del proyecto | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Anon key pública | Supabase → Settings → API |
| `VOYAGE_API_KEY` | API key de embeddings | dash.voyageai.com |
| `FIRECRAWL_API_KEY` | API key de scraping | firecrawl.dev |
| `FRONTEND_URL` | URL del frontend (CORS) | URL de Vercel |

---

## Base de datos

Ejecutar `supabase.sql` en el SQL Editor de Supabase. Crea las tablas, los datos mock y la función RPC de búsqueda vectorial.

### Esquema

```
cuenta
├── id          bigserial PK
├── nombre      text
└── email       text

eventos
├── id          bigserial PK
├── nombre      text
├── fecha       date
├── precio      numeric
├── capacidad   int
├── vendidos    int
└── estado      text  ('activo' | 'finalizado')

ventas
├── id          bigserial PK
├── evento_id   bigint FK → eventos.id
├── comprador   text
├── monto       numeric
├── fecha       date
└── estado      text  ('confirmada' | 'cancelada' | 'pendiente')

documentos
├── id          bigserial PK
├── contenido   text        ← chunk de texto del artículo
├── url_origen  text        ← URL de donde vino
└── embedding   vector(1024) ← generado por Voyage AI (voyage-3)
```

### Indexar documentación

Hay dos formas de poblar la tabla `documentos`:

**Opción 1 — Scraping directo** (requiere créditos de Firecrawl)

Scrapea `ayuda.fanz.com.ar` y `fanz.com.ar` en tiempo real, genera embeddings y guarda todo en Supabase en un solo paso.

```bash
npm run scrape
```

**Opción 2 — Importar JSONs descargados** (sin créditos de Firecrawl)

Si ya tenés los JSONs del crawl descargados desde el dashboard de Firecrawl, poné todos los archivos en la carpeta `crawl-data/` y corré:

```bash
npm run import
```

El script filtra automáticamente los artículos en inglés (duplicados), limpia el HTML de navegación y genera los embeddings con Voyage AI. Útil cuando los créditos de Firecrawl ya fueron consumidos o para re-indexar sin gastar créditos adicionales.

En ambos casos el script borra los documentos anteriores antes de insertar, por lo que puede correrse múltiples veces sin duplicados.

---

## Endpoints

### `GET /health`
Verifica que el servidor esté corriendo.

```json
{ "status": "ok", "timestamp": "2026-06-12T..." }
```

### `GET /api/cuenta`
Devuelve datos de la cuenta mock y sus eventos.

```json
{
  "cuenta": { "id": 1, "nombre": "Martin Iglesias", "email": "..." },
  "eventos": [{ "id": 1, "nombre": "Festival de Verano 2026", ... }]
}
```

### `POST /api/chat`
Endpoint principal del agente. Responde con SSE.

**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "¿Cómo creo un evento?" }
  ]
}
```

**Stream SSE:**
```
data: { "type": "step",     "text": "🤔 Pensando..." }
data: { "type": "step",     "text": "🔍 Buscando en documentación..." }
data: { "type": "step",     "text": "✅ Listo, armando respuesta..." }
data: { "type": "response", "text": "Para crear un evento...", "source": "https://ayuda.fanz.com.ar/..." }
data: { "type": "error",    "text": "..." }
```

---

## Seguridad

- **Rate limiter** — máximo 30 requests por IP cada 15 minutos en `/api/chat`
- **Truncado de historial** — máximo 20 mensajes por request para evitar consumo excesivo de tokens
- **Variables de entorno** — ninguna key está hardcodeada en el código

---

## Stack

| Tecnología | Uso |
|---|---|
| Node.js + Express | Servidor HTTP |
| TypeScript | Tipado estático |
| Anthropic SDK | LLM (Claude Sonnet) |
| Voyage AI | Generación de embeddings |
| Supabase + pgvector | Vector DB y datos mock |
| Railway | Deploy |
