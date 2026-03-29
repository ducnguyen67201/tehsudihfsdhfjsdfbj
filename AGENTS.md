# AGENTS.md

Canonical repository context and operating rules for AI coding agents.

`CLAUDE.md` is symlinked to this file so Codex/Claude read the same guidance.

## Project Overview

TrustLoop is a TypeScript monorepo for support automation + codex workflows.

- Product surface: `apps/web`
- Background orchestration: Temporal workflows
- Shared contracts and infra: `packages/*`

## Deployment Model (Current Default)

Use **2 deployed services**:

1. `web`
   - Next.js app
   - API/tRPC surface
   - workflow dispatch
2. `worker`
   - single deployment running both support and codex workers

Use **2 Temporal task queues** (must stay separate):

- `TEMPORAL_TASK_QUEUE` for support/inbox workflows
- `CODEX_TASK_QUEUE` for codex indexing/fix-PR workflows

Queue-level isolation is mandatory even if both are run in one worker runtime.

## Code/Domain Boundaries

- `apps/web`: UI + API transport boundary
- `apps/queue`: support workflow domain
- `apps/codex`: codex workflow domain
- `packages/types`: shared types + Zod schemas + Prisma-generated model types
- `packages/rest`: tRPC routers/orchestration
- `packages/database`: Prisma schema + client
- `packages/env`: environment contracts/validation

## Dependency Direction

- `apps/*` may depend on `packages/*`
- `packages/types` should remain dependency-light and stable
- `packages/rest` owns API procedure contracts and validation boundaries
- avoid circular dependencies across packages

## Core Stack

- Node.js 22+
- npm workspaces
- TypeScript strict mode
- Next.js 16
- Temporal (`@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`)
- PostgreSQL + pgvector
- Prisma 7 (`prisma-client` generator)
- Zod 4
- Turborepo
- Docker Compose for local infra

## Local Setup (Golden Path)

```bash
npm install
docker compose up -d postgres temporal
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev:web
npm run dev:queue
npm run dev:codex
```

Local dev can run queue/codex workers separately. Deployment should target one worker service.

## Type Safety Rules (Non-Negotiable)

- Define request/response schemas in shared contracts (`packages/types`) with Zod.
- Infer TypeScript types from Zod; do not duplicate DTOs per app.
- Share workflow input/output payload types via `@shared/types`.
- Validate all ingress boundaries at runtime (API, webhook, workflow input).

### Contract source of truth order

1. Zod schema
2. TS inferred type
3. OpenAPI generated from the same schema source

Do not manually maintain parallel OpenAPI and TS contracts for the same payload.

## Temporal Workflow Rules

- Workflows are orchestration only (deterministic).
- Activities perform all I/O (DB, network, git, external APIs).
- Use semantic workflow IDs for idempotency/dedupe.
- Set explicit activity timeouts.
- Retry only transient failures with bounded backoff.
- Fail fast on validation/configuration errors.

## Database + Prisma Rules

- Keep Prisma schema split by domain files under `packages/database/prisma/*.schema.prisma`.
- Every schema change must include a committed migration.
- `db:push` is local-prototyping only.
- Use explicit transactions for multi-step writes requiring atomicity.
- Add indexes intentionally for new query paths.

## API/Router Conventions

- Keep procedure/business orchestration in `packages/rest`.
- Keep `apps/web` route handlers thin wrappers over shared procedures.
- Use shared Zod schemas for validation.
- Return stable, explicit response shapes.

## Environment + Secrets Rules

- Use `@shared/env` for env access in app code.
- Avoid scattered direct `process.env` usage in business logic.
- Never log raw credentials/tokens.
- Keep secrets centralized and validated (env schema first).

## Naming/Structure Conventions

- `*.workflow.ts` for workflows
- `*.activity.ts` for activities
- `*.schema.ts` for validation contracts
- `*.prompt.ts` for prompt modules
- `index.ts` for controlled exports only

## Error Handling + Observability

Prefer typed error categories:

- `ValidationError`
- `TransientExternalError`
- `PermanentExternalError`
- `ConflictError`

Use stable log metadata keys (as applicable):

- `workspaceId`
- `threadId`
- `analysisId`
- `workflowId`

## Testing Baseline

For non-trivial changes:

- unit tests for pure logic/helpers
- at least one integration path for changed API/workflow orchestration
- contract coverage for schema-boundary changes

Pre-PR baseline:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

## CI Guardrails

- `db:generate` should produce no uncommitted diff
- type-check/lint/tests/build must pass
- optional but recommended: OpenAPI drift check + Temporal smoke checks

## Definition of Done

A feature is done only when:

- contracts updated in shared types/schemas
- workflow/procedure implemented in the correct layer
- migrations included for schema changes
- tests added/updated
- observability/logging added where needed
- docs updated (this file or relevant `docs/*.md`)

## Additional Docs

- Architecture/conventions baseline:
  - `docs/foundation-setup-and-conventions.md`
- Implementation plan (MVP):
  - `docs/impl-plan-first-customer-happy-path-mvp.md`

## Skills + Doc Hygiene

### Canonical skill location

- Keep canonical skills under `.skills/`.
- Keep `.codex/skills/` and `.claude/skills/` as symlink mirrors to canonical skills.
- Do not maintain duplicated skill content across multiple folders.

### Skill update protocol

When asked to "update a skill" or "clean up skills":

1. Edit canonical skill(s) under `.skills/`.
2. Validate symlinks in `.codex/skills/` and `.claude/skills/`.
3. Remove stale or duplicate skills not referenced anymore.
4. Keep skill names stable and purpose-specific.

Primary governance skill:

- `.skills/repo-governance/SKILL.md`

### AGENTS.md cleanup protocol

- Keep `AGENTS.md` focused on high-signal rules and boundaries.
- If `AGENTS.md` grows too large, split details into docs under `docs/` and keep short links here.
- Do not duplicate long implementation specs in `AGENTS.md`; link to source docs instead.
- On every substantive AGENTS change, verify linked docs remain accurate.

If uncertain between clever and simple, choose simple while preserving boundaries.
