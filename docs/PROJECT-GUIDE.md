# Resume Parser — Kompletni vodic

## Sta je Resume Parser

Resume Parser je aplikacija koja prima PDF resume, izvlaci tekst, salje ga Claude AI-ju koji vraca strukturirane podatke (ime, email, skills, radno iskustvo, edukacija), i cuva ih u bazu. Korisnik moze da pretrazuje po skills-u i pregleda parsirane podatke kroz web interfejs.

Projekat demonstrira serverless arhitekturu na AWS-u sa AI integracijom, event-driven procesiranjem i modernim frontend stackom.

---

## Selling pointi

### Za recruitere i hiring managere

- **AWS Serverless** — 4 Lambda funkcije, S3, SQS, DynamoDB, SAM IaC — pokriva najtrazenije AWS servise
- **AI integracija** — Claude API sa structured output promptom, Zod validacija odgovora
- **Presigned S3 URL pattern** — jedno od najcescih interview pitanja za backend pozicije
- **Event-driven arhitektura** — S3 event → Lambda → SQS → Lambda, asinhroni processing pipeline
- **DynamoDB GSI** — pokazuje razumevanje NoSQL dizajna, ne samo CRUD
- **Status polling** — async UX pattern koji se koristi u svakom production sistemu
- **Dead Letter Queue** — graceful failure handling, poruka se ne gubi
- **Infrastructure as Code** — ceo stack je u jednom YAML fajlu, reproducible deployments
- **CI/CD** — GitHub Actions pipeline koji automatski deployuje na AWS
- **Moderan frontend** — React + Vite + shadcn/ui + Tailwind CSS

### Sta izdvaja ovaj projekat od tipicnih portfolio projekata

1. Nije CRUD — ima pravi async processing pipeline sa vise servisa
2. Koristi AI na smislen nacin — ne samo wrapper oko API-ja, vec ekstrahuje strukturirane podatke sa validacijom
3. Production-grade patterni — DLQ, TTL, least-privilege IAM, API key auth
4. Deployovan na AWS — nije samo lokalni projekat, radi uzivo

---

## Kako aplikacija radi — korak po korak

### 1. Korisnik uploaduje PDF

Korisnik otvara web stranicu, prevlaci PDF na drag & drop zonu i klikne Upload.

### 2. Frontend trazi upload URL (Upload Lambda)

Frontend salje POST zahtev na Upload Lambda sa imenom fajla. Lambda:
- Validira da je fajl `.pdf`
- Generise jedinstven UUID (`resumeId`)
- Kreira zapis u DynamoDB sa statusom `pending`
- Generise presigned S3 PUT URL koji vazi 5 minuta
- Vraca `resumeId` i `uploadUrl` frontendu

### 3. Frontend uploaduje PDF direktno na S3

Frontend koristi presigned URL da uploaduje PDF direktno na S3 — Lambda nikad ne dodiruje fajl. Ovo je kljucni pattern:
- Nema Lambda payload limita (inace ogranicen na 6MB)
- S3 prima fajlove do 5TB
- Lambda ne trosi vreme na transfer fajla
- URL je potpisan i istice za 5 minuta — ne moze se zloupotrebiti

### 4. S3 okida Trigger Lambda

Kad PDF stigne u S3, S3 emituje ObjectCreated event koji automatski poziva Trigger Lambda. Trigger Lambda:
- Izvlaci `resumeId` iz S3 key-a (format: `uploads/{resumeId}.pdf`)
- Menja status u DynamoDB na `processing`
- Salje poruku na SQS queue sa `resumeId` i `s3Key`

Trigger Lambda ne radi tezak posao — samo prosleđuje poruku. Ovo je namerno razdvojeno da bi SQS mogao da hendla retry logiku.

### 5. Processor Lambda obradjuje resume

SQS isporucuje poruku Processor Lambda-i. Ovo je srce sistema:
- Skida PDF iz S3
- `pdf-parse` biblioteka izvlaci tekst iz PDF-a
- Ako tekst ima manje od 50 karaktera, smatra da PDF nema citljiv tekst i failuje
- Salje tekst Claude API-ju sa structured promptom koji trazi tacan JSON format
- Claude vraca JSON sa svim podacima (ime, email, skills, experience, education...)
- Zod schema validira odgovor — ako Claude vrati nesto neocekivano, hvata gresku
- Cuva parsirane podatke u DynamoDB sa statusom `completed`
- Ako bilo sta failuje — cuva status `failed` sa error porukom

