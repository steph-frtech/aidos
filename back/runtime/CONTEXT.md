# AIDOS Runtime

The harness (_harnais_) that runs everything: probabilistic search wrapped in deterministic acceptance. It orchestrates and enforces the truth but can never reach its own fitness or the wall.

## Language

**harnais (harness)**:
Everything surrounding the model — `Agent = Modèle + Harness`. The versioned, self-evolvable engine that wraps loops, skills, hooks, sensors, generators, context and archive, yet may never edit its own fitness or the wall.
_Avoid_: framework, wrapper, scaffolding, orchestrator (generic), runtime-as-language-runtime.

**sensor**:
A detector that verifies a projection against its source, in one of three regimes — `computational` (deterministic), `inferential` (LLM-judge, guarded), or `meter` (budget). A sensor that never fires is dead.
_Avoid_: check, validator, monitor, test.

**computational sensor (the per-diff drawer)**:
The deterministic regime of a sensor, run at `PostToolUse` on each diff (KRD §19/§74): `gofmt`+`go vet` (typecheck/format), `lint`, `archtest`, and the affected mirrors/tests. The agent self-certifies on these alone (never on behaviour). `on_fail: block`. An errored or unknown computational sensor is itself a **failure** made explicit (KRD §82 `.passthrough()` anti-pattern), never a silent pass.
_Avoid_: inferential review (LLM-judge — a different regime), meter (budget — a third regime), CI step.

**affected set (code changé)**:
The changed-code subset a per-diff sensor runs over: the file(s) named by the `PostToolUse` event and the package(s) those files live in — never the whole repository. The sensor is a pure function of the event plus the code it points at (same event ⇒ same verdict). The reverse-dependency closure is a later precision (OpenQuestion OQ-S07-1).
_Avoid_: working-tree diff, full build, global test run.

**on_fail: block (the feedback wall)**:
The PostToolUse verdict policy: any failing computational sensor returns `block` with an actionable `BlockReason` (`code = SENSOR_FAILED`) — the agent does not proceed past a diff that reddened a sensor. The twin of the wall's refusal: `PreToolUse` blocks an illegal *write*, `PostToolUse` blocks a *broken diff*. Exactly two verdicts (`block` | `allow`), no third.
_Avoid_: warn, soft-fail, advisory check, continue-on-error.

**vague de rouge (red wave)**:
The cascade of stale links and failing mirrors triggered by a kernel hash bump; it starts at the mirror and propagates to projections. It IS the worklist (computed, never hunted).
_Avoid_: test-failure cascade, build break, ripple, regression.

**mur (the wall)**:
The single permission/authority boundary the Runtime mechanically enforces: the agent writes projections, never the kernel, the mirror plane, or fitness. The Runtime enforces it but does not own or author it.
_Avoid_: firewall, ACL, barrier, gate.

**fitness non-gameable (NIVEAU 3)**:
The inviolable méta-méta — fitness function + layer grammar + waterline — physically hosted by the Runtime but owned only by human and reality. No loop edits its own fitness; there is no level 4.
_Avoid_: reward function, score, metric, config root.

### The harness machinery

**skill (geste)**:
An orchestrated gesture the harness performs (`/goal`, `/grill`, `/spike`, `/harvest`, `/evolve`, `/tdd`, `/reconcile`, `/project`, `/learn`, `/harden`, `/context`, `/merge-semantic`…), defined in a `SKILL.md` and validated by sensors. Skills are the muscular movements; the method is the noyau and the cliquet.
_Avoid_: command, macro, prompt, agent.

**hook**:
One of the five mechanical guardrails wired in `hooks.yaml` (`PreToolUse`, `PostToolUse`, `Stop`, `PostKernelChange`, `SessionStart`). The guardrails ARE hooks.
_Avoid_: callback, middleware, trigger (generic), git hook.

**tool**:
One MCP server, one backend operation (test-runner, mutation-tester, deploy…). Tools say what the agent CAN do; the noyau and hooks say what it has the RIGHT to do.
_Avoid_: function, plugin, integration, capability.

