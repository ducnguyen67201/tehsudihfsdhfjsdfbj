import { Agent } from "@mastra/core/agent";
import {
  type SupportSummaryRequest,
  type SupportSummaryResponse,
  compressedSummaryOutputSchema,
  reconstructSummaryOutput,
} from "@shared/types";

import { getDefaultModel, resolveProviderConfig } from "./agent-config";
import {
  SUPPORT_SUMMARY_SYSTEM_PROMPT,
  renderSupportSummaryPrompt,
} from "./prompts/support-summary.prompt";
import { resolveModel } from "./providers";

export async function runSupportSummary(
  request: SupportSummaryRequest
): Promise<SupportSummaryResponse> {
  const startTime = Date.now();
  const providerConfig = resolveProviderConfig();
  const modelName = providerConfig.model ?? getDefaultModel(providerConfig.provider);
  const agent = new Agent({
    id: "trustloop-support-summary-agent",
    name: "TrustLoop Support Summary Agent",
    instructions: SUPPORT_SUMMARY_SYSTEM_PROMPT,
    model: resolveModel(providerConfig),
    tools: {},
  });

  console.log("[agents] Starting support summary", {
    conversationId: request.conversationId,
    provider: providerConfig.provider,
    model: modelName,
    messageCount: request.messages.length,
  });

  const result = await agent.generate(renderSupportSummaryPrompt(request.messages), {
    maxSteps: 1,
  });
  const output = parseSummaryOutput(result.text);

  console.log("[agents] Support summary complete", {
    conversationId: request.conversationId,
    provider: providerConfig.provider,
    model: modelName,
    durationMs: Date.now() - startTime,
  });

  return { summary: output.summary };
}

function parseSummaryOutput(rawOutput: string | undefined) {
  if (!rawOutput) {
    throw new Error("Summary agent produced no output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(`Summary agent returned non-JSON response: ${rawOutput.slice(0, 200)}`);
  }

  const compressed = compressedSummaryOutputSchema.parse(parsed);
  return reconstructSummaryOutput(compressed);
}
