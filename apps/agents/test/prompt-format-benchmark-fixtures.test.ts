import { describe, expect, it } from "vitest";

import { serializeAsJson } from "../src/prompts/renderers/json-serializer";
import { serializeAsToon } from "../src/prompts/renderers/toon-serializer";

describe("prompt format benchmark fixtures", () => {
  it("shows TOON beating formatted JSON on a uniform record fixture", () => {
    const payload = {
      results: [
        { id: 1, file: "src/auth.ts", line: 42, score: 0.92, type: "code" },
        { id: 2, file: "src/billing.ts", line: 88, score: 0.81, type: "code" },
        { id: 3, file: "src/inbox.ts", line: 17, score: 0.78, type: "code" },
      ],
    };

    const jsonOutput = serializeAsJson(payload);
    const toonOutput = serializeAsToon(payload);

    expect(toonOutput.length).toBeLessThan(jsonOutput.length);
  });

  it("renders nested fixtures in both formats for later comparison", () => {
    const payload = {
      conversation: {
        customer: {
          email: "user@example.com",
          org: "Acme",
        },
        events: [
          {
            type: "message",
            body: "Billing failed after upgrade",
            metadata: {
              source: "slack",
              tags: ["billing", "upgrade"],
            },
          },
        ],
      },
    };

    const jsonOutput = serializeAsJson(payload);
    const toonOutput = serializeAsToon(payload);

    expect(jsonOutput.length).toBeGreaterThan(0);
    expect(toonOutput.length).toBeGreaterThan(0);
  });
});
