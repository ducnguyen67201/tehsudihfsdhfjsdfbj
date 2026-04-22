"use client";

import { AgentStream } from "@/components/support/agent-stream";
import { ConfidenceBadge } from "@/components/support/confidence-badge";
import { ReasoningTrace } from "@/components/support/reasoning-trace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAgentTeamRun } from "@/hooks/use-agent-team-run";
import { useAnalysisStream } from "@/hooks/use-analysis-stream";
import { AGENT_TEAM_RUN_STATUS, type SupportAnalysisWithRelations } from "@shared/types";
import { useState } from "react";

// Statuses where a fix-team run is in flight: a new run would race the old.
// `waiting` blocks too because the team is parked on an open question — adding
// a parallel run would just confuse the operator.
const ACTIVE_RUN_STATUSES: ReadonlyArray<string> = [
  AGENT_TEAM_RUN_STATUS.queued,
  AGENT_TEAM_RUN_STATUS.running,
  AGENT_TEAM_RUN_STATUS.waiting,
];

interface AnalysisPanelProps {
  analysis: SupportAnalysisWithRelations | null;
  conversationId: string;
  workspaceId: string;
  isAnalyzing: boolean;
  onTriggerAnalysis: () => void;
  onApproveDraft: (draftId: string, editedBody?: string) => void;
  onDismissDraft: (draftId: string, reason?: string) => void;
  isMutating: boolean;
}

/**
 * AI analysis panel shown inside the conversation sheet.
 *
 * Hierarchy: confidence badge → draft (the action) → reasoning trace (collapsed).
 * Per DESIGN.md: "Evidence first. Show the thing that helps the user act."
 */
export function AnalysisPanel({
  analysis,
  conversationId,
  workspaceId,
  isAnalyzing,
  onTriggerAnalysis,
  onApproveDraft,
  onDismissDraft,
  isMutating,
}: AnalysisPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const { events, isStreaming } = useAnalysisStream({
    workspaceId,
    analysisId: isAnalyzing ? (analysis?.id ?? null) : null,
    enabled: isAnalyzing,
  });

  // Agent-team run status drives the "Run fix team" button + a small inline
  // status pill. Hook lazily fetches the latest run for the conversation
  // and subscribes to its SSE stream while one is active.
  const agentTeamRun = useAgentTeamRun(conversationId, workspaceId);
  const teamRunActive = agentTeamRun.run && ACTIVE_RUN_STATUSES.includes(agentTeamRun.run.status);

  // State: no analysis yet
  if (!analysis && !isAnalyzing) {
    return (
      <div className="py-3">
        <Button variant="outline" size="sm" onClick={onTriggerAnalysis} disabled={isMutating}>
          Analyze this thread
        </Button>
      </div>
    );
  }

  // State: gathering context
  if (analysis?.status === "GATHERING_CONTEXT") {
    return (
      <section className="py-3 space-y-2" aria-label="AI analysis">
        <div className="text-xs text-muted-foreground font-mono">
          Fetching thread context and error history...
        </div>
      </section>
    );
  }

  // State: analyzing (streaming)
  if (isAnalyzing || analysis?.status === "ANALYZING") {
    return (
      <section className="py-3 space-y-2" aria-label="AI analysis">
        <div className="text-xs text-muted-foreground font-mono">Analyzing...</div>
        <AgentStream events={events} isStreaming={isStreaming} />
      </section>
    );
  }

  // State: analysis failed
  if (analysis?.status === "FAILED") {
    return (
      <section className="py-3 space-y-2" aria-label="AI analysis">
        <div className="text-sm text-destructive">Analysis failed</div>
        <Button variant="outline" size="sm" onClick={onTriggerAnalysis} disabled={isMutating}>
          Retry
        </Button>
      </section>
    );
  }

  // State: analyzed (with or without draft)
  const draft = analysis?.drafts[0];
  const confidence = analysis?.confidence ?? 0;

  return (
    <section className="py-3 space-y-3" aria-label="AI analysis">
      {/* ① Confidence + status line */}
      <div className="flex items-center gap-2 flex-wrap">
        <ConfidenceBadge confidence={confidence} />
        {analysis?.category && (
          <Badge variant="outline" className="text-xs font-mono">
            {analysis.category}
          </Badge>
        )}
        {analysis?.likelySubsystem && (
          <span className="text-xs text-muted-foreground font-mono">
            {analysis.likelySubsystem}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{Math.round(confidence * 100)}%</span>
      </div>

      {/* Problem statement */}
      {analysis?.problemStatement && (
        <p className="text-sm text-foreground">{analysis.problemStatement}</p>
      )}

      {/* PR link */}
      {draft?.prUrl && (
        <a
          href={draft.prUrl as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline underline-offset-2"
        >
          Suggested fix: PR #{draft.prNumber} →
        </a>
      )}

      {/* Run-fix-team trigger. Shown only when an analysis exists and no run
          is in flight. We pass analysisId so the eventual run is correlated
          with the analysis the operator is looking at. */}
      {analysis && !teamRunActive && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void agentTeamRun.startRun({ analysisId: analysis.id })}
            disabled={agentTeamRun.isMutating || agentTeamRun.isLoading}
            data-testid="run-fix-team"
          >
            {agentTeamRun.run ? "Run fix team again" : "Run fix team"}
          </Button>
          {agentTeamRun.error && (
            <p className="mt-1 text-xs text-destructive">{agentTeamRun.error}</p>
          )}
        </div>
      )}

      {/* In-flight pill so the operator knows the team is working without
          having to scroll to the agent-team panel. */}
      {teamRunActive && agentTeamRun.run && (
        <Badge variant="outline" className="text-xs font-mono">
          Fix team: {agentTeamRun.run.status.toLowerCase()}
        </Badge>
      )}

      <Separator />

      {/* ② Draft (the action) */}
      {draft && draft.status === "AWAITING_APPROVAL" && (
        <div className="space-y-2">
          {isEditing ? (
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
              autoFocus
            />
          ) : (
            <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm whitespace-pre-wrap">
              {draft.editedBody ?? draft.draftBody}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (isEditing) {
                  onApproveDraft(draft.id, editText);
                  setIsEditing(false);
                } else {
                  onApproveDraft(draft.id);
                }
              }}
              disabled={isMutating}
            >
              {isEditing ? "Save & Approve" : "Approve"}
            </Button>
            {!isEditing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditText(draft.editedBody ?? draft.draftBody);
                  setIsEditing(true);
                }}
                disabled={isMutating}
              >
                Edit
              </Button>
            )}
            {isEditing && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDismissDraft(draft.id)}
              disabled={isMutating}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Draft sent/dismissed state */}
      {draft && draft.status === "SENT" && (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Sent
        </Badge>
      )}
      {draft && draft.status === "DISMISSED" && (
        <Badge variant="outline" className="text-muted-foreground">
          Dismissed
        </Badge>
      )}

      {/* No draft (needs context) */}
      {!draft && analysis?.status === "NEEDS_CONTEXT" && (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            Not enough context to draft a response.
          </div>
          {analysis.missingInfo && analysis.missingInfo.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
              {(analysis.missingInfo as string[]).map((info, i) => (
                <li key={info}>{info}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ③ Reasoning trace (collapsed) */}
      {analysis && (
        <ReasoningTrace
          evidence={analysis.evidence}
          reasoningTrace={analysis.reasoningTrace}
          toolCallCount={analysis.toolCallCount}
          durationMs={analysis.llmLatencyMs}
        />
      )}
    </section>
  );
}
