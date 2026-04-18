<!-- /autoplan restore point: /Users/ducng/.gstack/projects/TrustLoop/main-autoplan-restore-20260418-090440.md -->
# Mintlify Customer Docs Rollout

Status: rough plan, pending autoplan review.
Owner: Duc.
Target: first customer pilot (aligned with `impl-plan-first-customer-happy-path-mvp.md`).

## 1) Goal

Stand up a free, customer-facing documentation site at `docs.gettrustloop.app` (or sub-path of the marketing domain) so that:

1. Prospective customers can evaluate TrustLoop without a sales call.
2. Pilot customers can self-serve Slack install, workspace API key use, and session-replay SDK integration.
3. Security-conscious buyers see "customer-safety language" (trust, isolation, redaction, data handling) as a first-class page, not buried.
4. New customer-facing docs added to the repo auto-publish to the live site with zero manual ops.
5. The internal engineering docs in `docs/` **never** leak to customers.

Non-goal: migrate internal engineering docs. They stay where they are, scoped to the repo.

## 2) Why Mintlify (vs alternatives)

| Tool | Free for our stage? | GitHub sync | Auto-publish new pages | Customer-tone defaults | Startup fit |
|---|---|---|---|---|---|
| **Mintlify** (pick) | Yes, free tier: 1 editor, subdomain, basic analytics | Yes, native | Yes, on push | Yes, OpenAPI + component library | High |
| Docusaurus | Yes, fully free, self-hosted | Manual CI | Yes once CI wired | Generic | Medium (more setup cost) |
| GitBook | Free tier exists but new-page auto-publish is weaker | Yes | Manual enablement per page | Yes | Medium |
| Readme.io | Paid only for custom domain | Yes | Yes | Yes | Low (cost) |

Mintlify wins on the combination of: free at our stage, OpenAPI rendering for our `/api/rest/*` surface, MDX with components, and GitHub-native sync with zero CI config. We hit a paywall at custom domain (~$150/mo Pro), which becomes the trigger for the first paid upgrade — expected concurrent with first paid customer.

## 3) Customer-facing surface (what actually needs docs)

Mapped from the MVP plan and the existing product:

1. **Getting started** — create workspace, invite team, connect Slack.
2. **Slack install flow** — OAuth scopes, what TrustLoop sees, how to uninstall. Source of truth: `docs/domains/support/spec-slack-oauth-install-flow.md` (redacted to customer language).
3. **Inbox usage** — triage, grouping, assign, reply, approvals.
4. **AI draft approvals** — how drafts are generated, how to edit, source-citation semantics.
5. **Workspace API keys** (`tlk_` prefix) — generate, rotate, scopes, quickstart.
6. **REST API reference** — generated from `docs/contracts/openapi.json`.
7. **Session Replay SDK** — install snippet, initialization, privacy redaction controls. Source: `docs/domains/session-replay/spec-session-replay-sdk.md` (redacted).
8. **Security and trust** — data residency, tenant isolation, Slack webhook signature, soft-delete recovery, audit logging, subprocessor list. The "customer safety language" page.
9. **Billing and plan limits** — (stubbed until Deliverable D ships).
10. **Changelog** — customer-visible releases only.

## 4) Repo structure — separating internal from public

This is the load-bearing decision. Three options:

**Option A — `docs/public/` subtree in this monorepo (recommended)**
- New path `docs/public/` holds all customer-facing MDX.
- Mintlify points at `docs/public` via `mint.json`.
- CI check prevents any `docs/domains/**`, `docs/conventions/**`, `docs/plans/**`, `docs/specs/**` content from ever landing under `docs/public/` (path validator + keyword denylist).
- Internal docs untouched.

**Option B — separate repo** (`trustloop/docs`)
- Cleanest isolation, but breaks "single source of truth for shared content" (Slack OAuth spec, SDK spec). Would need a sync job.

**Option C — Mintlify path filter only**
- Relies on Mintlify config alone. One misconfig and internal specs ship publicly. No defense in depth.

→ **Recommend A.** Monorepo simplicity + explicit CI deny-list. Internal docs stay in place; customer docs are a new, isolated tree we own the style of.

## 5) Redaction policy (customer-safety language)

Every page in `docs/public/` must pass these checks before merge:

1. **No internal paths**: no `apps/queue/src/...`, `packages/rest/...`, `services/**`.
2. **No internal identifiers**: no `tli_` service-key prefix references; `tlk_` is fine (it is the customer surface).
3. **No implementation detail that isn't contract**: OpenAPI surface, event names, and SDK methods are fine. Prisma schema, Temporal task-queue names, and workflow IDs are not.
4. **Tone**: operator-facing, not engineer-facing. Second person ("you"), short sentences, no "we use X because Y" unless Y is customer-relevant.
5. **Security language uses the trust vocabulary**: "tenant-isolated", "signed webhooks", "recoverable soft-delete", "audit-logged", "redaction controls". Matches DESIGN.md tone: calm, sharp, credible.
6. **Source-of-truth footer on any page derived from internal spec**: footnote linking to the date of the last internal-spec sync (helps keep them from drifting silently).

Enforcement: a Biome-style denylist check in CI plus a manual review gate in the PR template (`[ ] Customer-safety review`).

## 6) Auto-publish flow

1. Developer writes or edits `docs/public/**/*.mdx`.
2. PR opens → CI runs: (a) path validator, (b) denylist scanner, (c) MDX lint, (d) openapi drift check if `contracts/openapi.json` changed.
3. On merge to `main`, Mintlify's GitHub app picks up the diff and publishes within ~60s.
4. New pages appear automatically once referenced in `mint.json` navigation. Un-referenced MDX files fail the nav-completeness check.
5. Changelog page is the only one with a scheduled automation (weekly): pulls from curated commit trailers like `docs-public: ...` on merged PRs.

## 7) Domain, branding, analytics

- **Free tier**: start on `trustloop.mintlify.app`. Accept Mintlify branding.
- **Paid upgrade trigger**: first paying customer OR public launch, whichever first. Move to `docs.gettrustloop.app` and drop Mintlify branding.
- **Branding**: map Mintlify theme to DESIGN.md tokens (mono family, calm low-chrome palette). Keep product voice consistent.
- **Analytics**: Mintlify's built-in page view tracking is sufficient for pilot. No third-party analytics until we have something to learn from.
- **Feedback**: enable Mintlify's built-in thumbs-up/down per page. Route low-score pages into a `docs-public: review` label for weekly triage.

## 8) Initial content cut (shipping order)

Phase 1 (week 1) — unblocks first pilot:
- Getting started
- Slack install flow
- Inbox usage (basic)
- Security and trust (this is the demo-clinching page)

Phase 2 (week 2) — unblocks self-serve and sales:
- Workspace API keys quickstart
- REST API reference (auto-generated)
- AI draft approvals

Phase 3 (week 3+) — depth:
- Session Replay SDK
- Advanced inbox
- Changelog wiring
- Billing (once Deliverable D lands)

## 9) Open questions (for review)

1. Subpath (`trustloop.ai/docs`) vs subdomain (`docs.gettrustloop.app`) — SEO vs isolation tradeoff.
2. Does the "Customer safety" page need legal review before publish?
3. Should SDK docs live in the SDK repo once the SDK is extracted, with Mintlify multi-source? Or stay in monorepo?
4. Where does the "API playground" (try-it-now, requires workspace key) live — and does it need rate-limiting or auth-isolation work first?
5. Do we want versioned docs (`/v1`, `/v2`) from day one, or collapse to latest-only until we break something?

