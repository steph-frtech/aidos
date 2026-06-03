# BA_PLAN.md — AIDOS / Build-Agent track plan (executed by `/long-run`)

This is the **build-agent long-run index** — the track that governs the agent which codes the user's app (distinct from the app-builder `Sxx` track). `/long-run` parses this file and executes the steps below **sequentially**: per step, `step-baNN` (fallback `step-executor`) implements it, then `step-verifier` validates/corrects it; the workflow advances **only after a pass** and **resumes from cache** on restart.

Each `## BAxx` section is a parseable entry with:
- **Objectif** — the one verifiable capability the step adds (subsystem hint + its key mirror/wall/determinism obligation).
- **Detail** — `docs/plan/ROADMAP-build-agent.md`, the SAME shared doc for every step: the executor locates its `BAxx` row + the epic intro + the dependency note there. This index is a map; the roadmap is the territory.
- **Inputs** — the prior `BAxx` steps (and cited existing `Sxx` steps) this step consumes.
- **Criteres de done** — the computed done-condition for the step.

Discipline at every step: **mirror-first** (the red BDD/property/fixture mirror is named before the code) ; **the wall** (propose-not-approve — truth via `idée→miroir→/goal→ChangeSet→approbation`, never a direct write) ; **determinism-first** (the LLM is the gated exception isolated to one function) ; **declare-before-enforce** (no phantom limit, no undeclared knob) ; **fail-closed** (default-deny). "Done" is computed, never declared.

Subsystem tags: **Runtime · Kernel · Mirror · Archive · Workbench**.

---

## BA01
**Objectif:** Kernel — extend the `AgentSpec` SOURCE through `idée→miroir→/goal` (never a direct kernel write; the propose emits a `Proposal Status=proposed` needing S16 authority) to declare the above-the-line knobs projection and replay depend on — `Temperature`, `MaxTurns`, `Seed` (or `Seed` derived deterministically `Hash(impl‖pack‖item)`), `AllowedNetworkHosts` (empty → no egress), `AllowedExec` (empty → no subprocess), `ResourceLimits`, `MaxConcurrency`. A behaviour knob lives in the governed layer, never in a `providerCfg`; an undeclared knob is a determinism gap that blocks the step.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** S52
**Criteres de done:** the red property+fixture mirror is green — every new knob lives in the governed layer (never in `providerCfg`), kind-aware `Validate` holds (empty defaults = max confinement, fail-closed) ∧ the wall holds (extension proposed via `/goal` as a `Proposal Status=proposed`, never a direct kernel write) ∧ determinism-first respected (no smuggled knob).

## BA02
**Objectif:** Runtime — define the projection TYPE `AgentImplementation` (`agentimpl`): a below-the-line, content-addressed struct carrying NO truth (regenerable) with `LayerRef`, `Provider`, `Model`, `Temperature`, `MaxTurns`, `Seed`, `Tools`, `Skills`, `Hooks`, allowed/forbidden paths, network hosts, exec, resource limits, concurrency — type + invariants only, no emitter yet.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01
**Criteres de done:** the red reproducibility property mirror is green — an `AgentImplementation` can never be reconstructed into a `CoucheAgent` (no `Version`-as-truth, no `Mirror` field), mirroring the `agentrun` "a run is irrepresentable as layer" discipline ∧ the wall holds (projection below the line) ∧ determinism-first respected.

## BA03
**Objectif:** Runtime + Mirror — deterministic emitter `Project(layer, providerCfg, pack)` (`agentimpl` + `pretooluse`): same `(layer, cfg, pack)` → byte-identical `AgentImplementation` (reusing `records.Canonicalize`+`Hash`); `providerCfg` carries ONLY resolved endpoint/key, never a behaviour knob; `ForbiddenPaths` MUST equal the wall's forbidden zones — resolving OQ-S52-wall by extracting `Classify` from the S04 hook's `package main` into an importable package, single-sourcing the wall across hook, emitter and future `GateAction`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S04
**Criteres de done:** the red property mirror is green (byte-stable projection; `cfg` ignores any non-credential field; `Project` refuses a layer failing `Validate`, a `cfg` whose `Model != Spec.Modele`, a non-`IsKnownProvider`/`IsKnownModel`) ∧ the existing wall regression mirrors (`wall_bdd_test`, `wall_property_test`) pass unchanged against the extracted package (anti-overwrite §9) ∧ the wall is single-sourced ∧ determinism-first respected (pure emitter, no LLM, no clock).