**topologie / harness template**:
An Ashby-style bundle of guides + sensors that a layer or cell inherits (crud / workflow / event-processor / dashboard). Composed in fragments, never single-select — a real app is a composition of topologies.
_Avoid_: template (generic), boilerplate, scaffold, archetype.

**generator (emitter)**:
A deterministic emitter, one per `kind × target`, that produces a projection from a source. It instantiates a topology and its harness, never a bare skeleton.
_Avoid_: code generator, scaffolder, transpiler, codegen.

**policy**:
A harness-level rule (mocking, architecture-rules, permissions, context-selection). Distinct from the Kernel's authorization Policy DSL and from the Archive's curation policy.
_Avoid_: rule (generic); conflating with the Kernel `policy` source layer or `ArchiveCurationPolicy`.

### The compilers

**KRDCompiler (`krd`)**:
A compiler of truth, not of code: it reads the truth graph (ideas, kernel, mirror, context, changesets, projections, telemetry) and produces the objective system state. No KRD concept exists if `krd check` cannot verify it.
_Avoid_: transpiler, build tool, code generator, linter.

**ContextPack / ContextRouter / ContextGraph**:
The context compiler. The `ContextRouter` (an algorithm, not a prompt) compiles a minimal, branch-aware `ContextPack` from the affected subgraph of the `ContextGraph`. Context is compiled from the red-set, never global.
_Avoid_: prompt builder, RAG retriever, knowledge graph, context window.

