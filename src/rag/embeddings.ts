// Embedding provider for the RAG layer.
//
// A single embedding model is used for BOTH indexing and querying — never mix
// models, or cosine distances become meaningless. text-embedding-3-small -> 1536 dims,
// which must match the vector(1536) column in the migration.
//
// The Embedder interface keeps OpenAI at the edge: the embed/search/backfill code
// depends on the interface, and tests inject a deterministic fake — no network,
// no API key.

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export interface Embedder {
  /** Embed a batch of texts, returning one vector per input in the same order. */
  embed(texts: string[]): Promise<number[][]>;
}

interface OpenAIEmbeddingResponse {
  data: { index: number; embedding: number[] }[];
}

/** OpenAI embedder over the REST API (global fetch — no SDK dependency). */
export class OpenAIEmbedder implements Embedder {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = EMBEDDING_MODEL,
    private readonly baseUrl: string = 'https://api.openai.com/v1',
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as OpenAIEmbeddingResponse;
    // The API preserves order, but sort by index defensively before stripping it.
    return body.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

/** Build the default embedder from the environment. */
export function embedderFromEnv(): Embedder {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAIEmbedder(apiKey, process.env.EMBEDDING_MODEL || EMBEDDING_MODEL);
}

/**
 * Deterministic offline embedder for tests and local smoke runs.
 * Not semantically meaningful — it only guarantees stable, correctly-shaped
 * vectors so the DB write/read path can be exercised without a real API call.
 */
export class FakeEmbedder implements Embedder {
  constructor(private readonly dims: number = EMBEDDING_DIMS) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorFor(t));
  }

  private vectorFor(text: string): number[] {
    // Cheap deterministic hash spread across the dimensions.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const vec = new Array<number>(this.dims);
    for (let i = 0; i < this.dims; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
      vec[i] = (h / 0xffffffff) * 2 - 1; // in [-1, 1]
    }
    return vec;
  }
}
