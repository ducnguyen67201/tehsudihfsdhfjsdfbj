---
name: gtm-founder-outreach
description: |
  Founder outreach workflow for TrustLoop's early GTM motion. Use when the task
  is to find target companies, find the right founder, qualify whether they fit
  the current ICP, score leads, draft founder-specific outreach DMs, or update
  the outreach tracker. Good triggers include: "who should I DM", "find founders",
  "find companies", "qualify leads", "score this lead", "what should I send",
  "help with outreach", or "source founder prospects".
  Use this instead of ad-hoc outreach advice so sourcing, scoring, and messaging
  stay grounded in the repo's current GTM thesis.
---

# GTM Founder Outreach

This skill turns the repo's GTM docs into a repeatable sourcing and outreach
loop.

## Canonical Context

Read these files first:

- `business/gtm/icp-and-positioning.md`
- `business/gtm/sourcing-playbook.md`
- `business/gtm/lead-scoring-rubric.md`
- `business/gtm/outreach-copy.md`
- `business/gtm/STATUS.md`

Read these when relevant:

- `business/gtm/call-notes-template.md` for discovery calls
- `business/gtm/learnings.md` when updating patterns after replies or calls
- the outreach tracker when the user shares it or references the live sheet

## Purpose

Use this skill to help with five jobs:

1. find candidate companies
2. find the founder to contact
3. score whether the lead is worth messaging
4. draft a short, founder-specific DM
5. turn scored leads into the next concrete outreach actions

The current wedge is narrow on purpose. Do not broaden it unless the repo docs
have been updated.

## Workflow

### 1. Re-ground in the ICP

Before sourcing or writing copy, restate the current target in one sentence.

If the request would push beyond the current wedge, say so and keep the output
anchored to the documented ICP unless the user explicitly wants to change it.

### 2. Check The Tracker Before Sourcing

If the tracker is available, inspect it before doing new research.

Default operating order:

- if there are `8+` scored leads with no DM sent, prioritize messaging them now
- if there are open follow-ups, write those before sourcing new names
- only source fresh leads when the current message queue is thin or exhausted

The goal is to avoid doing more list-building when the real bottleneck is
execution.

### 3. Source Companies

Prefer the cheapest-good stack documented in `business/gtm/sourcing-playbook.md`:

- YC Companies
- LinkedIn
- the outreach sheet / tracker

When sourcing companies:

- prefer B2B SaaS, workflow-heavy, integration-heavy, ops software, devtools
- avoid consumer apps, agencies, generic marketplaces, and obviously too-large teams
- only keep companies where you can form a pain hypothesis about founder-led support

Warm-signal refinement:

- intent signals can raise priority, but they do not replace ICP fit
- treat recent hiring, funding, product launches, support-heavy product updates,
  and founder posts about customers or bugs as useful tie-breakers
- do not keep a lead just because they engaged with "AI" content or a competitor
- when possible, separate `fit` from `why now`

### 4. Find and Qualify the Founder

For each company, look for:

- Founder
- Co-Founder
- Founder & CEO
- CEO

Before accepting a lead, write one sentence answering:

`Why does this founder plausibly feel the support-routing pain?`

If that sentence is weak, the lead is weak.

Then write one sentence answering:

`What public signal suggests they may already be trying to solve it now?`

If there is no signal, say `No clear public intent signal found` instead of
inventing one.

### 5. Score the Lead

Use `business/gtm/lead-scoring-rubric.md`.

Default output per lead:

- company
- founder
- one-line pain hypothesis
- score out of `10`
- intent signal: `high`, `medium`, or `low`
- one-line why-now reason
- short reason for the score

Default recommendation:

- `8-10` message now
- `5-7` keep as backup
- `0-4` skip

### 6. Draft The Outreach Sequence

Use `business/gtm/outreach-copy.md` as the base voice.

Rules:

- keep it short
- lead with the pain, not the product
- do not ask for a demo
- personalize the first line when possible
- optimize for a reply, not a conversion
- use curiosity first, proof second

Sequence rules:

- first touch: `2-4` short lines, ending in one easy question
- follow-up: brief bump tied to the same pain hypothesis, not a new pitch
- positive reply: mirror their language, then ask for a short chat
- only offer a Loom, example, or product detail after interest is confirmed

When drafting outreach, output:

- the first-touch DM
- the follow-up DM
- the reply-handling DM if they respond with pain or curiosity
- one sentence explaining why it fits this founder

### 7. Update the Tracker or Prepare Rows

If the user provides a tracker destination, update it directly.

If not, return rows that can be pasted into the tracker with these fields:

- Founder Name
- LinkedIn URL
- Company
- Company URL
- YC Batch
- Estimated Team Size
- Category
- Why They Match
- Pain Guess
- Fit Score

When the tracker already exists, prefer adding execution guidance alongside the
rows:

- recommended send order
- personalization hook
- next action

If the tracker has room for extra fields, prefer adding:

- `Intent Signal`
- `Why Now`
- `Signal Source`

### 8. Capture Learnings

After real replies or calls, summarize the signal into `business/gtm/learnings.md`
or propose the exact update.

Prioritize:

- repeated language
- repeated pain
- objections
- wedge changes

## Guardrails

- Do not target multiple ICPs at once.
- Do not call a founder a good lead without a concrete pain hypothesis.
- Do not write long generic outreach.
- Do not confuse curiosity with painful demand.
- Do not confuse generic startup activity with intent.
- Ten sharp leads beat one hundred vague ones.

## Default Deliverables

For sourcing tasks, return the best concise artifact for the user's request:

- `Top leads`: table of `5-10` qualified founders with scores and pain hypotheses
- `Lead review`: scored keep/skip recommendation
- `Message queue`: the next `3-5` leads to contact, in order, with one-line why now
- `Outreach draft`: first-touch, follow-up, and reply-handling DMs
- `Tracker update`: rows written or ready to paste

## Completion Checklist

- ICP was used explicitly
- tracker was checked first when available
- every lead has a one-line reason
- every lead has a score
- every DM is short and specific
- the next action is obvious
- tracker rows or structured output are ready to use
