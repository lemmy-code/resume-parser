// Embed Lambda — reacts to DynamoDB Streams on the resumes table.
//
// Trigger decision (see README): embedding fires off the Stream, NOT the SQS
// success path. Extraction owns writing the source of truth to DynamoDB;
// embedding reacts to it. That keeps embedding failures from ever poisoning an
// extraction result, and makes re-embedding replayable (stream retention +
// the backfill script share this exact code path).
//
// Uses partial batch responses (ReportBatchItemFailures): only the records that
// actually failed are returned for retry, not the whole batch.

import type {
  DynamoDBStreamEvent,
  DynamoDBBatchResponse,
  DynamoDBRecord,
} from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { embedResume, type EmbedDeps } from '../rag/embedResume';
import { embedderFromEnv } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';
import type { ParsedResumeData, ResumeDocument } from '../types';

// Warm-reused across invocations (connection pool + config built once).
let deps: EmbedDeps | null = null;
function getDeps(): EmbedDeps {
  if (!deps) deps = { embedder: embedderFromEnv(), store: storeFromEnv() };
  return deps;
}

function newImage(record: DynamoDBRecord): ResumeDocument | null {
  const image = record.dynamodb?.NewImage;
  if (!image) return null;
  return unmarshall(image as Record<string, AttributeValue>) as ResumeDocument;
}

function keyResumeId(record: DynamoDBRecord): string | null {
  const key = record.dynamodb?.Keys;
  if (!key) return null;
  const parsed = unmarshall(key as Record<string, AttributeValue>) as { resumeId?: string };
  return parsed.resumeId ?? null;
}

export const handler = async (
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> => {
  const { embedder, store } = getDeps();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const seq = record.dynamodb?.SequenceNumber;
    try {
      if (record.eventName === 'REMOVE') {
        const resumeId = keyResumeId(record);
        if (resumeId) await store.deleteByResume(resumeId);
        continue;
      }

      const doc = newImage(record);
      // Only completed resumes with parsed data are embeddable. Anything else
      // (pending/processing/failed, or a status-only update) is skipped, not failed.
      if (!doc || doc.status !== 'completed' || !doc.parsedData) continue;

      await embedResume(doc.resumeId, doc.parsedData as ParsedResumeData, {
        embedder,
        store,
      });
    } catch (err) {
      console.error(
        `embed failed for sequence ${seq ?? '<unknown>'}:`,
        err instanceof Error ? err.message : err,
      );
      if (seq) batchItemFailures.push({ itemIdentifier: seq });
    }
  }

  return { batchItemFailures };
};
