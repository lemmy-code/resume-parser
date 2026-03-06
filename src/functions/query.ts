import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getResume, searchResumes } from '../lib/dynamodb';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  const apiKey = event.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const rawPath = event.rawPath;
  const segments = rawPath.split('/').filter(Boolean);

  // /resumes
  if (segments.length === 1 && segments[0] === 'resumes') {
    const skill = event.queryStringParameters?.skill;
    const results = await searchResumes(skill);
    return jsonResponse(200, results);
  }

  // /resumes/{id}/status
  if (segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'status') {
    const id = segments[1];
    const resume = await getResume(id);
    if (!resume) {
      return jsonResponse(404, { error: 'Resume not found' });
    }
    return jsonResponse(200, { resumeId: resume.resumeId, status: resume.status });
  }

  // /resumes/{id}
  if (segments.length === 2 && segments[0] === 'resumes') {
    const id = segments[1];
    const resume = await getResume(id);
    if (!resume) {
      return jsonResponse(404, { error: 'Resume not found' });
    }
    return jsonResponse(200, resume);
  }

  return jsonResponse(404, { error: 'Not found' });
};
