// Package blockreason is the canonical, single home of the AIDOS BlockReason — the
// actionable refusal shape reused at every KRD block site (CLAUDE.md §2, KRD §44.5).
//
// KRD §44.5: "Le mur doit bloquer sans devenir une prison. Chaque blocage doit
// expliquer quoi faire." A wall without a BlockReason becomes a prison — every
// refusal names the door out. This package gives the wall, completeness, and the
// scope/authority checks one common vocabulary: a code, a severity, a human
// explanation, and a non-empty how_to_fix resolution path.
//
// BELOW THE WATERLINE (CLAUDE.md §2/§8): a BlockReason is Runtime plumbing — it
// writes no truth, it is not a kernel truth. The Code enum is CLOSED and small: the
// three S13 codes (MISSING_MIRROR, MISSING_AUTHORITY, OUT_OF_SCOPE) plus the
// inherited AGENT_WRITE_ABOVE_WATERLINE (S04's wall). No code is invented beyond a
// human red.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): For and Render are pure total functions of
// their input — no clock, no rng, no I/O — so the same code always yields the same
// BlockReason and the same rendering. The reproducibility mirror
// (blockreason_property_test.go) pins that, and pins the prison-forbidding invariant
// (every code has a non-empty fix path).
package blockreason

import (
	"fmt"
	"strings"
)

// Code is the stable, machine-readable code of a refusal. The set is CLOSED —
// declared here, never discovered at runtime — so the Workbench /why-blocked
// projection and `aidos explain` enumerate exactly these.
type Code string

