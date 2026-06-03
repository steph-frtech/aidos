# BA_PLAN.md — AIDOS / Build-Agent track plan (executed by `/long-run`)

This is the **build-agent long-run index** — the track governing the agent that codes the user's app (distinct from the app-builder `Sxx` track). `/long-run` parses this file and executes the steps **sequentially**: per step `step-baNN` (fallback `step-executor`) implements it, then `step-verifier` validates/corrects it; advance **only after a pass**, **resume from cache**.

Brief complet par étape : voir docs/plan/ROADMAP-build-agent.md (chaque Detail y pointe).

Each `## BAxx` entry has: **Objectif** (the one capability), **Detail** (the shared roadmap row), **Inputs** (prior steps consumed), **Criteres de done** (the computed done-condition). Discipline every step: mirror-first, the wall (propose-not-approve), determinism-first, declare-before-enforce, fail-closed. "Done" is computed, never declared. Subsystems: **Runtime · Kernel · Mirror · Archive · Workbench**.

---

## BA01
**Objectif:** Kernel — extend the `AgentSpec` source with the above-the-line behaviour knobs (Temperature, MaxTurns, Seed, confinement, limits).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** S52
**Criteres de done:** the red property+fixture mirror is green ∧ knobs governed (never in providerCfg) ∧ the wall holds ∧ determinism-first.

## BA02
**Objectif:** Runtime — define the below-the-line projection type `AgentImplementation` (`agentimpl`): regenerable struct, no truth.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01
**Criteres de done:** the red reproducibility mirror is green ∧ an impl can never be reconstructed into a layer ∧ the wall holds ∧ determinism-first.

## BA03
**Objectif:** Runtime + Mirror — deterministic emitter `Project(layer, providerCfg, pack)`: byte-identical impl, wall single-sourced.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S04
**Criteres de done:** the red property mirror is green ∧ the existing wall regression mirrors pass unchanged ∧ the wall is single-sourced ∧ determinism-first.

## BA04
**Objectif:** Runtime — deterministic `SystemPrompt` assembly (`agentimpl`): a pure template over only the declared layer fields.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03
**Criteres de done:** the red fixture+property mirror is green ∧ identical layers → identical prompts, kernel/mirror zones always present ∧ determinism-first.

## BA05
**Objectif:** Runtime — resolve the impl bindings (`agentimpl`): Tools/Skills/Hooks derive only from enabled declared bindings.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02
**Criteres de done:** the red property mirror is green ∧ the impl's capability surface is a provable subset of the layer ∧ determinism-first.

## BA06
**Objectif:** Runtime + Workbench — MCP server `agentimpl` + the `/agents` Implementation panel (read-only, display-only).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03, BA04, BA05
**Criteres de done:** the red Playwright e2e is green ∧ the wall holds (read-only) ∧ determinism-first ∧ the panel is themed + bilingual.

## BA07
**Objectif:** Runtime — capacity-axis enforcer `ToolAllowed` (`agentimpl/enforce.go`): fail-closed set-membership over bound tools.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05
**Criteres de done:** the red property mirror is green ∧ default-deny on the unknown ∧ the wall holds ∧ determinism-first.

## BA08
**Objectif:** Runtime — skill-axis enforcer `SkillAllowed` (`agentimpl/enforce.go`): fail-closed set-membership over bound skills.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05, S35
**Criteres de done:** the red property mirror is green ∧ default-deny ∧ the wall holds ∧ determinism-first.

## BA09
**Objectif:** Runtime + Kernel — confinement enforcers (`agentimpl/enforce.go`): fail-closed allow-lists for path, egress, exec.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA03, BA02
**Criteres de done:** the red property mirror is green ∧ both deny and allow invariants co-exist ∧ the wall holds ∧ determinism-first.

## BA10
**Objectif:** Runtime + Mirror — mandatory-hook enforcer `HooksSatisfied` (`agentimpl/enforce.go`): a mandatory hook must have run AND be green.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA05
**Criteres de done:** the red property + fault-injection mirrors are green ∧ verdict comes from the binary, not the transcript ∧ the wall holds ∧ determinism-first.

