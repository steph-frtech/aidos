---
name: semantic-diff
description: Classify a kernel change (add/refine/override/rescope/reweight/deprecate) and compute its blast radius before applying it. Use when a changeset is about to touch the kernel, when deciding what kind of change an idea/mirror implies, or when asking "what does this change break / propagate to?".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Semantic Diff (KRD gesture)

A KRD gesture: take one proposed kernel change and, **before it is applied**, name *what kind of change it is* and *how far it reaches*. The change kind chooses the propagation rules; the blast radius lists every truth, mirror and projection it disturbs. No change reaches the kernel until both are known.

> The wall (CLAUDE.md §2): this gesture never writes the `kernel` / `mirrors` / `fitness` schemas. It produces a *classified diff* on a `changeset` (DRAFT). The only door to the kernel stays `idea → mirror → /goal → human approval`.

> **Determinism-first (the diff is an algorithm, not an LLM).** Per the `determinism-first` law, every computable part here is **deterministic code**, never an LLM "diff agent": the before/after diff is a **structural / AST compare** (reuse a diff algorithm — `git`/`jj` for text, a structural differ for ASTs), the `blast_radius` is a **ContextGraph walk**, and the `change_kind` is chosen by **declared rules** (the table below) in `back/kernel/propagation/` with its property mirror. The LLM is used **only** for a genuinely undecidable kind — and even then the honest move is `unknown` + an OpenQuestion, **not** an LLM guess. Never reach for the model where the diff algorithm / graph walk / rule decides.

## Purpose

Lift a raw proposed change out of ambiguity into a typed, bounded diff:

- assign a **change_kind** — `add` · `refine` · `override` · `rescope` · `reweight` · `deprecate`,
- compute the **blast radius** — the set of targets, mirrors and projections this change touches,
- attach the **propagation rule** the kind implies (what must re-prove, what must regenerate),
- and surface every gap as an **OpenQuestion** rather than guessing.

## When to use

- A `changeset` is DRAFT and about to touch a kernel truth (entity / policy / operation / control / action).
- After `classify-truth` + a mirror exists, before opening / sizing a `/goal`.
- When someone says "just tweak the rule" and you must decide if it is a refine, an override, or a rescope.
- When you need the blast radius for `aidos impact` before approval.

## Inputs

- `changesetId` — the DRAFT changeset carrying the proposed diff (required).
- The `targetId` of the kernel truth being changed — **read from the base, never invented**.
- The before/after AST (or the mirror that drove the change) for the target.
- `CONTEXT-MAP.md` + the subsystem `CONTEXT.md` for the glossary; the ContextGraph for downstream edges.

## Outputs

A classified diff recorded against the `changeset` (via the changeset / dag MCP, never a direct kernel write):

- `change_kind` ∈ { `add`, `refine`, `override`, `rescope`, `reweight`, `deprecate` }.
- `blast_radius` — the transitive set of affected `targetId`s, their **mirrors**, and **projections** (Go structs, DDL, TS types) that must regenerate.
- `propagation` — what must re-prove (which mirrors go provisionally red) and what must regenerate, per kind.
- `reversibility` — append-only supersede path (deprecate/override never destroy; head is mutable).
- Zero or more **OpenQuestion** records for every unknown target, edge, or undecidable kind.

## Change kinds (pick by nature, not convenience)

- **add** — a new truth; no prior version. Blast radius = its own new mirror + new projections.
- **refine** — same target, tightened behaviour, same scope/authority. Existing mirrors must re-prove green.
- **override** — a recorded decision that supersedes a prior truth's verdict (not an edit; §8). Keeps history; needs ADR + provenance.
- **rescope** — the target's `scope`/level changes (more or fewer cells/entities governed). Re-derives the ContextGraph; touches everything in/out of the new scope.
- **reweight** — a declared weight/threshold/budget changes (above the line, never learned; §8). Touches `fitness` consumers only.
- **deprecate** — lifecycle transition; truth retained, head marked. Downstream must migrate before head flips.

## BDD / mirror required before use

This is a classification + impact gesture, not a behaviour. It writes no truth, so it needs no truth-test of its own. But:

- The classifier/blast-radius logic (in `back/kernel/propagation/`) ships with a **red property mirror first** (rapid): e.g. *a `rescope` blast radius always includes every target entering or leaving the new scope*. `red → green → refactor`.
- Its **fault-injection test**: feed an `override` and assert it is recorded as a decision (changeset + ADR), never an in-place edit; remove one downstream edge and assert the blast radius goes red (incomplete).
- Classifying a change does **not** apply it — applying truth is `/goal` → human approval, never here.

## Steps

1. **Read the diff** for `changesetId`; resolve the target and its words against `CONTEXT-MAP.md` / `CONTEXT.md`. Undefined term → OpenQuestion, do not guess.
2. **Confirm the target exists** in the base (`store`). If `targetId` is absent or ambiguous → OpenQuestion; never manufacture one.
3. **Pick the change_kind** by nature (table above). If two kinds plausibly fit (e.g. refine vs override), set it `unknown` + OpenQuestion rather than forcing one.
4. **Walk the ContextGraph** out from the target: collect transitively affected truths, their mirrors, and their projections. That set is the **blast radius**.
5. **Attach the propagation rule** for the kind: which mirrors must re-prove (mark provisionally red), which projections must regenerate, what `fitness` consumers move on a reweight.
6. **State reversibility:** confirm the kind's path is append-only (supersede/deprecate, head mutable) — never a destructive overwrite (§9).
7. **Record** the classified diff + blast radius on the `changeset` via the changeset MCP (a recorded decision, not an edit). Attach all OpenQuestions.
8. **Hand off:** sized blast radius → `/goal` (size the red set from the touched mirrors) → human approval. Never apply from here.

## Stop conditions

- **Done is computed, not declared:** the changeset has a `change_kind` (or `unknown` + OpenQuestion), a non-empty blast radius **or** an explicit "isolated" justification, and every gap is an OpenQuestion.
- Stop and refuse to proceed if the target cannot be confirmed in the base.
- Never apply or approve the change from this gesture — classification + impact is necessary, not sufficient.
- An `override`/`deprecate` without its supersede path and ADR/provenance is incomplete — block.

## Failure modes

- **Manufacturing a target.** Inventing a `targetId` to make a diff resolve → monster. Leave it open + OpenQuestion.
- **Kind-forcing.** Labelling an `override` a `refine` to skip the ADR/provenance, or a `rescope` a `refine` to dodge re-deriving the graph. Pick by nature.
- **Blast-radius theatre.** Declaring "isolated" without walking the ContextGraph. An undersized radius is a silent break (§9).
- **Edit-as-override.** Mutating a prior truth in place instead of recording a superseding decision. Forbidden — append-only.
- **Reweight invention.** Treating a learned/derived number as a weight change. Weights are declared above the line (§8); a value you cannot point to is an OpenQuestion.
- **Wall breach.** Writing the diff straight into `kernel`/`mirrors`. It belongs on the `changeset` via MCP.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness` from this gesture; route via the changeset MCP.
- `PostKernelChange` — fires on apply; uses this diff's blast radius to know what to re-prove/regenerate.
- `Stop` (completeness) — blocks finish if a touched truth is left without its living mirror, or a changeset is left unclassified / with no blast radius.

## Related MCP tools

- **changeset** — read the DRAFT diff; record the `change_kind`, blast radius, propagation + reversibility as an append-only decision.
- **context** — walk the ContextGraph to compute the transitive blast radius and reuse decisions.
- **store** — read the before/after AST and confirm the target exists (read-only).
- **dag** — locate the change in the phase/changeset graph; confirm the supersede/revert path for override/deprecate.

## Workbench visualization

Next route `front/web/app/diff/` (or the changeset/impact panel): one changeset per card showing the `change_kind` badge, the blast-radius graph (target → affected truths → mirrors → projections), the propagation that will fire, and its OpenQuestions. A Playwright e2e asserts a `rescope` renders a non-empty downstream set and that an `override` shows a supersede edge (not a destructive edit).

## Honesty rules

Never invent a `target`, a `targetId`, or a business rule to complete a classification or pad a blast radius; every gap — undefined term, unconfirmed target, missing downstream edge, undecidable kind, untraceable weight — becomes an **OpenQuestion**, never a guess, and the change is never applied from this gesture.
