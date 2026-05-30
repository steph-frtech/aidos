---
name: classify-truth
description: Classify a candidate truth — truth_kind, verifiability, scope, authority — and route non-verifiable claims to /spike instead of the kernel. Use when triaging an idea/candidate-truth before it becomes a mirror, deciding if a claim is provable, or asking "is this a real truth or a wish?".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Classify Truth

A KRD gesture: take one candidate-truth and decide what it *is* before it is allowed near the kernel. Verifiable truths get a `truth_kind`, a `scope` and an `authority`, and earn the right to a mirror. Non-verifiable claims are NOT truths — they are routed to `/spike` to be made falsifiable first.

> The wall (CLAUDE.md §2): this gesture never writes the `kernel`/`mirrors`/`fitness` schemas. It produces a *classification* on an `idea`. The only door to the kernel is `idea → mirror → /goal → human approval`.

## Purpose

Lift a raw candidate-truth out of ambiguity into a typed, routable record:

- assign a **truth_kind** (which mirror form it will eventually take),
- judge **verifiability** (can a deterministic mirror ever go red on it?),
- bound its **scope** (which target / cell / entity it governs),
- assign its **authority** (who may approve it),
- and **route** anything non-verifiable to `/spike` instead of the kernel.

## When to use

- An `idea` has landed (human or incident provenance) and is not yet typed.
- Before `/grill-with-docs` hardens a scenario, to know *which* mirror form to grill toward.
- When someone proposes "the system should…" and you must decide truth vs wish.
- When triage is unclear: is this an invariant, a journey, a workflow, or a non-verifiable claim?

## Inputs

- `ideaId` — the candidate-truth record in the `ideas` schema (required).
- The candidate claim text (ubiquitous language preferred).
- Optional: a proposed `targetId` / scope hint (entity, cell, operation) **from the human** — never invented here.
- `CONTEXT-MAP.md` + the relevant subsystem `CONTEXT.md` for the glossary.

## Outputs

A classification recorded against the `idea` (via the idea-intake / changeset MCP, never a direct kernel write):

- `truth_kind` ∈ { `journey` (N0), `invariant` (∀, N1), `workflow` (N2), `contract` (N3) }.
- `verifiability` ∈ { `verifiable`, `non_verifiable`, `unknown` }.
- `scope` — `targetId` + level, **only if supplied/derivable from existing truth**.
- `authority` — the approver class for this scope (read from `fitness`/authority map, never set by the agent).
- `route` — `mirror` (eligible for `/goal`) **or** `spike` (sent to `/spike`).
- Zero or more **OpenQuestion** records for every gap.

## BDD / mirror required before use

This is a routing gesture, not a behaviour. It writes no truth, so it needs no truth-test of its own. But:

- The classifier's own logic (in `back/kernel/truth-typing/`) ships with a **red property mirror first** (rapid): e.g. *a non-verifiable claim is never routed to `mirror`*. `red → green → refactor`.
- Its **fault-injection test**: feed a known non-verifiable claim, assert `route == spike`; feed a claim with an invented `targetId`, assert it is rejected as a monster.
- Classifying an idea does **not** create the idea's mirror — that is the next gesture (`/grill-with-docs` then write the mirror).

## Steps

1. **Read the claim** and resolve its words against `CONTEXT-MAP.md` / `CONTEXT.md`. If a term is undefined, open an OpenQuestion — do not guess.
2. **Falsifiability test:** can a deterministic mirror (Gherkin / property / fixture) ever go *red*? If no observable, repeatable failure exists → `verifiability = non_verifiable`.
3. **If non_verifiable → route = spike.** Stop classifying truth_kind/scope. Emit the `/spike` handoff (what to probe to make it falsifiable). Do not push to the kernel.
4. **If verifiable → pick truth_kind** by nature:
   - external behaviour / acceptance → `journey` (Gherkin, Godog/Playwright).
   - a `∀` that must always hold → `invariant` (rapid / fast-check).
   - `state → command → events` → `workflow` (Operation DSL fixture).
   - shape/entity/contract between cells → `contract` (AST in Postgres, Pact).
5. **Bound scope:** set `targetId`/level **only** from an existing target or a human-supplied hint. Otherwise leave scope empty + OpenQuestion.
6. **Assign authority:** read the approver class from the authority/`fitness` map for that scope. Never invent or elevate it.
7. **Record** the classification on the `idea` via the idea-intake MCP (a recorded decision, not an edit). Attach all OpenQuestions.
8. **Hand off:** `mirror`-routed → eligible for `/grill-with-docs` → write mirror → `/goal`. `spike`-routed → `/spike`.

## Stop conditions

- **Done is computed, not declared:** the idea has a `truth_kind` *or* `route = spike`, a `verifiability`, and every gap is an OpenQuestion. No silent defaults.
- Stop immediately and route to `/spike` the moment `verifiability = non_verifiable`.
- Never proceed to `/goal` from here — classification is necessary, not sufficient.
- If you cannot decide truth_kind with confidence, set `verifiability = unknown` + OpenQuestion; do not force a kind.

## Failure modes

- **Manufacturing a target.** Inventing a `targetId` to make scope look complete → monster. Leave empty + OpenQuestion.
- **Verifiability theatre.** Calling a vibe ("feels faster") verifiable. If you can't name the red, it's `non_verifiable` → `/spike`.
- **Authority inflation.** Assigning a weaker approver than the scope demands. Read the map; never set it.
- **Kind-forcing.** Squeezing a journey into an invariant to dodge Gherkin. Pick by nature, not by convenience.
- **Wall breach.** Writing the classification straight into `kernel`/`mirrors`. It belongs on the `idea` via MCP/changeset.

## Related hooks

- `pretooluse` — blocks any write to `kernel`/`mirrors`/`fitness` from this gesture (the wall).
- `sessionstart` — surfaces untyped ideas needing classification.
- `stop` — completeness: an `idea` left half-classified (no kind, no route) blocks the stop.

## Related MCP tools

- **idea-intake** — read the candidate-truth, record the classification + route.
- **context** — resolve scope/`targetId` against the ContextGraph; check reuse decisions.
- **store** — read existing targets/authority map (read-only) to bound scope and authority.
- **changeset** — wrap the classification as a recorded decision (append-only), never an edit.

## Workbench visualization

Next route `front/web/app/triage/` (or the ideas panel): one candidate-truth per card showing `truth_kind`, `verifiability` badge, `scope`/`authority`, the `mirror`-vs-`spike` route, and its OpenQuestions. A Playwright e2e asserts a non-verifiable claim renders the **Spike** route, not a kernel path.

## Honesty rules

Never invent a `target`, a `targetId`, or a business rule to complete a classification; every gap — undefined term, unknown scope, unclear authority, undecidable kind — becomes an **OpenQuestion**, and any claim you cannot make falsifiable is routed to `/spike`, never to the kernel.