## BA11
**Objectif:** Runtime — per-run cost counter + budget gate (`agentimpl/budget.go` + `economics`): the tightest of the two caps wins.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S51, S29
**Criteres de done:** the red property mirror is green ∧ monotone meter, verdict flips at `min()` of caps ∧ determinism-first ∧ reuses `economics`.

## BA12
**Objectif:** Runtime — determinism-first arbiter `Arbitrate` (`agentimpl/arbiter.go`): the skill's mapping table in code, intent by structure.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA02, S34, S35
**Criteres de done:** the red fixture+property mirror is green ∧ re-labelling intent cannot change the verdict, deterministic tool wins ∧ determinism-first.

## BA13
**Objectif:** Runtime + Workbench — compose all enforcers into one pure `GateAction` with explicit precedence (`pretooluse` + `agentimpl` + `/agents`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA07, BA08, BA09, BA10, BA11, BA12, S04
**Criteres de done:** the red fixture mirror + Playwright e2e are green ∧ each axis returns its BlockReason in order ∧ the wall holds ∧ determinism-first ∧ UI themed + bilingual.

## BA14
**Objectif:** Runtime + Mirror — arch-fitness rule "one single LLM function" (`agentloop` + arch-fitness): only `provider*` may import the SDK.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA13
**Criteres de done:** the red fault-injection arch mirror is green ∧ an LLM-SDK import elsewhere flips it red ∧ determinism-first ∧ the wall holds.

## BA15
**Objectif:** Runtime — loop shell `Drive` with a mock action generator (`agentloop`): gate before each action, tick the meter, emit an `AgentRun`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA13, S29, S33, S42
**Criteres de done:** the red fixture mirror (state→cmd→events) is green ∧ Result computed by `goal.IsClosed`, never self-reported ∧ the wall holds ∧ determinism-first.

## BA16
**Objectif:** Runtime — deterministic post-check of every action + acceptance condition (`agentloop`): one check per action nature.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15
**Criteres de done:** the red property mirror is green ∧ Result is a pure function of verdicts + budget + wall, invariant to claimed confidence ∧ determinism-first ∧ the wall holds.

## BA17
**Objectif:** Runtime — real OS/Postgres sandbox binding + the LLM as the single gated exception behind `ActionGenerator` (`agentloop` + `agentimpl`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15, BA16, BA11
**Criteres de done:** the red fixture + three-level fault-injection mirrors are green ∧ defense in depth proven ∧ the wall holds (FS + hook + GRANT) ∧ determinism-first.

## BA18
**Objectif:** Runtime — agent identity/auth toward MCP servers (`agentloop` + `agentimpl/identity.go`): the impl content-hash as a capability token.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, BA06
**Criteres de done:** the red property+fixture mirror is green ∧ a call is accepted only if the token binds the process to that `CoucheAgent@version` ∧ the wall holds ∧ determinism-first.

## BA19
**Objectif:** Runtime + Workbench — MCP server `agentloop` + the `/agents` Run controls + N0 journey mirror (`agentloop` + `/agents`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, BA18, S22
**Criteres de done:** the red journey N0 + transport-integration + Playwright e2e are green ∧ the run never writes truth ∧ the wall holds ∧ determinism-first ∧ Run section action-capable, themed + bilingual.

## BA20
**Objectif:** Archive + Runtime — scheduler role + migration + fencing (`migrations` + `scheduler`): a new `aidos_scheduler` role with lease writes.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01, S22
**Criteres de done:** the red migration-roundtrip+GRANT mirror is green ∧ scheduler transitions but has no truth write, agent stays insert+select ∧ the wall holds ∧ determinism-first.

## BA21
**Objectif:** Runtime — deterministic role-matching `MatchRole` + starvation detector (`scheduler`): maps a red item to an agent by declared role.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA20, S22
**Criteres de done:** the red property mirror is green ∧ matching is total, mirror-first, starvation surfaced as a signal ∧ determinism-first ∧ the wall holds.

## BA22
**Objectif:** Runtime — lease/expire engine `Schedule` + tick driver + write-path fencing (`scheduler`): lease, expire stale, refuse stale-epoch writes.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA20, BA21, S22
**Criteres de done:** the red fixture + property (invariants + fencing) mirrors are green ∧ dead-agent items reclaimed, fenced writes refused ∧ determinism-first ∧ the wall holds.

## BA23
**Objectif:** Runtime + Workbench — MCP server `scheduler` + the `/agents` Queue & Dispatch panel under the scheduler role (`scheduler` + `/agents`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA22
**Criteres de done:** the red Playwright e2e is green ∧ deps gate leasing, expired leases reclaim at tick ∧ the wall holds ∧ determinism-first ∧ panel action-capable, themed + bilingual.

## BA24
**Objectif:** Kernel — immutable-per-run `OrchestrationPolicy` + kind-aware `Validate` (`agentlayer`): arbitration, fan-out/in, concurrency caps.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA01, S16
**Criteres de done:** the red property+fixture mirror is green ∧ `ResolveConflict` total, deterministic, no lost-update ∧ the wall holds (proposed via /goal) ∧ determinism-first.

## BA25
**Objectif:** Runtime + Workbench — multi-agent coordination in the scheduler (`scheduler` + `/agents`): N agents under an `OrchestrationPolicy`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA22, BA24
**Criteres de done:** the red fixture + property (at-most-one-lease, declared-concurrency) mirrors + Playwright e2e are green ∧ the wall holds ∧ determinism-first ∧ UI action-capable, themed + bilingual.

## BA26
**Objectif:** Runtime — mirror-gated `AgentRun` schema extension for replay (`agentrun`): adds Impl hash, Seed, transcript ref as a new version.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA17, S52
**Criteres de done:** the red property+migration-roundtrip mirror is green ∧ legacy seedless runs stay readable, supersede via version ∧ the wall holds ∧ determinism-first.

## BA27
**Objectif:** Runtime — wire the live meter + halt-on-budget into the loop (`agentloop` + `economics`): pre-call halt, feed measured cost to `economics`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA15, BA11, BA26, S51, S29
**Criteres de done:** the red fixture (halt) + property (monotone) mirrors are green ∧ a breaching run stops at/before the cap with `Result:abandoned` ∧ determinism-first ∧ reuses `economics`.

## BA28
**Objectif:** Runtime — replay + reproducibility + redacted transcript (`agentloop` + `agentrun`): `Replay` re-derives an identical run, confined fields redacted.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA26, BA27, S42
**Criteres de done:** the red property (replay) + property (secret-non-leak) mirrors are green ∧ `Replay(run).ID == run.ID`, secrets never verbatim ∧ the wall holds ∧ determinism-first.

## BA29
**Objectif:** Runtime + Workbench — boundary effect-log + `AgentRun` ledger + observability (`agentloop`/`telemetry-reader` + `/agents`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA28, BA19
**Criteres de done:** the red Testcontainers + Playwright e2e are green ∧ replay-equality + effect-reconciliation = auditable ∧ the wall holds (read-only) ∧ determinism-first ∧ Ledger panel themed + bilingual.

## BA30
**Objectif:** Runtime — bridge `RunToSignal` with identity-by-pattern (`reality` + `agentloop`): failed/abandoned/green-hollow runs map to a `reality.Signal`.
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA27, BA29, S43
**Criteres de done:** the red property + honesty mirrors are green ∧ signal carries `incident_derived` taint, `Recurrence` increments by pattern ∧ the wall holds (hypothesis) ∧ determinism-first.

## BA31
**Objectif:** Runtime + Archive + Workbench — the loop emits the signal feeding `Observe→Learn→ToIdea` into a DRAFT idea, proposed never applied (`agentloop` + `reality` + `/agents`).
**Detail:** docs/plan/ROADMAP-build-agent.md
**Inputs:** BA30, S43, S27, S16
**Criteres de done:** the red fixture + fault-injection + Playwright e2e are green ∧ draft idea with provenance, no kernel write, forged `admitted` refused ∧ the wall holds ∧ determinism-first ∧ Learnings panel themed + bilingual.