Ako Processor Lambda pukne (npr. network error), SQS automatski ponovo salje poruku. Posle 3 neuspesna pokusaja, poruka ide u Dead Letter Queue gde moze da se ispita sta je poslo po zlu.

### 6. Frontend poluje status

Dok se resume procesira, frontend svakih 2 sekunde salje GET zahtev na Query Lambda pitajuci za status:
- `pending` → "Waiting to process..."
- `processing` → "Analyzing resume with AI..."
- `completed` → prikazuje parsirane podatke
- `failed` → prikazuje gresku

Kad dobije `completed`, prestaje da poluje i prikazuje rezultat.

### 7. Pretraga

Korisnik moze da pretrazi sve procesirane resume-ove po skill-u. Query Lambda skenira DynamoDB tabelu i filtrira po sadrzaju `skills` niza (case-insensitive).

---

## Tehnologije — sta i zasto

### AWS Lambda (Serverless Compute)

Lambda je serverless — ne placas kad niko ne koristi app. Svaka funkcija radi jednu stvar (Single Responsibility Principle). Imamo 4 funkcije sa 4 razlicita trigera:

| Funkcija | Trigger | Sta radi |
|----------|---------|----------|
| Upload | HTTP (Function URL) | Generise presigned URL |
| Trigger | S3 Event | Prosledjuje poruku na SQS |
| Processor | SQS | Parsira PDF, poziva Claude, cuva rezultat |
| Query | HTTP (Function URL) | Cita iz DynamoDB, search |

Zasto Function URLs a ne API Gateway? Function URLs su besplatne i jednostavnije. API Gateway bi dodao rate limiting, custom domain, usage plans — ali za portfolio projekat je overkill. Na intervjuu mozes reci: "Za production bih dodao API Gateway ispred za throttling i monitoring."

### S3 (Simple Storage Service)

Skladistenje PDF fajlova. Koristi presigned URL pattern za upload — Lambda generise vremenski ogranicen, potpisan URL koji dozvoljava klijentu da uploaduje fajl direktno na S3.

Zasto presigned URL a ne upload kroz Lambda?
- Lambda payload limit je 6MB, resume moze biti veci
- Ne trosis Lambda compute time na file transfer
- S3 je dizajniran za file storage, Lambda nije

### SQS (Simple Queue Service)

Message queue izmedju Trigger i Processor Lambde. Zasto ne pozovemo Processor direktno iz Trigger-a?

- **Retry** — ako Claude API padne ili Lambda istekne, SQS automatski ponovo salje poruku (do 3 puta)
- **Dead Letter Queue** — posle 3 neuspesna pokusaja, poruka ne nestaje vec ide u DLQ za analizu
- **Throttling** — kontrolise koliko poruka Processor dobija odjednom (BatchSize: 1)
- **Decoupling** — Trigger se vraca odmah, ne ceka obradu koja traje 10-30 sekundi

Visibility Timeout je 300 sekundi — to je vreme koje SQS daje Processoru da zavrsi posao pre nego sto ponovo posalje poruku.

### DynamoDB (NoSQL Database)

NoSQL baza za cuvanje resume podataka. Zasto ne PostgreSQL (RDS)?

- **Pay-per-request** — besplatan za mali saobracaj, nema fiksnih troskova
- **Serverless** — nema servera za odrzavanje
- **TTL (Time to Live)** — automatski brise zapise posle 90 dana
- **GSI (Global Secondary Index)** — `status-index` sa partition key `status` i sort key `uploadedAt` omogucava efikasno filtriranje po statusu

Schema:
- `resumeId` (partition key) — UUID
- `status` — pending | processing | completed | failed
- `s3Key` — putanja do PDF-a u S3
- `uploadedAt` — ISO timestamp
- `parsedData` — Map sa svim parsiranim podacima
- `processedAt` — kad je obrada zavrsena
- `errorMessage` — ako je failovalo
- `ttl` — epoch timestamp za auto-expire

