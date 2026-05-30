# AIDOS Runtime

The harness (_harnais_) that runs everything: probabilistic search wrapped in deterministic acceptance. It orchestrates and enforces the truth but can never reach its own fitness or the wall.

## Language

**harnais (harness)**:
Everything surrounding the model — `Agent = Modèle + Harness`. The versioned, self-evolvable engine that wraps loops, skills, hooks, sensors, generators, context and archive, yet may never edit its own fitness or the wall.
_Avoid_: framework, wrapper, scaffolding, orchestrator (generic), runtime-as-language-runtime.

**sensor**:
A detector that verifies a projection against its source, in one of three regimes — `computational` (deterministic), `inferential` (LLM-judge, guarded), or `meter` (budget). A sensor that never fires is dead.
_Avoid_: check, validator, monitor, test.

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
