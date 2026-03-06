import { S3Event } from 'aws-lambda';
import { sendProcessingMessage } from '../lib/sqs';
import { updateStatus } from '../lib/dynamodb';

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const resumeId = s3Key.split('/')[1].replace('.pdf', '');

    try {
      await updateStatus(resumeId, 'processing');
      await sendProcessingMessage(resumeId, s3Key);
      console.log(`Triggered processing for resumeId=${resumeId}, s3Key=${s3Key}`);
    } catch (error) {
      console.error(`Failed to trigger processing for resumeId=${resumeId}`, error);
    }
  }
};
