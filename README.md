# Resume Parser

Upload a PDF resume and get back structured JSON with extracted skills, experience, education, and contact info using Claude AI.

## Tech Stack

- TypeScript, Node.js 20
- AWS Lambda (4 functions via SAM)
- S3 for file storage, SQS for async processing, DynamoDB for persistence
- Anthropic Claude API for resume extraction
- pdf-parse for PDF text extraction
- Zod for validation
- React + Vite + Tailwind CSS (frontend)
- LocalStack + Docker for local development

## Setup

### Prerequisites

- Node.js 20+
- AWS CLI
- AWS SAM CLI (`brew install aws-sam-cli`)
- Docker

### Install

```bash
git clone https://github.com/YOUR_USERNAME/resume-parser.git
cd resume-parser
npm install
cd frontend && npm install
```

### Local Development

Start LocalStack to emulate AWS services locally:

```bash
docker compose up -d
```

Then start the API:

```bash
sam local start-api
```

The API runs at `http://localhost:3000`.

### Environment Variables

```
AWS_REGION=eu-west-1
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

S3_BUCKET_NAME=resume-parser-uploads
SQS_QUEUE_URL=https://sqs.eu-west-1.amazonaws.com/123/resume-processing
DYNAMODB_TABLE_NAME=resumes
ANTHROPIC_API_KEY=sk-ant-your-key
```

For local dev with LocalStack, the AWS credentials can be any dummy values.

## Deploy

Build and deploy to AWS with SAM:

```bash
sam build
sam deploy --guided
```

On the first deploy, `--guided` walks you through setting the stack name, region, and parameter values (including `AnthropicApiKey`). After that, `sam deploy` picks up the saved config from `samconfig.toml`.

## API

### Upload a resume

```bash
curl -X POST http://localhost:3000/resumes/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "resume.pdf"}'
```

Returns a `resumeId` and a presigned `uploadUrl`. Upload the PDF directly to S3 using the presigned URL:

```bash
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @resume.pdf
```

### Check processing status

```bash
curl http://localhost:3000/resumes/<resumeId>/status
```

### Get parsed resume or search

```bash
curl http://localhost:3000/resumes/<resumeId>

curl "http://localhost:3000/resumes?skill=TypeScript&role=backend"
```

## Frontend

The frontend is a React app in the `frontend/` directory.

```bash
cd frontend
npm run dev
```

Runs on `http://localhost:5173`. Has pages for uploading resumes, viewing parsed results, and searching by skill or role.
