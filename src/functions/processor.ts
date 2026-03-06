import { SQSEvent } from 'aws-lambda';
import { downloadFile } from '../lib/s3';
import { extractText } from '../lib/pdfParser';
import { extractResumeData } from '../lib/claude';
import { saveParseResult, saveFailed } from '../lib/dynamodb';
import { ProcessingMessage } from '../types';

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message: ProcessingMessage = JSON.parse(record.body);

    try {
      const buffer = await downloadFile(message.s3Key);
      const text = await extractText(buffer);

      if (!text || text.length < 50) {
        throw new Error('PDF contains no extractable text');
      }

      const parsedData = await extractResumeData(text);
      await saveParseResult(message.resumeId, parsedData);

      console.log(`Successfully processed resume ${message.resumeId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `Failed to process resume ${message.resumeId}: ${errorMessage}`
      );
      await saveFailed(message.resumeId, errorMessage);
    }
  }
};
