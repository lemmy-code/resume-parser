// Chunking for the RAG semantic-search layer.
//
// Operates on the ALREADY-VALIDATED structured resume JSON produced by the
// extraction pipeline — not raw PDF text. Each chunk is a semantic unit
// (summary / one per experience / skills / one per education) rendered to
// natural-language prose, because embedding models are trained on prose and a
// JSON blob embeds worse than a sentence carrying the same facts.
//
// Note on the render: the extraction schema has NO per-experience `years` or
// per-experience `skills` field. Duration is derived from startDate/endDate
// (using `asOf` for current roles), and skills live only at the resume level
// in their own chunk.
//
// Runtime-import-free (only `import type`, which is erased) so it runs unchanged
// under esbuild/tsc (the Lambda build) and Node's native type stripping (tests).

import type { ParsedResumeData } from '../types';

export type ChunkType = 'summary' | 'experience' | 'skills' | 'education';

export const CHUNK_TYPES: readonly ChunkType[] = [
  'summary',
  'experience',
  'skills',
  'education',
];

export interface ResumeChunk {
  resumeId: string;
  chunkType: ChunkType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ChunkOptions {
  /** Reference "now" for open-ended (current) roles. Injectable for deterministic tests. */
  asOf?: Date;
}

/** Parse "YYYY-MM" or "YYYY" into absolute month count; null if unparseable. */
function toAbsoluteMonths(value: string): number | null {
  const match = /^(\d{4})(?:-(\d{1,2}))?/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/** Whole months between two "YYYY-MM" strings; falls back to `asOf` for the open end. */
export function monthsBetween(
  startDate: string,
  endDate: string | null,
  asOf: Date,
): number {
  const start = toAbsoluteMonths(startDate);
  if (start === null) return 0;
  const end =
    endDate && toAbsoluteMonths(endDate) !== null
      ? (toAbsoluteMonths(endDate) as number)
      : asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  return Math.max(0, end - start);
}

/** Human-readable, embedding-friendly duration ("less than a year", "1 year", "5 years"). */
export function describeDuration(months: number): string {
  if (months < 12) return 'less than a year';
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Break a parsed resume into semantic chunks ready for embedding.
 * Returns [] for a resume with no renderable content.
 */
export function chunkResume(
  resumeId: string,
  data: ParsedResumeData,
  opts: ChunkOptions = {},
): ResumeChunk[] {
  const asOf = opts.asOf ?? new Date();
  const chunks: ResumeChunk[] = [];

  // --- summary ---
  if (data.summary && data.summary.trim()) {
    chunks.push({
      resumeId,
      chunkType: 'summary',
      content: data.summary.trim(),
      metadata: {
        totalYearsExperience: data.totalYearsExperience,
        location: data.location ?? undefined,
      },
    });
  }

  // --- one chunk per experience entry ---
  for (const exp of data.experience) {
    const months = monthsBetween(exp.startDate, exp.endDate, asOf);
    const duration = describeDuration(months);
    const head = `${exp.role} at ${exp.company} (${duration})`;
    const content = exp.description?.trim()
      ? `${head}: ${exp.description.trim()}`
      : `${head}.`;
    chunks.push({
      resumeId,
      chunkType: 'experience',
      content,
      metadata: {
        company: exp.company,
        role: exp.role,
        current: exp.current,
        startDate: exp.startDate,
        endDate: exp.endDate,
        years: round1(months / 12),
      },
    });
  }

  // --- skills (+ certifications, languages) as one chunk ---
  if (data.skills.length > 0 || data.certifications.length > 0) {
    const parts: string[] = [];
    if (data.skills.length) parts.push(`Skills: ${data.skills.join(', ')}`);
    if (data.certifications.length)
      parts.push(`Certifications: ${data.certifications.join(', ')}`);
    if (data.languages.length)
      parts.push(`Languages: ${data.languages.join(', ')}`);
    chunks.push({
      resumeId,
      chunkType: 'skills',
      content: `${parts.join('. ')}.`,
      metadata: {
        skills: data.skills,
        certifications: data.certifications,
        languages: data.languages,
      },
    });
  }

  // --- one chunk per education entry ---
  for (const edu of data.education) {
    const year = edu.graduationYear ? ` (${edu.graduationYear})` : '';
    chunks.push({
      resumeId,
      chunkType: 'education',
      content: `${edu.degree} in ${edu.field} from ${edu.institution}${year}.`,
      metadata: {
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        graduationYear: edu.graduationYear,
      },
    });
  }

  return chunks;
}
