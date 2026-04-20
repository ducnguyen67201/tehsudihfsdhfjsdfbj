# Implementation Plan — Wire rrweb Frames Into the Agent Prompt

<!-- /autoplan restore point: ~/.gstack/projects/trustloop/main-autoplan-rrweb-restore-20260419-180250.md -->

**Author:** Duc · **Date:** 2026-04-19 · **Branch:** main → `feat/rrweb-into-agent-prompt` · **Status:** Plan
**Depends on:** PR #37 (`chore/remove-sentry-integration`) merged first.

## 1. TL;DR

When the support agent investigates a customer thread, it currently reads the *text* session digest (clicks, navigations, network errors, console errors, JS exceptions) but never **sees** the screen the customer was on. We already capture rrweb visual replay chunks via `packages/sdk-browser/src/recorder.ts` and store them in `SessionReplayChunk`. They reach the human reviewer (UI player exists at `apps/web/src/components/session-replay/rrweb-player-view.tsx`) but never reach the agent.

This PR renders 3–7 PNG keyframes around the digest's `failurePoint`. The frames are delivered to the analyzing agent **two ways depending on the workspace's chosen model**:
- **Vision-capable models** (OpenAI 4o family, Claude Sonnet/Opus today): frames are passed as multimodal `image` content directly to `agent.generate({...})`.
- **Text-only models** (any future workspace pick like `gpt-4o-mini`, Haiku, llama, etc.): a captioner pipeline runs each frame through a fixed shared vision model (`gpt-4o-mini` by default) to generate a structured text caption, then the captions are injected into the prompt as text. The workspace's analyzing model never sees pixels.

Either way, the rendered frames are **persisted to a new `SupportAnalysisFrame` Prisma table** so the human reviewer (and any future re-analysis flow) can later see exactly what the agent saw.

The change is fail-soft at every layer: render fails → empty array → workflow continues with text digest as today; caption fails → fall through to "frames present but uncaptioned" → text-only workspace gets text digest only; persistence fails → analysis still completes, frames just aren't replayable later.

## 2. Why

The session digest is a *summary* of what happened. Frames are *evidence* of what was on screen. The agent currently can't:

- Tell a "Submit button greyed out" from a "Submit button missing" from a "Submit button hidden behind a cookie banner" — they all read as "user clicked Submit, network call failed."
- Notice that an error toast was already on screen from a previous attempt.
- See partially-filled forms, modals open, expanded sections, validation states.

Rrweb gives all of that for free if we render and pass it. This is qualitatively different from making the digest text richer — captioning rrweb as more text just trusts a captioner LLM to extract what mattered (the same problem the digest already has).

## 3. In Scope / Out of Scope

**In scope:**
- New activity that loads `SessionReplayChunk` rows for the failure window, renders N PNG keyframes via headless Playwright + rrweb-player, returns base64 + caption hints.
- Workflow edit: insert the activity between `buildThreadSnapshot` and `markAnalyzing`. Conditional on `digest.failurePoint != null`. Failure non-blocking.
- Schema additions: `failureFrameSchema` + optional `failureFrames?: FailureFrame[]` on `analyzeRequestSchema`.
- Agent edit: spread frames as image messages in `agent.generate({...})` when present.
- Prompt edit: add a "Visual evidence at the failure point" section with reading guidance.
- Pure helper: `computeFrameTimestamps(failurePoint, precedingActionsCount): number[]`. 3 frames default, up to 7 adaptive.
- Dockerfile: add Playwright + Chromium to the queue image.
- Tests: unit for `computeFrameTimestamps`. Integration for the activity using a fixture chunk. Prompt regression test verifying the "Visual evidence" section appears when frames are present.

**Out of scope (future TODOs):**
- UI to let the human reviewer see the same frames the agent saw (forensic playback).
- Agent requesting more frames mid-investigation if confidence is low.
- Audio capture or richer multimodal beyond static frames.
- Persisting rendered frames (e.g., to S3) for later replay/audit. Frames stay in-memory for this PR.

## 4. What Already Exists (Reused, Not Re-Built)

