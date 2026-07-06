# Resume Parser

Upload a PDF resume and get back structured JSON with extracted skills, experience, education, and contact info using Claude AI.

> **Semantic search + RAG:** a pgvector-backed semantic search and grounded
> question-answering layer (`POST /search`, `POST /ask`) sits on top of this
> pipeline, with a recall@5 eval harness. See [`docs/RAG.md`](docs/RAG.md).

## Tech Stack

- TypeScript, Node.js 20
- AWS Lambda (4 functions via SAM)
- S3 for file storage, SQS for async processing, DynamoDB for persistence
- Anthropic Claude API for resume extraction
- pdf-parse for PDF text extraction
- Zod for response validation
- React + Vite + shadcn/ui + Tailwind CSS (frontend)
- LocalStack + Docker for local development
- GitHub Actions for CI/CD

## Setup

### Prerequisites

- Node.js 20+
- AWS CLI configured with credentials
- AWS SAM CLI (`brew install aws-sam-cli`)
- Docker

### Install

```bash
git clone https://github.com/lemmy-code/resume-parser.git
cd resume-parser
npm install
cd frontend && npm install
```

### Environment Variables

Backend variables are managed through the SAM template as parameters (`ApiKey`, `AnthropicApiKey`). For local development, create a `.env` file or pass them directly.

Frontend uses a `.env` file in the `frontend/` directory:

```
VITE_UPLOAD_API_URL=https://your-upload-lambda-url
VITE_QUERY_API_URL=https://your-query-lambda-url
VITE_API_KEY=your-api-key
```

See `frontend/.env.example` for reference.

### Local Development

Start LocalStack to emulate AWS services locally:

```bash
docker compose up -d
```

Then start the Lambda functions:

```bash
sam local start-api
```

## Deploy

Build and deploy to AWS:

```bash
sam build
sam deploy --guided
```

First deploy walks you through stack name, region, and parameter values. After that, `sam deploy` uses the saved config.

Frontend deploy:

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-frontend-bucket --delete
```

## API

All endpoints require an `x-api-key` header.

### Upload a resume

```bash
curl -X POST https://your-upload-url/resumes/upload \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"filename": "resume.pdf"}'
```

Returns a `resumeId` and a presigned `uploadUrl`. Upload the PDF directly to S3:

```bash
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @resume.pdf
```

### Check processing status

```bash
curl https://your-query-url/resumes/<resumeId>/status \
  -H "x-api-key: your-key"
```

### Get parsed resume

```bash
curl https://your-query-url/resumes/<resumeId> \
  -H "x-api-key: your-key"
```

### Search by skill

```bash
curl "https://your-query-url/resumes?skill=TypeScript" \
  -H "x-api-key: your-key"
```

## Frontend

```bash
cd frontend
npm run dev
```

Runs on `http://localhost:5173`. Upload resumes, track processing status, view parsed results, and search by skill.
