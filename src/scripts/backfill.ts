// Backfill: embed every already-extracted resume in DynamoDB.
//
// Second entry point onto the SAME code path as the Streams handler — both call
// embedResume(), so a re-embed here behaves identically to a live stream event
// (idempotent delete-then-insert). Use it to seed the vector store for resumes
// that were extracted before the embed Lambda existed, or after a schema/model
// change that needs a full re-embed.
//
// Config (env):
//   DYNAMODB_TABLE_NAME   required — the resumes table
//   DATABASE_URL          Postgres target (defaults to the local container)
//   OPENAI_API_KEY        required unless EMBEDDER=fake
//   EMBEDDER=fake         use the deterministic offline embedder (local testing)
//   AWS_ENDPOINT_URL_DYNAMODB   set to http://localhost:4566 for LocalStack
//
// Run (compiled): npm run backfill

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { embedResume } from '../rag/embedResume';
import { embedderFromEnv, FakeEmbedder, type Embedder } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';
import type { ParsedResumeData, ResumeDocument } from '../types';

function makeEmbedder(): Embedder {
  return process.env.EMBEDDER === 'fake' ? new FakeEmbedder() : embedderFromEnv();
}

async function* scanCompleted(
  doc: DynamoDBDocumentClient,
  tableName: string,
): AsyncGenerator<ResumeDocument> {
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#s = :completed AND attribute_exists(parsedData)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':completed': 'completed' },
        ExclusiveStartKey,
      }),
    );
    for (const item of (res.Items ?? []) as ResumeDocument[]) yield item;
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
}

async function main(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) throw new Error('DYNAMODB_TABLE_NAME is not set');

  const dynamo = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' }),
  );
  const embedder = makeEmbedder();
  const store = storeFromEnv();

  let ok = 0;
  let failed = 0;
  let chunks = 0;
  try {
    for await (const doc of scanCompleted(dynamo, tableName)) {
      if (!doc.parsedData) continue;
      try {
        const res = await embedResume(doc.resumeId, doc.parsedData as ParsedResumeData, {
          embedder,
          store,
        });
        chunks += res.chunks;
        ok++;
        console.log(`  ✓ ${doc.resumeId} (${res.chunks} chunks)`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${doc.resumeId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await store.close();
  }

  console.log(`\nBackfill done: ${ok} embedded (${chunks} chunks), ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Backfill aborted:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
