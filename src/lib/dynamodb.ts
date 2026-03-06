import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ParsedResumeData, ResumeDocument } from '../types';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const tableName = process.env.DYNAMODB_TABLE_NAME!;

export async function createResume(resumeId: string, s3Key: string): Promise<void> {
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60;

  const command = new PutCommand({
    TableName: tableName,
    Item: {
      resumeId,
      s3Key,
      status: 'pending',
      uploadedAt: now.toISOString(),
      ttl,
    },
  });

  await docClient.send(command);
}

export async function updateStatus(resumeId: string, status: string): Promise<void> {
  const command = new UpdateCommand({
    TableName: tableName,
    Key: { resumeId },
    UpdateExpression: 'SET #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status },
  });

  await docClient.send(command);
}

export async function saveParseResult(resumeId: string, parsedData: ParsedResumeData): Promise<void> {
  const command = new UpdateCommand({
    TableName: tableName,
    Key: { resumeId },
    UpdateExpression: 'SET parsedData = :parsedData, #status = :status, processedAt = :processedAt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':parsedData': parsedData,
      ':status': 'completed',
      ':processedAt': new Date().toISOString(),
    },
  });

  await docClient.send(command);
}

export async function saveFailed(resumeId: string, errorMessage: string): Promise<void> {
  const command = new UpdateCommand({
    TableName: tableName,
    Key: { resumeId },
    UpdateExpression: 'SET #status = :status, errorMessage = :errorMessage',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'failed',
      ':errorMessage': errorMessage,
    },
  });

  await docClient.send(command);
}

export async function getResume(resumeId: string): Promise<ResumeDocument | null> {
  const command = new GetCommand({
    TableName: tableName,
    Key: { resumeId },
  });

  const result = await docClient.send(command);
  return (result.Item as ResumeDocument) || null;
}

export async function searchResumes(skill?: string): Promise<ResumeDocument[]> {
  const command = new ScanCommand({
    TableName: tableName,
  });

  const result = await docClient.send(command);
  const items = (result.Items as ResumeDocument[]) || [];

  let completed = items.filter((item) => item.status === 'completed');

  if (skill) {
    const lowerSkill = skill.toLowerCase();
    completed = completed.filter(
      (item) => item.parsedData?.skills?.some((s) => s.toLowerCase().includes(lowerSkill))
    );
  }

  return completed;
}