**SemanticDiff / BlockReason**:
What the Runtime computes for the Workbench to render: `SemanticDiff` reads the real nature of a kernel change (change_type, blast_radius, requires_authority, red_wave); `BlockReason` makes every refusal actionable (code, severity, explanation, how_to_fix). A wall without a BlockReason becomes a prison.
The `BlockReason` shape is **one canonical type** (`back/runtime/blockreason`, S13) reused at every block site — Runtime plumbing **below the waterline**, never a kernel truth. Its `Code` enum is closed and small: `MISSING_MIRROR`, `MISSING_AUTHORITY`, `OUT_OF_SCOPE` (KRD §44.5), plus the inherited `AGENT_WRITE_ABOVE_WATERLINE` (S04's wall). Each code maps deterministically to a non-empty `how_to_fix[]` resolution path (the canonical fix tokens of KRD §44.5: `write_mirror`, `assign_authority`, `rerun_krd_check`); a code with an empty fix path **is** the prison and is forbidden by the property mirror. `aidos explain <code>` (KRD §82.1) renders any BlockReason — code, severity, explanation, numbered how_to_fix — and invents nothing (round-trip). `OUT_OF_SCOPE`'s in-scope target/owner is named only when a real scope record supplies it (TruthScope arrives at S14); until then the fix path names the role generically, never a fabricated owner (OpenQuestion OQ-S13-scope).
_Avoid_: git diff, error message, stack trace.

### Goal engine and coordination

**stigmergie / RedWorkQueue**:
Coordination without a central coordinator: stigmergy coordinates attention via the shared red wave (a pheromone trace), while the `RedWorkQueue` coordinates execution (work items targeting a `mirror_id`).
_Avoid_: pub/sub, task queue (generic), scheduler, event bus.

## Shared terms (as Runtime uses them)

**cliquet (ratchet)**:
The forward-only mechanism: behavior advances, never regresses unversioned. In the Runtime, the steering loop IS the cliquet — it forbids unversioned change, not change. (Co-owned with the Kernel.)
_Avoid_: lock, freeze, gate, CI gate.

**tracer bullet / walking skeleton**:
A single real end-to-end wiring done early to validate a port's shape before stacking use-cases on it, closed by Pact provider verification. The Runtime drives the wiring; the port itself is Kernel-owned.
_Avoid_: MVP, POC, prototype, spike.

### Exploration gestures (S28)

**exploration gesture (`/grill` · `/spike` · `/harvest`)**:
The three Runtime gestures of the idea entry-stage (KRD §75), run by `back/runtime/exploration` **over** the S27 `ideas` lifecycle — never re-implementing a transition. `/grill` challenges an intention ABOVE the wall and routes it on a verdict; `/spike` opens the ratchet-OFF, T0, throwaway zone; `/harvest` extracts the discovered intention and PROPOSES a kernel delta. The freeze (writing the mirror = `/goal`) is a separate later gesture, Kernel-owned and out of reach.
_Avoid_: command/macro, prompt-to-kernel, generic "workflow"; conflating the AIDOS-internal `grill/` gesture with the `grill-with-docs` session skill.

**grill verdict**:
The closed three-value outcome of `/grill` on a `draft` idea — `sharp` (falsifiable now → `grilled`, skips the spike, KRD §132), `fuzzy` (not-yet-falsifiable → `grilled` then `spiking`, the floue branch), `bad` (a bad idea → `rejected`, traced with provenance). A pure routing; there is no fourth verdict.
_Avoid_: score, confidence, rating; an invented fourth verdict.

**spike confinement (`SpikeWrite`, `SPIKE_WRITE_ESCAPES_ZONE`)**:
The non-bypassable rule that, while an idea is `spiking` (ratchet OFF, T0), every write path is UNDER the `/spike` prefix or is refused (`SpikeWrite{Path}.Confined()`). The throwaway spike must not leak into `/kernel` or `/src`. The `spike-confinement` hook defers to the pure predicate and learns the current idea status from an INJECTED event field — it never reaches into the kernel/mirrors schemas (the wall). An escaping write returns the actionable `SPIKE_WRITE_ESCAPES_ZONE` BlockReason (`how_to_fix` ⊇ `confine_write_to_/spike`).
_Avoid_: sandbox (generic), chroot, quarantine (that is the S42 EvolutionSandbox), allowlist.

**DRAFT-Truth proposal (`/harvest`, `HARVEST_CANNOT_FREEZE`)**:
What `/harvest` returns from a spiking idea: a kernel-delta CANDIDATE `{ideaId, proposes, intent, provenance, hasFrozenVersion: false, hasMirror: false}`. It is a *proposal*, not a truth — no frozen version, no mirror, no kernel write. Harvest PROPOSES; the human freezes later via `/goal`. An attempt by harvest to write the kernel or a mirror directly is refused with `HARVEST_CANNOT_FREEZE` (`how_to_fix` ⊇ `write_mirror_run_goal_freeze`). The AI may draft, the human approves — never the inverse.
_Avoid_: freeze, kernel-delta (applied), candidate-truth-with-mirror, graduation.

### Goal engine (S29)

**goal (`/goal`, the internal loop ①)**:
The ONLY legitimate door from a candidate-truth (idea) to truth, KRD §56–§59/§63①: `idea → mirror → /goal`. A `Goal` is a DRAFT `ChangeSet` (S20) carrying the idea's `spec_delta` + `mirror_delta` atomically PLUS the **red set** — the failing mirror refs that ARE the goal (§56: "le test rouge EST le goal ; le set rouge EST la todo-list"). `back/runtime/goal` opens the goal and computes its stop; it does NOT run the red→green TDD motion (the agent's `/src` work), does NOT own the ChangeSet envelope/commit-gate (S20, consumed), the SemanticDiff (S21, consumed) or the red-wave cascade that decides WHICH mirrors redden (S22, **called** via `redwave.Impact`, never re-implemented). Internal loop ① only — not the `/evolve` middle loop (§63②) nor the outer reality loop (§63③).
_Avoid_: command/macro, prompt-to-kernel, the freeze itself (a goal opens the door, the aidos role + commit-gate freeze), task/ticket.