### Claude API (Anthropic)

AI model koji parsira tekst resume-a i vraca strukturiran JSON. Prompt je dizajniran da trazi tacan format sa svim poljima. Model: `claude-sonnet-4-20250514`.

Prompt:
```
Extract structured information from this resume text and return ONLY valid JSON...
```

Claude vraca JSON koji sadrzi: fullName, email, phone, location, summary, totalYearsExperience, skills[], languages[], experience[], education[], certifications[].

### Zod (Runtime Validation)

TypeScript tipovi postoje samo u compile time-u — u runtimeu ne postoje. Kad Claude vrati JSON string, moramo da PROVERIMO da li zaista ima polja koja ocekujemo. Zod schema definise ocekivani oblik i `parsedResumeSchema.parse(data)` baci error ako nesto ne odgovara.

Ovo je bitno jer Claude moze da vrati:
- Pogresan tip (string umesto number za `totalYearsExperience`)
- Polje koje fali
- Dodatna polja koja ne ocekujemo

### SAM (Serverless Application Model)

Infrastructure as Code — ceo AWS stack definisan u `template.yaml`:
- S3 bucket sa CORS konfiguracijom
- SQS queue sa DLQ i retry polisom
- DynamoDB tabela sa GSI i TTL
- 4 Lambda funkcije sa IAM rolama, env varijablama, event source mappingom
- Least-privilege permisije — svaka Lambda ima samo ono sto joj treba:
  - Upload: S3 Write + DynamoDB Write
  - Trigger: SQS Send + DynamoDB Update
  - Processor: S3 Read + DynamoDB Write
  - Query: DynamoDB Read

`sam build` koristi esbuild da bundluje TypeScript u jedan JS fajl. Rezultat: Upload Lambda je 5KB umesto 80MB sa celim node_modules.

### esbuild (Bundler)

Bundler koji pakuje samo kod koji se zaista koristi. AWS SDK (`@aws-sdk/*`) je externalizovan jer ga Lambda runtime vec sadrzi. Aplikacijske zavisnosti (Anthropic SDK, pdf-parse, uuid, zod) se bundluju u jedan fajl.

### React + Vite + shadcn/ui + Tailwind CSS (Frontend)

- **Vite** — brz build tool, zamena za webpack. Hot module replacement, brz dev server.
- **shadcn/ui** — kolekcija UI komponenti (Button, Card, Badge, Input, Skeleton). Nisu npm dependency vec copy-paste source kod koji mozes da prilagodis.
- **Tailwind CSS** — utility-first CSS framework. Klase kao `flex gap-4 p-6 rounded-xl` umesto pisanja custom CSS-a.
- **React Router** — client-side routing izmedju Upload, Search i Detail stranica.

### GitHub Actions (CI/CD)

Pipeline koji se okida na push u main branch:
1. **deploy-backend** — checkout, npm install, sam build, sam deploy
2. **deploy-frontend** — zavisi od backend-a, npm install, npm run build (sa env varijablama iz secrets), aws s3 sync

---

## Struktura projekta

```
resume-parser/
├── src/
│   ├── functions/
│   │   ├── upload.ts        # HTTP — presigned S3 URL generisanje
│   │   ├── trigger.ts       # S3 Event → SQS poruka
│   │   ├── processor.ts     # SQS → PDF → Claude → DynamoDB
│   │   └── query.ts         # HTTP — search + get resume
│   ├── lib/
│   │   ├── s3.ts            # S3 client (presigned URL, download)
│   │   ├── sqs.ts           # SQS sender
│   │   ├── dynamodb.ts      # DynamoDB operacije
│   │   ├── claude.ts        # Anthropic SDK wrapper
│   │   └── pdfParser.ts     # pdf-parse wrapper
│   ├── schemas/
│   │   └── resume.schema.ts # Zod validacija
│   └── types/
│       └── index.ts         # TypeScript interfejsi
├── frontend/
│   ├── src/
│   │   ├── api/client.ts    # API pozivi ka backendu
│   │   ├── components/      # UI komponente
│   │   └── pages/           # Upload, Search, Detail stranice
│   └── .env                 # API URL-ovi i key (nije u git-u)
├── template.yaml            # SAM infrastruktura
├── docker-compose.yml       # LocalStack za lokalni dev
├── scripts/
│   └── localstack-init.sh   # Kreira lokalne AWS resurse
└── .github/workflows/
    └── deploy.yml           # CI/CD pipeline
```