const (
	// CodeMissingMirror — a truth has no living mirror (the completeness law, KRD
	// §29/§44.5). The canonical KRD §44.5 example code.
	CodeMissingMirror Code = "MISSING_MIRROR"
	// CodeMissingAuthority — a change requires an authority that has not been
	// assigned (the AuthorityGraph, KRD §44.5 how_to_fix `assign_authority`).
	CodeMissingAuthority Code = "MISSING_AUTHORITY"
	// CodeOutOfScope — a write targets a layer outside the declared TruthScope
	// (KRD §118.2 forbidden: out_of_scope).
	CodeOutOfScope Code = "OUT_OF_SCOPE"
	// CodeAgentWriteAboveWaterline — an agent attempted to write a truth zone above
	// the waterline. INHERITED from S04's wall (back/hooks/pretooluse); folded in
	// here via a ChangeSet + SemanticDiff so the wall can import this one home
	// instead of re-declaring the shape.
	CodeAgentWriteAboveWaterline Code = "AGENT_WRITE_ABOVE_WATERLINE"
	// CodeNoMirrorNoKernel — an idea was promoted toward the kernel WITHOUT a
	// mirror. The only door from idea to truth is `idea → mirror → /goal → freeze`
	// (KRD §116/§118/§119.1): an idea with no mirror can NEVER enter the kernel.
	// ADDED at S27 (the ideas lifecycle) — an additive extension of the closed enum
	// recorded by a ChangeSet + SemanticDiff (change_type: refine, never a removal).
	CodeNoMirrorNoKernel Code = "NO_MIRROR_NO_KERNEL"
	// CodeSpikeWriteEscapesZone — while an idea is `spiking` (ratchet OFF, T0,
	// throwaway), a write whose path ESCAPES the `/spike` prefix. The spike must not
	// leak into /kernel or /src (KRD §84/§60.x). ADDED at S28 (exploration gestures),
	// ADR 0023 — additive enum extension (change_type: refine, never a removal).
	CodeSpikeWriteEscapesZone Code = "SPIKE_WRITE_ESCAPES_ZONE"
	// CodeHarvestCannotFreeze — `/harvest` attempted to write the kernel or a mirror
	// directly. Harvest PROPOSES a DRAFT Truth; it never freezes. The freeze is the
	// separate later `/goal` (KRD §116/§118). ADDED at S28 (exploration gestures),
	// ADR 0023 — additive enum extension (change_type: refine, never a removal).
	CodeHarvestCannotFreeze Code = "HARVEST_CANNOT_FREEZE"
	// CodeIdeaWithoutMirror — `/goal` was opened on an idea with no mirror_delta. An
	// idea without a mirror is a *vœu* / monster: the only door to truth is
	// idea → mirror → /goal (KRD §57, LIVRE XX). The goal is refused; no ChangeSet is
	// opened. ADDED at S29 (goal engine) — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff.
	CodeIdeaWithoutMirror Code = "IDEA_WITHOUT_MIRROR"
	// CodeNoRedSet — `/goal` was opened on an idea whose mirror is ALREADY green: the
	// derived red set is empty. A test already green is not a goal — there is nothing
	// to close (KRD §56). The goal is refused. ADDED at S29 (goal engine) — additive
	// enum extension (change_type: refine, never a removal).
	CodeNoRedSet Code = "NO_RED_SET"
	// CodeGoalStillRed — the non-gameable stop (KRD §57 Algorithme ①/§8) refused to
	// CLOSE a goal: at least one of the four computed conditions fails (a still-red
	// mirror, a broken prior green, mutation < threshold, or a monster). "Done" is
	// COMPUTED, never declared — the engine never reads the agent's confidence. ADDED
	// at S29 (goal engine) — additive enum extension (change_type: refine, never a
	// removal).
	CodeGoalStillRed Code = "GOAL_STILL_RED"
	// CodeMemoryCannotDeclareTruth — the MemoryFirewall (KRD §119.1) refused the direct
	// edge Memory → Kernel: a `MemoryItem` is context fuel, never truth. No memory enters
	// /kernel except through the mandatory one-way flow
	// Memory → ContextPack → Idea → Mirror → Goal → Kernel — regardless of its confidence
	// or taint (even a clean, fully-confident memory is still not truth). "Memory proposes;
	// the kernel declares." ADDED at S30 (memory firewall) — additive enum extension
	// (change_type: refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeMemoryCannotDeclareTruth Code = "MEMORY_CANNOT_DECLARE_TRUTH"
	// CodeHistoricalImpactRequiresMigration — a change whose DataTruthScope.applies_to
	// touches existing_records/historical_records (a historical-impact change, KRD §44.3
	// "les données ont leur propre inertie") was made WITHOUT a declared migration.
	// Changing the truth of the code does not automatically change the truth of data
	// already produced: a historical-impact change REQUIRES a declared migration
	// (migration.required:true, a strategy in the closed §44.3 set, preserve_old_truth:true)
	// or it is refused — never a silent schema edit over historical data. ADDED at S37
	// (the db projection / DataTruthScope) — additive enum extension (change_type: refine,
	// never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeHistoricalImpactRequiresMigration Code = "HISTORICAL_IMPACT_REQUIRES_MIGRATION"
	// CodeUnknownMigrationStrategy — a DataTruthScope declared a migration.strategy
	// outside the CLOSED §44.3 set {expand_contract, backfill, dual_read, dual_write}.
	// A strategy is never guessed or coerced: an unknown strategy is refused (honesty,
	// CLAUDE.md §8 — never invent a business rule). ADDED at S37 (the db projection /
	// DataTruthScope) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeUnknownMigrationStrategy Code = "UNKNOWN_MIGRATION_STRATEGY"
	// CodeSandboxWriteEscapesZone — while an /evolve run is active (the EvolutionSandbox
	// is open, KRD §66.1), a write whose path ESCAPES the can_write set
	// {/branches/evolution, /reports, /ideas/proposed} — typically a write to /kernel,
	// /mirrors/above, /authority, or /fitness (the cannot_write set), or any path outside
	// the can_write prefixes. "L'évolution explore, elle ne gouverne pas" : the medium
	// loop may produce candidates, branches, scores, hypotheses, suggestions — never
	// truths, approvals, exceptions, or rights. The §66.1 cannot_write set IS the §2 wall.
	// ADDED at S42 (the EvolutionSandbox) — additive enum extension (change_type: refine,
	// never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeSandboxWriteEscapesZone Code = "SANDBOX_WRITE_ESCAPES_ZONE"
	// CodeSandboxEscape — a per-project workspace (S82) attempted to read or write OUTSIDE
	// its own workspace root: another project's source/build tree, or the AIDOS truth-store.
	// Each project's generated code lives in an ISOLATED runtime workspace (container + git/jj
	// repo + worktree); project A can never observe project B's tree/build nor the truth-store
	// (the cross-project isolation done-criterion). ADDED at S82 (per-project sandbox
	// provisioning) — additive enum extension (change_type: refine, never a removal).
	CodeSandboxEscape Code = "SANDBOX_ESCAPE"
	// CodeSandboxResourceLimit — a per-project workspace (S82) exceeded one of its declared
	// resource caps (CPU / memory / disk / wall-clock) — a runaway, fork-bomb or disk-filler.
	// The cgroup/ulimit kills it (anti noisy-neighbor): one project can never starve another.
	// ADDED at S82 — additive enum extension (change_type: refine, never a removal).
	CodeSandboxResourceLimit Code = "SANDBOX_RESOURCE_LIMIT"
	// CodeSandboxCannotGovern — the /evolve loop attempted to write a truth / approval /
	// exception / right directly (a kernel freeze, a mirror, an authority approval, a
	// fitness/exception). The evolution PROPOSES; the human FREEZES via /goal (KRD
	// §118/§132). Even a green-mirror, out-of-sample-green, authority-approved variant
	// yields only a promotion PROPOSAL — never the freeze itself. ADDED at S42 (the
	// EvolutionSandbox) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeSandboxCannotGovern Code = "SANDBOX_CANNOT_GOVERN"
	// CodeRealityCannotDeclareTruth — the RealityMirror (KRD §53/§67/§117/§1099) refused
	// the direct edge Incident → Kernel: a prod incident / telemetry signal is REALITY, never
	// a truth. Reality is a sensor that READS the world and PROPOSES — it never writes the
	// kernel. Judging that the world disagrees with the kernel is a TRUTH DECISION, above the
	// line, owned by human + reality, not the agent (KRD §1099). The only outward edge from a
	// RealityMirror is → the S27 idea-intake door (an incident becomes an idea DRAFT); turning
	// that idea into a frozen truth is still the human's mirror + /goal + approval. ADDED at
	// S43 (the RealityMirror) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeRealityCannotDeclareTruth Code = "REALITY_CANNOT_DECLARE_TRUTH"
	// CodeAgentToolNotBound — a governed build-agent attempted to exercise an MCP
	// (server, tool) that is NOT present as an Enabled binding in its resolved
	// AgentImplementation (back/runtime/agentimpl, BA07). This is the CAPACITY axis of
	// the wall: the S04/S52 wall applies the ZONE axis (AGENT_WRITE_ABOVE_WATERLINE —
	// deny truth zones), this code applies the capability axis (default-deny — an
	// agent may only use a tool its governed layer explicitly granted). A capability
	// is never widened below the line: the only door to grant a new tool is the
	// governed layer (idée → miroir → /goal → approbation). ADDED at BA07 (the
	// CAPACITY-axis enforcer ToolAllowed) — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentToolNotBound Code = "AGENT_TOOL_NOT_BOUND"
	// CodeAgentSkillNotBound — a governed build-agent attempted to use a skill that is
	// NOT present as an Enabled binding in its resolved AgentImplementation
	// (back/runtime/agentimpl, BA08). This is the SKILL axis of the wall — the 3rd of
	// the four declared axes. The S04/S52 wall applies the ZONE axis
	// (AGENT_WRITE_ABOVE_WATERLINE — deny truth zones), BA07 the CAPACITY axis
	// (AGENT_TOOL_NOT_BOUND — default-deny an unbound MCP tool); this code applies the
	// skill axis (default-deny — an agent may only use a skill its governed layer
	// explicitly granted). Without it SkillBinding.Enabled is mere documentation: an
	// ungoverned skill is the same leak class as an ungoverned tool. A skill is never
	// widened below the line: the only door to grant a new skill is the governed layer
	// (idée → miroir → /goal → approbation). ADDED at BA08 (the SKILL-axis enforcer
	// SkillAllowed) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentSkillNotBound Code = "AGENT_SKILL_NOT_BOUND"
	// CodeAgentPathNotAllowed — a governed build-agent attempted to write/read a path
	// NOT covered by its resolved AgentImplementation.AllowedPaths (or covered by a
	// ForbiddenPaths prefix) — back/runtime/agentimpl, BA09. This is the CONFINEMENT
	// axis of the wall, an ALLOW-LIST that is DISTINCT from the ZONE deny-list: the
	// S04/S52 wall (AGENT_WRITE_ABOVE_WATERLINE) refuses the truth zones above the
	// waterline; this code refuses everything NOT explicitly inside the agent's
	// declared writable root (default-deny — an empty AllowedPaths denies every path,
	// the max-confinement default). A path is never widened below the line: the only
	// door to grant a new writable zone is the governed layer (idée → miroir → /goal →
	// approbation). ADDED at BA09 (the CONFINEMENT enforcer PathAllowed) — additive enum
	// extension (change_type: refine, never a removal); recorded by a ChangeSet +
	// SemanticDiff + ADR.
	CodeAgentPathNotAllowed Code = "AGENT_PATH_NOT_ALLOWED"
	// CodeAgentEgressNotAllowed — a governed build-agent attempted to reach a network
	// host NOT present in its resolved AgentImplementation.AllowedNetworkHosts
	// (back/runtime/agentimpl, BA09). The network-confinement axis: an EMPTY allow-list
	// denies EVERY host (no egress by default — fail-closed). A host is never widened
	// below the line: the only door is the governed layer (idée → miroir → /goal →
	// approbation). ADDED at BA09 — additive enum extension (change_type: refine, never
	// a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentEgressNotAllowed Code = "AGENT_EGRESS_NOT_ALLOWED"
	// CodeAgentExecNotAllowed — a governed build-agent attempted to run a subprocess
	// (command) NOT present in its resolved AgentImplementation.AllowedExec
	// (back/runtime/agentimpl, BA09). The exec-confinement axis: an EMPTY allow-list
	// denies EVERY command (no subprocess by default — fail-closed). The agent's Bash is
	// itself gated — every command passes ExecAllowed, never a free shell. A command is
	// never widened below the line: the only door is the governed layer (idée → miroir →
	// /goal → approbation). ADDED at BA09 — additive enum extension (change_type: refine,
	// never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentExecNotAllowed Code = "AGENT_EXEC_NOT_ALLOWED"
	// CodeAgentMandatoryHookSkipped — the turn-acceptance gate refused a governed
	// build-agent's turn because a HooksObligatoires{Mandatory:true} declared in its
	// resolved AgentImplementation NEVER RAN (no verdict from its hook binary) —
	// back/runtime/agentimpl, BA10. This is the HOOK axis of acceptance: the four wall
	// axes (zone/capacity/skill/confinement) gate what an action may TOUCH; this gates
	// whether a TURN may be ACCEPTED. A turn is admissible ONLY when every mandatory
	// hook actually ran (presence of the verdict, from the binary's own deterministic
	// exit — NEVER the agent's transcript, §8). A mandatory hook is never waived below
	// the line: the only door to change which hooks are mandatory is the governed layer
	// (idée → miroir → /goal → approbation). ADDED at BA10 (the MANDATORY-HOOK enforcer
	// HooksSatisfied) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentMandatoryHookSkipped Code = "AGENT_MANDATORY_HOOK_SKIPPED"
	// CodeAgentMandatoryHookRed — the turn-acceptance gate refused a governed
	// build-agent's turn because a HooksObligatoires{Mandatory:true} RAN but is NOT
	// GREEN (the hook binary returned a failing verdict) — back/runtime/agentimpl, BA10.
	// PRESENCE ≠ GREEN: a mandatory hook that ran and failed blocks acceptance just as a
	// skipped one does. The verdict comes from the hook BINARY's own deterministic exit/
	// BlockReason, never an agent-self-reported set (§8 — the judge is deterministic).
	// ADDED at BA10 (the MANDATORY-HOOK enforcer HooksSatisfied) — additive enum
	// extension (change_type: refine, never a removal); recorded by a ChangeSet +
	// SemanticDiff + ADR.
	CodeAgentMandatoryHookRed Code = "AGENT_MANDATORY_HOOK_RED"
	// CodeAgentBudgetExceeded — a governed build-agent's run BREACHED its declared
	// budget on at least one axis (tokens / turns / ci-minutes / wall-clock) —
	// back/runtime/agentimpl (budget.go), BA11. The effective per-axis cap is the
	// MINIMUM of the two declarations that share that axis: goal.Budgets (S29, the
	// secondary anti-runaway guard) and economics.HarnessCostBudget (S51, the harness
	// economy cap). The tightest cap wins (fail-closed): a run is within budget IFF the
	// measured cost is ≤ min(cap_S29, cap_S51) on EVERY shared axis AND ≤ each axis's
	// single declared cap otherwise. Cost is COST-AWARE (tokens × the declared model
	// rate → a unit comparable across an équipe) and includes a wall-clock DEADLINE (a
	// hung agent burns time without burning tokens). The verdict is PURE and the gate
	// is the authoritative deterministic min() — never an LLM judgment (§8). ADDED at
	// BA11 (the RunMeter + CheckBudget gate) — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentBudgetExceeded Code = "AGENT_BUDGET_EXCEEDED"
	// CodeAgentDeterminismGap — the determinism-first ARBITER (back/runtime/agentimpl,
	// arbiter.go, BA12) refused an action that would have asked the LLM to do what a
	// DETERMINISTIC TOOL can already do: a diff (jj/Myers), a search (rg), a format
	// (biome/gofmt), a codegen (S34 emitters) or a validate (kernel validators). The
	// intent is classified from the action's STRUCTURE (tool name + args), NEVER from a
	// model-supplied label — re-labelling the displayed intent cannot change the verdict,
	// only the structure can. An agent doing what a pure function could is a determinism
	// gap that BLOCKS the action (CLAUDE.md §6/§8 — the LLM is the gated exception, only
	// for irreducible generation). ADDED at BA12 (the Arbitrate gate) — additive enum
	// extension (change_type: refine, never a removal); recorded by a ChangeSet +
	// SemanticDiff + ADR.
	CodeAgentDeterminismGap Code = "AGENT_DETERMINISM_GAP"
	// CodeAgentPostCheckFailed — the deterministic POST-CHECK (back/runtime/agentloop,
	// postcheck.go, BA16) refused to ACCEPT an action's claimed effect AFTER it ran. The
	// gate (BA13) decided BEFORE; the post-check decides AFTER, per the action's NATURE:
	// a code-changing action (write / run_mirror) is accepted ONLY when the relevant
	// mirror/sensor AGREES the red-set mirror went green (goal.SensorState — the agent's
	// claimed confidence is never trusted, §8: done is computed); a propose is accepted
	// only when its proposal passes a SHAPE-check (the cause_sketch is a hypothesis, never
	// a truth); a read is accepted only when it lands NO side effect (a read that flips a
	// sensor is a read with side effects, refused). An action whose NATURE carries no
	// deterministic post-check is ITSELF a determinism gap that refuses to accept the
	// effect (CLAUDE.md §6/§8 — the judge is the mirror, EVERY action re-checked, not only
	// the code-changing ones). ADDED at BA16 — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentPostCheckFailed Code = "AGENT_POSTCHECK_FAILED"
	// CodeAgentIdentityUnverified — a call to an MCP server (agentimpl/scheduler/agentloop)
	// arrived WITHOUT a valid capability token, or with a token that does NOT bind the
	// calling process to exactly the CoucheAgent@version the server expects (gap K3, BA18).
	// The identity of the writer is PROVEN, never chain-declared: owner_agent/owner is not a
	// field the caller fills, it is DERIVED from a content-hash token the loop presents and
	// the server re-derives and matches. A missing token, a malformed token, or a token for
	// ANOTHER identity (a different LayerRef) all refuse here, fail-closed — the server never
	// trusts a self-asserted owner. ADDED at BA18 — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentIdentityUnverified Code = "AGENT_IDENTITY_UNVERIFIED"
	// CodeAgentLeaseFenced — the write-path FENCING gate (back/runtime/scheduler,
	// lease.go, BA22) refused an agent write whose LeaseEpoch is STALE: the item it
	// targets has since been re-leased (its current lease_epoch is strictly greater
	// than the epoch the write carries), so the writer is an agent woken late after its
	// lease expired and the item was reclaimed by another. Accepting the write would be a
	// LOST UPDATE (gap E2). The fence is a deterministic comparison — write.epoch ==
	// item.lease_epoch ⇒ live, write.epoch < item.lease_epoch ⇒ stale (refused), a future
	// epoch is impossible (refused too). The verdict is the scheduler-role UPDATE's own
	// epoch check / the gate's pure compare, never an LLM judgment (§8). ADDED at BA22 (the
	// lease/expire engine + write-path fencing) — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeAgentLeaseFenced Code = "AGENT_LEASE_FENCED"
	// CodeProposalNotAdmitted — the BA31 apply gate (back/runtime/agentloop, applygate.go)
	// refused a Proposal whose Status field READS "admitted" but for which NO corresponding
	// S16 authority record actually admits it. The transition proposed→admitted lives in S16
	// (authority.Decide); BA31 re-asserts it at the apply seam: the agent builds structs
	// FREELY (a buggy/malicious loop can forge Proposal{Status:"admitted"} in memory), so the
	// apply NEVER trusts the self-asserted field — it RE-DERIVES the admission verdict from the
	// authority graph + the roles actually granted, and admits ONLY when authority.Decide
	// returns `admitted`. A forged "admitted" with no admitting authority record is refused
	// here, fail-closed — the wall holds (the reality on-ramp PROPOSES a draft idea; it never
	// applies a truth). ADDED at BA31 (the reality-to-idea on-ramp + provenance-verified
	// apply) — additive enum extension (change_type: refine, never a removal); recorded by a
	// ChangeSet + SemanticDiff + ADR.
	CodeProposalNotAdmitted Code = "PROPOSAL_NOT_ADMITTED"
	// CodeGenFileHandEdited — the S78 project-scoped regeneration (« Régénérer mon app »,
	// back/runtime/regen, regen.go) refused to (re)emit a project's tree because a file
	// UNDER the emitted (gen/) tree was HAND-EDITED: its on-disk bytes no longer hash to
	// the output_hash the emitter recorded (generators.Drifted / relemit drift). gen/ is a
	// PROJECTION, regenerable, never authored by hand (CLAUDE.md §4/§9 — "NEVER hand-edited",
	// "hand-editing generated files is forbidden"). A regeneration that overwrote a drifted
	// file would SILENTLY DESTROY the human edit (non-destruction, §9), and a drift unnoticed
	// is a stale projection that lies about its source. The drift is COMPUTED — a pure hash
	// inequality over (recorded output_hash, on-disk bytes), never an LLM judgment (§8). The
	// refusal is fail-closed: the FIRST drifted file blocks the whole regen (no partial,
	// silently-overwriting pass). ADDED at S78 (the project-scoped regenerator) — additive
	// enum extension (change_type: refine, never a removal); recorded by a ChangeSet +
	// SemanticDiff + ADR.
	CodeGenFileHandEdited Code = "GEN_FILE_HAND_EDITED"
	// CodeBuildLoopNoProgress — the S83 build-loop service (back/runtime/buildloop)
	// HALTED a build that was SPENDING WITHOUT ADVANCING. The deterministic no-progress
	// detector (a PURE function of the iteration history — repeated diff-hash / red↔green
	// oscillation / zero newly-green mirror across the declared stagnation window, OR the
	// declared max-iteration cap reached) fired, OR the HarnessCostBudget (S51, economics)
	// flagged the run over a declared cap. The loop stops HONESTLY (KRD §8: a loop that
	// cannot reach green stops, it never claims a done it did not earn). The verdict is a
	// FUNCTION OF THE HISTORY — same history ⇒ same halt — never an LLM judgment (§6/§8
	// determinism-first): the judge is the mirror + the pure detector, the LLM is the
	// generation-only exception. ADDED at S83 (the build-loop circuit breaker); additive
	// enum extension (change_type: refine, never a removal).
	CodeBuildLoopNoProgress Code = "BUILD_LOOP_NO_PROGRESS"
)

