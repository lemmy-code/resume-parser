# Resume Parser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered resume processing pipeline on AWS with a React frontend.

**Architecture:** 4 Lambda functions (upload, trigger, processor, query) connected via S3 events and SQS. React frontend uploads PDFs via presigned URLs and polls for results. Claude API extracts structured data from resumes.

**Tech Stack:** TypeScript, AWS SAM, Lambda (Node.js 20), S3, SQS, DynamoDB, Anthropic SDK, pdf-parse, Zod, React, Vite, shadcn/ui, Tailwind CSS.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "resume-parser",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@aws-sdk/client-dynamodb": "^3.700.0",
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/client-sqs": "^3.700.0",
    "@aws-sdk/lib-dynamodb": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "pdf-parse": "^1.1.1",
    "uuid": "^11.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.145",
    "@types/node": "^22.0.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.0",
    "esbuild": "^0.24.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "frontend"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.aws-sam/
samconfig.toml
.env
frontend/node_modules/
frontend/dist/
```

**Step 4: Install dependencies**

Run: `npm install`

---

### Task 2: Types and Zod schemas

**Files:**
- Create: `src/types/index.ts`
- Create: `src/schemas/resume.schema.ts`

**Step 1: Create shared types**

`src/types/index.ts` — define interfaces for ResumeDocument, ExperienceEntry, EducationEntry, ParsedResumeData, and the SQS message shape.

**Step 2: Create Zod schemas**

`src/schemas/resume.schema.ts` — Zod schema matching the Claude API response structure. Used to validate Claude output before writing to DynamoDB. Schema fields: fullName, email, phone (nullable), location (nullable), summary (nullable), totalYearsExperience, skills[], languages[], experience[], education[], certifications[].

---

### Task 3: Lib helpers — S3, SQS, DynamoDB, Claude, PDF

**Files:**
- Create: `src/lib/s3.ts`
- Create: `src/lib/sqs.ts`
- Create: `src/lib/dynamodb.ts`
- Create: `src/lib/claude.ts`
- Create: `src/lib/pdfParser.ts`

**Step 1: S3 helper** (`src/lib/s3.ts`)

- `generatePresignedUploadUrl(key: string): Promise<string>` — PutObject presigned URL, 5 min expiry, content-type application/pdf
- `downloadFile(key: string): Promise<Buffer>` — GetObject, return body as Buffer

Uses env: `S3_BUCKET_NAME`

**Step 2: SQS helper** (`src/lib/sqs.ts`)

- `sendProcessingMessage(resumeId: string, s3Key: string): Promise<void>` — sends JSON message to queue

Uses env: `SQS_QUEUE_URL`

**Step 3: DynamoDB helper** (`src/lib/dynamodb.ts`)

- `createResume(resumeId: string, s3Key: string): Promise<void>` — PutItem with status "pending", uploadedAt, ttl (90 days)
- `updateStatus(resumeId: string, status: string, extra?: object): Promise<void>` — UpdateItem
- `saveParseResult(resumeId: string, parsedData: ParsedResumeData): Promise<void>` — update with parsedData, status "completed", processedAt
- `saveFailed(resumeId: string, errorMessage: string): Promise<void>` — status "failed" + errorMessage
- `getResume(resumeId: string): Promise<ResumeDocument | null>` — GetItem
- `searchResumes(skill?: string): Promise<ResumeDocument[]>` — Scan with optional filter on parsedData.skills contains skill

Uses env: `DYNAMODB_TABLE_NAME`

**Step 4: Claude helper** (`src/lib/claude.ts`)

- `extractResumeData(text: string): Promise<ParsedResumeData>` — sends structured prompt to Claude API, parses JSON response, validates with Zod schema
- Uses claude-sonnet model
- Prompt asks for exact JSON structure matching Zod schema

Uses env: `ANTHROPIC_API_KEY`

**Step 5: PDF parser** (`src/lib/pdfParser.ts`)

- `extractText(buffer: Buffer): Promise<string>` — uses pdf-parse to extract text from PDF buffer

---

### Task 4: Upload Lambda

**Files:**
- Create: `src/functions/upload.ts`

**Step 1: Implement handler**

- Validate `x-api-key` header against env `API_KEY`
- Parse body, validate filename ends with `.pdf`
- Generate UUID with `uuid` package
- S3 key format: `uploads/{resumeId}.pdf`
- Call `createResume()` to write pending item to DynamoDB
- Call `generatePresignedUploadUrl()` to get presigned URL
- Return 200 with `{ resumeId, uploadUrl }`
- CORS headers on response: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type, x-api-key`
- Handle OPTIONS preflight