---

## Sigurnosne odluke

1. **API Key autentikacija** — svaki HTTP endpoint zahteva `x-api-key` header. Key se cuva u Lambda env varijablama (prosle|en kao SAM parametar sa NoEcho)
2. **Presigned URL expiry** — upload URL vazi samo 5 minuta
3. **Least-privilege IAM** — svaka Lambda ima minimalne permisije. Upload ne moze da cita iz S3, Query ne moze da pise u DynamoDB
4. **Env varijable** — nijedan secret nije hardkodiran. API keyevi su u SAM parametrima (NoEcho), frontend secrets su u `.env` (gitignored)
5. **Input validacija** — filename mora da bude `.pdf`, Claude odgovor se validira Zod shemom
6. **CORS** — konfigurisano na S3 bucketu i Lambda odgovorima

---

## Error handling

| Scenario | Sta se desava |
|----------|---------------|
| Upload bez API key-a | 401 Unauthorized |
| Upload .docx fajla | 400 "Only .pdf files accepted" |
| Resume ne postoji | 404 "Resume not found" |
| PDF bez teksta | Status: failed, "PDF contains no extractable text" |
| Claude vrati pogresan format | Zod baci error, status: failed |
| Claude API padne | SQS retry (do 3 puta), zatim DLQ |
| DynamoDB error u Query | 500 Internal server error (try/catch) |

---

## Arhitekturni patterni — za intervju

### 1. Presigned URL Pattern
Klijent uploaduje fajl direktno na S3 bez prolaska kroz server. Server samo generise vremenski ogranicen, potpisan URL. Koristi se u svakom production sistemu koji hendla file upload.

### 2. Event-Driven Architecture
Servisi komuniciraju kroz evente: S3 event okida Lambda, Lambda salje poruku na SQS, SQS okida drugu Lambda. Nema direktnog pozivanja — svaki servis radi nezavisno.

### 3. Fan-out sa Message Queue
SQS omogucava da Trigger i Processor rade nezavisno. Trigger se vraca odmah, Processor radi u pozadini. Ako Processor padne, poruka se ponovo isporucuje.

### 4. Dead Letter Queue
Poruke koje ne mogu da se procesiraju posle 3 pokusaja idu u poseban DLQ. Omogucava analizu sta je poslo po zlu bez gubitka podataka.

### 5. Status Polling
Frontend periodično proverava status obrade. Alternativa je WebSocket ili Server-Sent Events, ali polling je jednostavniji i dovoljno dobar za ovaj use case.

### 6. TTL (Time to Live)
DynamoDB automatski brise zapise posle 90 dana. Nema potrebe za cron jobom ili manual cleanupom.

### 7. Infrastructure as Code
Ceo stack je u YAML fajlu. `sam deploy` kreira sve resurse. Mozes obrisati i ponovo kreirati ceo stack za 3 minuta.

---

## Kako je projekat napravljen — implementacija

### Redosled pravljenja

Projekat je gradjen u slojevima, od dna ka vrhu:

1. **Scaffolding** — `package.json`, `tsconfig.json`, `.gitignore`, `npm install`
2. **Tipovi i sheme** — prvo definises oblik podataka (`src/types/index.ts`, `src/schemas/resume.schema.ts`)
3. **Lib helperi** — wrapper-i za svaki AWS servis (`src/lib/`)
4. **Lambda funkcije** — koriste helpere, svaka radi jednu stvar (`src/functions/`)
5. **SAM template** — povezuje sve u infrastrukturu (`template.yaml`)
6. **Frontend** — scaffold Vite, dodaj shadcn, napravi stranice
7. **CI/CD** — GitHub Actions pipeline
8. **Deploy** — sam build + sam deploy, frontend na S3

Ovo je bottom-up pristup — prvo napravis alate (helpere), onda ih koristis u visim slojevima.

### package.json — zavisnosti

