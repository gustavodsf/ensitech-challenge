# Money Transfer API

A minimal, production-minded REST API for creating accounts and transferring
money between them. Built with Node.js, TypeScript, and Express, using an
in-memory datastore. No authentication/authorization is implemented, as
specified.

## Setup

Requirements: Node.js 18+ and npm.

```bash
npm install
```

## Running locally

```bash
npm run dev     # runs with ts-node-dev, auto-restarts on change
# or
npm run build && npm start   # compiles to dist/ and runs the compiled app
```

The server listens on `http://localhost:3000` by default (override with the
`PORT` environment variable).

## Running tests

```bash
npm test
```

Tests use Jest + Supertest and exercise the Express app directly (no network
calls), covering successful transfers and all the failure cases in the
spec (missing accounts, insufficient funds, invalid/negative amounts,
self-transfers, invalid account creation input).

Other useful scripts:

```bash
npm run lint   # type-checks the project without emitting output
npm run build  # compiles src/ to dist/
```

## API reference

All responses are JSON. Errors follow the shape:

```json
{ "error": "ValidationError", "message": "amount must be greater than zero" }
```

### Create an account

`POST /accounts`

Request:

```json
{ "balance": 100 }
```

Response `201`:

```json
{ "id": "b3f1...", "balance": 100, "createdAt": "2026-07-21T10:00:00.000Z" }
```

Errors: `400` if `balance` is missing, not a number, or negative.

### Get account details

`GET /accounts/:accountId`

Response `200`:

```json
{ "id": "b3f1...", "balance": 100, "createdAt": "2026-07-21T10:00:00.000Z" }
```

Errors: `404` if the account does not exist.

### List all accounts

`GET /accounts`

Response `200`: array of accounts (same shape as above).

### Transfer money

`POST /transfers`

Request:

```json
{ "fromAccountId": "b3f1...", "toAccountId": "9ac2...", "amount": 30 }
```

Response `201`:

```json
{
  "id": "7e21...",
  "fromAccountId": "b3f1...",
  "toAccountId": "9ac2...",
  "amount": 30,
  "createdAt": "2026-07-21T10:01:00.000Z"
}
```

Errors:
- `400` — `amount` is missing, not a number, zero, or negative.
- `400` — `fromAccountId` equals `toAccountId`.
- `400` — source account has insufficient funds.
- `404` — either account does not exist.

### List transfer history

`GET /transfers`

Response `200`: array of transfers (same shape as above), in the order they
were made.

### Get an account's ledger

`GET /accounts/:accountId/ledger`

Returns the full, chronological, immutable history of balance movements for
an account — one entry for the initial deposit made at account creation,
and one `DEBIT`/`CREDIT` entry per transfer it was involved in. The
account's current balance (returned by the endpoints above) is always the
`balanceAfter` of its most recent entry here.

Response `200`:

```json
[
  {
    "id": "1a2b...",
    "accountId": "b3f1...",
    "type": "CREDIT",
    "amount": 100,
    "balanceAfter": 100,
    "reason": "INITIAL_DEPOSIT",
    "createdAt": "2026-07-21T10:00:00.000Z"
  },
  {
    "id": "4c5d...",
    "accountId": "b3f1...",
    "type": "DEBIT",
    "amount": 30,
    "balanceAfter": 70,
    "reason": "TRANSFER",
    "transferId": "7e21...",
    "createdAt": "2026-07-21T10:01:00.000Z"
  }
]
```

Errors: `404` if the account does not exist.

### Health check

`GET /health` → `200 { "status": "ok" }`

## Design decisions and assumptions

- **Framework**: Express, because it is the most widely adopted Node.js HTTP
  framework and maps cleanly onto an API Gateway + Lambda proxy integration
  via `serverless-http`, avoiding a rewrite when deploying to AWS.
- **Validation**: `zod` schemas validate request bodies before they reach
  business logic, returning descriptive `400` responses on failure.
- **IDs**: account and transfer IDs are UUIDs (`uuid` package), not
  sequential integers, since a serverless/DynamoDB backend would not
  guarantee ordering or centralized sequence generation.
- **Money representation**: balances/amounts are plain JavaScript numbers
  for simplicity. A real production system should use integer minor units
  (e.g. cents) or a decimal library to avoid floating-point rounding issues;
  this is called out here rather than solved, to keep the implementation
  minimal as requested.
- **Ledger-based balances**: account balances are never stored or mutated
  directly. Every balance change — the initial deposit at account creation,
  and each leg of a transfer — is appended as an immutable `LedgerEntry`
  (`CREDIT`/`DEBIT`, with the resulting `balanceAfter`) rather than
  overwriting a `balance` field. An account's current balance is simply the
  `balanceAfter` of its most recent entry, and `GET /accounts/:id/ledger`
  exposes the full history. This gives every account a real, auditable
  trail of how its balance was reached, instead of just the latest number.
- **Consistency without a database transaction**: `TransferService.transfer`
  reads both accounts' derived balances, validates, and appends both ledger
  entries synchronously, with no `await` in between. Since Node.js runs
  JavaScript on a single thread, no other request can interleave in the
  middle of that sequence, so no two transfers can read a stale balance and
  both succeed against it. This guarantee holds only for the in-memory
  store; see the deployment section below for how this maps to a real
  conditional-write transaction in DynamoDB.
- **Layering**: the code is split into `domain` (types/errors), `store`
  (the only place that knows about the storage mechanism), `services`
  (business logic, storage-agnostic), and `http` (Express routers/
  validation/error handling). `app.ts` assembles these into an Express app
  used identically by both `server.ts` (local) and `lambda.ts` (AWS). This
  separation is what makes the Lambda migration a matter of swapping the
  entry point and the store implementation, not rewriting business logic.