// Severity is the gravity marker of a refusal. The KRD §44.5 example uses
// `blocking`; the set is closed.
type Severity string

const (
	// SeverityBlocking — the refusal halts the action until the fix path is walked
	// (KRD §44.5 example).
	SeverityBlocking Severity = "blocking"
)

// BlockReason is the actionable refusal shape (KRD §44.5): a code, a severity, a
// human explanation, and a how_to_fix resolution path of length >= 1. A BlockReason
// with an empty how_to_fix IS the prison and is forbidden (the property mirror).
type BlockReason struct {
	Code        Code     `json:"code"`
	Severity    Severity `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// reasons is the closed registry mapping each Code to its canonical BlockReason.
// The how_to_fix tokens are grounded in KRD §44.5 (write_mirror, assign_authority,
// rerun_krd_check — here `rerun aidos check`, the AIDOS CLI verb). Each path is
// non-empty: no code becomes a prison.
//
// OUT_OF_SCOPE names the in-scope target or its owner generically — TruthScope
// (the real scope record) lands at S14, so until a concrete record is supplied the
// fix path names the role, never a fabricated owner (OpenQuestion OQ-S13-scope).
var reasons = map[Code]BlockReason{
	CodeMissingMirror: {
		Code:     CodeMissingMirror,
		Severity: SeverityBlocking,
		Explanation: "La vérité visée n'a pas de miroir vivant : un comportement sans preuve BDD est un " +
			"monstre (loi de complétude, KRD §29). Aucune ligne de code sans scénario rouge d'abord.",
		HowToFix: []string{
			"write_mirror : créez le miroir (Gherkin / property / fixture) de la vérité — le rouge est le /goal.",
			"assign_authority : faites approuver le miroir par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : rejouez le set rouge ; le blocage se lève quand le miroir devient vivant.",
		},
	},
	CodeMissingAuthority: {
		Code:     CodeMissingAuthority,
		Severity: SeverityBlocking,
		Explanation: "Le changement exige une autorité qui n'a pas été assignée : nul ne peut figer cette " +
			"vérité sans le détenteur d'autorité du sous-graphe affecté (AuthorityGraph).",
		HowToFix: []string{
			"assign_authority : identifiez et assignez l'autorité requise pour le sous-graphe affecté.",
			"Faites approuver le ChangeSet par cette autorité — une autorité manquante n'est jamais contournée.",
			"rerun aidos check : rejouez le set rouge une fois l'autorité assignée.",
		},
	},
	CodeOutOfScope: {
		Code:     CodeOutOfScope,
		Severity: SeverityBlocking,
		Explanation: "L'écriture vise une couche hors du TruthScope déclaré : le contexte est compilé, pas " +
			"accumulé — un changement reste dans son périmètre (scope) ou passe par son propriétaire (owner).",
		HowToFix: []string{
			"Routez le changement vers la cible in-scope (l'owner / le propriétaire du périmètre déclaré).",
			"Si la cible doit changer de périmètre, ouvrez un /goal de re-scoping (rescope) auprès du scope owner.",
			"rerun aidos check : rejouez le set rouge une fois le changement ramené dans le périmètre.",
		},
	},
	CodeAgentWriteAboveWaterline: {
		Code:     CodeAgentWriteAboveWaterline,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison " +
			"(kernel / mirrors / fitness). Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
		HowToFix: []string{
			"write_mirror : ne jamais écrire la vérité au passage — créez une idea puis son miroir (le rouge est le /goal).",
			"assign_authority : ouvrez un /goal et obtenez l'approbation humaine (idea → mirror → /goal → approbation).",
			"rerun aidos check : le ChangeSet approuvé est appliqué par le rôle `aidos`, la seule porte vers le noyau.",
		},
	},
	CodeNoMirrorNoKernel: {
		Code:     CodeNoMirrorNoKernel,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : on promeut une idée vers le noyau SANS miroir. Une idée est une " +
			"vérité-candidate sans gel ni miroir (KRD §118) ; la seule porte vers /kernel est " +
			"idea → miroir → /goal → gel (KRD §116/§119.1). Sans miroir, aucune idée n'entre jamais dans le noyau.",
		HowToFix: []string{
			"write_mirror_run_goal_freeze : écrivez le miroir BDD rouge de l'idée — ce rouge EST le /goal, et le /goal EST le gel dans /kernel.",
			"assign_authority : faites approuver le /goal par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : la promotion passe le mur dès que l'idée porte son miroir ; le gel est écrit par le rôle `aidos` via /goal, jamais par l'agent.",
		},
	},
	CodeSpikeWriteEscapesZone: {
		Code:     CodeSpikeWriteEscapesZone,
		Severity: SeverityBlocking,
		Explanation: "Refus du confinement : pendant qu'une idée est en `spiking` (cliquet OFF, T0, " +
			"jetable), une écriture sort de la zone `/spike`. Le spike est jetable et ne doit JAMAIS fuir " +
			"vers /kernel ni /src (KRD §84/§60.x) ; il ne gradue pas directement vers le noyau.",
		HowToFix: []string{
			"confine_write_to_/spike : ramenez l'écriture sous le préfixe `/spike` — tout ce qu'un spike produit y reste, et reste jetable.",
			"run_/harvest_to_propose_a_kernel_delta : quand l'intention découverte est nette, récoltez-la (/harvest) pour PROPOSER un delta-noyau DRAFT — c'est la seule sortie de la zone.",
			"rerun aidos check : le blocage se lève dès que l'écriture est confinée à `/spike`.",
		},
	},
	CodeHarvestCannotFreeze: {
		Code:     CodeHarvestCannotFreeze,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : /harvest tente d'écrire le noyau ou un miroir directement. Harvest " +
			"PROPOSE une DRAFT Truth (un delta-noyau candidat sans gel ni miroir) ; il ne gèle JAMAIS. " +
			"Le gel est un /goal ultérieur séparé (KRD §116/§118) : l'IA esquisse, l'humain gèle.",
		HowToFix: []string{
			"harvest_proposes_only : /harvest s'arrête à la proposition DRAFT — aucune écriture du noyau ni d'un miroir.",
			"write_mirror_run_goal_freeze : pour figer la DRAFT Truth, ouvrez un /goal séparé qui écrit son miroir (le gel) — la seule porte vers /kernel.",
			"rerun aidos check : le blocage se lève dès que harvest ne vise plus le noyau/un miroir.",
		},
	},
	CodeIdeaWithoutMirror: {
		Code:     CodeIdeaWithoutMirror,
		Severity: SeverityBlocking,
		Explanation: "Refus du /goal : on ouvre un goal sur une idée SANS miroir. Une idée sans miroir est " +
			"un vœu — un monstre (KRD §57, LIVRE XX) ; la seule porte vers la vérité est idea → miroir → /goal. " +
			"Aucun ChangeSet n'est ouvert tant que l'idée ne porte pas son miroir.",
		HowToFix: []string{
			"draft_mirror_for_idea : esquissez le miroir BDD (Gherkin / property / fixture) de l'idée — ce rouge EST le /goal.",
			"assign_authority : faites approuver le miroir par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : ouvrez le /goal dès que l'idée porte son mirror_delta.",
		},
	},
	CodeNoRedSet: {
		Code:     CodeNoRedSet,
		Severity: SeverityBlocking,
		Explanation: "Refus du /goal : le set rouge dérivé est VIDE — le miroir de l'idée est déjà vert. " +
			"Un test déjà vert n'est pas un goal : il n'y a rien à fermer (KRD §56, « le set rouge EST la " +
			"todo-list »). Un goal existe seulement s'il porte ≥1 miroir rouge.",
		HowToFix: []string{
			"check_the_idea_changes_something : un goal n'est légitime que si son spec_delta fait rougir ≥1 miroir ; sinon il n'y a rien à faire.",
			"open_a_real_change : reformulez l'idée pour qu'elle change réellement une couche (et fasse rougir son miroir) — la vague de rouge (S22) dérive alors un set non vide.",
			"rerun aidos check : le /goal s'ouvre dès que le set rouge dérivé est non vide.",
		},
	},
	CodeGoalStillRed: {
		Code:     CodeGoalStillRed,
		Severity: SeverityBlocking,
		Explanation: "Refus de la fermeture (stop non-gameable, KRD §57 Algorithme ①/§8) : le goal ne peut " +
			"PAS être fermé — au moins une des quatre conditions calculées échoue (un miroir encore rouge, un " +
			"vert antérieur cassé, un score de mutation sous le seuil, ou un monstre). « Done » est CALCULÉ, " +
			"jamais déclaré : le moteur ne lit jamais la confiance de l'agent.",
		HowToFix: []string{
			"close_red_mirrors : passez au vert tout miroir encore rouge du set rouge (la todo-list du goal).",
			"restore_prior_green : réparez tout vert antérieur cassé — aucune fermeture ne casse un seul vert existant (KRD §8).",
			"raise_mutation_or_remove_monster : remontez le score de mutation au-dessus du seuil et éliminez tout monstre (orphelin / vérité sans miroir).",
			"rerun aidos check : la fermeture est admise dès que les quatre conditions tiennent — jamais sur la déclaration de l'agent.",
		},
	},
	CodeMemoryCannotDeclareTruth: {
		Code:     CodeMemoryCannotDeclareTruth,
		Severity: SeverityBlocking,
		Explanation: "Refus du MemoryFirewall (KRD §119.1) : un `MemoryItem` est du carburant de " +
			"contexte, JAMAIS une vérité. Aucune mémoire n'entre dans /kernel par l'arête directe " +
			"Memory → Kernel ; la seule porte est le flux obligatoire à sens unique " +
			"Memory → ContextPack → Idea → Mirror → Goal → Kernel — quels que soient sa confiance ou " +
			"son taint (même une mémoire propre et pleinement confiante n'est pas une vérité). " +
			"« La mémoire propose ; le noyau déclare le vrai. »",
		HowToFix: []string{
			"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel : routez la mémoire par le flux complet — proposez-la dans un ContextPack, puis remettez-la à l'idea-intake (S27) comme idée draft.",
			"write_mirror_run_goal_freeze : l'idée draft DOIT encore acquérir son miroir (le /goal) pour atteindre le noyau ; sans miroir, aucune idée n'entre jamais dans /kernel.",
			"assign_authority : faites approuver le /goal par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : le gel dans /kernel est écrit par le rôle `aidos` via /goal, jamais par la mémoire ni par l'agent.",
		},
	},
	CodeHistoricalImpactRequiresMigration: {
		Code:     CodeHistoricalImpactRequiresMigration,
		Severity: SeverityBlocking,
		Explanation: "Refus (DataTruthScope, KRD §44.3) : un changement touche des données déjà " +
			"produites (existing_records / historical_records) SANS migration déclarée. Changer la vérité " +
			"du code ne change pas automatiquement la vérité des données historiques — « les données ont leur " +
			"propre inertie ». Une telle modification EXIGE une migration déclarée (migration.required:true, " +
			"une stratégie du jeu fermé §44.3, audit.preserve_old_truth:true) ; jamais une modification " +
			"silencieuse du schéma sur des données historiques.",
		HowToFix: []string{
			"declare_data_truth_scope : déclarez un DataTruthScope avec migration.required:true et une stratégie ∈ {expand_contract, backfill, dual_read, dual_write}.",
			"preserve_old_truth : posez audit.preserve_old_truth:true — l'ancienne vérité sur les enregistrements historiques n'est jamais détruite (la migration est forward-only, expand→backfill→contract).",
			"rerun aidos check : le blocage se lève dès que le changement à impact historique porte sa migration déclarée — l'écriture de la déclaration passe par le rôle `aidos`, jamais par l'agent.",
		},
	},
	CodeUnknownMigrationStrategy: {
		Code:     CodeUnknownMigrationStrategy,
		Severity: SeverityBlocking,
		Explanation: "Refus (DataTruthScope, KRD §44.3) : la stratégie de migration déclarée n'appartient " +
			"pas au jeu FERMÉ {expand_contract, backfill, dual_read, dual_write}. Une stratégie n'est jamais " +
			"devinée ni coercée (honnêteté, CLAUDE.md §8) ; une stratégie inconnue est refusée.",
		HowToFix: []string{
			"use_a_known_strategy : choisissez une stratégie du jeu fermé §44.3 — expand_contract | backfill | dual_read | dual_write.",
			"do_not_invent : aucune stratégie hors de ce jeu n'est acceptée ; corrigez le DataTruthScope plutôt que d'inventer une règle.",
			"rerun aidos check : le blocage se lève dès que la stratégie déclarée est membre du jeu fermé.",
		},
	},
	CodeSandboxWriteEscapesZone: {
		Code:     CodeSandboxWriteEscapesZone,
		Severity: SeverityBlocking,
		Explanation: "Refus du sandbox (EvolutionSandbox, KRD §66.1) : pendant qu'une exécution /evolve " +
			"est active, une écriture sort de la zone autorisée {/branches/evolution, /reports, " +
			"/ideas/proposed}. La boucle moyenne EXPLORE, elle ne GOUVERNE pas : elle peut produire " +
			"candidats, branches, scores, hypothèses, suggestions — jamais des vérités, approbations, " +
			"exceptions ou droits. Tout chemin vers /kernel, /mirrors/above, /authority, /fitness (ou " +
			"hors de la zone autorisée) est refusé. Le jeu cannot_write §66.1 EST le mur §2.",
		HowToFix: []string{
			"confine_write_to_/branches/evolution_or_/reports_or_/ideas/proposed : ramenez l'écriture sous une des trois zones autorisées — tout ce que la boucle produit y reste un candidat.",
			"open_a_/goal_to_promote_a_candidate : pour qu'un candidat devienne vérité, ouvrez un /goal séparé (mirror_green ∧ out_of_sample_green ∧ authority_approval) — la seule porte vers /kernel ; l'IA propose, l'humain gèle.",
			"rerun aidos check : le blocage se lève dès que l'écriture est confinée à la zone autorisée.",
		},
	},
	CodeSandboxEscape: {
		Code:     CodeSandboxEscape,
		Severity: SeverityBlocking,
		Explanation: "Refus du bac à sable de projet (S82, ADR 0001) : le workspace d'un projet tente de " +
			"LIRE ou d'ÉCRIRE en dehors de sa propre racine — l'arbre source/build d'un AUTRE projet, " +
			"ou le truth-store d'AIDOS. Chaque projet émis vit dans un workspace runtime ISOLÉ " +
			"(conteneur + dépôt git/jj + worktree) ; le projet A ne peut jamais observer l'arbre/build " +
			"du projet B ni le noyau/miroirs (le mur §2). L'isolation inter-projets est défaut-refus : " +
			"tout chemin hors de la racine du workspace courant est refusé.",
		HowToFix: []string{
			"confine_to_workspace_root : ramenez la lecture/écriture sous la racine du workspace du projet courant (son arbre /ideas /spike /src /kernel/spec isolé).",
			"cross_project_reuse_goes_through_capitalisation : pour réutiliser un artefact d'un autre projet, passez par la porte légale (idée → miroir → /goal), jamais par une lecture directe de son arbre.",
			"rerun aidos check : le blocage se lève dès que l'accès reste confiné à la racine du workspace courant.",
		},
	},
	CodeSandboxResourceLimit: {
		Code:     CodeSandboxResourceLimit,
		Severity: SeverityBlocking,
		Explanation: "Refus du bac à sable de projet (S82) : le workspace d'un projet a dépassé une de ses " +
			"limites de ressources déclarées (CPU / mémoire / disque / temps mural) — une boucle " +
			"runaway, une fork-bomb ou un remplissage de disque. Le cgroup/ulimit le TUE (anti " +
			"noisy-neighbor) : un projet ne peut jamais affamer un autre. Les limites sont déclarées " +
			"au provisioning (au-dessus de la ligne), jamais un bouton du workspace.",
		HowToFix: []string{
			"reduce_the_workload_under_the_caps : le build/test du projet doit rester sous les caps CPU/mémoire/disque/temps déclarés ; une charge légitime plus lourde se négocie au provisioning.",
			"raise_the_cap_via_provisioning : pour relever un cap, redéclarez les ResourceLimits du workspace au provisioning (au-dessus de la ligne) — jamais depuis l'écran ni dans la boucle.",
			"rerun aidos check : le workspace tué peut être re-provisionné ; le blocage se lève dès que la charge reste sous les caps.",
		},
	},
	CodeSandboxCannotGovern: {
		Code:     CodeSandboxCannotGovern,
		Severity: SeverityBlocking,
		Explanation: "Refus du sandbox (EvolutionSandbox, KRD §66.1/§118/§132) : la boucle /evolve tente " +
			"d'écrire directement une vérité / approbation / exception / droit (un gel du noyau, un " +
			"miroir, une approbation d'autorité, une fitness). L'évolution PROPOSE ; l'humain GÈLE " +
			"via /goal. Même une variante mirror_green ∧ out_of_sample_green ∧ authority_approval ne " +
			"produit qu'une PROPOSITION de promotion — jamais le gel lui-même. « L'évolution explore, " +
			"elle ne gouverne pas. »",
		HowToFix: []string{
			"evolve_proposes_only : /evolve s'arrête à la proposition (candidat, branche, score, hypothèse, suggestion) — aucune écriture d'une vérité/approbation/droit.",
			"open_a_/goal_to_promote_a_candidate : pour figer un candidat, ouvrez un /goal séparé qui écrit son miroir et obtient l'approbation de l'autorité — la seule porte vers /kernel.",
			"rerun aidos check : le blocage se lève dès que la boucle ne vise plus une vérité/approbation/droit.",
		},
	},
	CodeRealityCannotDeclareTruth: {
		Code:     CodeRealityCannotDeclareTruth,
		Severity: SeverityBlocking,
		Explanation: "Refus du RealityMirror (boucle externe, KRD §53/§67/§117/§1099) : un incident de " +
			"prod / un signal de télémétrie est de la RÉALITÉ, jamais une vérité. La réalité est un " +
			"sensor qui LIT le monde et PROPOSE — elle n'écrit jamais le noyau. Juger qu'un désaccord " +
			"avec le réel est vrai est une DÉCISION DE VÉRITÉ, au-dessus de la ligne, détenue par " +
			"l'humain + la réalité, pas par l'agent. La seule arête sortante d'un RealityMirror est " +
			"vers la porte idea-intake (S27) : un incident devient une idée DRAFT, jamais une vérité.",
		HowToFix: []string{
			"incident_then_learn_then_mirror_then_goal_then_approval : observez l'incident → /learn le transforme en idée DRAFT (provenance incident:#NNNN) → écrivez son miroir (le /goal) → approbation de l'autorité → gel dans /kernel.",
			"reality_proposes_only : la boucle externe lit la réalité et PROPOSE une idée ; elle n'écrit jamais /kernel, /mirrors ou /fitness — il n'existe aucune porte Incident → Kernel.",
			"rerun aidos check : le blocage est permanent sur l'arête directe ; la seule sortie est l'idée DRAFT remise à l'idea-intake (S27), qui doit encore acquérir son miroir.",
		},
	},
	CodeAgentToolNotBound: {
		Code:     CodeAgentToolNotBound,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur — axe CAPACITÉ : l'agent gouverné tente d'exercer un outil MCP " +
			"(server, tool) qui n'est PAS un binding `Enabled` de son implémentation résolue " +
			"(back/runtime/agentimpl, BA07). Le mur S04/S52 applique l'axe ZONE (refus des zones de " +
			"vérité) ; ceci applique l'axe capacité : un agent ne peut utiliser qu'un outil que sa " +
			"couche gouvernée a explicitement accordé (default-deny — ce qui n'est pas lié est refusé). " +
			"Une capacité ne s'élargit jamais sous la ligne : la gouvernance ne peut que rétrécir.",
		HowToFix: []string{
			"add_binding_via_governed_layer : pour accorder cet outil, ajoutez un OutilMCPAutorisé `Enabled` à la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
			"governance_only_narrows : l'implémentation projetée est un sous-ensemble prouvable de la couche gouvernée ; aucune écriture sous la ligne ni depuis l'écran n'élargit la surface de capacité.",
			"rerun aidos check : le blocage se lève dès que (server, tool) est un binding activé de l'implémentation résolue.",
		},
	},
	CodeAgentSkillNotBound: {
		Code:     CodeAgentSkillNotBound,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur — axe SKILL : l'agent gouverné tente d'utiliser un skill qui " +
			"n'est PAS un binding `Enabled` de son implémentation résolue " +
			"(back/runtime/agentimpl, BA08). C'est le 3ᵉ des quatre axes déclarés : le mur " +
			"S04/S52 applique l'axe ZONE (refus des zones de vérité), BA07 l'axe CAPACITÉ " +
			"(refus d'un outil MCP non lié) ; ceci applique l'axe skill : un agent ne peut " +
			"utiliser qu'un skill que sa couche gouvernée a explicitement accordé " +
			"(default-deny — ce qui n'est pas lié est refusé). Sans cet enforcer, " +
			"`SkillBinding.Enabled` n'est que de la documentation : un skill ungouverné est " +
			"la même classe de fuite qu'un outil ungouverné. Une capacité ne s'élargit " +
			"jamais sous la ligne : la gouvernance ne peut que rétrécir.",
		HowToFix: []string{
			"add_binding_via_governed_layer : pour accorder ce skill, ajoutez un SkillAutorisé `Enabled` à la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
			"governance_only_narrows : l'implémentation projetée est un sous-ensemble prouvable de la couche gouvernée ; aucune écriture sous la ligne ni depuis l'écran n'élargit la surface de skills.",
			"rerun aidos check : le blocage se lève dès que le skill est un binding activé de l'implémentation résolue.",
		},
	},
	CodeAgentPathNotAllowed: {
		Code:     CodeAgentPathNotAllowed,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur — axe CONFINEMENT : l'agent gouverné vise un chemin qui n'est PAS " +
			"couvert par sa liste d'autorisation `AllowedPaths` (ou il tombe sous un préfixe " +
			"`ForbiddenPaths`) — back/runtime/agentimpl, BA09. C'est une ALLOW-LIST, DISTINCTE de la " +
			"deny-list de ZONE : le mur S04/S52 (AGENT_WRITE_ABOVE_WATERLINE) refuse les zones de " +
			"vérité au-dessus de la ligne ; ce code refuse tout ce qui n'est PAS explicitement dans " +
			"la racine inscriptible déclarée de l'agent (default-deny — une `AllowedPaths` vide refuse " +
			"tout chemin, confinement maximal). Une zone ne s'élargit jamais sous la ligne.",
		HowToFix: []string{
			"add_allowed_path_via_governed_layer : pour accorder ce chemin, ajoutez-le aux zones d'écriture de la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
			"keep_out_of_forbidden : assurez-vous que le chemin ne tombe pas sous un préfixe `ForbiddenPaths` (le mur est toujours porté par la projection) ; la racine inscriptible est l'arbre de l'app, pas /kernel ni /mirrors.",
			"rerun aidos check : le blocage se lève dès que le chemin est couvert par un préfixe `AllowedPaths` et hors `ForbiddenPaths`.",
		},
	},
	CodeAgentEgressNotAllowed: {
		Code:     CodeAgentEgressNotAllowed,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur — axe CONFINEMENT RÉSEAU : l'agent gouverné tente de joindre un host " +
			"réseau qui n'est PAS dans sa liste `AllowedNetworkHosts` (back/runtime/agentimpl, BA09). " +
			"Une `AllowedNetworkHosts` vide refuse TOUT host (aucun egress par défaut — fail-closed). " +
			"Un host ne s'élargit jamais sous la ligne.",
		HowToFix: []string{
			"add_allowed_host_via_governed_layer : pour accorder ce host, ajoutez-le aux hosts réseau autorisés de la CoucheAgent (la SOURCE) — la seule porte est idée → miroir → /goal → approbation humaine.",
			"egress_is_fail_closed : par défaut aucun egress n'est permis ; déclarez explicitement chaque host requis (registry, API du provider…).",
			"rerun aidos check : le blocage se lève dès que le host est un membre déclaré de `AllowedNetworkHosts`.",
		},
	},
	CodeAgentExecNotAllowed: {
		Code:     CodeAgentExecNotAllowed,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur — axe CONFINEMENT EXEC : l'agent gouverné tente d'exécuter une commande " +
			"qui n'est PAS dans sa liste `AllowedExec` (back/runtime/agentimpl, BA09). Une `AllowedExec` " +
			"vide refuse TOUTE commande (aucun sous-processus par défaut — fail-closed). Le `Bash` de " +
			"l'agent est lui-même gaté : toute commande passe par `ExecAllowed`, jamais un shell libre.",
		HowToFix: []string{
			"add_allowed_exec_via_governed_layer : pour accorder cette commande, ajoutez-la aux exécutables autorisés de la CoucheAgent (la SOURCE) — la seule porte est idée → miroir → /goal → approbation humaine.",
			"exec_is_fail_closed : par défaut aucun sous-processus n'est permis ; déclarez explicitement chaque exécutable requis (go, npm…) — jamais un shell libre.",
			"rerun aidos check : le blocage se lève dès que la commande est un membre déclaré de `AllowedExec`.",
		},
	},
	CodeAgentMandatoryHookSkipped: {
		Code:     CodeAgentMandatoryHookSkipped,
		Severity: SeverityBlocking,
		Explanation: "Refus de l'ACCEPTATION DU TOUR — axe HOOK : un hook OBLIGATOIRE " +
			"(HooksObligatoires{Mandatory:true}) déclaré dans l'implémentation résolue de l'agent " +
			"gouverné n'a JAMAIS tourné (aucun verdict de son binaire) — back/runtime/agentimpl, BA10. " +
			"Les quatre axes du mur (zone/capacité/skill/confinement) gatent ce qu'une action peut " +
			"TOUCHER ; ceci gate si un TOUR peut être ACCEPTÉ : un tour n'est admissible que si chaque " +
			"hook obligatoire a réellement tourné. Présence du verdict = exit déterministe du BINAIRE " +
			"hook, jamais le transcript auto-rapporté de l'agent (CLAUDE.md §8 — le juge est déterministe).",
		HowToFix: []string{
			"run_the_mandatory_hook : exécutez le hook obligatoire manquant (sa phase PreToolUse/PostToolUse/Stop/SessionStart) — l'acceptation est gatée sur des hooks VERTS, jamais sur leur seule déclaration.",
			"verdict_from_the_binary : fournissez le verdict produit par le BINAIRE du hook (exit/BlockReason), jamais un set de noms rapporté par l'agent — un hook qui ne tourne pas est mort.",
			"change_mandatory_via_governed_layer : pour qu'un hook cesse d'être obligatoire, modifiez la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine ; jamais une dispense sous la ligne.",
			"rerun aidos check : le blocage se lève dès que tout hook obligatoire a tourné ET est vert.",
		},
	},
	CodeAgentMandatoryHookRed: {
		Code:     CodeAgentMandatoryHookRed,
		Severity: SeverityBlocking,
		Explanation: "Refus de l'ACCEPTATION DU TOUR — axe HOOK : un hook OBLIGATOIRE " +
			"(HooksObligatoires{Mandatory:true}) a TOURNÉ mais n'est PAS VERT (son binaire a renvoyé un " +
			"verdict en échec) — back/runtime/agentimpl, BA10. PRÉSENCE ≠ VERT : un hook obligatoire qui " +
			"a tourné et échoué bloque l'acceptation autant qu'un hook sauté. Le verdict provient de " +
			"l'exit/BlockReason déterministe du BINAIRE du hook, jamais d'un set auto-rapporté par " +
			"l'agent (CLAUDE.md §8 — le juge est déterministe, jamais le transcript).",
		HowToFix: []string{
			"fix_what_the_hook_flags : lisez le BlockReason renvoyé par le binaire du hook et corrigez la cause (le mur franchi, la complétude violée, le sensor rouge) — passez le hook au VERT.",
			"presence_is_not_green : un hook présent mais rouge ne suffit pas ; l'acceptation exige des hooks obligatoires VERTS, pas seulement exécutés.",
			"rerun aidos check : le blocage se lève dès que le hook obligatoire rouge redevient vert.",
		},
	},
	CodeAgentBudgetExceeded: {
		Code:     CodeAgentBudgetExceeded,
		Severity: SeverityBlocking,
		Explanation: "Refus du BUDGET DE RUN : le run de l'agent gouverné a DÉPASSÉ son budget déclaré sur " +
			"au moins un axe (tokens / turns / ci-minutes / wall-clock) — back/runtime/agentimpl (budget.go), " +
			"BA11. Le cap effectif par axe partagé est le MINIMUM des deux déclarations : goal.Budgets (S29, " +
			"le garde-fou anti-runaway secondaire) ET economics.HarnessCostBudget (S51, le cap d'économie du " +
			"harnais) — le cap le plus serré gagne (fail-closed). Le coût est COST-AWARE (tokens × le taux " +
			"modèle déclaré) et inclut une DEADLINE wall-clock (un agent hung brûle du temps sans brûler de " +
			"tokens). Le gate est le min() déterministe autoritaire, jamais un jugement de l'agent (§8).",
		HowToFix: []string{
			"reduce_run_cost : ramenez le coût du run sous le cap dépassé — moins de tours, moins de tokens, un run plus court ; le compteur est monotone, il ne fait que croître.",
			"tightest_cap_wins : le cap effectif est min(goal.Budgets, economics.HarnessCostBudget) sur l'axe partagé ; relever UN seul des deux ne lève pas le blocage si l'autre reste serré.",
			"raise_budget_via_goal : si un cap déclaré est trop bas, RELEVEZ-le via un /goal (la zone fitness pour HarnessCostBudget, le corps du goal pour Budgets) — jamais une édition directe ; l'agent est SELECT-only sur fitness.",
			"rerun aidos check : le blocage se lève dès que le coût mesuré repasse ≤ min() des caps sur chaque axe.",
		},
	},
	CodeAgentDeterminismGap: {
		Code:     CodeAgentDeterminismGap,
		Severity: SeverityBlocking,
		Explanation: "Refus de l'ARBITRE determinism-first : l'action voulait confier au LLM ce qu'un OUTIL " +
			"DÉTERMINISTE sait déjà faire — un diff (jj/Myers), une recherche (rg), un format (biome/gofmt), " +
			"une génération de code (émetteurs S34) ou une validation (validateurs kernel) — back/runtime/agentimpl " +
			"(arbiter.go), BA12. L'intent est classifié depuis la STRUCTURE de l'action (nom d'outil + args), " +
			"jamais depuis un label fourni par le modèle : ré-étiqueter l'intent affiché ne change pas le verdict, " +
			"seule la structure le peut. Un agent qui fait ce qu'une fonction pure pourrait faire est un " +
			"determinism gap qui bloque l'action (CLAUDE.md §6/§8 — le LLM est l'exception gatée, réservée à la " +
			"génération irréductible).",
		HowToFix: []string{
			"use_deterministic_tool : routez l'action vers l'outil déterministe que la table de la SKILL declare (diff→jj/Myers, search→rg, format→biome/gofmt, codegen→émetteurs S34, validate→validateurs kernel) — le code gagne, l'agent défère.",
			"classify_by_structure : ne re-labelisez pas l'intent pour contourner le gate ; le verdict vient de la structure (nom d'outil + args), pas du label revendiqué.",
			"llm_is_the_gated_exception : ne réservez le LLM qu'à la génération/jugement irréductible, isolé à la plus petite surface et re-checké déterministiquement ; jamais pour ce qu'une fonction pure couvre.",
			"rerun aidos check : le blocage se lève dès que l'action emprunte l'outil déterministe au lieu du LLM.",
		},
	},
	CodeAgentPostCheckFailed: {
		Code:     CodeAgentPostCheckFailed,
		Severity: SeverityBlocking,
		Explanation: "Refus du POST-CHECK déterministe (back/runtime/agentloop, postcheck.go, BA16) : APRÈS " +
			"l'exécution d'une action, l'effet revendiqué n'est ACCEPTÉ que si le juge déterministe est " +
			"d'accord, selon la NATURE de l'action — une action qui change du code (write / run_mirror) n'est " +
			"acceptée que si le miroir/sensor pertinent confirme que le miroir du set rouge est passé au vert " +
			"(goal.SensorState ; la confiance revendiquée par l'agent n'est jamais crue, §8 « done is computed ») ; " +
			"une action propose n'est acceptée que si sa proposition passe un contrôle de FORME (le cause_sketch " +
			"est une hypothèse, jamais une vérité) ; une action read n'est acceptée que si elle ne pose AUCUN " +
			"effet de bord (une lecture qui bascule un sensor est une lecture avec effet, refusée). Une action " +
			"dont la NATURE ne porte aucun post-check déterministe est ELLE-MÊME un determinism gap (CLAUDE.md " +
			"§6/§8 — le juge est le miroir, CHAQUE action re-checkée, pas seulement celles qui changent du code).",
		HowToFix: []string{
			"let_the_mirror_judge : pour une action qui change du code, ne déclarez l'effet vert que lorsque le miroir/sensor du set rouge le confirme réellement — la confiance revendiquée ne ferme pas le goal, le sensor le ferme (§8).",
			"shape_check_the_proposal : pour un propose, faites passer la proposition (le cause_sketch) par le contrôle de forme avant de l'accepter ; une hypothèse mal formée n'est pas acceptée et ne devient jamais une vérité.",
			"reads_are_side_effect_free : pour un read, n'attachez aucun effet de bord (aucun flip de sensor) ; une lecture qui mute l'état est refusée par l'assertion no-op.",
			"every_action_needs_a_postcheck : donnez à chaque action une nature connue (read | write | propose | run_mirror) — une nature sans post-check déterministe est un determinism gap qui bloque le pas.",
			"rerun aidos check : le blocage se lève dès que le juge déterministe (le miroir / la forme / l'assertion no-op) accepte l'effet.",
		},
	},
	CodeAgentIdentityUnverified: {
		Code:     CodeAgentIdentityUnverified,
		Severity: SeverityBlocking,
		Explanation: "L'appel à un serveur MCP est arrivé sans token de capacité valide, ou avec un token qui ne " +
			"lie PAS le process appelant à exactement le CoucheAgent@version attendu (gap K3, BA18). En KRD " +
			"l'identité du writer est PROUVÉE, jamais déclarée par chaîne : owner_agent/owner n'est pas un champ " +
			"que l'appelant remplit, il est DÉRIVÉ d'un token content-hash que la boucle présente et que le " +
			"serveur re-dérive puis vérifie. Un token absent, malformé, ou émis pour une AUTRE identité (un autre " +
			"LayerRef) est refusé ici, fail-closed — le serveur ne fait jamais confiance à un owner auto-déclaré.",
		HowToFix: []string{
			"present_token : la boucle (agentloop) présente le token de capacité = content-hash de son AgentImplementation (agentimpl.MintToken) à CHAQUE appel MCP — pas d'appel sans token.",
			"bind_the_process : le token doit lier le process appelant à exactement ce CoucheAgent@version ; un token pour une autre identité (un autre LayerRef) est refusé, ce n'est pas une élévation possible.",
			"verify_server_side : le serveur MCP re-dérive le token attendu (agentimpl.VerifyToken) et le compare au token présenté — il ne lit jamais un owner_agent auto-déclaré dans la requête.",
			"rerun aidos check : le blocage se lève dès que le token présenté lie le process à l'identité attendue (preuve, pas déclaration).",
		},
	},
	CodeAgentLeaseFenced: {
		Code:     CodeAgentLeaseFenced,
		Severity: SeverityBlocking,
		Explanation: "Refus du FENCING au write-path (ordonnanceur, BA22, gap E2) : l'écriture porte un " +
			"LeaseEpoch PÉRIMÉ — l'item visé a été re-leasé depuis (son lease_epoch courant est " +
			"strictement supérieur à l'epoch de l'écriture). L'agent a été réveillé tard, après " +
			"l'expiration de son lease, alors qu'un autre agent avait déjà repris l'item au tick " +
			"suivant. Accepter l'écriture serait un lost-update : deux agents écriraient le même item. " +
			"Le fence est une comparaison déterministe (epoch == lease_epoch courant ⇒ vivant ; " +
			"epoch < lease_epoch ⇒ périmé, refusé ; un epoch futur est impossible, refusé aussi) — " +
			"jamais un jugement LLM (§8).",
		HowToFix: []string{
			"re_lease_before_writing : ne réécrivez pas avec un epoch périmé — re-claimez l'item (l'ordonnanceur émet un nouveau lease_epoch monotone) puis écrivez sous ce nouvel epoch.",
			"check_assignment_is_live : vérifiez que votre AgentAssignment est encore `leased|running` et non `expired|released` avant d'écrire ; un lease expiré ne donne aucun droit d'écriture.",
			"let_the_tick_reclaim : si vous étiez en pause, le tick driver a déjà récupéré l'item (claimed→open→re-claimed) sans action humaine ; reprenez le travail via un nouveau lease.",
			"rerun aidos check : le blocage se lève dès que l'écriture porte l'epoch courant de l'item (la preuve que le lease est vivant).",
		},
	},
	CodeProposalNotAdmitted: {
		Code:     CodeProposalNotAdmitted,
		Severity: SeverityBlocking,
		Explanation: "Refus de la porte d'apply BA31 (back/runtime/agentloop, applygate.go) : une " +
			"Proposal dont le champ Status affiche « admitted » mais SANS enregistrement d'autorité S16 " +
			"correspondant qui l'admette réellement. La transition proposed→admitted vit en S16 " +
			"(authority.Decide) ; l'apply la RÉ-ASSERTE à la couture : l'agent construit des structs " +
			"LIBREMENT (une boucle bugguée/malveillante peut fabriquer Proposal{Status:\"admitted\"} en " +
			"mémoire), donc l'apply ne fait JAMAIS confiance au champ auto-déclaré — il RE-DÉRIVE le " +
			"verdict d'admission depuis le graphe d'autorité + les rôles réellement accordés, et n'admet " +
			"que si authority.Decide renvoie « admitted ». Un « admitted » forgé sans autorité admettante " +
			"est refusé ici, fail-closed — le mur tient (l'on-ramp réalité PROPOSE une idée DRAFT ; il " +
			"n'applique jamais une vérité).",
		HowToFix: []string{
			"obtain_a_real_admission : ne forgez pas Status:\"admitted\" ; faites passer la proposition par S16 — l'autorité (approbateurs requis, aucun veto) doit réellement l'admettre (authority.Decide ⇒ admitted).",
			"propose_only_path : l'on-ramp réalité (RunToSignal → Observe → Learn → ToIdea) ne produit qu'une idée DRAFT ; pour la figer, écrivez son miroir au /goal puis obtenez l'approbation — il n'existe aucune porte directe vers une vérité admise.",
			"rerun aidos check : le blocage se lève dès qu'un enregistrement d'autorité S16 admet réellement la proposition (le champ Status n'est jamais cru, seul le verdict re-dérivé compte).",
		},
	},
	CodeGenFileHandEdited: {
		Code:     CodeGenFileHandEdited,
		Severity: SeverityBlocking,
		Explanation: "Refus de la régénération project-scopée S78 (« Régénérer mon app », back/runtime/regen) : " +
			"un fichier de l'arbre émis (gen/) a été ÉDITÉ À LA MAIN — ses octets sur disque ne correspondent " +
			"plus à l'output_hash que l'émetteur avait enregistré (drift). L'arbre gen/ est une PROJECTION " +
			"régénérable, jamais autorée à la main (CLAUDE.md §4/§9). Une régénération qui écraserait un fichier " +
			"drifté DÉTRUIRAIT silencieusement l'édition humaine (non-destruction, §9) ; un drift ignoré est une " +
			"projection périmée qui ment sur sa source. Le drift est CALCULÉ — une inégalité de hash pure (hash " +
			"des octets sur disque ≠ output_hash enregistré), jamais un jugement LLM (§8). Le refus est " +
			"fail-closed : le PREMIER fichier drifté bloque toute la régénération (aucune passe partielle qui " +
			"écrase en silence).",
		HowToFix: []string{
			"revert_the_hand_edit : restaurez le fichier généré à sa dernière sortie d'émetteur (git checkout du fichier gen/) — gen/ se modifie en changeant SA SOURCE (l'AST d'entité/operation/control/blob), jamais le fichier émis.",
			"change_the_source_then_regenerate : si l'édition manuelle traduisait un vrai besoin, portez-la dans la source Kernel via idea → mirror → /goal → approbation, puis relancez la régénération — l'émetteur déterministe ré-émet le fichier.",
			"rerun « Régénérer mon app » : le blocage se lève dès qu'aucun fichier de l'arbre émis ne diverge de son output_hash enregistré ; la régénération est alors byte-stable.",
		},
	},
	CodeBuildLoopNoProgress: {
		Code:     CodeBuildLoopNoProgress,
		Severity: SeverityBlocking,
		Explanation: "La boucle de build (S83, back/runtime/buildloop) a STOPPÉ un build qui DÉPENSAIT SANS " +
			"AVANCER. Le détecteur de non-progrès déterministe — une fonction PURE de l'historique d'itérations " +
			"(hash de diff répété, oscillation rouge↔vert, zéro miroir nouvellement vert sur la fenêtre de " +
			"stagnation déclarée, OU le plafond max-itérations atteint), OU le HarnessCostBudget (S51) flaggé " +
			"au-delà d'un cap déclaré — a déclenché l'arrêt. La boucle s'arrête HONNÊTEMENT (KRD §8 : une boucle " +
			"qui ne peut atteindre le vert s'arrête, elle ne revendique jamais un « done » non gagné). Le verdict " +
			"est une FONCTION DE L'HISTORIQUE (même historique ⇒ même arrêt), jamais un jugement LLM (§6/§8 " +
			"déterminisme-d'abord) : le juge est le miroir + le détecteur pur, le LLM est l'exception " +
			"génération-only.",
		HowToFix: []string{
			"inspect_the_iteration_history : lisez la timeline AgentRun/AgentAction (S52) du run — la cause exacte (diff répété / oscillation / zéro vert / cap / budget) est nommée dans le verdict, jamais devinée.",
			"sharpen_the_red_set_or_context : un red set non atteignable signale souvent un miroir mal dérivé ou un ContextPack trop pauvre ; raffinez la dérivation (idea → mirror → /goal) ou élargissez le ContextGraph affecté avant de relancer.",
			"raise_the_declared_budget_via_a_valuecase : si le cap HarnessCostBudget était trop bas pour une cellule qui justifie son coût, ouvrez un ValueCase justifié (§66.3, economics) — le cap est DÉCLARÉ au-dessus de la ligne, jamais relevé en passant.",
			"rerun aidos build : le blocage se lève quand la boucle progresse de nouveau (un miroir passe du rouge au vert dans la fenêtre) sous les caps déclarés.",
		},
	},
}

// codeOrder is the canonical enumeration order of the Code enum. Declared, never
// derived from map iteration, so Codes() and every projection are stable.
var codeOrder = []Code{
	CodeMissingMirror,
	CodeMissingAuthority,
	CodeOutOfScope,
	CodeAgentWriteAboveWaterline,
	CodeNoMirrorNoKernel,
	CodeSpikeWriteEscapesZone,
	CodeHarvestCannotFreeze,
	CodeIdeaWithoutMirror,
	CodeNoRedSet,
	CodeGoalStillRed,
	CodeMemoryCannotDeclareTruth,
	CodeHistoricalImpactRequiresMigration,
	CodeUnknownMigrationStrategy,
	CodeSandboxWriteEscapesZone,
	CodeSandboxCannotGovern,
	CodeRealityCannotDeclareTruth,
	CodeAgentToolNotBound,
	CodeAgentSkillNotBound,
	CodeAgentPathNotAllowed,
	CodeAgentEgressNotAllowed,
	CodeAgentExecNotAllowed,
	CodeAgentMandatoryHookSkipped,
	CodeAgentMandatoryHookRed,
	CodeAgentBudgetExceeded,
	CodeAgentDeterminismGap,
	CodeAgentPostCheckFailed,
	CodeAgentIdentityUnverified,
	CodeAgentLeaseFenced,
	CodeProposalNotAdmitted,
	CodeGenFileHandEdited,
	CodeBuildLoopNoProgress,
}

// Codes returns every Code in the closed enum, in canonical order.
func Codes() []Code {
	out := make([]Code, len(codeOrder))
	copy(out, codeOrder)
	return out
}

// Lookup returns the canonical BlockReason for a code, and whether the code is a
// known member of the closed enum. It invents nothing: an unknown code returns the
// zero BlockReason and false.
func Lookup(code Code) (BlockReason, bool) {
	br, ok := reasons[code]
	if !ok {
		return BlockReason{}, false
	}
	return br, true
}

// For returns the canonical BlockReason for a known code. It panics on an unknown
// code — callers that accept untrusted input use Lookup. For is the deterministic
// constructor the property mirror checks over every enum value.
func For(code Code) BlockReason {
	br, ok := Lookup(code)
	if !ok {
		panic(fmt.Sprintf("blockreason: unknown code %q (the enum is closed)", code))
	}
	return br
}

// Render writes a BlockReason as human-readable text — code, severity, explanation,
// then the numbered how_to_fix resolution path. It is the single rendering shared by
// `aidos explain` and the Workbench /why-blocked panel, so the CLI and the screen
// never diverge. Pure: it round-trips every field and invents nothing (the property
// mirror pins that).
func Render(br BlockReason) string {
	var b strings.Builder
	fmt.Fprintf(&b, "code        : %s\n", br.Code)
	fmt.Fprintf(&b, "severity    : %s\n", br.Severity)
	fmt.Fprintf(&b, "explanation : %s\n", br.Explanation)
	fmt.Fprintln(&b, "how_to_fix  :")
	for i, step := range br.HowToFix {
		fmt.Fprintf(&b, "  %d. %s\n", i+1, step)
	}
	return b.String()
}