```
Dependencies (runtime):
  @anthropic-ai/sdk     — Claude API klijent
  @aws-sdk/client-*     — S3, SQS, DynamoDB klijenti
  @aws-sdk/lib-dynamodb  — DynamoDB Document Client (jednostavniji API)
  @aws-sdk/s3-request-presigner — presigned URL generisanje
  pdf-parse             — izvlaci tekst iz PDF-a
  uuid                  — generise UUID za resumeId
  zod                   — runtime validacija JSON-a

DevDependencies (samo za development):
  @types/aws-lambda     — TypeScript tipovi za Lambda evente
  @types/node           — Node.js tipovi
  typescript            — TypeScript compiler
  esbuild               — bundler za Lambda pakete
```

`@aws-sdk/*` se ne bundluje u Lambda paket jer ga Lambda runtime vec sadrzi — to je `External` u SAM template-u.

### tsconfig.json — TypeScript konfiguracija

- `target: ES2022` — koristimo moderan JavaScript (top-level await, etc.)
- `module: commonjs` — Lambda ocekuje CommonJS module
- `strict: true` — striktni TypeScript, hvata vise gresaka
- `esModuleInterop: true` — da `import pdf from 'pdf-parse'` radi sa CommonJS modulima
- `skipLibCheck: true` — ne proverava tipove u node_modules (brzi build)

### src/types/index.ts — definicija podataka

Ovde su svi TypeScript interfejsi. Napravljeni su prvi jer definisu oblik podataka koji prolaze kroz ceo sistem:

- `ParsedResumeData` — sta Claude vraca (fullName, email, skills, experience, education...)
- `ResumeDocument` — sta je u DynamoDB (resumeId, status, s3Key, parsedData, ttl...)
- `ExperienceEntry` / `EducationEntry` — ugnjezdeni objekti
- `ProcessingMessage` — oblik SQS poruke (resumeId, s3Key)

### src/schemas/resume.schema.ts — Zod validacija

Zod schema OGLEDALO TypeScript interfejsa, ali radi u runtime-u. Kad Claude vrati JSON string:

```typescript
const parsed = JSON.parse(jsonString);        // samo parsira string u objekat
const validated = parsedResumeSchema.parse(parsed); // PROVERAVA da li objekat ima prava polja
```

Ako Claude vrati `"totalYearsExperience": "five"` umesto broja, Zod baci error i resume dobije status `failed` umesto da cuva lose podatke.

### src/lib/ — helperi (wrapper-i za AWS servise)

Svaki helper je tanak wrapper oko AWS SDK-a. Zasto wrapperi umesto direktnog pozivanja?

- **Centralizacija** — bucket name, table name, queue URL su na jednom mestu
- **Apstrakcija** — Lambda funkcije ne znaju za AWS SDK detalje, samo pozivaju `createResume(id, key)`
- **Lakse testiranje** — mozes mockovati jedan helper umesto celog AWS SDK-a

**s3.ts:**
```typescript
// S3 klijent se kreira jednom, van funkcije — reuse izmedju Lambda poziva
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' });

// Presigned URL — kreira PutObjectCommand sa ContentType: 'application/pdf'
// i potpisuje ga sa expiresIn: 300 (5 minuta)
generatePresignedUploadUrl(key) → string

// Download — GetObject, cita stream u Buffer
downloadFile(key) → Buffer
```

**dynamodb.ts:**
```typescript
// Koristi DynamoDBDocumentClient umesto obicnog DynamoDBClient
// Document Client automatski konvertuje JS objekte u DynamoDB format i obratno
const docClient = DynamoDBDocumentClient.from(dynamoClient);

createResume(resumeId, s3Key)    — PutCommand, status "pending", TTL = now + 90 dana
updateStatus(resumeId, status)   — UpdateCommand, koristi ExpressionAttributeNames jer je "status" reserved word u DynamoDB
saveParseResult(resumeId, data)  — UpdateCommand, setuje parsedData + status "completed" + processedAt
saveFailed(resumeId, message)    — UpdateCommand, setuje status "failed" + errorMessage
getResume(resumeId)              — GetCommand, vraca null ako ne postoji
searchResumes(skill?)            — ScanCommand, filtrira u kodu (ne u DynamoDB) po statusu i skill-u
```

