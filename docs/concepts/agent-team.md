---
summary: "How the multi-role agent team runs, addresses dialogue between roles, and produces optional PRs"
read_when:
  - You're touching anything under `apps/queue/src/domains/agent-team/`
  - You're adding a new role, tool, or routing rule
  - You're wiring a new tool whose result needs to flow back into a support entity
title: "Agent Team"
---

# Agent Team

A multi-role AI pipeline that runs as a Temporal workflow on
`TASK_QUEUES.CODEX`. Triggered manually today (operator clicks "Run fix
team" on the analysis panel). Produces messages, facts, open questions —
and optionally a draft GitHub PR.

## Roles

Defined in `apps/agents/src/roles/role-registry.ts`:

| Slug | Tools | Purpose |
|------|-------|---------|
| `architect` | `searchCode`, `searchSentry` | Plans the investigation, hypothesizes |
| `code_reader` | `searchCode` | Walks code paths, reports findings |
| `reviewer` | `searchCode`, `searchSentry` | Challenges proposals, gates approval |
| `pr_creator` | `searchCode`, `createPullRequest` | Drafts the PR when the fix is small + obvious |
| `rca_analyst` | `searchSentry`, `searchCode` | Confirms root cause from prod signals |

Roles communicate via **addressed dialogue**: every message has a
`fromRoleSlug`, `toRoleSlug` (a specific role or `broadcast`), and a
`kind` (question / answer / hypothesis / proposal / approval / …). The
routing layer (`agent-team-run-routing.ts`) decides which inboxes wake
up next based on the message graph.

## Run lifecycle

```
queued → running ──▶ (loop until terminal) ──▶ completed | waiting | failed
                          │
                          ▼  per turn
              claim_next_queued_inbox
                          │
                          ▼
                  load_turn_context
                          │
                          ▼
              run_team_turn (HTTP → apps/agents)
                          │
                          ▼
              persist_role_turn_result
                          │
                          ▼
              snapshot → workflow loop
```

Terminal states:
- **completed** — every inbox terminal (idle/done), no open questions
- **waiting** — open questions blocked on roles, OR all inboxes idle but
  questions remain
- **failed** — turn budget exhausted (`MAX_AGENT_TEAM_TURNS`) or activity
  threw a non-retryable error

A run is **not** required to produce a PR. The pipeline can finish with
a plan + facts only when `pr_creator` decides the fix isn't obvious
enough to draft.

## Storage

Schema in `packages/database/prisma/schema/agent-team.prisma`:

- `AgentTeamRun` — root row with `status`, `workflowId`, `conversationId`,
  `analysisId`, `teamSnapshot` (frozen at start so role/edge edits mid-run
  don't corrupt history), `summary` (per-role rollup, populated on terminal)
- `AgentTeamMessage` — every dialogue message, `kind`, `toolName`, `metadata`
- `AgentTeamRoleInbox` — per-role state machine (idle/queued/running/blocked/done)
- `AgentTeamFact` — proposed/accepted/rejected facts with confidence
- `AgentTeamOpenQuestion` — questions awaiting an answer
- `AgentTeamRunEvent` — partitioned event log for SSE + observability
  rollups

## Trigger surface

Today the only entry point is the `agentTeam.startRun` tRPC mutation,
called from the operator UI. Inputs:

- `conversationId` (required)
- `teamId` (optional — defaults to the workspace's `isDefault` team)
- `analysisId` (optional — links the run to a specific analysis so the
  UI can correlate)

There is **no auto-trigger** on draft approval. Adding one would mean
a new LLM run per approved bug-fix draft — defer that until we have
enough signal-to-noise data to set a sensible threshold.

## Tool result wire format

Tool returns flow as part of the dialogue stream:

- `apps/agents/src/agent.ts` runs the tool, gets a result, and emits two
  dialogue messages (`tool_call`, `tool_result`) with the toolName and a
  stringified `content`.
- For tools whose typed payload downstream consumers depend on, agent.ts
  also validates the parsed JSON against a Zod schema and stashes it
  under `metadata.toolStructuredResult` (key constant in
  `packages/types/src/agent-team/agent-team-tool-result.schema.ts`).
- Today only `create_pull_request` opts into the structured channel.
  `metadata.toolStructuredResult.kind === "create_pull_request"` carries
  the validated success/failure tagged union.

Consumers read it via the `readToolStructuredResult()` helper. Failed
parse → null → fall back to the string-only `content`.

## Cross-domain side effects

`persistRoleTurnResult` is the one place where agent-team writes outside
its own domain. Specifically: when the turn includes a successful
`create_pull_request` tool result, the activity calls
`supportDrafts.linkPullRequest(tx, …)` inside the same transaction so the
write rolls back if the rest of the turn fails. After the transaction
commits, it emits `supportRealtime.emitConversationChanged()` with reason
`PR_LINKED` so the inbox refreshes.

The realtime emit is **outside the transaction** because
`pg_notify` runs on the base prisma connection, not the tx client — emitting
inside the tx would notify subscribers about a write that may be rolled
back.

## Streaming

Agent-team runs have their own SSE stream at
`/api/[workspaceId]/agent-team-runs/[runId]/stream`. The route uses a
cursor-based poll over `AgentTeamRunEvent` (id, ts) and stops on
terminal event kinds.

The support inbox SSE (`/api/[workspaceId]/support/stream`) is separate —
it's invalidated only via the `emitConversationChanged` post-commit hook
when the PR link writes back, not for every team turn.

## Observability

Every turn writes events into the partitioned `AgentTeamRunEvent` log
(message_sent, tool_called, tool_returned, fact_proposed, question_opened,
role_queued, role_completed, role_blocked, run_succeeded, run_failed).
The archive workflow rolls the partitioned table forward and the metrics
rollup workflow aggregates per-day rollups for the dashboard.

## Invariants

- **The dispatched workflow input is frozen on the row's `teamSnapshot` field.**
  Editing the team's roles or edges mid-run does not affect any in-flight
  run. New runs pick up the new shape.
- **Cross-domain writes go through services.** Agent-team activities never
  touch `prisma.supportDraft` directly — they call
  `supportDrafts.linkPullRequest` so workspace scoping, soft-delete handling,
  and Zod validation live in one place.
- **Realtime emits happen post-commit, never inside `$transaction`.**
- **Turn budget is hard-capped at `MAX_AGENT_TEAM_TURNS`.** Runs that hit
  it terminate `failed`; the workflow does not retry past the cap.
- **A run can complete without producing a PR.** PR creation is one of
  several legitimate terminal states — surfacing none is fine.

## Related concepts

- `ai-draft-generation.md` — describes how `prUrl`/`prNumber` get linked
  back to the draft
- `architecture.md` — where this fits in the wider service mesh
- `codex-search.md` — what the `searchCode` tool does

## Keep this doc honest

Update when you:
- Add/remove a role or change role tools
- Add/remove a tool
- Add a new structured-tool-result kind (extend the discriminated union)
- Add a new cross-domain side effect (write to a different domain's table)
- Change the trigger surface (e.g. add an auto-trigger on draft approve)
- Change run lifecycle terminal states
- Change the SSE stream endpoint or the cursor format
