# ResumeParser 🤖

> AI-powered resume processing pipeline built on AWS.  
> Upload a PDF resume → S3 triggers Lambda → Claude AI extracts structured data → stored in DynamoDB → searchable via Query API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | AWS Lambda (Node.js 20) |
| File Storage | AWS S3 |
| Queue | AWS SQS |
| Database | AWS DynamoDB |
| AI Extraction | Anthropic Claude API (claude-sonnet) |
| PDF Parsing | pdf-parse |
| API | AWS Lambda HTTP (Function URLs) |
| Validation | Zod |
| IaC | AWS SAM (Serverless Application Model) |
| Local Dev | LocalStack + Docker |
| Testing | Jest + AWS SDK mocks |
| CI/CD | GitHub Actions → AWS deploy |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Upload Lambda (HTTP)                │
│                                                  │
│  POST /resumes/upload                            │
│    → generate presigned S3 URL                  │
│    → return URL to client                        │
│    → client uploads PDF directly to S3          │
└─────────────────────────────────────────────────┘
                      │ S3 Event (ObjectCreated)
                      ▼
┌─────────────────────────────────────────────────┐
│            Trigger Lambda (S3 Trigger)           │
│                                                  │
│    → receives S3 event                           │
│    → publishes message to SQS                   │
│    → returns immediately                         │
└─────────────────────┬───────────────────────────┘
                      │ SQS message
                      ▼
┌─────────────────────────────────────────────────┐
│           Processor Lambda (SQS Trigger)         │
│                                                  │
│    → download PDF from S3                        │
│    → extract text (pdf-parse)                    │
│    → send to Claude API with structured prompt   │
│    → parse JSON response                         │
│    → save to DynamoDB                            │
│    → on failure → SQS DLQ after 3 retries       │
└─────────────────────┬───────────────────────────┘
                      │ write / read
                      ▼
┌─────────────────────────────────────────────────┐
│                  DynamoDB                        │
│                                                  │
│  table: resumes                                  │
│  partition key: resumeId                         │
│  GSI: status-index (filter by status)            │
│  GSI: skills-index (search by skill)             │
└─────────────────────┬───────────────────────────┘
                      │ read
                      ▼
┌─────────────────────────────────────────────────┐
│             Query Lambda (HTTP)                  │
│                                                  │
│  GET /resumes/:id          → single resume       │
│  GET /resumes?skill=&role= → search              │
│  GET /resumes/:id/status   → processing status   │
└─────────────────────────────────────────────────┘
```

---

## Claude AI Extraction

Processor šalje ovakav prompt Claude API-ju:

```
Extract structured information from this resume text and return ONLY valid JSON.

Resume text:
{extracted_text}

Return this exact structure:
{
  "fullName": "string",
  "email": "string",
  "phone": "string | null",
  "location": "string | null",
  "summary": "string | null",
  "totalYearsExperience": "number",
  "skills": ["string"],
  "languages": ["string"],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "startDate": "string",
      "endDate": "string | null",
      "current": "boolean",
      "description": "string"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "graduationYear": "number | null"
    }
  ],
  "certifications": ["string"]
}
```

---

## DynamoDB Schema

```typescript
interface ResumeDocument {
  resumeId: string          // PK — UUID
  status: 'pending' | 'processing' | 'completed' | 'failed'
  s3Key: string             // original PDF location
  uploadedAt: string        // ISO timestamp

  // populated after AI processing
  parsedData?: {
    fullName: string
    email: string
    phone: string | null
    location: string | null
    summary: string | null
    totalYearsExperience: number
    skills: string[]
    languages: string[]
    experience: ExperienceEntry[]
    education: EducationEntry[]
    certifications: string[]
  }

  processedAt?: string
  errorMessage?: string     // if status = failed
  ttl?: number              // auto-expire after 90 days
}
```

---

## Project Structure

```
resume-parser/
├── .github/
│   └── workflows/
│       └── deploy.yml          GitHub Actions → AWS deploy
│
├── infra/
│   └── template.yaml           AWS SAM template (IaC)
│
├── src/
│   ├── functions/
│   │   ├── upload.ts           HTTP — presigned S3 URL
│   │   ├── trigger.ts          S3 Event → SQS
│   │   ├── processor.ts        SQS → PDF → Claude → DynamoDB
│   │   └── query.ts            HTTP — search + get resume
│   │
│   ├── lib/
│   │   ├── s3.ts               S3 client helpers
│   │   ├── sqs.ts              SQS sender
│   │   ├── dynamodb.ts         DynamoDB client helpers
│   │   ├── claude.ts           Anthropic SDK wrapper
│   │   └── pdfParser.ts        pdf-parse wrapper
│   │
│   ├── schemas/
│   │   └── resume.schema.ts    Zod schemas
│   │
│   └── types/
│       └── index.ts
│
├── tests/
│   ├── upload.test.ts
│   ├── processor.test.ts
│   └── query.test.ts
│
├── samconfig.toml              SAM deploy config
├── package.json
└── tsconfig.json
```

---

## Lambda Functions — 4 Functions

### 1. `upload` — HTTP Trigger
Prima zahtev za upload, vraća presigned S3 URL. Klijent direktno uploaduje PDF na S3 — Lambda ne dira fajl.

```
POST /resumes/upload
{ "filename": "john-doe-cv.pdf" }

