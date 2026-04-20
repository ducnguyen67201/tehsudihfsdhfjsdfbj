import { Agent } from "@mastra/core/agent";
import {
  AGENT_PROVIDER,
  AGENT_PROVIDER_DEFAULTS,
  type AgentProviderConfig,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type FailureFrame,
  type FailureFrameCaption,
  type SessionDigest,
  type ToneConfig,
  agentProviderConfigSchema,
  compressedAnalysisOutputSchema,
  reconstructAnalysisOutput,
} from "@shared/types";

import {
  SUPPORT_AGENT_SYSTEM_PROMPT,
  buildAnalysisPromptWithContext,
  buildSupportAgentSystemPrompt,
} from "./prompts/support-analysis";
import { resolveModel } from "./providers";
import { createPullRequestTool } from "./tools/create-pr";
import { searchCodeTool } from "./tools/search-code";

const DEFAULT_MAX_STEPS = 8;

// ── Agent Factory ───────────────────────────────────────────────────
//
// Agents are created per-request with the caller's chosen provider/model.
// Tools and system prompt stay the same regardless of provider.
// The web app passes { provider: "openai", model: "gpt-4o" } or
// { provider: "anthropic", model: "claude-sonnet-4-20250514" } and the
// pipeline builds the right agent.
//
//   Web (user picks provider)
//       → Queue (passes provider in analyze request)
//           → Agent Service (factory creates agent with chosen LLM)
//               → Same tools, same prompt, different brain

function createSupportAgent(
  providerConfig: AgentProviderConfig,
  options?: { toneConfig?: ToneConfig; sessionDigest?: SessionDigest; hasVisualEvidence?: boolean }
) {
  let instructions: string;
  if (options?.sessionDigest) {
    instructions = buildAnalysisPromptWithContext({
      sessionDigest: options.sessionDigest,
      hasVisualEvidence: options.hasVisualEvidence,
    });
  } else if (options?.toneConfig) {
    instructions = buildSupportAgentSystemPrompt(options.toneConfig);
  } else {
    instructions = SUPPORT_AGENT_SYSTEM_PROMPT;
  }

  return new Agent({
    id: "trustloop-support-agent",
    name: "TrustLoop AI Support Agent",
    instructions,
    model: resolveModel(providerConfig),
    tools: {
      searchCode: searchCodeTool,
      createPullRequest: createPullRequestTool,
    },
  });
}

export async function runAnalysis(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const startTime = Date.now();
  const maxSteps = request.config?.maxSteps ?? DEFAULT_MAX_STEPS;
  const providerConfig = resolveProviderConfig(request);
  const modelName = providerConfig.model ?? getDefaultModel(providerConfig.provider);

  const hasVisualEvidence =
    (request.failureFrames?.length ?? 0) > 0 || (request.failureFrameCaptions?.length ?? 0) > 0;

  console.log("[agents] Starting analysis", {
    conversationId: request.conversationId,
    provider: providerConfig.provider,
    model: modelName,
    maxSteps,
    failureFrames: request.failureFrames?.length ?? 0,
    failureFrameCaptions: request.failureFrameCaptions?.length ?? 0,
  });

  const agent = createSupportAgent(providerConfig, {
    toneConfig: request.config?.toneConfig,
    sessionDigest: request.sessionDigest,
    hasVisualEvidence,
  });
  const messages = buildAgentMessages({
    workspaceId: request.workspaceId,
    threadSnapshot: request.threadSnapshot,
    failureFrames: request.failureFrames,
    failureFrameCaptions: request.failureFrameCaptions,
  });

  // Mastra's `agent.generate` accepts either a string (legacy single-message
  // text path) or a messages array (multimodal path). Cast at the boundary
  // because the public type doesn't yet model multimodal content parts in
  // every alpha; we forward what the LLM SDK natively understands.
  const result = await agent.generate(messages as never, { maxSteps, toolChoice: "auto" });

  const output = parseAgentOutput(result.text);
  const toolCalls = extractToolCalls(result);

  console.log("[agents] Analysis complete", {
    conversationId: request.conversationId,
    durationMs: Date.now() - startTime,
    toolCalls: toolCalls.length,
    steps: result.steps?.length ?? 0,
    confidence: output.analysis.confidence,
    severity: output.analysis.severity,
  });

  return {
    analysis: output.analysis,
    draft: output.draft,
    toolCalls,
    meta: {
      provider: providerConfig.provider,
      model: modelName,
      totalDurationMs: Date.now() - startTime,
      turnCount: result.steps?.length ?? 0,
    },
  };
}

