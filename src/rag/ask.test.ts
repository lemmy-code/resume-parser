import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askAboutResumes } from './ask';
import { FakeEmbedder } from './embeddings';
import type { ChunkStore, ChunkHit, EmbeddedChunk } from './store';
import type { AnswerGenerator } from './generator';

// Store double returning canned chunk hits.
class StubStore implements ChunkStore {
  constructor(private hits: ChunkHit[]) {}
  async search(): Promise<ChunkHit[]> {
    return this.hits;
  }
  async upsertResumeChunks(_r: string, _c: EmbeddedChunk[]) {}
  async deleteByResume() {}
  async countByResume() {
    return 0;
  }
  async close() {}
}

// Generator double returning a fixed JSON string, and recording if it was called.
class StubGenerator implements AnswerGenerator {
  called = false;
  constructor(private reply: string) {}
  async generate(): Promise<string> {
    this.called = true;
    return this.reply;
  }
}

function hit(resumeId: string): ChunkHit {
  return {
    resumeId,
    chunkType: 'summary',
    content: `${resumeId} summary`,
    metadata: {},
    score: 0.9,
  };
}

const deps = (hits: ChunkHit[], gen: AnswerGenerator) => ({
  embedder: new FakeEmbedder(8),
  store: new StubStore(hits),
  generator: gen,
});

test('returns grounded answer with cited candidates from the context', async () => {
  const gen = new StubGenerator(
    JSON.stringify({
      answer: 'r003 fits best.',
      candidates: [{ resumeId: 'r003', reason: 'Azure + React' }],
    }),
  );
  const res = await askAboutResumes('event-driven azure with react', deps([hit('r003'), hit('r007')], gen));
  assert.equal(res.answer, 'r003 fits best.');
  assert.deepEqual(res.candidates, [{ resumeId: 'r003', reason: 'Azure + React' }]);
  assert.deepEqual(res.retrievedResumeIds, ['r003', 'r007']);
});

test('drops candidates the model invented (not in retrieved context)', async () => {
  const gen = new StubGenerator(
    JSON.stringify({
      answer: 'Two candidates.',
      candidates: [
        { resumeId: 'r003', reason: 'in context' },
        { resumeId: 'r999', reason: 'hallucinated — not retrieved' },
      ],
    }),
  );
  const res = await askAboutResumes('q', deps([hit('r003')], gen));
  assert.deepEqual(res.candidates.map((c) => c.resumeId), ['r003']);
});

test('empty retrieval short-circuits without calling the generator', async () => {
  const gen = new StubGenerator('should not be called');
  const res = await askAboutResumes('q', deps([], gen));
  assert.equal(gen.called, false);
  assert.deepEqual(res.candidates, []);
  assert.match(res.answer, /No candidates/i);
});

test('tolerates prose or fences around the JSON', async () => {
  const gen = new StubGenerator(
    'Here is the answer:\n```json\n{"answer":"ok","candidates":[]}\n```\nThanks!',
  );
  const res = await askAboutResumes('q', deps([hit('r001')], gen));
  assert.equal(res.answer, 'ok');
});

test('throws when the model returns no JSON object', async () => {
  const gen = new StubGenerator('I refuse to answer in JSON.');
  await assert.rejects(() => askAboutResumes('q', deps([hit('r001')], gen)), /JSON object/);
});

test('throws when the JSON fails schema validation', async () => {
  const gen = new StubGenerator(JSON.stringify({ answer: 'ok' })); // missing candidates
  await assert.rejects(() => askAboutResumes('q', deps([hit('r001')], gen)));
});