Zasto `ExpressionAttributeNames: { '#status': 'status' }`? Zato sto je `status` rezervisana rec u DynamoDB — ne mozes je koristiti direktno u UpdateExpression.

Zasto se search radi Scan-om sa filterom u kodu umesto DynamoDB filterom? DynamoDB ne podrzava `contains` na elementima niza u GSI. Za portfolio skalu (par desetina resume-ova) Scan je OK. Za production bi koristio ElasticSearch.

**claude.ts:**
```typescript
// Anthropic SDK automatski cita ANTHROPIC_API_KEY iz env varijable
const anthropic = new Anthropic();

// Salje poruku modelu sa max_tokens: 4096
// Prompt trazi "return ONLY valid JSON" da izbegne markdown oko odgovora
// Ali za svaki slucaj, regex izvlaci JSON iz mogucih ```json ``` blokova
const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
```

**pdfParser.ts:**
```typescript
// Koristi require umesto import jer je pdf-parse CommonJS modul
const pdf = require('pdf-parse');
// Jednostavan wrapper — prima Buffer, vraca tekst
```

**sqs.ts:**
```typescript
// Salje JSON poruku na queue
// MessageBody je string, pa koristimo JSON.stringify({ resumeId, s3Key })
```

### src/functions/ — Lambda handleri

Svaka Lambda ima istu strukturu: primi event, obradi, vrati odgovor.

**upload.ts — HTTP handler:**
```
1. OPTIONS? → vrati CORS headers (browser preflight)
2. Proveri x-api-key header → 401 ako ne valja
3. Parsiraj body, izvuci filename
4. Validacija: mora zavrsavati sa .pdf → 400 ako nije
5. Generisi UUID, kreiraj DynamoDB zapis, generisi presigned URL
6. Vrati { resumeId, uploadUrl }
7. Try/catch oko svega → 500 ako nesto pukne
```

CORS headeri su na SVAKOM odgovoru (ukljucujuci errore) — inace browser nece moci da procita error poruku.

**trigger.ts — S3 event handler:**
```
1. Loop kroz event.Records (moze biti vise fajlova odjednom)
2. Dekoduj S3 key (URL encoding — razmaci su + ili %20)
3. Izvuci resumeId iz key-a: "uploads/abc-123.pdf" → "abc-123"
4. Update status na "processing"
5. Posalji SQS poruku
```

Nema API key provere — ovo je interni trigger, ne HTTP endpoint.

**processor.ts — SQS handler:**
```
1. Loop kroz event.Records
2. Parsiraj SQS body kao ProcessingMessage
3. Try:
   - Skini PDF iz S3
   - Izvuci tekst
   - Proveri da tekst ima >= 50 karaktera
   - Posalji Claude-u, validiraj odgovor
   - Sacuvaj u DynamoDB kao "completed"
4. Catch:
   - Sacuvaj u DynamoDB kao "failed" sa error porukom
   - NE BACA PONOVO error — ovo je svestan izbor
```

Zasto ne bacamo error u catch-u? Kad SQS handler baci error, SQS ponovo salje poruku. To ima smisla za PROLAZNE greske (network timeout). Ali ako PDF nema tekst ili Claude vrati neispravan JSON, ponovo slanje nece pomoci — samo cemo trositi resurse. Zato hvatamo gresku, belezimo je, i NE bacamo ponovo.

**query.ts — HTTP handler:**
```
1. OPTIONS? → CORS
2. Proveri x-api-key
3. Parsiraj rawPath u segmente: "/resumes/abc/status" → ["resumes", "abc", "status"]
4. Route na osnovu broja segmenata:
   - 1 segment ("resumes") → search
   - 2 segmenta ("resumes", id) → get by id
   - 3 segmenta ("resumes", id, "status") → get status only
   - default → 404
5. Try/catch oko svega → 500
```

Routing je rucni jer Function URLs nemaju ugradjeni router kao Express. Parsiramo `rawPath` i split-ujemo po `/`.

### template.yaml — SAM infrastruktura

Kljucne stvari u template-u:

```yaml
# Parametri — prosleđuju se pri deployu, NoEcho znaci da se ne prikazuju u logovima
Parameters:
  ApiKey:
    Type: String
    NoEcho: true

# Globals — default vrednosti za sve Lambda funkcije
Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 30
    MemorySize: 256

# S3 bucket sa CORS — dozvoljava PUT sa bilo kog origina
CorsConfiguration:
  CorsRules:
    - AllowedMethods: [PUT, POST, GET]
      AllowedOrigins: ["*"]

# SQS sa RedrivePolicy — posle 3 pokusaja, poruka ide u DLQ
RedrivePolicy:
  deadLetterTargetArn: !GetAtt ProcessingDLQ.Arn
  maxReceiveCount: 3

# DynamoDB sa GSI i TTL
GlobalSecondaryIndexes:
  - IndexName: status-index
    KeySchema:
      - AttributeName: status    # partition key
        KeyType: HASH
      - AttributeName: uploadedAt  # sort key
        KeyType: RANGE
TimeToLiveSpecification:
  AttributeName: ttl
  Enabled: true

# Lambda sa esbuild — bundluje TypeScript u jedan JS fajl
Metadata:
  BuildMethod: esbuild
  BuildProperties:
    Minify: true
    Target: "es2022"
    EntryPoints:
      - src/functions/upload.ts
    External:
      - "@aws-sdk/*"    # ne bundluj, Lambda runtime ih ima
```

`BillingMode: PAY_PER_REQUEST` za DynamoDB — ne placas za provisioned capacity, samo za stvarne operacije.

### Frontend — kako je napravljen

1. `npm create vite@latest frontend -- --template react-ts` — scaffold projekat
2. Instaliran Tailwind CSS v4 sa `@tailwindcss/vite` pluginom
3. shadcn/ui inicijalizovan — `components.json` konfigurise stil (new-york), path aliase (`@/`)
4. Dodane komponente: `npx shadcn@latest add button card input badge skeleton`
5. Kreiran API client (`src/api/client.ts`) sa 5 funkcija za komunikaciju sa backendom
6. Kreirane 3 stranice: Upload, Search, Detail
7. React Router za navigaciju

**Path alias `@/`** — umesto `../../components/ui/button` pises `@/components/ui/button`. Konfigurisano u `tsconfig.json` (za TypeScript) i `vite.config.ts` (za bundler).

**API client koristi dve razlicite env varijable:**
- `VITE_UPLOAD_API_URL` — URL za Upload Lambda
- `VITE_QUERY_API_URL` — URL za Query Lambda

Jer su to dve razlicite Lambda Function URLs.

**Polling implementacija u ProcessingStatus komponenti:**
```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const { status } = await getStatus(resumeId);
    if (status === 'completed') onComplete(resumeId);
    if (status === 'failed') onFailed();
  }, 2000);  // svake 2 sekunde
  return () => clearInterval(interval);  // cleanup kad se komponenta unmountuje
}, [resumeId]);
```

**State machine u UploadPage:**
```
idle → uploading → processing → completed
                               → failed → (retry) → idle
```

Svako stanje renderuje drugu komponentu:
- `idle` → FileDropzone
- `uploading` → FileDropzone sa disabled dugmetom
- `processing` → ProcessingStatus (poluje)
- `completed` → ResumeResult
- `failed` → Error poruka sa Retry dugmetom

### Deploy — kako je deployovano

**Backend:**
```bash
sam build                    # esbuild bundluje TypeScript
sam deploy --template-file .aws-sam/build/template.yaml  # deployuje built artifakte
```

Bitno: `sam deploy` se poziva sa `.aws-sam/build/template.yaml`, ne sa source template-om. Source template ima `CodeUri: .` sto ukljucuje ceo projekat. Built template ima `CodeUri: UploadFunction` sto ukljucuje samo bundlovani JS fajl (5KB umesto 80MB).

`.samignore` fajl iskljucuje `node_modules/`, `frontend/`, `docs/` i ostalo sto ne treba SAM-u.

**Frontend:**
```bash
cd frontend
npm run build                # Vite bundluje React app u dist/
aws s3 sync dist/ s3://bucket-name --delete  # uploaduje na S3
```

S3 bucket je konfigurisan kao static website sa public read pristupom.

### Problemi koji su reseni tokom razvoja

