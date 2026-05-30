---
name: derive-mirror
description: Derive the right mirror form for a truth (acceptance → Gherkin, invariant → property, workflow → fixture) and link it to the truth. Use when a Kernel truth needs its mirror form chosen, a behaviour must be classified by nature before writing the spec, or a mirror must be linked (reflects) to the truth it proves.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# derive-mirror (KRD gesture)

## Purpose

Given a truth, **derive the one correct mirror form** by its nature and **link** it to that truth. This is the classification + binding gesture, not the authoring one: acceptance (N0) → **Gherkin**, invariant (∀, N1) → **property**, workflow (N2) → **fixture**. It decides `test_kind` + `cert_language` and sets `reflects` to the real Kernel id — so `write-bdd-scenario` can then author a red mirror with no ambiguity about form or target.

## When to use

- A Kernel truth (entity / policy / operation / control / action) has no mirror, or a new mirror is about to be written and its **form** is undecided.
- You must classify a behaviour by nature (journey vs invariant vs workflow) before any spec exists.
- A mirror exists but its `reflects` link is missing, wrong, or unverified (an orphan-mirror risk).

## Inputs

- The truth to mirror: its **nature** and its Kernel id (the thing the mirror will `reflect`) — read-only, never invented.
- The sharpened intention in **ubiquitous language** (from `/grill-with-docs`).
- Target subsystem context (`back/kernel/<step>`, etc.) and its `CONTEXT.md` / ADRs.

## Outputs

- A **derivation decision**: `{ reflects, test_kind, cert_language }` justified by the truth's nature.
- The mirror **record** in the `mirrors` schema with `reflects` bound to the verified Kernel id (record + form only; the red source is authored by `write-bdd-scenario`).
- Any unknown target/rule recorded as an **OpenQuestion** (idea/provenance), never guessed.

## BDD / mirror required before use

This gesture **precedes** the red mirror — it derives the form and the link. It produces **no implementation and no green**. If you start writing scenario bodies, hand off to `write-bdd-scenario`; if you start writing code, stop (the wall, §2).

## Steps

1. **Identify the truth.** Confirm the Kernel id from the base/spec via the `store` MCP. If absent or ambiguous → **OpenQuestion**, do not invent it.
2. **Classify by nature** and map to the frozen slot (§3):
   - Journey / acceptance (N0) → **Gherkin** `.feature`; runner **Godog** (back) / **Playwright + playwright-bdd** (front).
   - Invariant (∀, N1) → **property test**; **rapid** (Go) / **fast-check** (front).
   - Workflow (N2) → **fixture** `state → command → events` (Operation DSL interpreter).
3. **Set the fields:** `test_kind` + `cert_language` from the mapping; `reflects` = the verified Kernel id; `liveness` = the form's living source.
4. **Link, do not author.** Create/repair the mirror record via the `mirror-runner` / `idea-intake` MCP so `reflects` points at a real truth. Never hand-edit truth tables.
5. **Hand off to `write-bdd-scenario`** to write the red source for the derived form.

## Stop conditions

- Exactly one form chosen, matching the truth's nature (no N0 spec for an ∀ invariant, etc.).
- `reflects` resolves to a real Kernel truth; `test_kind` + `cert_language` are consistent with the form.
- No monster created (no orphan mirror, no truth left mirror-less by a wrong link).
- No source body authored, no implementation written.

## Failure modes

- **Wrong form** (e.g. Gherkin for a ∀ invariant) → unsamplable behaviour escapes; re-classify by nature.
- **Orphan link** → `reflects` points at nothing; it is a monster. Fix the id or raise an OpenQuestion.
- **Invented target/id/rule** → forbidden (Honesty); route to an OpenQuestion.
- **Form/runner mismatch** → `cert_language` not in the frozen slot for that nature; correct against §3.
- **Hand-written into truth tables** → blocked by the wall; route through MCP.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness`; route truth links via MCP.
- `Stop` (completeness) — blocks finish if a truth lacks a living mirror or an orphan mirror exists.
- `PostToolUse` (sensors) — must stay green at each diff.

## Related MCP tools

- `store` — read the Kernel AST to confirm the truth and its id that the mirror will `reflect`.
- `mirror-runner` — create/repair the mirror record (form + `reflects` link), then materialize/run once handed off.
- `idea-intake` — when the reflected truth does not yet exist: open the `idea → mirror → /goal` door.

## Workbench visualization

`front/web/` — **Mirror Health** panel: the derived mirror shows its form (`test_kind` / `cert_language`) and its `reflects` link, surfacing orphans. Add/extend that route's Playwright e2e for the visualization (never touch existing routes).

## Honesty rules

Never invent a `target`, `targetId`, or business rule — if the reflected truth, an id, or a rule is unknown, it becomes an **OpenQuestion** (an idea/provenance entry), never a guess.
