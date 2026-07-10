import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkResume,
  monthsBetween,
  describeDuration,
  CHUNK_TYPES,
  type ChunkType,
} from './chunk';
import type { ParsedResumeData } from '../types';

const ASOF = new Date('2025-01-01T00:00:00Z');

const sample: ParsedResumeData = {
  fullName: 'Marko Ilic',
  email: 'marko@example.com',
  phone: null,
  location: 'Berlin, Germany',
  summary: 'Senior backend engineer specializing in event-driven services on AWS.',
  totalYearsExperience: 8,
  skills: ['TypeScript', 'AWS Lambda', 'DynamoDB'],
  languages: ['English', 'German'],
  experience: [
    {
      company: 'Paystream',
      role: 'Senior Backend Engineer',
      startDate: '2020-03',
      endDate: null,
      current: true,
      description: 'Event-driven payment services on AWS Lambda with SQS.',
    },
    {
      company: 'Northwind',
      role: 'Backend Engineer',
      startDate: '2016-06',
      endDate: '2020-02',
      current: false,
      description: 'Node.js REST APIs on PostgreSQL.',
    },
  ],
  education: [
    { institution: 'TU Berlin', degree: 'BSc', field: 'Computer Science', graduationYear: 2016 },
  ],
  certifications: ['AWS Certified Developer – Associate'],
};

test('monthsBetween: open-ended role measured against asOf', () => {
  // 2020-03 -> 2025-01 = 58 months
  assert.equal(monthsBetween('2020-03', null, ASOF), 58);
});

test('monthsBetween: closed role uses its own endDate', () => {
  // 2016-06 -> 2020-02 = 44 months
  assert.equal(monthsBetween('2016-06', '2020-02', ASOF), 44);
});

test('monthsBetween: bad/negative data clamps to 0', () => {
  assert.equal(monthsBetween('not-a-date', null, ASOF), 0);
  assert.equal(monthsBetween('2025-06', '2020-01', ASOF), 0);
});

test('describeDuration: boundaries', () => {
  assert.equal(describeDuration(6), 'less than a year');
  assert.equal(describeDuration(11), 'less than a year');
  assert.equal(describeDuration(12), '1 year');
  assert.equal(describeDuration(24), '2 years');
  assert.equal(describeDuration(58), '5 years'); // ~4.83 rounds to 5
});

test('chunkResume: produces the expected chunk mix', () => {
  const chunks = chunkResume('r001', sample, { asOf: ASOF });
  const counts = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.chunkType] = (acc[c.chunkType] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { summary: 1, experience: 2, skills: 1, education: 1 });
});

test('chunkResume: every chunk carries the resumeId and a valid chunkType', () => {
  const chunks = chunkResume('r001', sample, { asOf: ASOF });
  for (const c of chunks) {
    assert.equal(c.resumeId, 'r001');
    assert.ok(CHUNK_TYPES.includes(c.chunkType as ChunkType), `bad type ${c.chunkType}`);
    assert.ok(c.content.length > 0);
  }
});

test('chunkResume: experience chunk renders derived duration + metadata', () => {
  const chunks = chunkResume('r001', sample, { asOf: ASOF });
  const current = chunks.find(
    (c) => c.chunkType === 'experience' && c.metadata.company === 'Paystream',
  );
  assert.ok(current, 'expected the current-role chunk');
  assert.match(current!.content, /Senior Backend Engineer at Paystream \(5 years\)/);
  assert.equal(current!.metadata.current, true);
  assert.equal(current!.metadata.years, 4.8); // 58/12 = 4.83 -> round1
});

test('chunkResume: skills chunk folds in certifications and languages', () => {
  const chunks = chunkResume('r001', sample, { asOf: ASOF });
  const skills = chunks.find((c) => c.chunkType === 'skills');
  assert.ok(skills);
  assert.match(skills!.content, /Skills: TypeScript, AWS Lambda, DynamoDB/);
  assert.match(skills!.content, /Certifications: AWS Certified Developer/);
  assert.match(skills!.content, /Languages: English, German/);
  assert.deepEqual(skills!.metadata.skills, ['TypeScript', 'AWS Lambda', 'DynamoDB']);
});

test('chunkResume: no summary chunk when summary is null', () => {
  const noSummary: ParsedResumeData = { ...sample, summary: null };
  const chunks = chunkResume('r001', noSummary, { asOf: ASOF });
  assert.equal(chunks.some((c) => c.chunkType === 'summary'), false);
});

test('chunkResume: empty resume yields no chunks', () => {
  const empty: ParsedResumeData = {
    fullName: 'Nobody',
    email: 'n@example.com',
    phone: null,
    location: null,
    summary: null,
    totalYearsExperience: 0,
    skills: [],
    languages: [],
    experience: [],
    education: [],
    certifications: [],
  };
  assert.equal(chunkResume('rXXX', empty, { asOf: ASOF }).length, 0);
});