| Sub-problem | Existing code |
|---|---|
| rrweb capture in browser | `packages/sdk-browser/src/recorder.ts` (rrweb 2.0.0-alpha.20) |
| Chunk storage | `packages/database/prisma/schema/session-replay.prisma:51` — `SessionReplayChunk { compressedData Bytes, sequenceNumber, startTimestamp, endTimestamp }` |
| Chunk ingest | `apps/web/src/server/http/rest/sessions/ingest.ts` |
| rrweb player (deps already installed) | `apps/web/package.json` — `rrweb-player: ^1.0.0-alpha.4` |
| Player view (UI) | `apps/web/src/components/session-replay/rrweb-player-view.tsx` |
| Session correlation + digest | `packages/rest/src/services/support/session-correlation/digest.ts` (provides `failurePoint`) |
| Agent prompt builder | `apps/agents/src/prompts/support-analysis.ts` — already has `buildAnalysisPromptWithContext({ sessionDigest })` |
| Agent invocation | `apps/agents/src/agent.ts` `runAnalysis` → `agent.generate(userMessage, ...)` |

After this PR: same data, one new render step, agent sees images instead of just text.

## 5. File-by-File Changes

### 5.1 New files

**`packages/types/src/support/failure-frames.schema.ts`** (~40 lines)
```ts
import { z } from "zod";

export const failureFrameSchema = z.object({
  timestamp: z.iso.datetime(),
  base64Png: z.string().min(1),       // raw base64, no data: prefix
  captionHint: z.string(),             // e.g., "at failure: NETWORK_ERROR POST /api/pay 500"
  offsetMs: z.number().int(),          // ms relative to failurePoint timestamp
});

export type FailureFrame = z.infer<typeof failureFrameSchema>;

export const FAILURE_FRAMES_MIN = 3;
export const FAILURE_FRAMES_MAX = 7;
```

Add to `packages/types/src/support/index.ts` barrel export.

**`packages/rest/src/services/support/session-correlation/frame-timestamps.ts`** (~50 lines, pure function + tests)
```ts
export function computeFrameTimestamps(
  failurePointMs: number,
  precedingActionsCount: number,
  recordStartMs: number,
  recordEndMs: number
): number[] {
  // 3 frames default: t-1s, t (failure), t+1s
  // adaptive up to 7 if precedingActionsCount >= 5: t-3s, t-2s, t-1s, t, t+1s, t+2s, t+3s
  // clamp all timestamps to [recordStartMs, recordEndMs]
  ...
}
```

**`apps/queue/src/domains/support/support-frames.activity.ts`** (~150 lines)
```ts
export interface RenderFailureFramesInput {
  workspaceId: string;
  sessionRecordId: string;
  failurePointTimestamp: string;       // ISO
  precedingActionsCount: number;
}
export interface RenderFailureFramesResult {
  frames: FailureFrame[];               // empty array on failure (non-throwing)
}

export async function renderFailureFramesActivity(
  input: RenderFailureFramesInput
): Promise<RenderFailureFramesResult> {
  // 1. Load all SessionReplayChunk rows for the session, decompress, sort by sequenceNumber
  // 2. Compute target timestamps via computeFrameTimestamps(...)
  // 3. Spawn Playwright headless, mount rrweb-player on a tiny inline HTML page,
  //    feed events JSON, seek to each timestamp, screenshot, base64-encode
  // 4. Build captionHint per frame from digest event nearest to that timestamp
  // 5. Return frames; on any throw, log and return { frames: [] }
}
```

**`apps/queue/test/support-frames.activity.test.ts`** (~100 lines, integration with a fixture chunk)
**`packages/rest/test/frame-timestamps.test.ts`** (~50 lines, pure unit tests)

### 5.2 Edits

