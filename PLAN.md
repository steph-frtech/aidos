# PLAN.md — AIDOS / KRD implementation plan (executed by `/long-run`)

This is the **root long-run index** for the AIDOS repo (the AI Development Operating System implementing the KRD method). `/long-run` parses this file and executes the steps below **sequentially**: per step, `step-executor` implements it, then `step-verifier` validates/corrects it; the workflow advances **only after a pass** and **resumes from cache** on restart (state lives in `.claude/workflows/long-run.js`, never in the context).

Each `## <id>` section is a parseable entry with:
- **Objectif** — the one verifiable capability the step adds.
- **Detail** — the `docs/plan/<id>-<slug>.md` file that holds the step's **full launch prompt** (the complete brief `step-executor` reads). This index is a map; the plan file is the territory.
- **Inputs** — the prior step ids this step consumes (its stable-phase predecessors), or `(aucun)` for S00.
- **Criteres de done** — the computed done-condition for the step.

Follow the per-step loop from `CLAUDE.md` §6 at every step (grill → red mirror first → tdd → sensors → completeness → diagnose → UI route + Playwright e2e → improve-architecture → artifacts). "Done" is computed, never declared (`red→green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster`).

Subsystem tags: **Runtime · Kernel · Mirror · Archive · Workbench**.

---

## S00
**Objectif:** Runtime — Step execution contract & granularity rule as a machine-readable checklist.
**Detail:** docs/plan/S00-exec-contract.md
**Inputs:** (aucun)
**Criteres de done:** machine-readable checklist exists and is parseable; each step gate (minimal/autonomous/visualizable/non-destructive/chainable) is encoded and asserted by a passing mirror.

## S01
**Objectif:** Archive — Postgres + Atlas baseline; content store (content/head/history, hash, append-only).
**Detail:** docs/plan/S01-postgres-content-store.md
**Inputs:** S00
**Criteres de done:** Atlas migration applies on Postgres; content store stores by hash (content-addressed), exposes head + history, and rejects destructive writes (append-only) under test.

## S02
**Objectif:** Kernel — KRDCore record schemas (Idea, Truth, Mirror, Layer, Link, ChangeSet, Phase) as JSONB.
**Detail:** docs/plan/S02-krdcore-records.md
**Inputs:** S01
**Criteres de done:** the seven record types round-trip through the content store as validated JSONB; schema invariants proven by a property mirror.

## S03
**Objectif:** Runtime — `aidos` CLI stub (check/impact/stable/diff/explain) — deterministic, exit 0.
**Detail:** docs/plan/S03-cli-aidos.md
**Inputs:** S02
**Criteres de done:** `aidos check|impact|stable|diff|explain` run deterministically and exit 0; output is stable across runs; covered by a Godog journey.

## S04
**Objectif:** Runtime — The wall: PreToolUse hook (Go) + Postgres GRANTs deny agent writes to kernel/mirrors/fitness.
**Detail:** docs/plan/S04-the-wall.md
**Inputs:** S01, S03
**Criteres de done:** PreToolUse hook blocks writes to the forbidden zones with an actionable BlockReason; the agent DB role has no write GRANT on truth tables; fault-injection test proves both layers go red when bypassed.

## S05
**Objectif:** Mirror — CI ratchet `run-all-mirrors`: replays every mirror, rejects red regressions.
**Detail:** docs/plan/S05-ci-ratchet.md
**Inputs:** S02, S03
**Criteres de done:** the ratchet replays every registered mirror; a newly-red prior-green mirror fails the run; passing baseline recorded.

## S06
**Objectif:** Mirror — Mirror as living typed proof (reflects, test_kind, cert_language, authority, liveness).
**Detail:** docs/plan/S06-mirror-schema-liveness.md
**Inputs:** S02, S05
**Criteres de done:** mirror records carry the five typed fields; liveness is computed (a stale/dead mirror is flagged); schema enforced by migration + property mirror.

