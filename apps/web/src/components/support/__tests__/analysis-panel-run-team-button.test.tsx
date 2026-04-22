import type { SupportAnalysisWithRelations } from "@shared/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStartRun = vi.fn();
const mockUseAgentTeamRun = vi.fn();

vi.mock("@/hooks/use-agent-team-run", () => ({
  useAgentTeamRun: (conversationId: string, workspaceId: string) =>
    mockUseAgentTeamRun(conversationId, workspaceId),
}));

vi.mock("@/hooks/use-analysis-stream", () => ({
  useAnalysisStream: () => ({ events: [], isStreaming: false }),
}));

const { AnalysisPanel } = await import("../analysis-panel");

const baseAnalysis: SupportAnalysisWithRelations = {
  id: "analysis_1",
  workspaceId: "ws_1",
  conversationId: "conv_1",
  status: "ANALYZED",
  category: "BUG",
  severity: "MEDIUM",
  confidence: 0.8,
  problemStatement: "Reply threading is broken on Slack.",
  likelySubsystem: "support/reply-resolver",
  rootCauseHypothesis: null,
  suggestedDirection: null,
  evidence: [],
  reasoningTrace: [],
  toolCallCount: 1,
  llmLatencyMs: 1234,
  llmModel: "gpt-4o",
  triggerType: "MANUAL",
  retryCount: 0,
  errorMessage: null,
  missingInfo: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  drafts: [],
} as unknown as SupportAnalysisWithRelations;

beforeEach(() => {
  mockStartRun.mockReset();
  mockUseAgentTeamRun.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AnalysisPanel — Run fix team button", () => {
  it("renders the button when an analysis exists and no team run is in flight", () => {
    mockUseAgentTeamRun.mockReturnValue({
      run: null,
      isLoading: false,
      isMutating: false,
      isStreaming: false,
      error: null,
      startRun: mockStartRun,
      refetch: vi.fn(),
    });

    render(
      <AnalysisPanel
        analysis={baseAnalysis}
        conversationId="conv_1"
        workspaceId="ws_1"
        isAnalyzing={false}
        onTriggerAnalysis={vi.fn()}
        onApproveDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        isMutating={false}
      />
    );

    const button = screen.getByTestId("run-fix-team");
    expect(button.textContent).toContain("Run fix team");
  });

  it("calls startRun with the current analysisId when clicked", () => {
    mockUseAgentTeamRun.mockReturnValue({
      run: null,
      isLoading: false,
      isMutating: false,
      isStreaming: false,
      error: null,
      startRun: mockStartRun,
      refetch: vi.fn(),
    });

    render(
      <AnalysisPanel
        analysis={baseAnalysis}
        conversationId="conv_1"
        workspaceId="ws_1"
        isAnalyzing={false}
        onTriggerAnalysis={vi.fn()}
        onApproveDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        isMutating={false}
      />
    );

    fireEvent.click(screen.getByTestId("run-fix-team"));

    expect(mockStartRun).toHaveBeenCalledWith({ analysisId: "analysis_1" });
  });

  it("hides the button and shows the in-flight pill while a run is queued/running/waiting", () => {
    for (const status of ["queued", "running", "waiting"]) {
      mockUseAgentTeamRun.mockReturnValue({
        run: {
          id: "run_1",
          status,
          conversationId: "conv_1",
          analysisId: "analysis_1",
          workspaceId: "ws_1",
        },
        isLoading: false,
        isMutating: false,
        isStreaming: status !== "waiting",
        error: null,
        startRun: mockStartRun,
        refetch: vi.fn(),
      });

      const { unmount } = render(
        <AnalysisPanel
          analysis={baseAnalysis}
          conversationId="conv_1"
          workspaceId="ws_1"
          isAnalyzing={false}
          onTriggerAnalysis={vi.fn()}
          onApproveDraft={vi.fn()}
          onDismissDraft={vi.fn()}
          isMutating={false}
        />
      );

      expect(screen.queryByTestId("run-fix-team")).toBeNull();
      expect(screen.getByText(`Fix team: ${status}`)).toBeDefined();
      unmount();
    }
  });

  it("shows 'Run fix team again' once a previous run has terminated", () => {
    mockUseAgentTeamRun.mockReturnValue({
      run: {
        id: "run_1",
        status: "completed",
        conversationId: "conv_1",
        analysisId: "analysis_1",
        workspaceId: "ws_1",
      },
      isLoading: false,
      isMutating: false,
      isStreaming: false,
      error: null,
      startRun: mockStartRun,
      refetch: vi.fn(),
    });

    render(
      <AnalysisPanel
        analysis={baseAnalysis}
        conversationId="conv_1"
        workspaceId="ws_1"
        isAnalyzing={false}
        onTriggerAnalysis={vi.fn()}
        onApproveDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        isMutating={false}
      />
    );

    expect(screen.getByTestId("run-fix-team").textContent).toContain("Run fix team again");
  });

  it("disables the button while the mutation is in flight", () => {
    mockUseAgentTeamRun.mockReturnValue({
      run: null,
      isLoading: false,
      isMutating: true,
      isStreaming: false,
      error: null,
      startRun: mockStartRun,
      refetch: vi.fn(),
    });

    render(
      <AnalysisPanel
        analysis={baseAnalysis}
        conversationId="conv_1"
        workspaceId="ws_1"
        isAnalyzing={false}
        onTriggerAnalysis={vi.fn()}
        onApproveDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        isMutating={false}
      />
    );

    expect(screen.getByTestId("run-fix-team").hasAttribute("disabled")).toBe(true);
  });
});