---

### Task 5: Trigger Lambda

**Files:**
- Create: `src/functions/trigger.ts`

**Step 1: Implement handler**

- Receives S3Event (ObjectCreated)
- Extract s3Key from event record
- Extract resumeId from key (parse `uploads/{resumeId}.pdf`)
- Call `updateStatus(resumeId, "processing")`
- Call `sendProcessingMessage(resumeId, s3Key)`
- No API key check needed (internal trigger, not HTTP)

---

### Task 6: Processor Lambda

**Files:**
- Create: `src/functions/processor.ts`

**Step 1: Implement handler**

- Receives SQSEvent
- For each record: parse body to get `{ resumeId, s3Key }`
- Download PDF from S3 with `downloadFile(s3Key)`
- Extract text with `extractText(buffer)`
- Call `extractResumeData(text)` to get structured data from Claude
- Call `saveParseResult(resumeId, parsedData)`
- On any error: call `saveFailed(resumeId, error.message)`, but do NOT throw (to prevent SQS retry for known failures like empty PDFs)
- For unexpected errors (network, SDK): throw to allow SQS retry → DLQ after 3

---

### Task 7: Query Lambda

**Files:**
- Create: `src/functions/query.ts`

**Step 1: Implement handler**

- Validate `x-api-key` header
- Parse URL path from the event (Function URL event format uses `rawPath` and `queryStringParameters`)
- Route:
  - `GET /resumes/{id}/status` → getResume, return `{ status }` only
  - `GET /resumes/{id}` → getResume, return full document
  - `GET /resumes?skill=X` → searchResumes with filter
- 404 if resume not found
- CORS headers on all responses
- Handle OPTIONS preflight

---

### Task 8: SAM Template

**Files:**
- Create: `infra/template.yaml`

**Step 1: Write SAM template**

Resources:
- **S3 Bucket** (`ResumeUploadsBucket`): CORS config allowing PUT from any origin
- **SQS Queue** (`ProcessingQueue`): VisibilityTimeout 300s, RedrivePolicy → DLQ after 3 receives
- **SQS DLQ** (`ProcessingDLQ`): standard queue
- **DynamoDB Table** (`ResumesTable`): PK resumeId, GSI status-index (PK: status, SK: uploadedAt), TTL on `ttl` attribute
- **Upload Lambda**: Function URL enabled, env vars (S3_BUCKET_NAME, DYNAMODB_TABLE_NAME, API_KEY), IAM: s3:PutObject, dynamodb:PutItem
- **Trigger Lambda**: S3 event source (ObjectCreated, prefix: uploads/), env vars (SQS_QUEUE_URL, DYNAMODB_TABLE_NAME), IAM: sqs:SendMessage, dynamodb:UpdateItem
- **Processor Lambda**: SQS event source, timeout 60s, memory 512MB, env vars (S3_BUCKET_NAME, DYNAMODB_TABLE_NAME, ANTHROPIC_API_KEY), IAM: s3:GetObject, dynamodb:UpdateItem
- **Query Lambda**: Function URL enabled, env vars (DYNAMODB_TABLE_NAME, API_KEY), IAM: dynamodb:GetItem, dynamodb:Scan

Parameters:
- `ApiKey` (NoEcho)
- `AnthropicApiKey` (NoEcho)

Outputs:
- UploadFunctionUrl
- QueryFunctionUrl

All Lambdas use `nodejs20.x`, handler points to dist bundle, CodeUri: `.`

Use esbuild bundling via SAM `Metadata.BuildMethod: esbuild` with `EntryPoints` for each function.

---