→ 200 { "resumeId": "uuid", "uploadUrl": "https://s3.amazonaws.com/..." }
```

### 2. `trigger` — S3 Trigger
Okida se kad PDF stigne u S3. Samo prosleđuje poruku na SQS — ne radi ništa teško.

### 3. `processor` — SQS Trigger
Srce sistema. Skida PDF, parsira tekst, šalje Claude API-ju, čuva rezultat.

### 4. `query` — HTTP Trigger
Čitanje iz DynamoDB. Podržava search po skills i role.

```
GET /resumes/:id
GET /resumes?skill=TypeScript&role=backend
GET /resumes/:id/status
```

---

## Development Plan

### Phase 1 — Infrastructure (Dan 1)
- [ ] AWS SAM projekt setup
- [ ] `template.yaml` — S3, SQS, DynamoDB, Lambda definicije
- [ ] Docker Compose — LocalStack emulator
- [ ] DynamoDB helper (put, get, query, GSI)
- [ ] S3 helper (presigned URL, download)
- [ ] SQS sender helper
- [ ] Anthropic SDK wrapper sa retry logikom

### Phase 2 — Upload + Trigger (Dan 2)
- [ ] `upload` Lambda — presigned URL generisanje
- [ ] `trigger` Lambda — S3 event → SQS poruka
- [ ] PDF download + pdf-parse integracija
- [ ] Zod schema za parsed resume

### Phase 3 — Processor Lambda (Dan 3)
- [ ] SQS consumer setup
- [ ] PDF tekst ekstrakcija
- [ ] Claude API prompt + JSON parsing
- [ ] DynamoDB upis sa status tracking
- [ ] Error handling — status = failed + errorMessage
- [ ] DLQ konfiguracija u SAM template

### Phase 4 — Query Lambda (Dan 4)
- [ ] `GET /resumes/:id` — single resume
- [ ] `GET /resumes/:id/status` — polling endpoint
- [ ] `GET /resumes?skill=&role=` — GSI search
- [ ] 404 handling za nepostojeće resume

### Phase 5 — Polish (Dan 5)
- [ ] Jest testovi za sve funkcije (mock AWS SDK + Anthropic)
- [ ] GitHub Actions deploy pipeline
- [ ] README — architecture diagram, API reference, lokalni setup
- [ ] LocalStack smoke test skript

---

## Quick Start (Local)

```bash
git clone https://github.com/YOUR_USERNAME/resume-parser
cd resume-parser

# Install AWS SAM CLI
brew install aws-sam-cli  # macOS
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Install dependencies
npm install

# Start LocalStack (S3, SQS, DynamoDB emulator)
docker compose up -d

# Start Lambda functions locally
sam local start-api

# API available at http://localhost:3000
```

---

## API Examples

```bash
# 1. Request upload URL
curl -X POST http://localhost:3000/resumes/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "john-doe.pdf"}'
# -> { "resumeId": "uuid-123", "uploadUrl": "https://..." }

# 2. Upload PDF directly to S3
curl -X PUT "https://presigned-url-from-above" \
  -H "Content-Type: application/pdf" \
  --data-binary @john-doe.pdf

# 3. Poll status
curl http://localhost:3000/resumes/uuid-123/status
# -> { "status": "processing" }
# -> { "status": "completed" }

# 4. Get parsed resume
curl http://localhost:3000/resumes/uuid-123
# -> { "resumeId": "...", "parsedData": { "fullName": "John Doe", "skills": ["TypeScript", "Node.js", ...] } }

# 5. Search by skill
curl "http://localhost:3000/resumes?skill=TypeScript&role=backend"
# -> [{ "resumeId": "...", "fullName": "John Doe", "totalYearsExperience": 3, ... }]
```

---

## Environment Variables

```env
# AWS (LocalStack local dev)
AWS_REGION=eu-west-1
AWS_ENDPOINT_URL=http://localhost:4566  # LocalStack
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# S3
S3_BUCKET_NAME=resume-parser-uploads

# SQS
SQS_QUEUE_URL=https://sqs.eu-west-1.amazonaws.com/123/resume-processing

# DynamoDB
DYNAMODB_TABLE_NAME=resumes

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
```

---

## Key Concepts Demonstrated

- **AWS Lambda** — serverless functions, 4 različita trigger tipa
- **S3 Presigned URLs** — secure direktan upload bez Lambda kao proxy
- **SQS** — decoupled async processing, DLQ za failed messages
- **DynamoDB GSI** — Global Secondary Index za search po skills/role
- **AI Integration** — Claude API sa structured output promptom
- **AWS SAM IaC** — infrastruktura kao kod, reproducible deployments
- **LocalStack** — lokalni AWS emulator, razvoj bez cloud troškova
- **Status Polling** — async processing pattern sa status tracking
- **TTL** — DynamoDB auto-expire starih dokumenata

---

*Built as a portfolio project to demonstrate AWS serverless architecture with AI-powered document processing.*
