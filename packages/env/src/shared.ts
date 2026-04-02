import { z } from "zod";

/**
 * Shared server-side env schemas. Used by both the core (worker/queue)
 * and Next.js (web) env configurations.
 */
export const serverSchemas = {
  NODE_ENV: z.enum(["development", "test", "production"]),
  APP_BASE_URL: z.url(),

  // Session
  SESSION_COOKIE_NAME: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().int().positive(),
  SESSION_SECRET: z.string().min(16),

  // Security
  API_KEY_PEPPER: z.string().min(16),

  // Database
  DATABASE_URL: z.string().min(1),

  // Temporal
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_NAMESPACE: z.string().min(1),
  TEMPORAL_TASK_QUEUE: z.string().min(1),
  CODEX_TASK_QUEUE: z.string().min(1),

  // Support / Slack
  SUPPORT_INGEST_ENABLED: z.enum(["0", "1"]),
  SLACK_SIGNING_SECRET: z.string().min(16),
  SLACK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive(),
  SLACK_BOT_TOKEN: z.string().min(1),

  // Debug
  TRUSTLOOP_DEBUG_TRPC: z.enum(["0", "1"]),
};

/** Client-side env schemas (NEXT_PUBLIC_* — inlined by Next.js at build time). */
export const clientSchemas = {
  NEXT_PUBLIC_TRUSTLOOP_DEBUG_TRPC: z.enum(["0", "1"]),
};
