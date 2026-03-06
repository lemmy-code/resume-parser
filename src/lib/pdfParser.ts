const pdf = require('pdf-parse');

export async function extractText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}
