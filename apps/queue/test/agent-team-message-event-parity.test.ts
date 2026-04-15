import {
  AGENT_TEAM_EVENT_KIND,
  AGENT_TEAM_MESSAGE_KIND,
  AGENT_TEAM_ROLE_SLUG,
  AGENT_TEAM_TARGET,
  type AgentTeamDialogueMessageDraft,
} from "@shared/types";
import { describe, expect, it } from "vitest";

import { buildMessageSentDraft } from "../src/domains/agent-team/agent-team-run.activity";

describe("buildMessageSentDraft — event-projection parity", () => {
  it("mirrors every persisted message field into the event payload", () => {
    const message: AgentTeamDialogueMessageDraft = {
      toRoleSlug: AGENT_TEAM_TARGET.reviewer,
      kind: AGENT_TEAM_MESSAGE_KIND.hypothesis,
      subject: "root cause of the null deref",
      content: "checkout.ts:47 reads session.userId assuming presence.",
      refs: ["checkout.ts:47"],
    };
    const draft = buildMessageSentDraft({
      runId: "run_1",
      workspaceId: "ws_1",
      senderRoleSlug: AGENT_TEAM_ROLE_SLUG.architect,
      messageId: "msg_1",
      message,
    });
    expect(draft.kind).toBe(AGENT_TEAM_EVENT_KIND.messageSent);
    expect(draft.runId).toBe("run_1");
    expect(draft.workspaceId).toBe("ws_1");
    expect(draft.actor).toBe(AGENT_TEAM_ROLE_SLUG.architect);
    expect(draft.target).toBe(AGENT_TEAM_TARGET.reviewer);
    expect(draft.messageKind).toBe(AGENT_TEAM_MESSAGE_KIND.hypothesis);
    if (draft.kind !== AGENT_TEAM_EVENT_KIND.messageSent) throw new Error("unreachable");
    expect(draft.payload.messageId).toBe("msg_1");
    expect(draft.payload.fromRoleSlug).toBe(AGENT_TEAM_ROLE_SLUG.architect);
    expect(draft.payload.toRoleSlug).toBe(AGENT_TEAM_TARGET.reviewer);
    expect(draft.payload.kind).toBe(AGENT_TEAM_MESSAGE_KIND.hypothesis);
    expect(draft.payload.subject).toBe(message.subject);
    expect(draft.payload.contentPreview).toBe(message.content);
  });

  it("truncates contentPreview to 280 characters without losing the event", () => {
    const longContent = "x".repeat(1000);
    const draft = buildMessageSentDraft({
      runId: "run_1",
      workspaceId: "ws_1",
      senderRoleSlug: AGENT_TEAM_ROLE_SLUG.architect,
      messageId: "msg_1",
      message: {
        toRoleSlug: AGENT_TEAM_TARGET.broadcast,
        kind: AGENT_TEAM_MESSAGE_KIND.status,
        subject: "long blob",
        content: longContent,
        refs: [],
      },
    });
    if (draft.kind !== AGENT_TEAM_EVENT_KIND.messageSent) throw new Error("unreachable");
    expect(draft.payload.contentPreview).toHaveLength(280);
  });

  it("preserves broadcast target unchanged", () => {
    const draft = buildMessageSentDraft({
      runId: "run_1",
      workspaceId: "ws_1",
      senderRoleSlug: AGENT_TEAM_ROLE_SLUG.prCreator,
      messageId: "msg_42",
      message: {
        toRoleSlug: AGENT_TEAM_TARGET.broadcast,
        kind: AGENT_TEAM_MESSAGE_KIND.decision,
        subject: "opening PR",
        content: "PR #284 drafted",
        refs: [],
      },
    });
    expect(draft.target).toBe(AGENT_TEAM_TARGET.broadcast);
  });
});
