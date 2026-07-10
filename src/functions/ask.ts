// POST /ask — grounded RAG answer with cited candidates.
//
//   body: { query: string, contextChunks?: number }
//   -> { answer: string, candidates: [{ resumeId, reason }], retrievedResumeIds: [...] }

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { askAboutResumes, type AskDeps } from '../rag/ask';
import { embedderFromEnv } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';
import { generatorFromEnv } from '../rag/generator';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

let deps: AskDeps | null = null;
function getDeps(): AskDeps {
  if (!deps) {
    deps = {
      embedder: embedderFromEnv(),
      store: storeFromEnv(),
      generator: generatorFromEnv(),
    };
  }
  return deps;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return jsonResponse(200, {});
    }

    const apiKey = event.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return jsonResponse(400, { error: 'query is required' });
    }

    const contextChunks =
      typeof body.contextChunks === 'number' && Number.isFinite(body.contextChunks)
        ? Math.min(Math.max(1, Math.floor(body.contextChunks)), 25)
        : undefined;

    const result = await askAboutResumes(query, { ...getDeps(), contextChunks });
    return jsonResponse(200, result);
  } catch (error) {
    console.error('Ask handler error:', error);
    // A generation/parse failure is a bad-gateway condition, not a client error.
    return jsonResponse(502, { error: 'Failed to generate a grounded answer' });
  }
};