### Task 9: Docker Compose for LocalStack

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/localstack-init.sh`

**Step 1: docker-compose.yml**

LocalStack container with S3, SQS, DynamoDB services. Port 4566.

**Step 2: LocalStack init script**

Shell script that creates:
- S3 bucket `resume-parser-uploads`
- SQS queue `resume-processing` + DLQ
- DynamoDB table `resumes` with GSI

---

### Task 10: Frontend scaffolding

**Files:**
- Create: `frontend/` (Vite + React + TypeScript project)

**Step 1: Scaffold Vite project**

Run: `npm create vite@latest frontend -- --template react-ts`

**Step 2: Install dependencies**

Run inside `frontend/`:
```bash
npm install react-router-dom
npx shadcn@latest init
npx shadcn@latest add card button input badge skeleton
```

Plus Tailwind CSS setup via Vite.

**Step 3: Create API client**

`frontend/src/api/client.ts` — wrapper for all API calls:
- `requestUpload(filename: string)` → POST upload lambda URL
- `uploadFile(url: string, file: File)` → PUT to presigned URL
- `getStatus(resumeId: string)` → GET status endpoint
- `getResume(resumeId: string)` → GET full resume
- `searchResumes(skill: string)` → GET search endpoint

API base URL and API key from env vars (`VITE_API_URL`, `VITE_API_KEY`).

---

### Task 11: Frontend — Upload page

**Files:**
- Create: `frontend/src/pages/UploadPage.tsx`
- Create: `frontend/src/components/FileDropzone.tsx`
- Create: `frontend/src/components/ProcessingStatus.tsx`
- Create: `frontend/src/components/ResumeResult.tsx`

**Step 1: FileDropzone component**

Drag & drop zone + file picker. Accepts only .pdf files. Shows selected filename. Upload button.

**Step 2: ProcessingStatus component**

Shows current status with animated skeleton/spinner. Polls every 2 seconds using setInterval. Stops polling when status is "completed" or "failed".

**Step 3: ResumeResult component**

Displays parsed resume data: name, email, phone, location, summary, skills (as badges), experience entries (cards), education, certifications.

**Step 4: UploadPage**

Combines all three components. Flow:
1. Show dropzone
2. On upload: call requestUpload → uploadFile → show ProcessingStatus
3. When completed: show ResumeResult

---

### Task 12: Frontend — Search page

**Files:**
- Create: `frontend/src/pages/SearchPage.tsx`
- Create: `frontend/src/components/ResumeCard.tsx`

**Step 1: SearchPage**

Input field for skill search. Submit triggers searchResumes API call. Results displayed as list of ResumeCard components.

**Step 2: ResumeCard**

Card showing: fullName, top skills (badges), totalYearsExperience. Links to detail page.

---

### Task 13: Frontend — Detail page and routing

**Files:**
- Create: `frontend/src/pages/DetailPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/Layout.tsx`

**Step 1: DetailPage**

Fetches resume by ID from URL param. Displays full parsed data using ResumeResult component.

**Step 2: Layout**

Simple nav bar with links to Upload and Search pages.

**Step 3: App.tsx routing**

React Router setup:
- `/` → UploadPage
- `/search` → SearchPage
- `/resumes/:id` → DetailPage

---

### Task 14: GitHub Actions deploy pipeline

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Write workflow**

Triggers on push to main. Two jobs:

**Job 1: deploy-backend**
- Checkout
- Setup Node 20
- npm install
- sam build
- sam deploy (uses GitHub secrets for AWS credentials, API keys)

**Job 2: deploy-frontend**
- Checkout
- cd frontend && npm install && npm run build
- aws s3 sync dist/ to frontend bucket (bucket name from SAM outputs or hardcoded)

---

### Task 15: README

**Files:**
- Modify: existing README or create clean one

**Step 1: Write clean README**

Sections: what it does (brief), tech stack, setup instructions (AWS account, API keys, local dev, deploy), API endpoints, environment variables. Keep it concise, no ASCII art, no diagrams, written naturally.

---

## Execution Order

Tasks 1-3 are foundation (must be first, sequential).
Tasks 4-7 are the 4 Lambdas (can be parallel after Task 3).
Task 8 is SAM template (after Tasks 4-7, needs to reference all functions).
Task 9 is LocalStack (independent, can be parallel with Tasks 4-7).
Tasks 10-13 are frontend (sequential, can start after Task 4+7 since it needs API shape).
Task 14 is CI/CD (after everything else).
Task 15 is README (last).