// ── Private Helpers ─────────────────────────────────────────────────

function resolveProviderConfig(request: AnalyzeRequest): AgentProviderConfig {
  return agentProviderConfigSchema.parse({
    provider: request.config?.provider ?? AGENT_PROVIDER.openai,
    model: request.config?.model,
  });
}

function parseAgentOutput(rawOutput: string | undefined) {
  if (!rawOutput) {
    throw new Error("Agent produced no output after completing the loop");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(`Agent returned non-JSON response: ${rawOutput.slice(0, 200)}`);
  }

  const compressed = compressedAnalysisOutputSchema.parse(parsed);
  return reconstructAnalysisOutput(compressed);
}

interface RawToolResult {
  toolName?: string;
  name?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
}

function extractToolCalls(result: unknown) {
  const raw = (result as unknown as { toolResults?: RawToolResult[] }).toolResults ?? [];
  return raw.map((tc) => ({
    tool: tc.toolName ?? tc.name ?? "unknown",
    input: (tc.args ?? tc.input ?? {}) as Record<string, unknown>,
    output:
      typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result ?? tc.output ?? ""),
    durationMs: 0,
  }));
}

function getDefaultModel(provider: string): string {
  return AGENT_PROVIDER_DEFAULTS[provider]?.model ?? "gpt-4o";
}

interface BuildMessagesInput {
  workspaceId: string;
  threadSnapshot: string;
  failureFrames?: FailureFrame[];
  failureFrameCaptions?: FailureFrameCaption[];
}

type MessagePart = { type: "text"; text: string } | { type: "image"; image: string };

/**
 * Build the user message(s) sent to `agent.generate`. When visual evidence is
 * available we deliver it via two distinct channels depending on what the
 * caller computed:
 *
 *   - `failureFrames` (raw base64 PNGs): vision-capable model path. Each
 *     frame is appended as an `image` content part so the analyzing model
 *     sees the pixels directly. A short text caption labels each one.
 *   - `failureFrameCaptions` (text descriptions from the captioner pipeline):
 *     text-only model path. Each caption is appended as a text part. The
 *     analyzing model never receives an image.
 *
 * Callers MUST pass at most one of these — the workflow already enforces
 * mutual exclusivity. When neither is present we fall back to the original
 * single-string user message for behavioural parity with pre-frames code.
 */
function buildAgentMessages(
  input: BuildMessagesInput
): string | Array<{ role: "user"; content: MessagePart[] }> {
  const baseText = `WORKSPACE_ID: ${input.workspaceId}\n\n${input.threadSnapshot}`;

  if (input.failureFrames && input.failureFrames.length > 0) {
    const content: MessagePart[] = [{ type: "text", text: baseText }];
    content.push({
      type: "text",
      text: "\n\n## Visual evidence at the failure point\n\nThe screenshots below show the customer's screen around the moment of the failure. Cite specific UI elements you can see. Do not invent visual details.",
    });
    for (const frame of input.failureFrames) {
      content.push({
        type: "text",
        text: `\n[${frame.captionHint} — offset ${frame.offsetMs}ms from failure, timestamp ${frame.timestamp}]`,
      });
      content.push({
        type: "image",
        image: `data:image/png;base64,${frame.base64Png}`,
      });
    }
    return [{ role: "user", content }];
  }

  if (input.failureFrameCaptions && input.failureFrameCaptions.length > 0) {
    const lines: string[] = [
      baseText,
      "",
      "## Visual evidence at the failure point (described in text)",
      "",
      "These captions describe screenshots of the customer's screen around the moment of the failure. They are produced by an automated vision model — treat them as evidence but acknowledge the captioner can miss details.",
    ];
    for (const caption of input.failureFrameCaptions) {
      lines.push(
        `\n- ${caption.captionHint} (offset ${caption.offsetMs}ms, ${caption.timestamp}): ${caption.captionText}`
      );
    }
    return lines.join("\n");
  }

  return baseText;
}