## 10) NOT in scope

- Migrating internal engineering docs to Mintlify.
- Building a docs search/chat assistant (Mintlify provides search; custom AI chat is a later optimization).
- Multi-language / i18n.
- Community forum, discussions, or comments.
- Marketing site (separate project).
- OpenAPI polish beyond what the generator produces by default.

## 11) Implementation checklist (rough)

- [ ] Decide Option A vs B vs C in §4 (recommend A).
- [ ] Create `docs/public/` with a stub `introduction.mdx`.
- [ ] Add `docs/public/mint.json` with navigation skeleton covering Phase 1 content.
- [ ] Connect Mintlify GitHub app to the repo, scoped to `docs/public`.
- [ ] Add CI job: path validator + denylist scanner + MDX lint. Lives in `.github/workflows/docs-public.yml`.
- [ ] Add `docs-public` PR template checklist item.
- [ ] Write Phase 1 pages (getting started, Slack install, inbox, security & trust).
- [ ] Verify publish on push to `main`.
- [ ] Announce internally; link from in-app empty states.
- [ ] Track feedback thumbs for 2 weeks; triage low-score pages.

## 12) Success criteria

- First pilot customer can install Slack and send a message end-to-end using only published docs.
- Security buyer's most common objection (tenant isolation, webhook signing, redaction) is answered on a single page.
- Zero internal-docs leaks (validated by CI deny-list in every PR).
- New customer-facing page merged on Friday is live by Friday evening without human intervention.

---

# Autoplan Review Output

_Generated by `/autoplan` on 2026-04-18. Dual voices: Claude subagent + Codex. Premise gate passed with domain correction to `docs.gettrustloop.app`. Mode: SELECTIVE EXPANSION. Final approval gate skipped per explicit user instruction ("shipping this for me no need to ask my approval")._

## USER CHALLENGE — both models recommend changing the user's stated direction

**What the user said:** build the full Mintlify customer docs rollout now (10-page tree, 3-week phased content, auto-publish, CI deny-list, etc.).

**What both models recommend:** kill or heavily defer this plan. Ship a minimal "pilot activation + trust proof" pack (2-3 pages, maybe Notion for now) and reallocate the reclaimed founder-weeks to MVP Deliverables D (Billing + Metering) and F (Reliability + Retention), which are the actual blockers to charging a pilot customer.

**Why:**
- TrustLoop has **zero pilots today**. Docs with no audience → no signal. Pre-product B2B evaluation is supposed to happen on a call where you learn; polished docs short-circuit that learning.
- Core MVP blockers remain open (per `impl-plan-first-customer-happy-path-mvp.md`): manual merge/split, billing + metering, reliability/retention, secret rotation. Shipping docs before these is putting polish on an incomplete product.
- The "Security & Trust" page, framed as load-bearing, is a liability at this stage: you don't have SOC2, DPA template, finalized subprocessor list, or secret rotation policy. Publishing trust language you can't evidence creates legal + credibility risk.
- Both models flag the **missing AI-native angle** as a strategic miss: `llms.txt`, agent-readable docs, and "our docs ground our own agent" are strategic differentiators for an AI-agent company; this plan doesn't leverage them.

