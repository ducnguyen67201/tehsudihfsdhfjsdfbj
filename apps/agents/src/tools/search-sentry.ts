import { Tool } from "@mastra/core/tools";
import { z } from "zod";

export interface SearchSentryToolInput {
  query: string;
  workspaceId: string;
}

export interface SearchSentryToolResult {
  title: string;
  detail: string;
}

export interface SearchSentryToolOutput {
  message: string;
  results: SearchSentryToolResult[];
}

const searchSentryInputSchema = z.object({
  query: z.string().describe("Search query: error message, exception type, or keyword"),
  workspaceId: z.string().describe("The workspace ID"),
});

export const searchSentryTool = new Tool<SearchSentryToolInput, SearchSentryToolOutput>({
  id: "search_sentry",
  description:
    "Search production error evidence related to the customer's problem. " +
    "Use this when a role wants runtime confirmation for crashes, 500s, or unexpected behavior.",
  inputSchema: searchSentryInputSchema,
  execute: async (input: SearchSentryToolInput): Promise<SearchSentryToolOutput> => {
    return {
      message:
        "Sentry search is not configured in this environment. Continue with code search and session evidence instead.",
      results: [
        {
          title: `Unavailable for query: ${input.query}`,
          detail: `No Sentry backend is wired for workspace ${input.workspaceId}.`,
        },
      ],
    };
  },
});