**red set (`red_set`)**:
The ordered set of failing mirror refs a goal must turn green — derived by `redwave.Impact` (S22) from the idea's `spec_delta`, never hunted. A goal with an EMPTY red set is rejected (`NO_RED_SET`): a test already green is not a goal — there is nothing to close (§56). An idea with NO mirror is rejected (`IDEA_WITHOUT_MIRROR`): an idea without a mirror is a *vœu* / monster (§57, LIVRE XX). The red set lives INSIDE the goal's JSONB body (version-pinned refs, not foreign keys — a recorded goal stays inspectable after heads move).
_Avoid_: todo-list (generic), backlog, the red wave itself (the wave is the cascade; the red set is the goal's slice of it), failing-tests bag.

**non-gameable stop (`IsClosed`)**:
The COMPUTED close predicate of §57 Algorithme ① / §8: a goal closes iff `red set → green ∧ prior green intact ∧ mutation ≥ threshold ∧ no monster` — four conditions, all four must hold. `IsClosed(goal, sensors, mutation, monsters) → bool` is pure, total, deterministic and takes NO agent-confidence input: the engine never reads the agent's claim of "done". `OPEN`/`CLOSED` is therefore computed, never declared (the agent cannot self-certify the close). The default harness `/goal` stop is weak (the agent grades its own copy); KRD's contribution is exactly this non-gameable stop, plus declared (never learned) budgets (time/turns/tokens) as the SECONDARY anti-runaway guard. The `Stop:goal-check` hook defers to `IsClosed` and BLOCKS the close with `GOAL_STILL_RED` while any condition fails.
_Avoid_: self-assessment, confidence threshold, "done" flag, agent verdict, reward.

### Adoption + Release v0 (S47)

**AdoptionStage (`back/runtime/adoption.Plan`)**:
The READ-ONLY ladder that names the SMALLEST RATCHET THAT CLICKS NEXT (KRD §82.5 — install KRD progressively, never all at once). EXACTLY five declared tiers `T0..T4`, mapped from §82.5's `stage0..stage5` (REUSED, never re-coined): `T0`=tests+mutation, `T1`=one KRD cell, `T2`=kernel+mirror, `T3`=ContextGraph+Memory, `T4`=evolve+QualityDiversity. Each tier carries a declared `requires`/`grants` over `Capability` (consumed facts, never built). Three LOAD-BEARING gating facts: `T1` does NOT require `QualityDiversity` (advanced, §82.6 — asserting it at T1 is a monster); `T2` requires a live `RealityMirror` (Livre XX — no catastrophic tier without reality grounding); `T4` requires a live `EvolutionSandbox` (§66.1 — no evolution before its quarantine). `Plan(capabilities) → AdoptionPlan` is pure (no DB, no I/O, no `time.Now()`, no RNG): returns the current tier (the contiguous satisfied floor), the next smallest installable tier + the `[]Gap` per unsatisfied tier (monotone ladder — never jump to T2+ while T1 is unmet). It COMPUTES a ladder; it installs nothing, mutates nothing, writes no truth.
_Avoid_: installer, migration runner, feature-flag system, onboarding wizard, re-coined stages.

**Release v0 pack (`back/runtime/adoption/release.Assemble`)**:
The content-addressed bundle that proves "this AIDOS is launchable" — ASSEMBLED, never authored. `Assemble(view, capabilities, now) → ReleasePack` INVENTORIES the live truth-store view: `cli_surface`, `workbench_routes`, `demo_cell`, `docs_index`, `test_inventory` (the live mirrors), `changelog` (from changesets), `known_limits` (from declared limits / OpenQuestions), plus the `AdoptionPlan`. Every field is the view's content — no invented CLI cmd / route / demo / doc / changelog line / limit. `pack.id == Hash(Canonicalize(body))` REUSES S01/S02's scheme (`assembled_at` excluded from the hashed body). Pure over `(view, capabilities, now)`. An empty view yields an empty-but-valid pack. It ASSEMBLES; it installs nothing, ships nothing, publishes nothing, writes no truth. Recorded in `fitness.release_pack` (append-only, content-addressed, agent SELECT-only — the wall §2; the aidos writer role records via a ChangeSet S20).
_Avoid_: deployer, publisher, CI pipeline, release manager, authored changelog, editorialised limits.
