# TrustLoop docs

> Engineering docs for the TrustLoop monorepo. Current-reality only: stable contracts + cross-cutting conventions. Forward-looking plans, specs, and impl checklists do NOT live here — they belong in PR descriptions, GitHub issues, or local `~/.gstack/projects/<slug>/` scratch. See the root `AGENTS.md` "Doc Philosophy" section for the rule.

## How this folder is organized

- **`conventions/`** — stable contracts and operating rules that apply across the repo (service layer, UI, REST auth, positional JSON, soft-delete, foundation setup). Update these alongside the code when a contract changes.
- **`contracts/`** — generated schema artifacts (OpenAPI, etc.).

That's it. No `plans/`, no `domains/`, no `specs/`. If you need a forward-looking plan, write it in a PR description or `~/.gstack/` scratch and let it disappear when the work lands.

## Reading order for a new agent

1. `../AGENTS.md` (symlinked as `../CLAUDE.md`) — the operating rules, including the "Doc Philosophy" section.
2. `conventions/foundation-setup-and-conventions.md` — stack, layering, dependency direction.
3. `conventions/service-layer-conventions.md` — how all business logic is organized.
4. The code itself — `apps/web/src/domains/*`, `apps/queue/src/domains/*`, `packages/rest/src/services/*`. The code is authoritative; docs only tell you how to navigate it.

## Conventions (cross-cutting)

| Doc | What it covers |
|---|---|
| [conventions/foundation-setup-and-conventions.md](conventions/foundation-setup-and-conventions.md) | Architecture baseline: stack, monorepo layout, dependency direction, naming. |
| [conventions/service-layer-conventions.md](conventions/service-layer-conventions.md) | Service namespace imports, naming rules, size budget, rollout status. The law for `packages/rest/src/services/**`. |
| [conventions/ui-conventions.md](conventions/ui-conventions.md) | shadcn/ui only, theme preset, Tailwind usage, component decomposition rules. |
| [conventions/spec-rest-api-key-auth.md](conventions/spec-rest-api-key-auth.md) | Internal (`tli_`) vs workspace (`tlk_`) API key auth. `withServiceAuth` / `withWorkspaceApiKeyAuth` guards. |
| [conventions/spec-positional-json-format.md](conventions/spec-positional-json-format.md) | The compressed LLM output format: numeric enums, reconstruction, max 2-level nesting. Required for all structured LLM output. |
| [conventions/spec-soft-delete-strategy.md](conventions/spec-soft-delete-strategy.md) | Prisma soft-delete extension, `findIncludingDeleted`, partial unique indexes, transaction rules. |
| [conventions/spec-conversation-progress-insights.md](conventions/spec-conversation-progress-insights.md) | Conversation progress insights contract: shape, lifecycle, update rules. |

The `spec-*` files under `conventions/` are stable contracts (schemas, formats, auth patterns) — not forward-looking specs. They describe what the system guarantees, not what we plan to build.

## Contracts

| Doc | What it covers |
|---|---|
| [contracts/openapi.json](contracts/openapi.json) | Generated OpenAPI schema. Source of truth order: Zod → TS type → OpenAPI (see `conventions/foundation-setup-and-conventions.md`). |

## Adding a new doc

Before adding anything under `docs/`, ask: does this describe current reality, or future intent?

- **Current-reality contract or convention** → `conventions/` (update alongside the code that implements it)
- **Generated schema** → `contracts/`
- **Forward-looking plan, spec, or impl checklist** → **do not commit here.** Write it in your PR description, a GitHub issue, or `~/.gstack/projects/<slug>/`. Let it disappear when the work ships.
- **In-flight migration that needs shared state across sessions** → `docs/refactor/<feature>-status.md` (a status doc, not a plan). Delete when the migration lands.

If you need to explain rationale long-term, fold it into the matching `conventions/*.md` or root `AGENTS.md`. Commit the reasoning, not the plan.