1. **Lambda velicina 83MB** — SAM je uploadovao ceo node_modules. Reseno sa `.samignore` i koriscenjem built template-a umesto source template-a
2. **S3 bucket name vec zauzet** — S3 imena su globalno unikatna. Dodao `${AWS::AccountId}` u ime bucketa
3. **`@types/aws-lambda` import greska** — treba `import { SQSEvent } from 'aws-lambda'` ne `from '@types/aws-lambda'`
4. **CORS** — browser salje OPTIONS preflight pre svakog POST/GET sa custom headerima. Svaka HTTP Lambda mora da hendla OPTIONS i vraca CORS headere na SVE odgovore (ukljucujuci errore)
5. **DynamoDB reserved word `status`** — mora se koristiti `ExpressionAttributeNames` da bi se `status` koristio u UpdateExpression

---

## Sta bi dodao za production (odgovori za intervju)

Kad te pitaju "sta bi poboljsao", ovo su dobri odgovori:

1. **API Gateway** — rate limiting, throttling, custom domain, API key management na AWS nivou
2. **Cognito** — prava autentikacija sa user poolom, JWT tokenima
3. **CloudFront** — CDN ispred frontenda za HTTPS i brze ucitavanje
4. **ElasticSearch / OpenSearch** — DynamoDB Scan ne skalira. Za production search, koristio bih ElasticSearch sa DynamoDB Streams za sinhronizaciju
5. **WebSocket** — umesto pollinga, real-time notifikacije kad se obrada zavrsi
6. **CloudWatch Alarms** — monitoring za Lambda errore, DLQ dubinu, API latency
7. **S3 Lifecycle Policy** — automatsko prebacivanje starih PDF-ova u S3 Glacier za ustedu
8. **File size validation** — ograniciti velicinu PDF-a na presigned URL nivou
9. **Virus scanning** — skeniranje uploadovanih fajlova pre procesiranja
10. **Multi-tenant** — razdvajanje podataka po korisnicima

---

## Uputstvo za upotrebu

### Pristup aplikaciji

Otvori u browseru:
```
http://resume-parser-frontend-317287357405.s3-website-eu-west-1.amazonaws.com
```

### Upload resume-a

1. Otvori Upload stranicu (glavna stranica)
2. Prevuci PDF na drop zonu ili klikni da izaberes fajl
3. Klikni "Upload"
4. Sacekaj da se procesiranje zavrsi (obicno 10-20 sekundi)
5. Pregledaj parsirane podatke

### Pretraga

1. Klikni "Search" u navigaciji
2. Unesi skill (npr. "TypeScript", "React", "Python")
3. Klikni Search ili pritisni Enter
4. Klikni na rezultat da vidis detalje

### API (bez frontenda)

```bash
# 1. Trazi upload URL
curl -X POST https://rtzy64md3cd4f43sdj2wkt5hri0wqknv.lambda-url.eu-west-1.on.aws/resumes/upload \
  -H "Content-Type: application/json" \
  -H "x-api-key: rp-dev-2026-key" \
  -d '{"filename": "resume.pdf"}'

# 2. Uploaduj PDF na dobijeni uploadUrl
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @resume.pdf

# 3. Proveri status
curl https://3evwkqzscst353sn73eh372f7q0xipwf.lambda-url.eu-west-1.on.aws/resumes/<resumeId>/status \
  -H "x-api-key: rp-dev-2026-key"

# 4. Dobij parsirane podatke
curl https://3evwkqzscst353sn73eh372f7q0xipwf.lambda-url.eu-west-1.on.aws/resumes/<resumeId> \
  -H "x-api-key: rp-dev-2026-key"

# 5. Pretraga po skill-u
curl "https://3evwkqzscst353sn73eh372f7q0xipwf.lambda-url.eu-west-1.on.aws/resumes?skill=TypeScript" \
  -H "x-api-key: rp-dev-2026-key"
```

---

## Troskovi

Ceo projekat radi u AWS Free Tier:
- Lambda: 1 milion besplatnih poziva mesecno
- S3: 5GB besplatnog storage-a
- DynamoDB: 25GB storage + 25 WCU/RCU besplatno
- SQS: 1 milion besplatnih poruka mesecno
- Jedini troskak je Anthropic API key (Claude) — ima besplatan kredit za pocetak
