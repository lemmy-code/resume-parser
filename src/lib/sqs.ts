import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'eu-west-1',
});

const queueUrl = process.env.SQS_QUEUE_URL!;

export async function sendProcessingMessage(resumeId: string, s3Key: string): Promise<void> {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({ resumeId, s3Key }),
  });

  await sqsClient.send(command);
}
