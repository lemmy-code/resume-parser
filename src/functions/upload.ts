import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { generatePresignedUploadUrl } from '../lib/s3';
import { createResume } from '../lib/dynamodb';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Handle CORS preflight
    if (event.requestContext.http.method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      };
    }

    // Validate API key
    const apiKey = event.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Parse body and extract filename
    const body = JSON.parse(event.body || '{}');
    const { filename } = body;

    // Validate filename ends with .pdf (case insensitive)
    if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid filename. Only .pdf files are accepted.' }),
      };
    }

    // Generate resumeId and s3Key
    const resumeId = uuidv4();
    const s3Key = `uploads/${resumeId}.pdf`;

    // Create resume record in DynamoDB
    await createResume(resumeId, s3Key);

    // Generate presigned upload URL
    const uploadUrl = await generatePresignedUploadUrl(s3Key);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ resumeId, uploadUrl }),
    };
  } catch (error) {
    console.error('Upload handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