## S07
**Objectif:** Runtime — Sensors (PostToolUse): computational on changed code (gofmt/vet, lint, archtest, affected tests), on_fail block.
**Detail:** docs/plan/S07-sensors.md
**Inputs:** S04, S05
**Criteres de done:** PostToolUse runs only the computational sensors on the changed set; any failing sensor blocks with a BlockReason; fault-injection proves each sensor fires.

## S08
**Objectif:** Kernel — Expr DSL (typed JSON AST: lit/ref/call/obj/arr, funcs, roots).
**Detail:** docs/plan/S08-expr-dsl.md
**Inputs:** S02
**Criteres de done:** the Expr AST parses, type-checks and evaluates lit/ref/call/obj/arr with the allowed funcs/roots; property mirror proves type-soundness.

## S09
**Objectif:** Kernel — Policy DSL (forall ALLOW/DENY rule tree) + property mirror (rapid).
**Detail:** docs/plan/S09-policy-dsl.md
**Inputs:** S08
**Criteres de done:** a forall ALLOW/DENY rule tree evaluates deterministically over Expr; rapid property mirror proves DENY-precedence and totality.

## S10
**Objectif:** Kernel — Operation DSL (validate/authorize/read/mutate/return) interpreted in Go + fixture mirror state→cmd→events.
**Detail:** docs/plan/S10-operation-dsl.md
**Inputs:** S08, S09
**Criteres de done:** the Go interpreter runs the five operation phases in order; a `state → command → events` fixture mirror passes; authorize delegates to the Policy DSL.

## S11
**Objectif:** Kernel — Control-spec (button) + Action-spec (binds control to operation) + state/event fixtures.
**Detail:** docs/plan/S11-control-action.md
**Inputs:** S10
**Criteres de done:** a Control-spec and an Action-spec binding it to an operation are stored and validated; state/event fixtures prove the control triggers the bound operation.

## S12
**Objectif:** Mirror — Completeness law + monstre detection (Stop hook).
**Detail:** docs/plan/S12-completeness-monstre.md
**Inputs:** S06, S07
**Criteres de done:** completeness law detects monsters (truth without living mirror, orphan mirror); the Stop hook blocks on any monster; fault-injection proves it fires.

## S13
**Objectif:** Runtime — BlockReason everywhere (code/severity/explanation/how_to_fix) + `aidos explain`.
**Detail:** docs/plan/S13-blockreason.md
**Inputs:** S04, S07, S12
**Criteres de done:** every block path emits a structured BlockReason; `aidos explain <code>` returns the explanation + how_to_fix steps; covered by a journey.

## S14
**Objectif:** Kernel — TruthKind + VerifiabilityLevel; non-verifiable → /spike.
**Detail:** docs/plan/S14-truth-typing.md
**Inputs:** S02, S06
**Criteres de done:** each truth carries a TruthKind and VerifiabilityLevel; a non-verifiable truth is routed to /spike rather than frozen; enforced by mirror.

## S15
**Objectif:** Kernel — TruthScope (region/target/segment/env/time-window).
**Detail:** docs/plan/S15-truth-scope.md
**Inputs:** S14
**Criteres de done:** a TruthScope constrains region/target/segment/env/time-window; scope membership is decidable and proven by a property mirror.

## S16
**Objectif:** Kernel — AuthorityGraph (approver/veto/escalation).
**Detail:** docs/plan/S16-authority-graph.md
**Inputs:** S14
**Criteres de done:** the AuthorityGraph resolves approver/veto/escalation deterministically; a veto blocks approval; resolution proven by mirror.

## S17
**Objectif:** Kernel — Versioned links (projects_to/derives_from/contracts_with/triggers/binds/mirrors).
**Detail:** docs/plan/S17-links.md
**Inputs:** S02, S11
**Criteres de done:** the six link kinds are stored content-addressed and versioned; link integrity (no dangling endpoints) proven by mirror.

