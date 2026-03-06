import Anthropic from '@anthropic-ai/sdk';
import { parsedResumeSchema } from '../schemas/resume.schema';
import { ParsedResumeData } from '../types';

const anthropic = new Anthropic();

export async function extractResumeData(text: string): Promise<ParsedResumeData> {
  const prompt = `Extract structured information from this resume text and return ONLY valid JSON with no additional text.

Resume text:
${text}

Return this exact JSON structure:
{
  "fullName": "string",
  "email": "string",
  "phone": "string or null",
  "location": "string or null",
  "summary": "brief professional summary or null",
  "totalYearsExperience": number,
  "skills": ["string"],
  "languages": ["string"],
  "experience": [{"company": "string", "role": "string", "startDate": "string", "endDate": "string or null", "current": boolean, "description": "string"}],
  "education": [{"institution": "string", "degree": "string", "field": "string", "graduationYear": number or null}],
  "certifications": ["string"]
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Extract JSON from possible markdown code blocks
  let jsonString = responseText;
  const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonString);
  const validated = parsedResumeSchema.parse(parsed);

  return validated as ParsedResumeData;
}
