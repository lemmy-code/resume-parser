// Answer generation for /ask, behind an interface so the orchestrator and tests
// don't depend on a live model or an API key.

import Anthropic from '@anthropic-ai/sdk';

export interface AnswerGenerator {
  /** Given a system prompt and a user prompt, return the model's raw text. */
  generate(system: string, user: string): Promise<string>;
}

// Current-generation Opus. Overridable, but do not set temperature/top_p or a
// thinking budget here — Opus 4.8 rejects those (400).
const DEFAULT_MODEL = 'claude-opus-4-8';

export class ClaudeGenerator implements AnswerGenerator {
  private readonly client: Anthropic;
  constructor(
    private readonly model: string = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    client?: Anthropic,
  ) {
    // Zero-arg client resolves ANTHROPIC_API_KEY (or an ant-auth profile).
    this.client = client ?? new Anthropic();
  }

  async generate(system: string, user: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}

export function generatorFromEnv(): AnswerGenerator {
  return new ClaudeGenerator();
}