## S18
**Objectif:** Kernel — composes + recursive aggregate (parent green iff own_mirror + children green).
**Detail:** docs/plan/S18-composes-aggregate.md
**Inputs:** S17
**Criteres de done:** the composes link aggregates recursively; a parent is green iff its own mirror is green and all children are green; proven by property mirror.

## S19
**Objectif:** Kernel — Weighted propagation (load-bearing/cosmetic/critical thresholds) + weight evidence.
**Detail:** docs/plan/S19-weighted-propagation.md
**Inputs:** S18
**Criteres de done:** propagation honors per-link weights (load-bearing/cosmetic/critical) against declared thresholds; each weight carries evidence; proven by mirror.

## S20
**Objectif:** Archive — ChangeSet (DRAFT/APPLIED/REVERTED, atomic spec+mirror, inverse revert).
**Detail:** docs/plan/S20-changeset.md
**Inputs:** S02, S05
**Criteres de done:** a ChangeSet bundles spec+mirror atomically across DRAFT/APPLIED/REVERTED; revert applies the exact inverse; append-only history proven by mirror.

## S21
**Objectif:** Runtime — SemanticDiff (add/refine/override/rescope/reweight/deprecate) + `aidos diff`.
**Detail:** docs/plan/S21-semantic-diff.md
**Inputs:** S15, S19, S20
**Criteres de done:** SemanticDiff classifies a changeset into add/refine/override/rescope/reweight/deprecate; `aidos diff` reports the classification; proven by fixtures.

## S22
**Objectif:** Runtime — Impact / red wave (PostKernelChange) + RedWorkQueue + `aidos impact`.
**Detail:** docs/plan/S22-impact-red-wave.md
**Inputs:** S18, S21
**Criteres de done:** a kernel change propagates a red wave over the link graph into a RedWorkQueue; `aidos impact` lists the affected set; PostKernelChange fires; proven by mirror.

## S23
**Objectif:** Archive — Phase stable (coherent DAG cut) + `aidos stable`.
**Detail:** docs/plan/S23-phase-stable.md
**Inputs:** S20, S22
**Criteres de done:** `aidos stable` records a phase only when the cut is coherent (no red, no monster); the phase is a content-addressed DAG node; proven by mirror.

## S24
**Objectif:** Archive — Version DAG (branch / checkout-ancestor / rebranch).
**Detail:** docs/plan/S24-version-dag.md
**Inputs:** S23
**Criteres de done:** the DAG supports branch, checkout-ancestor and rebranch over phases (nodes) and changesets (edges); ancestry queries proven by mirror.

## S25
**Objectif:** Archive — Semantic merge (mirrors decide, not text diff).
**Detail:** docs/plan/S25-semantic-merge.md
**Inputs:** S24
**Criteres de done:** merge resolves two branches by replaying mirrors (not text diff); a conflict is a mirror that cannot be simultaneously green; proven by fixtures.

## S26
**Objectif:** Archive — ArchiveCurationPolicy (keep/compress/tombstone) + QD niches (MAP-Elites).
**Detail:** docs/plan/S26-curation-qd.md
**Inputs:** S24
**Criteres de done:** the curation policy classifies phases keep/compress/tombstone without losing truth; QD niches (MAP-Elites) index the archive; proven by mirror.

## S27
**Objectif:** Kernel — Ideas lifecycle (draft/grilled/spiking/harvested/rejected); promote only via mirror+goal.
**Detail:** docs/plan/S27-ideas-lifecycle.md
**Inputs:** S02, S14
**Criteres de done:** an idea transitions draft/grilled/spiking/harvested/rejected; promotion to a truth is possible only through mirror+goal; illegal transitions blocked by mirror.