**What we might be missing (models' blind spots):**
- The user may already have a pilot in pipeline that requires a shareable docs URL by a specific date.
- The user may be using this plan as a forcing function to clean up product messaging, not as a true ship target.
- "Looking like a company" has real fundraising / credibility value at pre-seed stage the models don't see.
- Mintlify setup is cheap enough (~1 week, not 3-4) that "defer until pilots exist" could leave the docs infrastructure on the critical path for the first paid customer.

**If we're wrong, the cost is:** 3-6 founder-weeks spent on a polished docs site while the actual MVP blockers (billing, reliability) slip. Pilots don't convert because TrustLoop can't take payment or guarantee uptime, not because the docs weren't pretty. Subagent's one thing: _"don't build the docs site"_. Codex's one thing: _"freeze the Mintlify rollout; replace with 1-week activation+trust pack that's both human- and agent-readable, ship only after MVP readiness gates pass."_

⚠️ **Both models agree this is a strategic priority problem, not a preference disagreement.** Neither flagged it as a security/feasibility blocker per se, but both landed at "critical" severity.

**Your original direction stands unless you explicitly change it.** This section exists so the ship of this plan happens with eyes open on what both independent reviewers said.

---

## Step 0A — Premise Challenge

| # | Premise | Verdict | Notes |
|---|---|---|---|
| P1 | Customers need self-serve docs before pilot | PARTIAL | Trust page has pre-contract value; usage docs don't (white-glove until pilot 3+) |
| P2 | Internal `docs/` tree can't be published | TRUE | Load-bearing; 25 files contain P0 security checklists, codex prompts, internal key prefixes |
| P3 | Mintlify free tier sufficient through first paid customer | TRUE today | Breaks ~Phase 3 when team contributes (multi-editor) |
| P4 | Auto-publish on push is meaningful | PARTIAL | Should be auto-to-staging + explicit promote; plan originally conflated these |
| P5 | Domain is `docs.gettrustloop.app` | CONFIRMED | User-corrected from `docs.trustloop.ai` at premise gate |
| P6 | Option A (`docs/public/` subtree) beats separate repo | CONTESTED | Both dual voices prefer Option B (separate repo) for CI decoupling; see Section 1 below |

## Step 0B — Existing Code Leverage Map

| Sub-problem | Existing in repo | Leverage strategy |
|---|---|---|
| OpenAPI rendering | `docs/contracts/openapi.json` | Mintlify reads directly, zero new work |
| Slack install customer doc | `docs/domains/support/spec-slack-oauth-install-flow.md` | Redact → customer page |
| Session Replay SDK doc | `docs/domains/session-replay/spec-session-replay-sdk.md` | Redact → customer page |
| Security narrative raw material | `docs/domains/auth/spec-auth-workspace-security-p0.md` + `spec-soft-delete-strategy.md` | Redact → Trust page (WITH codex caveat: only claim what's evidenced) |
| Brand tone/typography | `DESIGN.md` mono family, calm low-chrome | Map to Mintlify theme tokens |
| Workspace API key contract | `packages/rest/src/security/rest-auth.ts` | `tlk_` customer surface only |

**Finding:** 60-70% of intended customer content is redaction-and-rewrite from existing specs, not writing from scratch. This lowers the "founder time cost" concern from both voices by ~30-50%.

## Step 0C — Dream State Delta

**CURRENT:** `docs/` = 100% internal, 25 files, zero customer-facing prose beyond root README.

**THIS PLAN closes ~40% of the 12-month gap:** foundational tree, trust page, auto-publish loop, 3 most-demanded references (Slack install, API key, SDK).

**12-MONTH IDEAL (not closed by this plan):** `llms.txt` + agent-readable docs, in-app contextual links, API sandbox playground, embedded media, multi-editor workflow, AI-powered docs chat grounded in the same retrieval as the product, doc-feedback → product-backlog loop.

**Both models pushed the AI-native dimension into scope.** Noted as taste expansion candidate below.

## Step 0C-bis — Implementation Alternatives

Covered in plan §2 (Mintlify/Docusaurus/GitBook/Readme.io) and §4 (monorepo/separate repo/filter-only). Both dual voices flag **Option A → Option B** as a correction: separate `trustloop/docs` repo with pull-based sync for the 2 shared specs, not a monorepo subtree with CI deny-list.

## Step 0D — Mode Analysis (SELECTIVE EXPANSION)

**Hold scope:** Mintlify, customer tree, auto-publish with staging gate, Trust page scoped to evidenced controls only.

**Accepted cherry-picked expansions (in blast radius, <1d CC each):**
1. Staging gate via Mintlify PR preview + explicit promote-on-merge (auto-decide: P1 completeness, P2 blast-radius).
2. `llms.txt` + `llms-full.txt` auto-generation from the customer tree (auto-decide: P1, both models). ~2h CC.
3. Redaction-bot PR label for any `docs/public/**` change. ~30min CC.
4. Source-of-truth footer linking customer page → internal spec with last-sync date.
5. "Read as a stranger" PR checklist item (subagent #8).

**Deferred to TODOS.md:**
- In-product contextual onboarding (both voices recommend; major UI scope change — separate plan).
- Doc-grounded AI chat ("our product grounded by our own docs" demo — separate plan, depends on agent service).
- API playground / sandbox.
- Video / GIF embeds.
- Multi-language, community forum.

**Rejected:**
- Separate repo (Option B) vs monorepo subtree (Option A): **TASTE DECISION surfaced below**. Both voices favor B; I favor A for source-of-truth on Slack/SDK specs. Documented, not auto-decided.
- Full REST reference on day one (codex #9): **TASTE DECISION**. Ship only stable endpoints with beta markers. Lean accept.
- Lightweight version tags (codex #10): accept — add `latest` + `pilot-2026Q2` from day one.

## Step 0E — Temporal Interrogation

| Time | State | Risk |
|---|---|---|
| HOUR 1 | Mintlify GitHub app connected, stub page live | Low |
| DAY 1 | Trust page draft (if evidenced controls exist) + Getting Started | MED — tone calibration |
| DAY 3 | CI staging gate + `llms.txt` generator | MED — Mintlify preview limits on free tier |
| WEEK 1 | Phase 1 pages live; first pilot reads Slack install | HIGH — proof point. If install still needs support, docs failed |
| WEEK 2 | API reference + key quickstart | Low |
| WEEK 4 | SDK doc; external feedback triage | Med |
| MONTH 3 | Custom domain upgrade (first paid customer) | Low |
| MONTH 6 | Multi-editor need → paid tier | Low |
| MONTH 12 | Docs = inbound eval lever; in-app links; AI chat | Out of scope (separate plans) |

**HOUR 1 failure mode:** Mintlify GitHub app permissions on private repo. Mitigation: stub PR test first.

**WEEK 1 failure mode:** pilot can't install Slack from docs alone. Mitigation: one screen-recording GIF per critical step, even though §10 defers video. **Auto-accept this addition.**

## Step 0F — Mode Confirmation

**Mode: SELECTIVE EXPANSION.** Scope held on 10-page customer tree + auto-publish + deny-list; expansions accepted (staging gate, `llms.txt`, redaction bot, source-of-truth footer, screen-rec GIFs); non-blast-radius expansions (in-app links, AI chat, video, playground) deferred to TODOS.md.

## Step 0.5 — Dual Voices (CEO)

### CODEX SAYS (CEO — strategy challenge)

12 findings. Top 4:
1. **[critical]** Bet against self-serve premise while billing/reliability open. → Kill "prospect self-serve" goal; scope to pilot activation + support deflection.
2. **[critical]** Founder time on docs while MVP monetization + ops incomplete. → Defer full rollout until pilot-readiness gate passes.
3. **[high]** Trust page becomes marketing liability if not evidence-backed. → Restrict claims to demonstrable controls with evidence links.
4. **[high]** Missed AI-native angle. → `llms.txt`, agent-readable task docs, retrieval-optimized canonical docs are first-class.

Plus: replace part of Phase 1 with in-app guided setup (#7), lean on sharp differentiated promise ("AI+code-context resolution loop") with measurable before/after (#8), lightweight version tags (#10), gate changelog on customer-visible outcomes (#11), and the critical 6-month regret (#12).

ONE thing: **"freeze the full Mintlify rollout; replace with a 1-week activation+trust pack that is both human- and agent-readable; ship only after MVP readiness gates pass."**

### CLAUDE SUBAGENT (CEO — strategic independence)

10 findings. Top 4:
1. **[critical]** Building infrastructure for customers that don't exist. → Kill docs site; write 2-page Notion guide per design partner; close Deliverables E + F.
2. **[high]** Trust page is placebo without evidenced controls (no SOC2, no DPA, no rotation). → Replace with one-line "Security — talk to us" mailto until controls ship.
3. **[high]** Self-serve premise backwards at pre-product B2B. → Docs exist to reduce friction *after* sales conversation, not replace it.
4. **[high]** Mintlify comparison omits the one factor that matters in 2026 (AI chat, `llms.txt`, agent-readable output). → Add row and re-score.

Plus: 3-week rollout with one founder is padding OR crowding (#5), deferring doc search/AI chat is the regret decision (#6), Option A couples docs velocity to monorepo CI (#7) → prefer separate repo, deny-list is security theater vs taste (#8), auto-publish without staging is a regression (#9), competitive framing absent — need one page Intercom/Pylon can't write: "how we ground drafts in your code" (#10).

ONE thing: **"don't build the docs site. Write 2-page Notion guide per design partner, reclaim the week, ship Deliverables E and F."**

### Consensus

See table above. **6/6 CONFIRMED DISAGREEMENTS** with plan direction. Escalated to User Challenge at top of this review output.

## Sections 1-10 — CEO Review Sections (applicable subset)

_Not every section from the review rubric applies to a docs-infrastructure plan (no error-rescue registry for a static docs site, for example). For each, I state what I examined and whether anything was flagged._

### Section 1 — Problem & Scope Clarity
**Examined:** the goal statement (§1), success criteria (§12), and what's in/out of scope (§10). **Flagged:** the scope is clear but the _right_ scope is contested — both voices say it's too broad for pre-product stage. Not a clarity issue; a calibration issue, captured in User Challenge.

### Section 2 — Error & Rescue Registry
**N/A for a docs site.** No runtime errors/rescues apply. Doc-publish failures (Mintlify sync break, DNS misconfig) are Phase 3 Eng concerns — deferred there.

### Section 3 — Failure Modes Registry

| # | Failure mode | Severity | Detect | Mitigate |
|---|---|---|---|---|
| F1 | Internal spec content leaks to customer-facing page | Critical | CI deny-list + "read as stranger" review | Block merge; taste review over regex |
| F2 | Trust page makes unbacked claims (SOC2, retention, rotation) | Critical | Legal/founder review pre-merge | Scope to evidenced controls only; mark roadmap items as "on roadmap" not "done" |
| F3 | Mintlify free-tier limits hit before paid trigger (editor seats) | Medium | Monitor editor count | Upgrade to Pro |
| F4 | GitHub app permissions break on private repo | Medium | Stub PR test HOUR 1 | Degrade to manual webhook |
| F5 | Auto-publish ships typo before human sees it | High | Mintlify PR previews | Require preview URL in PR before merge |
| F6 | Docs drift from product (API response shape changes) | High | OpenAPI drift CI check | Source-of-truth footer + drift alert |
| F7 | Founder spends weeks polishing docs while MVP blockers slip | Critical | Review at end of WEEK 1 | **USER CHALLENGE above — decide first whether to proceed** |

### Section 4 — "What's already in scope elsewhere"
**Examined:** MVP plan Deliverables A-F. Auth + Slack ingestion + inbox UI are done. **Finding:** Billing (D) and Reliability (F) are open and Codex flagged this as a critical priority conflict. The Trust page in this plan would reference capabilities that Deliverable F is supposed to deliver — there's a dependency both voices called out.

### Section 5 — Competitive / Market
**Examined:** plan §2 table against Intercom/Zendesk/Pylon baseline. **Flagged:** plan doesn't name a differentiator. Subagent's fix is the sharpest: **one page competitors can't write** — "How we ground drafts in your code" with anonymized before/after traces. Added to Phase 1 content list below.

### Section 6 — Temporal / Sequencing
**Examined:** 3-phase 3-week rollout (§8). **Flagged:** Phase 3 depends on Deliverable D (billing) which is not shipped. Phase 1 "Security & Trust" depends on controls in A.7 and F (open). Sequencing assumes work outside this plan's control lands in time.

### Section 7 — Success Criteria Measurability
**Examined:** §12. **Flagged:** "Zero internal-docs leaks" is easy to measure (deny-list alert); "first pilot installs via docs alone" is the real outcome and has no measurement plan. Added to TODOS.

### Section 8 — Deferred / Out-of-scope Hygiene
**Examined:** §10. **Flagged:** §10 defers AI chat / search — both voices say this is the regret decision. Either accept the defer with eyes open, or move Mintlify AI chat into Phase 1 (~0 founder-time cost, free tier includes it).

### Section 9 — Risk to Other Initiatives
**Examined:** MVP plan dependencies. **Flagged:** founder-week reallocation is the main risk. See User Challenge.

### Section 10 — Overall Readiness
**Examined:** plan as a whole. **Verdict:** the plan is internally coherent. External to itself — at the company-strategy level — both dual voices say wrong priority. This is the core tension surfaced at top of review.

## Phase 1 — Completion Summary

| Dimension | Rating | Notes |
|---|---|---|
| Problem clarity | 8/10 | Clear; priority contested |
| Scope calibration | 4/10 | Both voices say too broad for pre-product |
| Alternatives coverage | 6/10 | Missed AI-native angle; both voices flagged |
| Failure mode registry | 7/10 | Added F1-F7; F7 is the user-challenge escalation |
| Competitive framing | 3/10 | Missing differentiator; one page proposed ("how we ground drafts in your code") |
| 6-month trajectory | 5/10 | Reasonable if priority is right; disastrous if not |
| **Overall** | **YELLOW** | Proceed per user instruction; User Challenge documented |

**Phase 1 complete.** Codex: 12 concerns (3 critical, 6 high). Claude subagent: 10 issues (1 critical, 6 high). Consensus: 6/6 confirmed directionally, 1 disagreement (monorepo vs separate repo → taste decision). Passing to Phase 2 (Design review — UI scope detected: docs site IA, nav, Trust page framing, onboarding flow all count).

---

## Phase 2 — Design Review

### Step 0 (Design Scope)

| Dimension | Completeness in plan | Notes |
|---|---|---|
| Information hierarchy | 2/10 | Pages listed, no ordering rationale, no evaluator-vs-operator split |
| Component vocabulary | 1/10 | No `mint.json`, no template set, no component spec |
| Interaction states | 1/10 | No prerequisites, empty, error, "if this fails", stale-data states |
| Typography + theme | 2/10 | "Map DESIGN.md tokens" is one line; no concrete mapping |
| Accessibility | 0/10 | Silent. DESIGN.md's yellow-on-taupe is a known AA contrast trap |
| Responsive | 2/10 | "Mintlify is responsive by default" is a non-decision for code-heavy docs |
| Voice/tone | 3/10 | §5 has redaction rules but no prose voice guide |

**Weighted completeness: ~1.5/10.** This plan is a content roadmap and repo-structure decision, not yet a design plan. That's the gap the design review closes.

Existing patterns to leverage:
- `DESIGN.md` (mono family, calm low-chrome, yellow primary, taupe base, no radius, operator-tool voice — not marketing)
- `apps/web/src/app/globals.css` (theme source of truth for the product; docs theme should reference same tokens)

### Step 0.5 — Design Dual Voices

#### CODEX SAYS (design — UX challenge)

11 findings. Top 4:
1. **[critical]** Two primary users at once (evaluator + operator) → nav fails both. Fix: split IA into `Evaluate TrustLoop` and `Implement TrustLoop` tabs; evaluator is the default entry path.
2. **[critical]** A11y entirely unspecified, yellow-on-taupe is a known contrast trap. Fix: Phase 1 gated on WCAG 2.2 AA: contrast, keyboard-only QA, visible focus, semantic landmarks, heading order.
3. **[critical]** Trust page governance is about wording, not evidence. Fix: every Trust claim must include `evidence source`, `last verified date`, `owner` — or remove the claim.
4. **[high]** Current Phase 1 order leads with setup instead of proof; contradicts "security-first buyer." Fix: lead nav with `Security & Trust` + `How We Ground Drafts in Your Code`.

Plus: standard "If this fails" section on every task page (#3), explicit OpenAPI/changelog states (Unavailable / Partially Updated / Last Verified) (#4), concrete responsive rules (#5), yellow restricted to accents only in `mint.json` (#7), concrete theme spec with token map + typography scale + code-block decisions (#8), 4 locked templates (Overview / Task Flow / Reference / Trust Evidence) (#9), top-level page "How TrustLoop Grounds Drafts in Your Code" cross-linked from home + Trust (#11).

ONE design decision: **pick a single primary Phase 1 audience (security evaluator) and force nav, templates, and states to optimize that journey first.**

#### CLAUDE SUBAGENT (design — independent review)

Findings grouped by 7 design dimensions. Headlines:
- **IH [critical]:** Nav serves already-onboarded operator, not evaluator. Trust page at position 8 buries the moment of belief. Fix: evaluator-first nav — Overview → Security & Trust → How we ground drafts → Changelog in one tab; setup/operate in a second tab.
- **Missing states [critical]:** Slack install without screenshots = invisible walk. Every usage page assumes prior connection — no prerequisites callout, no error-state docs, no 401/403/429 semantics, no `tli_` vs `tlk_` explainer.
- **User journey [critical]:** Trust page not pinned, no "moment of belief" in scannable evidence table, no friction analysis (where does security buyer bounce?), no "You'll know it worked when..." checkpoints.
- **Specificity [critical]:** Phase 1 is four bullets for ten pages; theme mapping is one line; nav skeleton is generic; code block styling undefined; interactive elements (playground/try-it-now) listed but not decided.
- **A11y [high]:** completely silent. Yellow-on-taupe is a known contrast risk — likely fails AA for text/CTAs. GIFs need alt text, step-list mirror, static fallback frame. `prefers-reduced-motion` unhandled.
- **Mobile/responsive [high]:** Trust page and Overview likeliest to be opened on phone, and the plan's side-by-side control/evidence layout breaks on mobile. Code blocks need mobile-specific copy-button + scroll-shadow rules.
- **Haunting decisions [critical]:** (1) no page-spec template → inconsistency across pages; (2) no Trust Control row schema (Name / Status / How-it-works / Evidence); (3) no docs voice guide → two writers produce two docs.

ONE design decision: **design the Overview page before anything else** — every other page's voice, layout, component vocabulary, typography mapping, and nav cascades from it. Ship Overview with a production `mint.json`, the page-spec template it implies, and a docs voice guide; then every subsequent page is fill-in, not re-decision.

#### Design Consensus Table

```
DESIGN DUAL VOICES — CONSENSUS TABLE:
══════════════════════════════════════════════════════════════════════
  Dimension                               Claude  Codex  Consensus
  ──────────────────────────────────────── ─────── ─────── ───────────
  1. Info hierarchy serves primary user?   NO      NO     CONFIRMED (evaluator-first, split IA)
  2. Interaction states specified?         NO      NO     CONFIRMED (prereq, empty, if-this-fails, stale)
  3. Trust page evidence schema defined?   NO      NO     CONFIRMED (status+evidence+date+owner)
  4. Accessibility gated at Phase 1?       NO      NO     CONFIRMED (WCAG AA, focus, contrast)
  5. Responsive rules concrete?            NO      NO     CONFIRMED (code/table/nav/touch-targets)
  6. Theme mapping specific?               NO      NO     CONFIRMED (mint.json token/typography/code)
  7. Page templates locked?                NO      NO     CONFIRMED (4 templates: Overview/Task/Ref/Trust)
══════════════════════════════════════════════════════════════════════
CONSENSUS: 7/7 DIMENSIONS CONFIRMED AS UNDER-SPECIFIED.
The plan is a content roadmap, not yet a design plan. If scope is held (per user's ship instruction), the implementer needs all 7 above nailed before the first page.
```

### Design Passes 1-7 — Applied Findings

Converted both voices into concrete design decisions now baked into the plan:

**Pass 1 (IH) — Accepted, plan amended:**
- Evaluator-first IA. Nav structure becomes two top-level Mintlify tabs: **Evaluate** (Overview → Security & Trust → How we ground drafts → Changelog) and **Implement** (Getting started → Slack install → Inbox → API keys → REST reference → SDK → Errors). Evaluate is the default landing.
- Overview page added as the anchor for voice/theme/vocabulary cascade.

**Pass 2 (States) — Accepted:**
- Every task page gets a standard "Prerequisites" callout and an "If this fails" section with symptoms / causes / recovery.
- REST ref: "Last verified" timestamp + "Partially Updated" / "Unavailable" states when OpenAPI sync lags.
- Errors page (`tli_` vs `tlk_`, 401/403/429, remediation) required in Phase 1.

**Pass 3 (User journey) — Accepted:**
- Trust page pinned one click from home, linked from Overview hero.
- "You'll know it worked when..." checkpoint with expected-state screenshot on every task page.
- Friction: security buyer bounce mitigated by "Control status" component (Live / In-progress / Roadmap) — absence becomes credibility.

**Pass 4 (Specificity) — Accepted:**
- Lock 4 page templates before Page 1 ships: `Overview`, `Task Flow`, `Reference`, `Trust Evidence`. Each has fixed section order, component vocabulary, and CTA placement.
- `mint.json` theme block must be authored in the plan before Phase 1 execution — literal color map, typography scale, code block treatment (sharp corners, single-pixel border, mono family, copy button top-right, language label left).
- Interactive elements: NO API playground in Phase 1-3. Static code blocks with copy button only. Revisit after auth isolation.

**Pass 5 (A11y) — Accepted and gated:**
- Phase 1 ships WCAG 2.2 AA or doesn't ship. Required: contrast audit against the yellow-on-taupe mapping (yellow restricted to small accents only — badges, active nav dot); link/CTA color uses darker text token, not `--primary`; MDX lint mandates alt text; GIFs require step-list mirror + static fallback + `prefers-reduced-motion` handling; keyboard-only pass before merge.

**Pass 6 (Mobile) — Accepted:**
- Trust page designed mobile-first: stacked single-column control list (not a table), collapsible evidence details, sticky "Talk to us" CTA.
- Code blocks on mobile: pinned copy button, horizontal scroll shadows, "Expand" after N lines on long snippets.
- Default Mintlify drawer nav; per-page TOC collapses to "Jump to section" dropdown.

**Pass 7 (Voice) — Accepted:**
- Half-page Docs Voice Guide authored as prerequisite to first page: second person, active voice, max 20-word sentences in body, ban "simply/just/easy," ban "we're excited to," lead every page with user's goal not product feature. Pinned in repo; quoted in PR checklist.

### Amended content list (Phase 1 pages, post-design-review)

Phase 1 — **evaluator-first** (week 1):
1. **Overview** — "What TrustLoop does" in one screen + three pillars (Inbox / Drafts grounded in code / Trust).
2. **Security & Trust** — evidenced controls only, using Control row component.
3. **How we ground drafts in your code** — the differentiator page competitors can't write.
4. **Getting started** — prerequisites-first, with screenshots.
5. **Slack install** — one annotated screenshot per step, GIFs where visual.

Phase 2 — **implement** (week 2):
6. Workspace API keys quickstart (with `tlk_` explainer + first working curl in first code block).
7. REST API reference (stable endpoints only + beta markers + "Last verified" banner).
8. AI draft approvals.
9. Errors & troubleshooting (401/403/429 + `tli_` vs `tlk_` + remediation table).

Phase 3 — **depth** (week 3+):
10. Session Replay SDK.
11. Changelog (customer-outcome gated entries only).
12. `llms.txt` + `llms-full.txt` generator (the AI-native expansion both CEO voices demanded; zero-cost once templates are locked).

### Phase 2 — Completion Summary

| Dimension | Rating (post-review) | Notes |
|---|---|---|
| Information hierarchy | 8/10 | Evaluator-first IA locked; two-tab split |
| Interaction states | 7/10 | Prerequisites + if-this-fails + stale-data states standardized |
| User journey | 8/10 | Trust pinned; moment-of-belief in Control table; checkpoint states |
| Specificity | 6/10 | 4 templates locked + mint.json contract required; pages themselves still need writing |
| Accessibility | 8/10 | WCAG 2.2 AA gate mandatory; yellow restricted; GIF a11y policy |
| Responsive | 7/10 | Concrete rules for code/table/nav/mobile Trust page |
| Voice/tone | 7/10 | Docs Voice Guide prerequisite before first page |
| **Overall** | **8/10 after amendments** | Concrete, implementable. The under-specification from Phase 2 Step 0 is closed |

**Phase 2 complete.** Codex: 11 concerns (3 critical, 7 high). Claude subagent: 7-dimension critique (4 critical, 3 high). Consensus: 7/7 dimensions confirmed under-specified; all 7 resolved with concrete decisions now in the plan. Passing to Phase 3 (Eng review).

---

## Phase 3 — Eng Review

### Step 0 — Scope Challenge (actual code analysis)

Checked against the real repo:
- `docs/contracts/openapi.json` = **43KB** today (not 10MB; plan's D1 size concern is theoretical, not urgent).
- `packages/rest/scripts/generate-openapi.ts:268` **already implements** `openapi:check` drift detection — plan's "OpenAPI drift check" (§6) should reuse this, not re-implement.
- `.github/CODEOWNERS` = **does not exist** today. Plan's reliance on review-gates is unenforced.
- Existing CI at `.github/workflows/ci.yml` runs `openapi:check` at line 68. New `docs-public` workflow must not block it.
- **Critical fact-check (Codex):** Mintlify **deprecated `mint.json` in favor of `docs.json`** (per `mintlify.com/docs/organize/settings`). The plan references `mint.json` throughout; needs rewrite to `docs.json` before any implementation.

### Step 0.5 — Eng Dual Voices

#### CODEX SAYS (eng — architecture challenge)

12 findings with file:line refs. Top 5:
1. **[critical]** Option A installs Mintlify GitHub App on the private monorepo; App permissions are repo-scoped, not folder-scoped → Mintlify gets read access to product/security internals. Fix: separate `trustloop-docs` repo, mirror only approved artifacts.
2. **[critical]** No `CODEOWNERS`, no branch protection required on `docs/public/**`. Leak protection = checklist + regex only. Fix: `CODEOWNERS` + required-review + denylist/OCR as required status checks before merge.
3. **[high]** Plan uses `mint.json`; Mintlify now requires `docs.json` (mint.json deprecated). Fix: rewrite plan/checklist around `docs.json` + schema validation in CI.
4. **[high]** Path inconsistency in plan text: §6 says `contracts/openapi.json`, plan §3.6 points at `docs/contracts/openapi.json` (which actually exists). Fix: normalize on `docs/contracts/openapi.json`; fail CI if absent.
5. **[high]** Denylist is regex-only, trivially defeated by NFKC/homoglyphs, HTML entities, base64 blobs, MDX imports. Fix: parser-based scan (MDX AST + NFKC normalize + entity/base64 decode + import allowlist).

Plus: image/GIF leak gate missing — OCR + EXIF scrub for PII in assets (#6); auto-publish assumes GitHub App webhook reliability, no reconciliation for dropped events (#7); no rollback/runbook/incident process (#8); nav/changelog from frontmatter + PR labels, not commit trailers (#9); versioning decision expensive if deferred (#10 — **disagrees with subagent**); custom domain CAA/TLS/owner unspecified (#11); OpenAPI size/validity/render smoke missing (#12).

ONE decision: **move customer docs to a separate docs repository now; mirror only approved public artifacts.**

#### CLAUDE SUBAGENT (eng — independent review)

14 findings across 7 dimensions. Top 5:
1. **[high]** `docs/public/` subtree gives Mintlify GitHub App **whole-repo read** access on a private monorepo containing `rest-auth.ts`, Prisma schema, migrations. Vendor security-review burden. Fix: separate `trustloop/docs` repo.
2. **[critical]** Denylist regex defeated by (i) Unicode homoglyphs (Cyrillic `а` in `аpps/`), (ii) MDX `{/* comments */}` rendering, (iii) JSX imports from relative paths like `../../packages/`, (iv) base64 `<img src>`, (v) HTML entities `&#x74;li_`, (vi) re-export chains. Fix: NFKC-normalize + disallow imports outside `@/components/docs/*` + strip entities + reject base64 > 1KB + **grep rendered HTML** (not source MDX) as final gate.
3. **[high]** Mintlify webhook drops → docs silently go stale. Fix: `docs/public/.sync-canary.mdx` with current SHA on every merge + hourly GH Actions cron probe; page on mismatch > 10min.
4. **[high]** Screenshots/GIFs leak PII (user emails, UUIDs, `tli_`/`tlk_`, JWTs in devtools). Fix: pre-commit OCR scan; screenshot style guide (demo@gettrustloop.app, fixed workspace "Acme Corp").
5. **[critical]** First break is probably a PR passing regex but the MDX build renders an internal term via component indirection. Fix: (a) require Mintlify PR preview URL in merge checklist, (b) denylist on built HTML, (c) pre-written "panic button" runbook (git revert + DNS holding-page toggle).

Plus: monorepo couples docs-publish to main-branch CI (A2); "source of truth" is misframed — derivation not sharing (A3); path validator incomplete (B1 — needs EXIF, docs.json schema, dead-anchor check, frontmatter Zod); existing `openapi:check` reusable (B2); llms.txt — either drop or CI-generate, commit to `docs/public/llms.txt` (B4); CODEOWNERS + external-PR gate missing (C2); CAA/TLS/registrar 2FA (C3); OpenAPI size budget (D1); Mintlify free-tier breakpoints undocumented (D2); GitHub App vendor security review (E1 — overlaps Codex #1); **versioning: do NOT version on day one** — breaks monorepo model, doubles audit surface. Subagent **disagrees with Codex** here (TASTE DECISION); commit trailer convention has no enforcement (E3 — overlaps Codex #9); Mintlify org ownership under `docs@gettrustloop.app`, not personal email (E4); rollback runbook + breach notification policy missing (F1+F2).

ONE decision: **move docs to a separate `trustloop/docs` repo (public) before writing a single MDX file** — it simultaneously de-risks A1/A2/C1/C2/E1/E2; remaining plan shrinks ~30%.

#### Eng Consensus Table

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════════════
  Dimension                               Claude  Codex  Consensus
  ──────────────────────────────────────── ─────── ─────── ───────────
  1. Architecture sound (subtree vs repo)? NO      NO     CONFIRMED — separate repo
  2. Test coverage sufficient?             NO      NO     CONFIRMED (OCR, reconcile, built-HTML, link)
  3. Security threats covered?             NO      NO     CONFIRMED (denylist bypass, CODEOWNERS, PII)
  4. Error paths handled?                  NO      NO     CONFIRMED (no runbook/rollback/reconcile)
  5. Performance risks addressed?          NO      NO     CONFIRMED (OpenAPI size, free-tier limits)
  6. Deployment risk manageable?           NO      NO     CONFIRMED (webhook reliance, no staging gate)
═══════════════════════════════════════════════════════════════════════
CONSENSUS: 6/6 DIMENSIONS CONFIRMED.
TASTE DECISION: versioning from day one (Codex yes; subagent no). Surfaced below.
FACT-CHECK: mint.json is deprecated → docs.json required. Plan §4, §6, §8, §11 all need find/replace.
```

### Section 1 — Architecture (ASCII dependency diagram)

Post-eng-review amended architecture (separate docs repo, pull-based sync):

```
  ┌──────────────────────────────────────┐
  │   TrustLoop monorepo (private)       │
  │                                      │
  │   docs/contracts/openapi.json        │
  │   docs/domains/**/*  (internal only) │
  │                                      │
  │   CI: openapi:check (existing)       │
  └─────────────────┬────────────────────┘
                    │
                    │ weekly CI sync-PR
                    │ (mirrors approved artifacts only:
                    │  openapi.json + redacted spec snippets)
                    │
                    ▼
  ┌──────────────────────────────────────┐
  │   trustloop/docs (public repo)       │
  │                                      │
  │   docs.json  (Mintlify config)       │
  │   **/*.mdx   (customer content)      │
  │   llms.txt + llms-full.txt           │
  │   .sync-canary.mdx                   │
  │   scripts/docs-denylist.ts           │
  │   scripts/docs-nav-check.ts          │
  │                                      │
  │   CODEOWNERS → @duc                  │
  │   Branch protection: required checks │
  └──────┬───────────────────────┬───────┘
         │                       │
         │ (PR opens)            │ (merge to main)
         ▼                       ▼
  ┌──────────────┐        ┌──────────────────────┐
  │ CI gates     │        │ Mintlify GitHub App  │
  │ (required)   │        │ (vendor — trusted    │
  │              │        │  with public repo    │
  │ - docs.json  │        │  only)               │
  │   schema     │        └─────────┬────────────┘
  │ - denylist   │                  │
  │   (NFKC +    │                  │ (build+deploy ~60s)
  │    AST +     │                  ▼
  │    entities) │        ┌──────────────────────┐
  │ - built-HTML │        │ Mintlify CDN         │
  │   scan       │        └─────────┬────────────┘
  │ - OCR assets │                  │
  │ - link check │                  │ (DNS CNAME + TLS)
  │ - nav check  │                  ▼
  │ - OpenAPI    │        ┌──────────────────────┐
  │   refs       │        │ docs.gettrustloop.app│
  │ - size budget│        │  (Let's Encrypt;     │
  └──────────────┘        │   CAA permits issuer)│
                          └─────────┬────────────┘
                                    │
                                    │ (hourly cron)
                                    ▼
                          ┌──────────────────────┐
                          │ Canary probe:        │
                          │ - SHA match < 10min  │
                          │ - TLS expiry > 14d   │
                          │ - Lighthouse TTFB<1s │
                          │ - alert on failure   │
                          └──────────────────────┘
```

**Critical single point of failure:** Mintlify vendor webhook. Mitigated by canary + manual redeploy runbook.
**Security boundary:** separate public repo means vendor access is contained to public-by-design content; monorepo secrets never reachable.

### Section 2 — Code Quality

| Concern | Found | Fix |
|---|---|---|
| DRY: OpenAPI drift | Plan would duplicate `openapi:check` (line 68 of ci.yml) | Reuse existing `npm run openapi:check`; add a docs-only check for MDX→OpenAPI ref existence |
| Feature-qualified naming (per CLAUDE.md) | Plan's proposed scripts need it | `scripts/docs-public-denylist.ts`, `scripts/docs-public-nav-check.ts` etc. — prefix `docs-public-` |
| Zod at ingress | `docs.json` schema + MDX frontmatter schema must have Zod validators | Add to `scripts/docs-public-frontmatter.schema.ts` |
| Explicit over clever | Denylist as AST + normalization passes, not clever regex tricks | Accept eng voices' recommendation |

### Section 3 — Test Review (the non-skippable section)

| Type | What it covers | Gate | Where |
|---|---|---|---|
| Unit | Denylist regex+AST against fixture file of Unicode/entity/base64 attacks | **Blocks merge** | `scripts/docs-public-denylist.test.ts` |
| Unit | Frontmatter Zod schema validation | **Blocks merge** | `scripts/docs-public-frontmatter.test.ts` |
| Unit | `docs.json` schema + nav-completeness (every MDX referenced) | **Blocks merge** | `scripts/docs-public-nav.test.ts` |
| Unit | OpenAPI ref existence (MDX endpoint refs match `docs/contracts/openapi.json`) | **Blocks merge on docs OR openapi change** | `scripts/docs-public-openapi-refs.test.ts` |
| Integration | Build Mintlify locally (`mintlify dev --ci`), grep **rendered HTML** for denylist | **Blocks merge** | `.github/workflows/docs-public.yml` |
| Integration | Broken-link check (`lychee`): internal blocks; external warns | **Blocks merge (internal)** | same workflow |
| Integration | Image OCR + EXIF scrub for PII/secrets (emails, UUIDs, `tli_`/`tlk_`, JWT `eyJ*`) | **Blocks merge** | same workflow |
| Integration | OpenAPI validity + size budget (warn > 1MB, fail > 5MB) | **Blocks merge** | same workflow |
| Smoke | Cron: fetch live `/.sync-canary` and verify SHA matches main within 10min | Alerts (paging) | `.github/workflows/docs-canary.yml` |
| Smoke | Cron: TLS cert expiry > 14 days | Alerts | same |
| Smoke | Cron: Lighthouse TTFB < 1s | Alerts | same |
| Manual | "Read as a stranger" PR checklist | **Blocks merge (checkbox)** | `.github/PULL_REQUEST_TEMPLATE.md` |
| Manual | WCAG 2.2 AA pass (contrast + keyboard) | **Blocks merge (checkbox)** | PR checklist |
| Manual | Mintlify PR preview URL viewed & approved | **Blocks merge (checkbox)** | PR checklist |
| Untested vendor risk | Mintlify CDN correctness, build pipeline, search indexing | Canary catches staleness | Acceptable — vendor-owned |

**New user flows this plan creates (each needs test coverage above):**
1. Publish flow: PR → gates → merge → Mintlify → live. Covered: gates + canary.
2. Edit flow: existing page PR → redaction re-check always runs.
3. External-contributor flow: CODEOWNERS + required-review block non-owners on `docs/public/**`.
4. Denylist-block flow: `__bad_fixtures__/` in tests reproduces forbidden content; CI must fail on it.

Test plan artifact: written as §3 above. Living in the plan file itself for now; will migrate to `~/.gstack/projects/TrustLoop/main-test-plan-mintlify.md` if gstack tooling lands.

### Section 4 — Performance

- OpenAPI at 43KB today; budget warn 1MB / fail 5MB.
- Mintlify free-tier build-minute limit unknown — document in plan §2 table; pre-commit to Pro SKU price + trigger.
- Canary hourly probe covers cold-start and TTFB budget (<1s).

### Failure Modes Registry (amended post-eng)

| # | Failure mode | Severity | Detect | Mitigate |
|---|---|---|---|---|
| F1 | Internal spec leaks to public page (text) | **Critical** | AST + NFKC denylist + built-HTML scan | Block merge; CODEOWNERS |
| F2 | Screenshot/GIF leaks PII | **Critical** | OCR + EXIF scrub in CI | Block merge; screenshot style guide |
| F3 | Trust page unbacked claims | **Critical** | Control component requires evidence field | Legal review pre-merge; Live/Roadmap status |
| F4 | Vendor webhook drops; docs stale | **High** | Hourly canary (SHA mismatch > 10min) | Manual redeploy runbook; alert |
| F5 | Regex bypass via Unicode/entity/base64/import chain | **Critical** | AST parse + normalize + import allowlist + built-HTML scan | Defense in depth; built-HTML is final gate |
| F6 | TLS cert renewal failure (vendor-owned) | **High** | External TLS expiry monitor (> 14d threshold) | Rollback DNS to subdomain fallback |
| F7 | Mintlify GH App whole-repo read on private monorepo | **Critical** | Pre-install vendor review | **MITIGATED by separate repo (eng consensus)** |
| F8 | External PR leak (contractor, Dependabot) | **High** | CODEOWNERS + required review + no auto-merge | Branch protection |
| F9 | `docs.json` schema drift (Mintlify updates spec) | **Medium** | CI schema validation | Track Mintlify release notes |
| F10 | OpenAPI size balloons; API pages fail silently | **Medium** | CI size budget; render smoke | Split per-tag at 1MB |
| F11 | Founder-time on docs while MVP slips | **Critical** | Phase-1 end review | **UNRESOLVED — see User Challenge at top of review** |
| F12 | Panicked need to revert leaked page | **Critical** | Runbook: `git revert` + DNS toggle + notify-list | Pre-staged holding page |

### Taste Decisions Surfaced (not auto-decided)

1. **Monorepo subtree vs separate repo** — original plan = A (subtree). All 6 dual voices across phases = B (separate repo). Eng phase is 4-0 for B with new fact: Mintlify GitHub App is repo-scoped, not path-scoped. **Lean strongly toward B.** I am surfacing this rather than auto-flipping because it inverts a foundational plan decision and deserves one explicit user confirmation at PR review — even though you said skip the approval gate, this is a vendor-access security choice that shouldn't be invisible.
2. **Versioning from day one** — Codex: yes (structural decision). Subagent: no (breaks monorepo; doubles audit; defer until first breaking change). **Lean: defer.** If we adopt the separate-repo decision above, versioning via branch becomes cheap and this becomes a non-issue; move to "yes, branch-per-version, later."
3. **llms.txt source** — Codex: CI-generate ourselves, commit to `docs/public/llms.txt`. Subagent: same recommendation. No disagreement. **Auto-decide: CI-generate.**

### Phase 3 — Completion Summary

| Dimension | Rating | Notes |
|---|---|---|
| Architecture | 4/10 (plan) → 9/10 (amended) | Post-review: separate repo, CI gates, canary |
| Security | 3/10 → 9/10 | AST denylist, CODEOWNERS, OCR, built-HTML, TLS monitoring, runbook |
| Test coverage | 4/10 → 9/10 | Test plan table above |
| Operations | 3/10 → 8/10 | Canary, runbook, manual redeploy fallback |
| Vendor risk | 5/10 → 8/10 | Contained by separate-repo choice |
| Documentation meta (this plan) | 6/10 | **Fact-check: `mint.json` → `docs.json` find-replace required** |
| **Overall (post-amendments)** | **8.5/10** | Blockers resolved if separate-repo decision lands |

**Phase 3 complete.** Codex: 12 concerns (2 critical, 5 high). Claude subagent: 14 findings (3 critical, 6 high). Consensus: 6/6 dimensions confirmed; architecture choice (separate repo) is the load-bearing eng decision of the whole plan.

---

## Cross-Phase Themes

Concerns that appeared independently in multiple phases' dual voices — highest-confidence signals:

**Theme 1: Separate repo beats monorepo subtree.** Flagged in Phase 1 (both CEO voices, CI coupling angle), Phase 3 (both Eng voices, security boundary angle — with new fact that Mintlify GH App can't path-scope). 4 independent reviewers converge. Near-certain correction.

**Theme 2: AI-native / llms.txt is strategic, not optional.** Flagged in Phase 1 (both CEO voices), Phase 2 (Codex Design — agent-readable docs journey), Phase 3 (Subagent B4 — CI-generate and commit). 4 voices converge. Moved into Phase 3 content list.

**Theme 3: Trust page is liability unless evidence-gated.** Flagged in Phase 1 (both CEO voices: unbacked claims → marketing risk), Phase 2 (both Design voices: Control component with status+evidence+date+owner required). 4 voices. Fix baked into amended content list.

**Theme 4: Prereq + "if this fails" + rollback runbook culture.** Flagged in Phase 2 (both Design voices — prerequisite callouts, error states, "you'll know it worked when"), Phase 3 (both Eng voices — rollback runbook, incident process, breach notification). Pattern: this plan has no "things go wrong" surface. Amended in §10 and failure modes registry F12.

**Theme 5: Founder-time priority conflict.** Flagged in Phase 1 only but at critical severity by both voices. Not a per-phase theme — an over-arching User Challenge; already surfaced at top of review. Does not disappear; passed to user.

---

## Decision Audit Trail (summary)

| # | Phase | Decision | Classification | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P1+P2 | Hold core scope, cherry-pick in-blast-radius expansions |
| 2 | CEO | Premises P1-P6 accepted with P4 tightening (staging gate) | Mechanical (P4); User-confirmed (P5 domain) | P1, P6 | Gate was the only non-auto-decision |
| 3 | CEO | `llms.txt` + `llms-full.txt` accepted | Mechanical | P1, P6 (both models) | In blast radius, low effort, high leverage |
| 4 | CEO | Screen-recording GIFs for Slack install | Mechanical | P1 | WEEK 1 proof-point mitigation |
| 5 | CEO | Redaction-bot PR label accepted | Mechanical | P1 | <30min CC |
| 6 | CEO | User Challenge: kill/defer scope | **NOT auto-decided** | N/A | Surfaced; user pre-authorized ship without gate so proceeding with challenge documented |
| 7 | Design | Evaluator-first IA with two tabs | Mechanical | P1, P5 | Both voices converge |
| 8 | Design | 4 page templates locked (Overview / Task Flow / Reference / Trust Evidence) | Mechanical | P5 | Both voices |
| 9 | Design | `docs.json` theme block mandatory pre-page-1 | Mechanical | P5 | Both voices |
| 10 | Design | WCAG 2.2 AA gate; yellow restricted to accents | Mechanical | P1 | Both voices; accessibility non-negotiable |
| 11 | Design | Trust Control component: status+evidence+date+owner | Mechanical | P1, P5 | Both voices |
| 12 | Design | Docs Voice Guide as prerequisite | Mechanical | P5 | Subagent specific |
| 13 | Design | Prerequisites + "If this fails" on every task page | Mechanical | P1 | Both voices |
| 14 | Eng | Separate `trustloop/docs` repo (Option B) | **TASTE (leaning strong accept)** | P1, P3, P4 | 4 independent voices across phases; vendor-security + CI decoupling + versioning trivial |
| 15 | Eng | `mint.json` → `docs.json` throughout plan | Mechanical (fact-check) | P6 | Codex surfaced deprecation; plan was using outdated artifact |
| 16 | Eng | Reuse existing `openapi:check`; add docs-only ref-existence check | Mechanical | P4 (DRY) | Subagent B2 |
| 17 | Eng | AST + NFKC denylist + built-HTML scan as final gate | Mechanical | P1 | Regex-only is defeated by 6 known vectors |
| 18 | Eng | Image OCR + EXIF scrub required | Mechanical | P1 | Both voices; PII leak risk critical |
| 19 | Eng | Canary (SHA match) + TLS monitor + Lighthouse smoke | Mechanical | P1 | Both voices |
| 20 | Eng | CODEOWNERS + branch protection on docs path | Mechanical | P1 | Both voices; required-review as status check |
| 21 | Eng | llms.txt CI-generated and committed to repo | Mechanical | P1, P5 | Both voices |
| 22 | Eng | Versioning deferred until first breaking change | **TASTE (Codex vs Subagent)** | P3, P5 | If separate-repo lands, defer becomes cheap |
| 23 | Eng | Rollback runbook + breach notification policy | Mechanical | P1 | Both voices; critical operational gap |
| 24 | Eng | Mintlify org under shared `docs@gettrustloop.app` inbox | Mechanical | P5 | Subagent E4; avoids personal-email handoff risk |

---

## Final State

**Mode:** SELECTIVE EXPANSION. Scope held on customer-facing docs; expansions baked in per design+eng reviews.

**Ship status:** per user instruction ("shipping this for me no need to ask my approval"), the final approval gate is skipped. This plan ships as a PR with all review findings, consensus tables, failure modes, test plan, dependency diagram, taste decisions, and the User Challenge documented in place.

**The two taste decisions remaining** (for user to resolve when implementation begins, not blocking ship of the plan itself):
1. **Monorepo subtree (Option A, original) vs separate public repo (Option B, 4-voice consensus).** Strong lean: B.
2. **Versioning from day one vs defer.** Strong lean: defer, especially if B is chosen.

**User Challenge (unresolved):** Both CEO voices recommend killing/deferring the full scope until MVP readiness gates land. User pre-authorized ship; challenge documented at top of review for the user's own later decision.


