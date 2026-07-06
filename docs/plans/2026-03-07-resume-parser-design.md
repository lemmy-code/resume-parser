# Resume Parser - Design Document

## Overview

AI-powered resume processing pipeline on AWS. User uploads a PDF resume, system extracts structured data using Claude API, stores in DynamoDB, searchable via API.

## Decisions

- Region: eu-west-1
- API: Lambda Function URLs (no API Gateway)
- Auth: API key in x-api-key header
- Frontend: React + Vite + shadcn/ui + Tailwind CSS, hosted on S3
- Backend: AWS SAM (TypeScript, Node.js 20)
- Tests: none
- Deploy: SAM for backend, shell script for frontend, GitHub Actions CI/CD
- Local dev: LocalStack + Docker Compose

## Backend

### Lambda Functions

**1. Upload Lambda (POST /resumes/upload)**
- Accepts `{ filename }`, validates .pdf extension
- Generates UUID resumeId
- Creates DynamoDB item with status: "pending"
- Generates presigned S3 PUT URL (5 min expiry)
- Returns `{ resumeId, uploadUrl }`

**2. Trigger Lambda (S3 ObjectCreated event)**
- Extracts resumeId from S3 key (format: `uploads/{resumeId}.pdf`)
- Sends SQS message with `{ resumeId, s3Key }`
- Updates DynamoDB status to "processing"

**3. Processor Lambda (SQS trigger)**
- Downloads PDF from S3
- Extracts text with pdf-parse
- Sends to Claude API with structured prompt
- Validates response with Zod
- Writes parsedData to DynamoDB, status "completed"
- On failure: status "failed" + errorMessage
- DLQ after 3 retries

**4. Query Lambda (HTTP)**
- GET /resumes/:id — full resume
- GET /resumes/:id/status — status only (polling)
- GET /resumes?skill=X — Scan with filter

All lambdas validate x-api-key header.

### DynamoDB Schema

Table: resumes
- PK: resumeId (String, UUID)
- status: pending | processing | completed | failed
- s3Key: S3 path to PDF
- uploadedAt: ISO timestamp
- parsedData: Map (populated after processing)
- processedAt: ISO timestamp
- errorMessage: String (if failed)
- ttl: Number (epoch, 90 days)

GSI: status-index (PK: status, SK: uploadedAt)
Skills search: Scan with filter (sufficient for portfolio scale)

### Claude Prompt

Structured prompt requesting JSON output with: fullName, email, phone, location, summary, totalYearsExperience, skills, languages, experience[], education[], certifications[].

## Frontend

### Pages

1. **Upload page** — drag & drop or file picker, uploads via presigned URL, auto-polls status, shows parsed result
2. **Search page** — skill search input, results list with basic info
3. **Resume detail page** — full parsed data display

### Tech
- React + Vite
- shadcn/ui (Card, Button, Input, Badge, Skeleton)
- Tailwind CSS
- React Router

### UX
- Upload triggers automatic polling every 2 seconds
- When completed, displays parsed data immediately
- No manual refresh needed

## Infrastructure (SAM)

- S3 bucket: PDF uploads (CORS enabled)
- S3 bucket: frontend static site
- SQS queue + DLQ
- DynamoDB table + GSI
- 4 Lambda functions with Function URLs
- IAM roles with least-privilege

## Environment Variables

Lambdas: S3_BUCKET_NAME, SQS_QUEUE_URL, DYNAMODB_TABLE_NAME, API_KEY
Processor additionally: ANTHROPIC_API_KEY

## Deploy

- Backend: sam build && sam deploy
- Frontend: npm run build && aws s3 sync dist/ s3://frontend-bucket
- CI/CD: GitHub Actions pipeline