## S28
**Objectif:** Runtime — grill/spike/harvest gestures; spike writes only /spike (T0, ratchet off).
**Detail:** docs/plan/S28-exploration-gestures.md
**Inputs:** S27
**Criteres de done:** grill/spike/harvest gestures exist as skills; spike writes only under /spike (T0, ratchet off) and never touches truth; proven by the wall + a journey.

## S29
**Objectif:** Runtime — goal: idea → Truth+Mirror DRAFT → red set; non-gameable stop.
**Detail:** docs/plan/S29-goal-engine.md
**Inputs:** S20, S27, S28
**Criteres de done:** `/goal` turns an idea into a Truth+Mirror DRAFT changeset producing a red set; the stop condition is non-gameable (agent cannot self-declare done); proven by mirror.

## S30
**Objectif:** Archive — MemoryFirewall: Memory→ContextPack→Idea→Mirror→Goal→Kernel; block Memory→Kernel.
**Detail:** docs/plan/S30-memory-firewall.md
**Inputs:** S04, S29
**Criteres de done:** memory can reach the kernel only via the ContextPack→Idea→Mirror→Goal path; a direct Memory→Kernel write is blocked; fault-injection proves the firewall fires.

## S31
**Objectif:** Archive — Memory adapter (pgvector embeddings; episodic/semantic/procedural/structural).
**Detail:** docs/plan/S31-memory-pgvector.md
**Inputs:** S01, S30
**Criteres de done:** MemoryItems of all four kinds store + retrieve via pgvector embeddings; similarity recall is deterministic under a fixed seed; proven by mirror.

## S32
**Objectif:** Archive — ContextGraphDecision (deterministic reuse: time/scope/authority/conditions) + mirrors.
**Detail:** docs/plan/S32-context-graph-decision.md
**Inputs:** S15, S16, S31
**Criteres de done:** a ContextGraphDecision allows/denies reuse deterministically from time/scope/authority/conditions; decisions are recorded; proven by mirrors.

## S33
**Objectif:** Runtime — ContextRouter/ContextPack (compile minimal context from the red-set, branch-aware).
**Detail:** docs/plan/S33-context-router.md
**Inputs:** S22, S32
**Criteres de done:** the router compiles a minimal, branch-aware ContextPack from the red-set respecting ContextGraphDecisions; minimality + branch-awareness proven by mirror.

## S34
**Objectif:** Runtime — Emitters (one per kind × target): emit Go (sqlc), Postgres DDL, TS types; deterministic, hash+protected.
**Detail:** docs/plan/S34-emitters.md
**Inputs:** S02, S33
**Criteres de done:** each emitter produces deterministic output (stable hash) into `back/gen`; emitted files are hash-protected against hand-edits; proven by mirror.

## S35
**Objectif:** Kernel — Entity source (AST in Postgres) → codegen Go+TS; the Order entity.
**Detail:** docs/plan/S35-entity-source.md
**Inputs:** S08, S34
**Criteres de done:** the Order entity is a single AST source emitting Go structs (sqlc) + TS types; the two projections never double-typed; round-trip proven by mirror.

## S36
**Objectif:** Runtime — API projection (Go REST/JSON from operation+entity) + Pact contract.
**Detail:** docs/plan/S36-api-projection.md
**Inputs:** S10, S35
**Criteres de done:** a Go REST/JSON API is projected from operation+entity; a Pact contract is generated and verified against the provider; proven by Pact verification.

## S37
**Objectif:** Runtime — DB projection (Atlas migration from entity, expand-contract) + DataTruthScope.
**Detail:** docs/plan/S37-db-projection.md
**Inputs:** S35, S37
**Criteres de done:** an Atlas expand-contract migration is projected from the entity under a DataTruthScope; the migration applies on Postgres (Testcontainers) without data loss; proven by mirror.

## S38
**Objectif:** Workbench — Web projection (Next component from view/control/action respecting fixtures).
**Detail:** docs/plan/S38-web-projection.md
**Inputs:** S11, S35
**Criteres de done:** a Next component is projected from view/control/action and honors the state/event fixtures; a Playwright + playwright-bdd journey passes against it.