## BA04
**Objectif:** Runtime — deterministic `SystemPrompt` assembly (`agentimpl`): the prompt is a pure template over the ONLY declared fields (`Role`, `Objectif`, `StopConditions`, the wall boundary in prose, `ForbiddenPaths`/`AllowedPaths` verbatim). A hand-written agent prompt is a determinism gap that blocks the step.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03
**Criteres de done:** the red fixture+property mirror is green — a given layer yields an exact golden file; identical layers → identical prompts; changing a declared field changes the prompt; no out-of-layer field can leak; the `/kernel/** /mirror/**` zones always appear in the prompt (defense in depth) ∧ determinism-first respected (the prompt is never hand-authored).

## BA05
**Objectif:** Runtime — resolve the bindings inside the implementation (`agentimpl`): `Tools[]` derive ONLY from `OutilsMCPAutorises` with `Enabled==true`; `Skills[]` only from enabled `SkillsAutorises`; `Hooks[]` from `HooksObligatoires` preserving `Mandatory` — governance can only narrow the capability surface, never widen it.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02
**Criteres de done:** the red property mirror is green — `ResolvedTools ⊆ enabled declared bindings`, `ResolvedSkills ⊆ enabled skills`, a `Mandatory` hook always survives projection (the implementation's capability surface is a provable subset of the governed layer) ∧ determinism-first respected.

## BA06
**Objectif:** Runtime + Workbench — MCP server `agentimpl` + the `/agents` panel "Implementation" section (every backend op is an MCP tool, ADR 0009). Tool `agentimpl.project(layerRef)` returns the projected `AgentImplementation` read-only (regenerable, persists nothing above the line); the route gains a deterministic, themed + bilingual view with a determinism badge (re-project → same hash), display-only (no run control — nothing executes until something is applied).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03, BA04, BA05
**Criteres de done:** the red Playwright e2e is green (select an agent → its implementation displays → forbidden paths show kernel/mirror zones, network shows "no egress" by default) ∧ the wall holds (read-only, no truth write) ∧ determinism-first respected ∧ the `/agents` Implementation section is themed (ADR 0010) + bilingual (ADR 0011, FR default).

## BA07
**Objectif:** Runtime — CAPACITY-axis enforcer `ToolAllowed(impl, server, tool) → (allowed, *BlockReason)` (`agentimpl/enforce.go`): a pure total function denying any `(server,tool)` not present as an `Enabled` binding in the resolved impl, with the NEW S13 code `AGENT_TOOL_NOT_BOUND` (full actionable form naming the `idée→miroir→/goal` door); same fail-closed shape as `MayWrite` but on the capability axis.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05
**Criteres de done:** the red property mirror is green — `ToolAllowed` true ⟺ `tool ∈ impl.Tools`, default-deny on the unknown ∧ the wall holds (the capability axis joins the zone axis) ∧ determinism-first respected (set-membership, never a judgment).

## BA08
**Objectif:** Runtime — SKILL-axis enforcer `SkillAllowed(impl, skillName) → (allowed, *BlockReason)` (`agentimpl/enforce.go`): a pure total set-membership over `impl.Skills`, denying any unbound skill with the NEW S13 code `AGENT_SKILL_NOT_BOUND` — the 3rd of the four declared axes (without it `SkillBinding.Enabled` is mere documentation, the same leak class as an ungoverned tool).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05, S35
**Criteres de done:** the red property mirror is green — `SkillAllowed` true ⟺ `skill ∈ impl.Skills`, default-deny ∧ the wall holds (skill axis governed) ∧ determinism-first respected (set-membership).

## BA09
**Objectif:** Runtime + Kernel — CONFINEMENT enforcer `PathAllowed(impl, target)` as a **fail-closed allow-list** (`agentimpl/enforce.go`): default-DENY against `AllowedPaths` (code `AGENT_PATH_NOT_ALLOWED`), DISTINCT from the `Classify` deny-list of forbidden zones; plus network/exec confinement `EgressAllowed`/`ExecAllowed` (default-deny against `AllowedNetworkHosts`/`AllowedExec`, codes `AGENT_EGRESS_NOT_ALLOWED`/`AGENT_EXEC_NOT_ALLOWED`). The agent's `Bash` is itself gated — every command passes `ExecAllowed`, never a free shell.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03, BA02
**Criteres de done:** the red property mirror is green — a path under `AllowedPaths` and outside `ForbiddenPaths` passes, everything else is denied, both invariants (deny + allow) co-exist ∧ the wall holds (confinement distinct from the zone deny-list) ∧ determinism-first respected (allow-list fail-closed, no judgment).

## BA10
**Objectif:** Runtime + Mirror — MANDATORY-HOOK enforcer `HooksSatisfied(impl, hookVerdicts) → *BlockReason` (`agentimpl/enforce.go`): a pure function consuming a per-hook verdict record (the hook binary's own deterministic exit/`BlockReason`, never an agent-self-reported set) that asserts every `HooksObligatoires{Mandatory:true}` actually ran AND is green — presence ≠ green — returning `AGENT_MANDATORY_HOOK_SKIPPED` or `AGENT_MANDATORY_HOOK_RED`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05
**Criteres de done:** the red property + FAULT-INJECTION mirrors are green — removing/reddening a mandatory hook flips `HooksSatisfied` red (hook-honesty §5); turn acceptance is gated on mandatory hooks being VERTS, not merely present ∧ the wall holds (verdict comes from the binary, never the transcript) ∧ determinism-first respected.

## BA11
**Objectif:** Runtime — per-run cost counter + budget gate (`agentimpl/budget.go` + `economics`): a pure `RunMeter` (tokens/turns/ci-minutes/wall-clock deltas) and `CheckBudget(meter, HarnessCostBudget S51, Budgets{Tokens,Turns} S29)` whose effective per-shared-axis cap is the **`min()` of both (tightest wins, fail-closed)**, cost-aware (tokens × declared rate) with a declared wall-clock deadline; code `AGENT_BUDGET_EXCEEDED`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S51, S29
**Criteres de done:** the red property mirror is green — the meter is monotone and the verdict flips exactly at the threshold `= min()` of the two caps (boundary test), no live LLM ∧ determinism-first respected (pure gate, `min()` authoritative) ∧ reuses `economics` (S51/S29).

## BA12
**Objectif:** Runtime — determinism-first ARBITER `Arbitrate(action) → DeterministicTool | LLMGated` (`agentimpl/arbiter.go`): encodes the `determinism-first` SKILL mapping table IN CODE (diff→`jj`/Myers, search→`rg`, format→biome/gofmt, codegen→S34 emitters, validate→kernel validators); intent is classified from the action's STRUCTURE (tool name + args), never from a model-supplied label.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S34, S35
**Criteres de done:** the red fixture+property mirror is green — re-labelling an action's displayed intent CANNOT change `Arbitrate`'s verdict (only structure can); if a deterministic tool exists for the structure, `Arbitrate` never returns `LLMGated` ∧ determinism-first respected (the SKILL's prose becomes authoritative code; intent by structure).

## BA13
**Objectif:** Runtime + Workbench — compose ALL enforcers into one pure `GateAction(impl, action, meter, hookVerdicts) → Decision` (`pretooluse` + `agentimpl` + `/agents`) with explicit PRECEDENCE: `Arbitrate` first → zone (`Classify` deny) → path (`PathAllowed` allow) → network/exec confinement → capacity (`ToolAllowed`) → skill (`SkillAllowed`) → budget (`CheckBudget`) → hook (`HooksSatisfied`); the existing S04 PreToolUse hook gates a governed `AgentImplementation`'s tool calls through this function. Still no autonomy — the perimeter is proven closed.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA07, BA08, BA09, BA10, BA11, BA12, S04
**Criteres de done:** the red fixture mirror + Playwright e2e are green — each axis violation (above-the-line write, out-of-`AllowedPaths` write, out-of-band tool, unbound skill, undeclared egress, budget breach, LLM action governed by a deterministic tool) returns the correct `BlockReason` from the SAME gate in precedence order, and the `/agents` panel renders the live "what would be refused" preview ∧ the wall holds (interceptor-ready single verdict) ∧ determinism-first respected ∧ UI themed + bilingual.

## BA14
**Objectif:** Runtime + Mirror — arch-fitness rule "one single LLM function" (`agentloop` + arch-fitness config): a deterministic depguard / go-arch-lint rule stating that ONLY `back/runtime/agentloop/provider*` may import the LLM SDK; any other package importing it fails the build — making "the LLM isolated to one gated exception" an enforced ARCHITECTURAL invariant rather than 25 repetitions of prose.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA13
**Criteres de done:** the red fault-injection arch mirror is green — adding an LLM-SDK import anywhere else flips the rule red ∧ determinism-first respected (the invariant becomes a rule, not prose) ∧ the wall holds.

## BA15
**Objectif:** Runtime — loop shell `Drive(impl, item, pack, sensors, budget, now)` with a MOCK action generator (`agentloop`): the deterministic shell — claim the item, per turn call `GateAction` BEFORE the action executes, on green execute, on any false verdict record `AgentAction{Autorisee:false, RaisonBlocage}`, tick the `RunMeter`, loop until `goal.IsClosed` OR budget breach OR `StopConditions` → emit a complete `agentrun.AgentRun` via `Record`. The LLM is mocked by a deterministic scripted sequence.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA13, S29, S33, S42
**Criteres de done:** the red fixture mirror (state→cmd→events) is green — a sequence with an above-the-line write yields a run whose action is `Autorisee:false` and whose `Result` is computed by `goal.IsClosed`, never self-reported ∧ the wall holds (interceptor before execution) ∧ determinism-first respected (pure shell modelled on `evolve.Evolve`).

## BA16
**Objectif:** Runtime — deterministic re-check of EVERY action + acceptance condition (`agentloop`): after each action a deterministic post-check per nature — a code-changing action → the relevant mirror/sensor (`goal.SensorState`), accepting only if the sensor agrees; a *propose* → a schema/shape-check; a *read* → a no-op-allowed assertion. An action without a deterministic post-check is itself a determinism gap that blocks the step.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15
**Criteres de done:** the red property mirror is green — `Drive`'s `Result` is a pure function of the verdicts (gate + post-check) + budget + wall, invariant to the agent's claimed confidence ∧ determinism-first respected (the judge is the mirror; EVERY action re-checked, not only code-changing ones) ∧ the wall holds.

## BA17
**Objectif:** Runtime — real OS/Postgres sandbox binding + the LLM as the single gated exception (`agentloop` + `agentimpl`): bound the loop to a real OS/container sandbox under the `aidos_agent` Postgres role (GRANTs are the level-3 fail-closed backstop, the wall hook level-1, the prompt `ForbiddenPaths` the soft level); the app tree is the ONLY writable root (the OS mirror of the `PathAllowed` allow-list), fail-closed egress, exec allow-list, cgroup/ulimit; the LLM call is isolated to one `GenerateAction(impl, transcript)` behind an `ActionGenerator` interface (renamed to avoid the `agentlayer.Provider` collision) with a deterministic fake, and the provider hard-stops streaming at the token cap.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15, BA16, BA11
**Criteres de done:** the red fixture (provider fake) + three-level fault-injection mirrors are green — a generated write to a non-`AllowedPaths` path is refused by the FS boundary AND the hook AND would miss the GRANT; an egress to an undeclared host is refused at the boundary AND the gate (defense in depth proven) ∧ the wall holds (FS allow-list + hook deny-list + GRANT) ∧ determinism-first respected (LLM isolated behind `ActionGenerator` + fake).

## BA18
**Objectif:** Runtime — agent identity/auth toward MCP servers (`agentloop` + `agentimpl/identity.go`): the loop presents its `AgentImplementation` content-hash as a **capability token** that each MCP server (`agentimpl`/`scheduler`/`agentloop`) verifies, so `owner_agent`/`owner` is not forgeable; a call without a valid token (or for another identity) is refused.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, BA06
**Criteres de done:** the red property+fixture mirror is green — an MCP call is accepted only if the token binds the calling process to exactly that `CoucheAgent@version` ∧ the wall holds (the writer's identity is proven, not chain-declared) ∧ determinism-first respected.

## BA19
**Objectif:** Runtime + Workbench — MCP server `agentloop` + the `/agents` "Run" controls + N0 JOURNEY mirror (`agentloop` + `/agents`): gated tools `agentloop.drive(layerRef, redWorkItemRef)` (refused if the impl fails `GateAction`) and `agentloop.watch(runId)`; a Godog journey proves the full single-agent happy-path with the fake provider (idle→claim→gate→green→ledger), plus a Testcontainers integration mirror asserting that an unbound tool is refused at the TRANSPORT boundary (the enforcer is on the call path, not just a unit return). `/agents` gains action-capable "Lancer un run" controls + a live action/verdict timeline.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, BA18, S22
**Criteres de done:** the red journey N0 + transport-integration + Playwright e2e are green — launching a run against a red item renders the action timeline, a forbidden-zone action shows its `BlockReason`, and the run never writes truth ∧ the wall holds (launch is below the line; truth via propose→ChangeSet→approbation) ∧ determinism-first respected ∧ the `/agents` Run section is action-capable, themed + bilingual with a Playwright e2e.

## BA20
**Objectif:** Archive + Runtime — scheduler role + migration + fencing (`migrations` + `scheduler`): a NEW Postgres role `aidos_scheduler` with `UPDATE` on `runtime.red_work_queue` (`status`/`owner_agent`/`lease_until`/`lease_epoch`) and explicit SELECT on the agent-layer source view (to `MatchRole`); the agent role stays `INSERT+SELECT` only; `AgentAssignment` gains a monotone `LeaseEpoch`; expand-contract, forward-only, append-only audit (Atlas).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01, S22
**Criteres de done:** the red migration-roundtrip+GRANT mirror is green — the scheduler role transitions `open→claimed` but the agent role CANNOT, and the scheduler has NO write on any truth schema (explicit GRANT assertion) ∧ the wall holds (distinct fail-closed role, fencing) ∧ determinism-first respected.

## BA21
**Objectif:** Runtime — deterministic role-matching `MatchRole(item, agents) → (chosenAgentRef, ok)` + starvation detector (`scheduler`): a pure function mapping `RedWorkItem.Layer` (via S22 `layerRank`) to a `CoucheAgent` by `Spec.Role`; anti-starvation — if the mirror-first queue head has no free role-matched agent for N ticks, emit a `still_red`-class signal feeding the BA28 on-ramp.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA20, S22
**Criteres de done:** the red property mirror is green — `MatchRole` is deterministic, total (no match → `ok=false`, never a panic), respects mirror-first order, and starvation is surfaced as a signal ∧ determinism-first respected (matching is an algorithm on declared roles, never an LLM prompt) ∧ the wall holds.

## BA22
**Objectif:** Runtime — lease/expire engine with a tick driver + write-path fencing (`scheduler`): pure `Schedule(queueState, agents, now)` emitting `AgentAssignments` + transitions — lease an item only if its (JSONB) dependencies are all `resolved`, write `AgentAssignment{LeaseJusqua, LeaseEpoch++}`, `open→claimed`, EXPIRE stale leases (`claimed→open` when `lease_until<now`); a Go ticker (the SOLE impure shell) supplies `now` per tick; every write carries its `LeaseEpoch` and the gate REFUSES a stale-epoch write (`AGENT_LEASE_FENCED`), no lost-update; queue.status and assignment.statut stay jointly consistent.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA20, BA21, S22
**Criteres de done:** the red fixture (hand-off) + property (invariants + fencing) mirrors are green — never leases a blocked item, an upstream resolution unblocks at the next tick, leases are idempotent, a dead agent's item is reclaimed at the next tick without a human, a fenced stale-epoch write is refused ∧ determinism-first respected (pure planner, `now` injected by the ticker) ∧ the wall holds (new code `AGENT_LEASE_FENCED`).

## BA23
**Objectif:** Runtime + Workbench — MCP server `scheduler` + the `/agents` "Queue & Dispatch" panel under the scheduler role (`scheduler` + `/agents`): tools `scheduler.tick()` (runs `Schedule`, applies transitions atomically, checks the epoch) and `scheduler.assignments()`; the panel renders the mirror-first queue, status/owner/lease/epoch per item, blocked items with unresolved deps, free agents per role, a starvation alert, with action-capable "Dispatch next" and "Reclaim expired".
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA22
**Criteres de done:** the red Playwright e2e is green — enqueue fixture items with a dependency → tick → the dependent stays `blocked` until upstream resolves then leases to the role-matched agent, and an expired lease is reclaimed at the tick (no human needed) ∧ the wall holds (dispatch writes telemetry/leases below the line, never truth) ∧ determinism-first respected ∧ the `/agents` Queue & Dispatch panel is action-capable, themed + bilingual.

## BA24
**Objectif:** Kernel — immutable-per-run `OrchestrationPolicy` + kind-aware `Validate` (`agentlayer`): add an `OrchestrationPolicy` to `CoucheAgent` (proposed via `idée→miroir→/goal`, a `Proposal Status=proposed` needing S16 authority) declaring claim arbitration, fan-out/fan-in, same-file conflict policy, and `MaxConcurrency` + per-role caps; `Validate` becomes kind-aware (an orchestration layer REQUIRES a policy + non-empty team; an agent layer must not carry one); a run pins a policy `@version` (no mid-run adaptation); same-file conflict serializes and merges via `merge-semantic`, `ResolveConflict` being only the who-goes-first tiebreak (by `layerRank` then content-hash, never an LLM or coin-flip).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01, S16
**Criteres de done:** the red property+fixture mirror is green — `ResolveConflict` is total and deterministic with NEVER a lost-update, orchestration writes no truth, the property stays red until the policy lands ∧ the wall holds (proposed via `/goal`, immutable per-run) ∧ determinism-first respected (conflict merged by rule, never by race).

## BA25
**Objectif:** Runtime + Workbench — multi-agent coordination in the scheduler (`scheduler` + `/agents`): extend `Schedule` to N contending agents under an `OrchestrationPolicy` — lease arbitration (`ResolveConflict` picks who goes first, the other waits), dependency-driven hand-off, same-file serialization + merge-semantic, and the declared `MaxConcurrency` never exceeded (enforce the number declared in BA01/BA24, not a phantom).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA22, BA24
**Criteres de done:** the red fixture (journey) + property (at-most-one-lease, declared-concurrency) mirrors + Playwright e2e are green — two agents, items A→B with distinct roles, full hand-off proven; at most `MaxConcurrency` live leases, at most one live lease per item at any `now`, zero lost-update on a shared target, and the "Team" panel renders fan-out + hand-offs + concurrency-vs-cap live ∧ the wall holds (orchestration coordinates, the wall holds for each member) ∧ determinism-first respected ∧ UI action-capable, themed + bilingual.

## BA26
**Objectif:** Runtime — mirror-gated `AgentRun` schema extension for replay (`agentrun`): `AgentRun` gains `Impl` (the `AgentImplementation` content-hash), `Seed` (declared in BA01 or derived `Hash(impl‖pack‖item)`), and a `ProviderTranscript` ref; the content-address scheme is extended EXPLICITLY (a new `@version` of the record, append-only, never an in-place hash mutation) — an announced back-fill, not a BA27 side-effect.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, S52
**Criteres de done:** the red property+migration-roundtrip mirror is green — a legacy seedless `AgentRun` stays readable, a new run carries a seed ∧ anti-overwrite §9 respected (supersede via version, never a hash mutated in passing) ∧ the wall holds ∧ determinism-first respected.

## BA27
**Objectif:** Runtime — wire the live meter + halt-on-budget into the loop (`agentloop` + `economics`): wire the `RunMeter` (BA11) into `Drive` so tokens/CI-minutes/wall-clock accumulate AS THEY GO and `CheckBudget` halts on breach, recording `Result:abandoned` with the breached axis; the budget check runs BEFORE each `GenerateAction` (refuse to START a turn that would overrun) + provider streaming hard-stop at the cap, the `min()` of caps authoritative; feed the finished run's `MeasuredCost` to `economics.Evaluate` (never fed by an `AgentRun` until now).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15, BA11, BA26, S51, S29
**Criteres de done:** the red fixture (halt) + property (monotone) mirrors are green — a run breaching the token budget at turn N stops at/before N with `Result:abandoned`, the loop never crosses a turn beyond the cap (anti-runaway proven pre-call), and `economics.Evaluate` receives the cost-aware measured cost ∧ determinism-first respected (deterministic, pre-call halt) ∧ reuses `economics` (S51/S29).

## BA28
**Objectif:** Runtime — replay + reproducibility + redacted transcript (`agentloop` + `agentrun`): `Replay(run)` re-derives an identical `AgentRun` from the recorded inputs (`impl`, `pack`, `item`, `seed`, provider responses), reusing `records.Hash` (mirroring `evolve`'s replay-by-seed); the persisted transcript (system prompt + `ContextPack`, possibly app code/env/secrets) is **redacted/hashed for confined fields BEFORE persistence** (or encrypted under a key the agent role cannot read); the `ActionGenerator` records its (redacted) responses so replay needs no live LLM.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA26, BA27, S42
**Criteres de done:** the red property (replay) + property (secret-non-leak) mirrors are green — `Replay(run).ID == run.ID` for any recorded run, and a known secret pattern in the input never appears verbatim in the replay record ∧ the wall holds (the ledger is not a secrets store) ∧ determinism-first respected (reproducibility extended to the runtime).

## BA29
**Objectif:** Runtime + Workbench — effect-log + `AgentRun` ledger: reality-faithful audit + observability (`agentloop`/`telemetry-reader` + `/agents`): an INDEPENDENT effect-log captures EVERY FS write and EVERY MCP call **at the boundary** (not by the loop's self-report), reconciled against the replayed actions (hash-equality proves the record re-derives, not that the real run matched it); a read-only deterministic ledger query (tool `agentloop.ledger(filter)`) over `runtime.agent_run/action/assignment` + the effect-log; the `/agents` "Ledger" panel renders queryable history, per-`BlockReason` refusal counts, and a per-run timeline with wall verdicts + reconciled effects.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA28, BA19
**Criteres de done:** the red Testcontainers + Playwright e2e are green — a mixed-verdict run renders its timeline + refusal counts (an `AGENT_WRITE_ABOVE_WATERLINE` renders with its `how_to_fix`), replay-equality + effect-reconciliation together = auditable ∧ the wall holds (read-only, effects captured at the boundary) ∧ determinism-first respected ∧ the `/agents` Ledger panel is themed + bilingual.

## BA30
**Objectif:** Runtime — bridge `RunToSignal(run) → (reality.Signal, ok)` with identity-by-pattern (`reality` + `agentloop`): a `still_red` after budget exhaustion, a recurring refusal pattern, or an `abandoned` maps to a `reality.Signal` carrying "agent run R failed on goal G" provenance; a GREEN-but-hollow run (high refusal-count thrashing, near-budget, many `Arbitrate→LLMGated`) emits a lower-severity signal; an ordinary green run yields `(_, false)`; the signal identity is content-addressed on the **pattern** (refusal code + layer-kind + cause class), NOT the run id, so distinct runs sharing a failure mode collapse into one recurring signal.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA27, BA29, S43
**Criteres de done:** the red property + honesty mirrors are green — failed/abandoned AND green-anomalous runs produce a signal carrying the `incident_derived` taint, the `cause_sketch` is a hypothesis carried in `Learn` and never a truth, and `Recurrence` increments because identity is by pattern not run-id ∧ the wall holds (hypothesis, never truth) ∧ determinism-first respected (pure total classifier, identity-by-pattern).

## BA31
**Objectif:** Runtime + Archive + Workbench — the loop emits the signal on a failed/abandoned/green-hollow terminal, feeding `reality.Observe→Learn→ToIdea` to produce a DRAFT `ideas.Idea` — proposed, NEVER applied (`reality.ToKernel` always refuses the direct Incident→Kernel edge `REALITY_CANNOT_DECLARE_TRUTH`); apply-time provenance gate — a `Proposal{Status:"admitted"}` fabricated in memory without a matching S16 authority record is refused (`PROPOSAL_NOT_ADMITTED`); reuses the `idea-intake` MCP; `/agents` "Learnings" + `/incidents-to-ideas` show a failed/green-hollow run as an incident with its cause sketch and a one-click "derive idea" opening the S27 draft.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA30, S43, S27, S16
**Criteres de done:** the red fixture (integration) + fault-injection + Playwright e2e are green — an abandoned run → incident → draft idea `Status=proposed` with provenance and NO kernel write (OpenQuestion recorded when `proposes` is unpinned), a recurring wall-refusal pattern AND a recurring green-but-thrashing pattern surface a "harden-the-harness" idea, and a forged `admitted` is refused ∧ the wall holds (the only legal door + provenance verified at apply) ∧ determinism-first respected ∧ the `/agents` Learnings panel is themed + bilingual.
