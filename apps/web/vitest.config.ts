import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": `${path.resolve(__dirname, "src")}/`,
      "@shared/types/": `${path.resolve(__dirname, "../../packages/types/src")}/`,
      "@shared/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@shared/rest/": `${path.resolve(__dirname, "../../packages/rest/src")}/`,
      "@shared/rest": path.resolve(__dirname, "../../packages/rest/src/index.ts"),
      "@shared/database/": `${path.resolve(__dirname, "../../packages/database/src")}/`,
      "@shared/database": path.resolve(__dirname, "../../packages/database/src/index.ts"),
      "@shared/env/": `${path.resolve(__dirname, "../../packages/env/src")}/`,
      "@shared/env": path.resolve(__dirname, "../../packages/env/src/index.ts"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "happy-dom",
    // Playwright e2e specs live in `e2e/` and use `@playwright/test` which is
    // executed by playwright, not vitest. Keep them out of the unit suite.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
  },
});