## S39
**Objectif:** Runtime — Meta-meta fitness (read-only) + SessionStart self-test (fault injection: each sensor fires, wall holds, fitness unchanged).
**Detail:** docs/plan/S39-meta-meta.md
**Inputs:** S07, S12, S30
**Criteres de done:** the fitness schema is read-only; SessionStart self-test injects faults proving each sensor fires, the wall holds, and fitness is unchanged; blocks the session on failure.

## S40
**Objectif:** Mirror — Mutation testing sensor (gremlins back, StrykerJS front); threshold gates the stable phase.
**Detail:** docs/plan/S40-mutation-testing.md
**Inputs:** S05, S23
**Criteres de done:** gremlins (back) + StrykerJS (front) compute a mutation score; the declared threshold gates `aidos stable`; a surviving mutant below threshold blocks the phase.

## S41
**Objectif:** Runtime — KernelDebt + /trim-kernel (stale fixtures, surviving mutants, orphan mirrors).
**Detail:** docs/plan/S41-kernel-debt.md
**Inputs:** S12, S40
**Criteres de done:** KernelDebt enumerates stale fixtures, surviving mutants and orphan mirrors; `/trim-kernel` proposes safe removals via changesets only; proven by mirror.

## S42
**Objectif:** Runtime — EvolutionSandbox (evolve writes only branches/reports/ideas; QD promotion needs a mirror).
**Detail:** docs/plan/S42-evolution-sandbox.md
**Inputs:** S26, S29
**Criteres de done:** `evolve` writes only branches/reports/ideas (never truth); a QD candidate is promotable only with a passing mirror; the wall blocks any truth write; proven by fault-injection.

## S43
**Objectif:** Runtime — RealityMirror (telemetry/incident → Idea with provenance) + OpenTelemetry.
**Detail:** docs/plan/S43-reality-mirror.md
**Inputs:** S27, S43
**Criteres de done:** OpenTelemetry signals/incidents are turned into Ideas with recorded provenance; reality never writes truth directly; proven by mirror.

## S44
**Objectif:** Workbench — KRDWorkbench full graph: navigate button↔view↔action↔operation↔entity↔mirrors↔scopes↔incidents; color legend; /brain cockpit.
**Detail:** docs/plan/S44-workbench-full.md
**Inputs:** S38, S43
**Criteres de done:** the Workbench renders the full navigable graph with the color legend and the /brain cockpit; navigation across all node kinds proven by a Playwright e2e.

## S45
**Objectif:** Runtime — `aidos` compiler integration: check/impact/stable/diff/explain cover all KRD laws (1 law = 1 red + 1 green).
**Detail:** docs/plan/S45-aidos-compiler.md
**Inputs:** S22, S23, S40
**Criteres de done:** the CLI integrates all KRD laws end-to-end; each law has exactly one red and one green mirror; the full ratchet is green.

## S46
**Objectif:** Workbench — End-to-end demo slice: cart view, checkout button, createOrder, Order entity, API, web preview, red→green.
**Detail:** docs/plan/S46-demo-checkout.md
**Inputs:** S36, S38, S45
**Criteres de done:** the cart→checkout→createOrder→Order→API→web slice runs end-to-end; the demo is driven red→green through a goal; a Playwright e2e proves the visible flow.

## S47
**Objectif:** Runtime — AdoptionStage (T0→T4 progressive) + Release v0 (CLI+Workbench+demo+docs+tests, changelog, known limits).
**Detail:** docs/plan/S47-adoption-release.md
**Inputs:** S45, S46
**Criteres de done:** AdoptionStage advances T0→T4 progressively; Release v0 bundles CLI+Workbench+demo+docs+tests with a changelog and known-limits; the release ratchet is green.