- **No auth**: intentionally omitted per the requirements.

## AWS serverless deployment proposal

### Architecture

```
Client -> API Gateway (HTTP API) -> AWS Lambda (Express app via serverless-http) -> DynamoDB
```

The existing Express app (`src/app.ts`) is reused unchanged. `src/lambda.ts`
already wraps it with `serverless-http`, so the same routing, validation, and
business logic run both locally and on Lambda — only the entry point and the
store implementation differ.

### API Gateway routing

Use an HTTP API (cheaper, lower-latency than a REST API) with a single
**proxy integration** (`{proxy+}` route, `ANY` method) forwarding every
request to one Lambda function running the Express app. Express's own
router continues to dispatch `/accounts`, `/accounts/{id}`, and `/transfers`
internally, so no per-route Lambda mapping is required and the code doesn't
need to change to add new routes.

Alternatively, for stricter isolation/scaling per endpoint, API Gateway could
route each resource (`POST /accounts`, `GET /accounts/{id}`, `POST
/transfers`, etc.) to its own dedicated Lambda function. This trades a bit of
routing simplicity for independent scaling/monitoring/IAM permissions per
operation.

### Lambda organization

Given the app's current size, a single Lambda running the whole Express app
behind a proxy integration is the pragmatic choice — it minimizes cold
starts and deployment complexity. If the API grows, split by bounded
context (e.g. an `accounts` Lambda and a `transfers` Lambda, each importing
only the routers/services it needs) rather than one Lambda per HTTP verb, to
keep cold-start bundles small and deployments independent.

### Persisting data: DynamoDB

Replace `InMemoryStore` with a `DynamoDbStore` implementing the same
interface (`saveAccountMeta`, `getAccountMeta`, `listAccountMetas`,
`appendLedgerEntry`, `getBalance`, `getLedgerEntries`, `saveTransfer`,
`listTransfers`) — no other code needs to change, since the ledger model
already matches how an append-only, auditable datastore should be designed.

- **Accounts table**: partition key `id`. Stores only metadata
  (`createdAt`) — no `balance` field, consistent with the ledger design.
- **Ledger table**: partition key `accountId`, sort key `createdAt` (or a
  monotonically increasing sequence number) so an account's entries can be
  queried in order with a single `Query`. The most recent item's
  `balanceAfter` is the account's current balance; a GSI on `transferId`
  lets you fetch both legs of a given transfer.
- **Transfers table**: partition key `id`; optionally a GSI on
  `fromAccountId`/`toAccountId` + `createdAt` for history queries.
- **Atomic transfers**: the in-memory implementation relies on Node's
  single-threaded execution to keep a transfer's read-check-write atomic.
  DynamoDB cannot rely on that across concurrent Lambda invocations, so the
  transfer should be implemented as a `TransactWriteItems` call that
  conditionally inserts the DEBIT ledger entry only if the computed
  `balanceAfter` is `>= 0` (guarding against a negative balance from
  concurrent transfers) alongside inserting the CREDIT entry and the
  transfer record. If the condition fails, DynamoDB rejects the whole
  transaction, which the service layer maps back to the existing
  `ValidationError` (insufficient funds). Because ledger entries are
  never updated in place — only ever appended — this transaction is a pure
  insert, which avoids the lost-update problems that plague
  read-modify-write balance columns under concurrency.

### Scalability, concurrency, error handling, logging, monitoring

- **Scalability/concurrency**: Lambda scales horizontally per request
  automatically; correctness under concurrent transfers is delegated to
  DynamoDB's conditional/transactional writes rather than in-process locks,
  which is what removes the single-threaded assumption the in-memory
  version relies on.
- **Error handling**: the existing `errorHandler` middleware already maps
  domain errors (`ValidationError` -> 400, `NotFoundError` -> 404) and
  unexpected errors -> 500 with a generic message (no internals leaked).
  This is unchanged on Lambda; `serverless-http` forwards the Express
  response as-is through the API Gateway integration.
- **Logging**: replace ad-hoc `console.log`/`console.error` with structured
  JSON logging (e.g. via `pino`) so CloudWatch Logs can be queried/filtered
  by field (request ID, account ID, status code). API Gateway access logs
  should be enabled separately for request-level metrics (latency, status
  codes) independent of application logs.
- **Monitoring/observability**: enable Lambda + API Gateway CloudWatch
  metrics (invocation count, duration, throttles, 4xx/5xx rate) and set
  alarms on error rate and p99 latency. Add AWS X-Ray tracing to the Lambda
  and DynamoDB SDK calls to see per-request timing across the Lambda ->
  DynamoDB hop, which is the main new latency source versus the in-memory
  version.
- **Idempotency**: for the transfer endpoint, consider accepting an optional
  client-supplied idempotency key stored alongside the transfer record, so
  Lambda retries (which can happen on transient failures) don't double-apply
  a transfer.

## Project structure

```
src/
  domain/        # Types and error classes shared across layers
  store/         # In-memory datastore (swap for DynamoDB later)
  services/      # Business logic (account/transfer rules), storage-agnostic
  http/          # Express routers, request validation, error handling
  app.ts         # Assembles the Express app (used by both entry points)
  server.ts      # Local standalone entry point
  lambda.ts      # AWS Lambda entry point (API Gateway proxy integration)
tests/           # Jest + Supertest tests
```
