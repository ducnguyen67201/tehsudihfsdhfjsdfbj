import {
  AGENT_TEAM_MESSAGE_KIND,
  AGENT_TEAM_TARGET,
  type AgentTeamDialogueMessageDraft,
  TOOL_STRUCTURED_RESULT_KIND,
  TOOL_STRUCTURED_RESULT_METADATA_KEY,
} from "@shared/types";
import { describe, expect, it, vi } from "vitest";

// Stub heavy module-level imports so we can pull in the activity without
// booting Prisma, env validation, or the Temporal runtime. We're testing a
// pure helper, not the activity body.
vi.mock("@shared/database", () => ({ prisma: {} }));
vi.mock("@shared/env", () => ({ env: {} }));
vi.mock("@shared/rest/services/support/support-realtime-service", () => ({
  emitConversationChanged: vi.fn(),
}));
vi.mock("@shared/rest/services/support/support-draft-service", () => ({
  linkPullRequest: vi.fn(),
}));
vi.mock("@temporalio/activity", () => ({ heartbeat: vi.fn() }));

const { findSuccessfulPrCreation } = await import(
  "../src/domains/agent-team/agent-team-run.activity"
);

const VALID_PR_URL = "https://github.com/acme/repo/pull/42";

function toolResultMessage(metadata: Record<string, unknown>): AgentTeamDialogueMessageDraft {
  return {
    toRoleSlug: AGENT_TEAM_TARGET.broadcast,
    kind: AGENT_TEAM_MESSAGE_KIND.toolResult,
    subject: "create_pull_request result",
    content: JSON.stringify(metadata),
    refs: [],
    toolName: "create_pull_request",
    metadata,
  };
}

describe("findSuccessfulPrCreation", () => {
  it("returns prUrl + prNumber when a successful create_pull_request structured result is present", () => {
    const messages = [
      toolResultMessage({
        durationMs: 1000,
        [TOOL_STRUCTURED_RESULT_METADATA_KEY]: {
          kind: TOOL_STRUCTURED_RESULT_KIND.createPullRequest,
          result: {
            success: true,
            prUrl: VALID_PR_URL,
            prNumber: 42,
            branchName: "trustloop/fix-1",
          },
        },
      }),
    ];
    expect(findSuccessfulPrCreation(messages)).toEqual({ prUrl: VALID_PR_URL, prNumber: 42 });
  });

  it("returns null when the structured result reports failure", () => {
    const messages = [
      toolResultMessage({
        durationMs: 1000,
        [TOOL_STRUCTURED_RESULT_METADATA_KEY]: {
          kind: TOOL_STRUCTURED_RESULT_KIND.createPullRequest,
          result: { success: false, error: "rate limited" },
        },
      }),
    ];
    expect(findSuccessfulPrCreation(messages)).toBeNull();
  });

  it("returns null when the message has no structured tool result metadata", () => {
    const messages: AgentTeamDialogueMessageDraft[] = [
      {
        toRoleSlug: AGENT_TEAM_TARGET.broadcast,
        kind: AGENT_TEAM_MESSAGE_KIND.toolResult,
        subject: "search result",
        content: "Found src/foo.ts",
        refs: [],
        toolName: "searchCode",
        metadata: { durationMs: 10 },
      },
    ];
    expect(findSuccessfulPrCreation(messages)).toBeNull();
  });

  it("returns null when no tool_result kind is present", () => {
    const messages: AgentTeamDialogueMessageDraft[] = [
      {
        toRoleSlug: AGENT_TEAM_TARGET.reviewer,
        kind: AGENT_TEAM_MESSAGE_KIND.proposal,
        subject: "proposed fix",
        content: "...",
        refs: [],
      },
    ];
    expect(findSuccessfulPrCreation(messages)).toBeNull();
  });

  it("ignores malformed structured payloads (defense against hallucination)", () => {
    const messages = [
      toolResultMessage({
        durationMs: 1000,
        [TOOL_STRUCTURED_RESULT_METADATA_KEY]: {
          kind: TOOL_STRUCTURED_RESULT_KIND.createPullRequest,
          // prUrl missing — readToolStructuredResult should reject it.
          result: { success: true, prNumber: 42, branchName: "x" },
        },
      }),
    ];
    expect(findSuccessfulPrCreation(messages)).toBeNull();
  });

  it("picks the first successful PR when multiple tool results are present", () => {
    const messages = [
      toolResultMessage({
        durationMs: 1000,
        [TOOL_STRUCTURED_RESULT_METADATA_KEY]: {
          kind: TOOL_STRUCTURED_RESULT_KIND.createPullRequest,
          result: { success: false, error: "first attempt failed" },
        },
      }),
      toolResultMessage({
        durationMs: 1000,
        [TOOL_STRUCTURED_RESULT_METADATA_KEY]: {
          kind: TOOL_STRUCTURED_RESULT_KIND.createPullRequest,
          result: {
            success: true,
            prUrl: "https://github.com/acme/repo/pull/100",
            prNumber: 100,
            branchName: "retry",
          },
        },
      }),
    ];
    expect(findSuccessfulPrCreation(messages)).toEqual({
      prUrl: "https://github.com/acme/repo/pull/100",
      prNumber: 100,
    });
  });
});
