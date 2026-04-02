import { z } from "zod";

/** Canonical node environment values. */
export const NODE_ENV = {
  DEVELOPMENT: "development",
  TEST: "test",
  PRODUCTION: "production",
} as const;

const nodeEnvValues = Object.values(NODE_ENV) as [string, ...string[]];

/**
 * Shared server-side env schemas. Used by both the core (worker/queue)
 * and Next.js (web) env configurations.
 */
export const serverSchemas = {
  NODE_ENV: z.enum(nodeEnvValues).default(NODE_ENV.DEVELOPMENT),
  APP_BASE_URL: z.url().default("http://localhost:3000"),

  // Session
  SESSION_COOKIE_NAME: z.string().default("trustloop_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  SESSION_SECRET: z.string().min(16).default("dev-only-trustloop-session-secret"),

  // Security
  API_KEY_PEPPER: z.string().min(16).default("dev-only-trustloop-api-key-pepper"),

  // Database
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/trustloop?schema=public"),

  // Temporal
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("support-general"),
  CODEX_TASK_QUEUE: z.string().default("codex-intensive"),

  // Support / Slack
  SUPPORT_INGEST_ENABLED: z.enum(["0", "1"]).default("0"),
  SLACK_SIGNING_SECRET: z.string().min(16).default("dev-only-trustloop-slack-signing-secret"),
  SLACK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  SLACK_BOT_TOKEN: z.string().min(1).default("xoxb-dev-placeholder"),

  // Debug
  TRUSTLOOP_DEBUG_TRPC: z.enum(["0", "1"]).default("0"),
};

/** Client-side env schemas (NEXT_PUBLIC_* — inlined by Next.js at build time). */
export const clientSchemas = {
  NEXT_PUBLIC_TRUSTLOOP_DEBUG_TRPC: z.enum(["0", "1"]).default("0"),
};
