---
name: besoin-invariant
description: The transversal-band /besoin-invariant gesture (EL14) — the LATERAL interview of the invariants ∀ that cross every level ("true on all paths") and the policies where authorization is in play, ABOVE the wall. The human STATES the invariant; the code only records and classifies it (the circularity ban, §8 — the skill cannot author a ∀ it would then satisfy). An ∃ (a single example) is REFUSED (INVARIANT_IS_EXAMPLE_NOT_FORALL); an invariant attached at a rung constrains that rung AND every SOURCE rung above it (the lateral cross-product); a policy band emits AT MOST ONE Idea{Proposes:policy} via the legal idea_capture door; a path-independent invariant emits none (NoEmit). Use when the user wants to state an invariant or a policy that crosses the levels, "record a besoin invariant", elicit the ∀ band, or attach a lateral constraint to the BesoinGraph. The LLM phrases the dialogue; the code judges. Writes only the `besoin` schema via the EL15 MCP, never the kernel/mirrors.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /besoin-invariant (EL14 — the transversal band of invariants ∀ and policies)

The **lateral** elicitation gesture of the *compound du besoin* track. Where `/compound-besoin` (EL13) descends the §23 verticale rung by rung, `/besoin-invariant` records the **invariants ∀** that **cross** the levels ("vrai sur tous les chemins") and the **policies** where authorization is in play (the `policy` band of EL02). The **LLM phrases** the dialogue; **every verdict is a pure function, code-authoritative** — the LLM defers to the code, never the reverse.

> **The wall (CLAUDE.md §2).** This gesture writes only the `besoin` schema, through the EL15 MCP `besoin-intake`. It **never** writes `kernel`/`mirrors`/`fitness`. The single emission is at most **one** `Idea{Proposes:policy}` GUIDANCE through the legal `idea_capture` door (provenance human, verbatim utterance) — never an Idea for the ∀ statement itself (`LevelToProposes(invariant) == NoEmit`; an invariant's mirror is a property N1). The backing functions live in `back/runtime/besoin/invariant.go` (Go authority) with the byte-equivalent twin `front/web/lib/besoin-invariant.ts`.

## What is code, never the LLM (determinism-first)

| Decision | Function (authority) | Never |
|---|---|---|
| Is this a ∀ or an ∃? | `IsForallStatement(statement)` — a DECLARED bilingual lexical predicate | an LLM "is this universal" judgment |
| Parse the band | `ParseInvariantBand(body)` — types the ∀, refuses an ∃, validates attachment | a silent coercion |
| What does the band constrain? | `CrossedLevels(band)` — L + every SOURCE rung above L (the lateral cross-product) | a re-judgement |
| Record the band | `RecordInvariant(graph, body, utterance, selfAuthored, meta)` — circularity ban + routing | an LLM verdict |
| Is a crossing invariant missing? | `BandCompleteness(graph)` — flags a resolved rung that requires one but has none | an inferred "should" |

## The circularity ban (§8)

The human **states** the invariant. The skill **may not author** a ∀ it would then satisfy — that is the circularity (a truth-test you write then pass). `RecordInvariant(..., selfAuthored=true, ...)` is **always refused** with `INVARIANT_CIRCULAR_SELF_AUTHORED`. The skill only **records and classifies** a human-stated invariant.

## The lateral constraint

An invariant attached at rung `L` constrains `L` **and every SOURCE rung above** `L`: an invariant on `operation` is also a constraint on `action / control / view / journey / product` — because "true on all paths" holds on every level the path crosses. `CrossedLevels` is the upward cross-product over the descent order, sorted and de-duplicated.

## How to run a turn

1. Read the frozen anchors (the resolved rungs above) for grounding — the band may not contradict them.
2. Ask the human to **state** the invariant ∀ (or the policy rule) and which SOURCE rungs it attaches to.
3. Hand the paraphrased body to `RecordInvariant` (never `selfAuthored`). The code:
   - refuses an ∃ (`INVARIANT_IS_EXAMPLE_NOT_FORALL`) or a bad attachment (`INVARIANT_BAD_ATTACHMENT`);
   - routes a fuzzy (unverifiable) band to `/spike` via `idea_capture → idea_grill → idea_spike`;
   - otherwise records the band node and — for a **policy** band only — emits **at most one** `Idea{Proposes:policy}` guidance.
4. Run `BandCompleteness` to surface any resolved rung that requires a crossing invariant but has none (`NEED_LEVEL_MISSING_INVARIANT`).

Persistence is the EL15 MCP `besoin-intake`; this gesture computes and returns the next `BesoinGraph`, it writes no truth.