**`packages/types/src/support/support-analysis.schema.ts`** (after PR #37 lands)
- Import `failureFrameSchema`.
- Add `failureFrames: z.array(failureFrameSchema).optional()` to `analyzeRequestSchema`.

**`apps/queue/src/domains/support/support-analysis.activity.ts`**
- Extend `ThreadSnapshotResult` with `sessionRecordId: string | null` and `failurePointTimestamp: string | null` (or surface from sessionDigest).
- Pass-through `failureFrames` to `runAnalysisAgent`'s `callAgentService` call (line ~322 in current main).

**`apps/queue/src/domains/support/support-analysis.workflow.ts`**
- Insert between `buildThreadSnapshot` and `markAnalyzing`:
  ```ts
  const framesResult = snapshot.failurePointTimestamp && snapshot.sessionRecordId
    ? await fastActivities.renderFailureFramesActivity({
        workspaceId: input.workspaceId,
        sessionRecordId: snapshot.sessionRecordId,
        failurePointTimestamp: snapshot.failurePointTimestamp,
        precedingActionsCount: snapshot.precedingActionsCount ?? 0,
      })
    : { frames: [] };
  ```
- Pass `failureFrames: framesResult.frames` into `runAnalysisAgent` input.
- Activity timeout for the new activity: **45 seconds** (Playwright cold-start + 7 screenshots).
- `retry: { maximumAttempts: 1 }` — failure is non-fatal so don't burn time on retries.

**`apps/queue/src/runtime/activities.ts`**
- Add `renderFailureFramesActivity` to the export list.

**`apps/agents/src/agent.ts`**
- In `runAnalysis`: if `request.failureFrames?.length`, build a multimodal user message:
  ```ts
  const content: Array<TextPart | ImagePart> = [
    { type: "text", text: `WORKSPACE_ID: ${request.workspaceId}\n\n${request.threadSnapshot}` },
  ];
  for (const frame of request.failureFrames ?? []) {
    content.push({ type: "text", text: `\n[Frame at ${frame.timestamp} (offset ${frame.offsetMs}ms): ${frame.captionHint}]` });
    content.push({ type: "image", image: `data:image/png;base64,${frame.base64Png}` });
  }
  const result = await agent.generate([{ role: "user", content }], { maxSteps, toolChoice: "auto" });
  ```
- Verify Mastra's `agent.generate` signature accepts a messages array with multimodal content (it does as of `@mastra/core` 0.x — confirm version pinned in `apps/agents/package.json`).

**`apps/agents/src/prompts/support-analysis.ts`**
- Append to `buildAnalysisPromptWithContext` when frames will be present: a new "## Visual evidence at the failure point" section with guidance like:
  > "You will receive 3-7 PNG screenshots of the customer's screen around the moment the failure occurred, captioned with their timestamp and the digest event at that moment. Treat these as primary evidence: cite specific UI elements you can see (button states, visible text, modal contents, error toasts). Do not hallucinate visual elements you cannot see in the frames."
- The frames themselves are passed via `agent.generate`'s message array, not in the system prompt.

**`apps/queue/Dockerfile`** (or `deploy/queue.Dockerfile`)
- Install Playwright + only Chromium (skip Firefox/WebKit):
  ```Dockerfile
  RUN npx playwright install --with-deps chromium
  ```
- This adds ~250 MB to the image. Layer cached.

**`packages/types/src/support/index.ts`** — add `export * from "./failure-frames.schema";`

### 5.3 Tests

| File | Type | What it covers |
|---|---|---|
| `packages/rest/test/frame-timestamps.test.ts` | unit | 3-frame default, 7-frame adaptive trigger, clamping to record boundaries, edge case where failure is at session start/end |
| `apps/queue/test/support-frames.activity.test.ts` | integration | renders a fixture rrweb chunk, asserts N PNG bytes returned, asserts caption hints derived from digest |
| `apps/agents/test/support-analysis-prompt.test.ts` | regression | when called with frames-context flag, prompt contains "Visual evidence at the failure point"; when not, it doesn't |

CI infra: Playwright in CI is doable but slow. Use `playwright install chromium` in the test job and cache it. Mark the integration test with `vitest --run --reporter=verbose` so flakes are visible. If the integration test exceeds 30s in CI, mark it `it.skipIf(process.env.CI && process.env.SKIP_PLAYWRIGHT_TESTS)` so PR-blocking can be deferred to a nightly suite if needed.

## 6. Architecture Decision Log (open for autoplan to challenge)

These are the decisions baked into the plan. The autoplan dual voices should pressure-test each one.

| # | Decision | Default | Alternatives considered |
|---|---|---|---|
| 1 | Where to render | `apps/queue` activity | `apps/agents` (co-located w/ consumer), `apps/web` (already has rrweb-player), separate microservice |
| 2 | Renderer | Playwright + Chromium headless | `rrweb-snapshot` + jsdom (lighter, may not faithfully render dynamic CSS), WASM Chromium (immature), browserless.io (extra hop) |
| 3 | Frame format | PNG base64 inline | Hosted URLs (S3 + signed URLs), JPEG (smaller, lossy), WebP (smaller still, less consistent multimodal support) |
| 4 | Frame count | Adaptive 3-7 | Fixed 3, fixed 5, agent-requested-on-demand |
| 5 | Resolution | 1024×768 (rrweb-player default) at low-detail | High-detail (more tokens), 512×384 (cheaper), original viewport size from digest |
| 6 | Storage | Ephemeral (memory only) | Persist to S3, persist to DB, persist to filesystem |
| 7 | Feature flag | None — additive (no failure point = no frames = no change) | Per-workspace allowlist for staged rollout, env flag |
| 8 | Activity timeout | 45s | 30s, 60s, 90s |
| 9 | Browser process | Spawn-per-activity | Long-lived browser pool, shared with other activities |

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Playwright install bloats queue Docker image to ~600 MB | High | Slower deploys, more storage cost | Single-arch (linux/amd64) only, Chromium only, cached layer |
| Playwright cold-start adds 1-3s latency per analysis | Medium | Slower first analysis after worker idle | Acceptable for v1. Browser pool is the next step if metrics show it matters. |
| Token cost balloons | Medium | Per-analysis cost up 30-50% when failurePoint exists | Frames only fire when failurePoint exists. Resize to 1024×768 low-detail. Monitor `meta.totalDurationMs` and inferred token spend after rollout. |
| rrweb chunk corrupted/incomplete | Low-Medium | No frames for that session | Activity returns `{ frames: [] }` non-throwing. Workflow continues. |
| Multimodal API contract drift in Mastra | Low | Build break | Pin `@mastra/core` version. Add prompt-test asserting the message structure compiles. |
| Customers without SDK installed | High | Zero impact (no chunks → no frames → text-only path as today) | This is by design. Codex CEO will flag it again — we accept it. |
| Headless rendering flaky in CI | Medium | Test failures unrelated to code | Cache Chromium. `it.skipIf` escape hatch on `SKIP_PLAYWRIGHT_TESTS=true`. Run nightly even if PR-skipped. |

## 8. Definition of Done

- A live Slack thread with a customer who has the SDK installed and a captured rrweb session, when analyzed, produces a draft that cites visual specifics ("I can see the Submit button is greyed out — looks like form validation").
- `npm run check` passes.
- `git grep -in "failureFrames"` shows the new schema + activity + agent + prompt + test wiring; no orphaned references.
- The new activity returns `{ frames: [] }` non-throwing when Playwright crashes — verified by an integration test that injects a corrupted chunk.
- Queue Docker image builds cleanly with Chromium; total size delta documented in PR description.
- One PR, atomic commit, merged on top of PR #37.

## 9. Future Work (TODOs, not this PR)

1. **UI: forensic frame playback** — show the human reviewer the same frames the agent saw, side by side with the draft.
2. **Browser pool** — if cold-start latency shows up in metrics, share a long-lived Chromium across activities.
3. **Agent-requested frames** — let the agent call a `requestMoreFrames(timestamp, span)` tool if it needs additional visual context mid-investigation.
4. **Persistent frame storage** — write rendered frames to S3 with a TTL so reviewer UI and re-analyses don't re-render.
5. **Resolution auto-tune** — pick frame resolution based on the digest's viewport metadata.

---

## Decision Audit Trail

<!-- AUTONOMOUS DECISION LOG -->

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
