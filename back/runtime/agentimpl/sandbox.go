// sandbox.go — BA17: the OS/Postgres SANDBOX BINDING. The four confinement axes
// (PathAllowed / EgressAllowed / ExecAllowed / ResourceLimits) are PURE verdicts (BA09); a
// sandbox BINDS them to a real OS/container boundary running under the aidos_agent Postgres
// role, so the SAME allow-list governs the loop at THREE independent levels (defense in
// depth, the roadmap gaps B1/B2):
//
//	level 1 — the FS/network/exec BOUNDARY (the OS mirror of the allow-list): the app tree
//	          is the ONLY writable root; egress is fail-closed; exec is an allow-list; a
//	          cgroup/ulimit descriptor mirrors the declared ResourceLimits;
//	level 1' — the GATE/hook (the S04 PreToolUse deny-list on the ZONE axis + the path axis),
//	          consulted BEFORE every action;
//	level 3 — the Postgres GRANTs (the migration S52 backstop): aidos_agent is SELECT-only on
//	          the truth zones — a write above the waterline WOULD miss the GRANT even if it
//	          slipped past levels 1 and 1'.
//
// The prompt's ForbiddenPaths is the SOFT level (the model is asked not to); the FS boundary
// is the HARD level-1 (the OS refuses); the hook is level-1' and the GRANT is the fail-closed
// level-3 backstop. The three NEVER disagree on a truth-zone write: each refuses
// independently. This file binds them so the proof is one call (CheckWrite / CheckEgress).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): BindSandbox and every boundary decision are PURE,
// TOTAL functions — no DB, no clock, no rng, no actual I/O (the binding DESCRIBES the OS
// boundary deterministically; mounting it is a deployment concern, the verdict is code). The
// LLM is the single gated exception, isolated to generate.go behind the ActionGenerator seam.
// Same input ⇒ same verdict (sandbox_property_test.go pins it).
//
// THE WALL (CLAUDE.md §2): a sandbox can only NARROW. It adds no writable path, no host, no
// command beyond the projection's declared allow-lists; it MIRRORS them at the OS level and
// adds the GRANT backstop. Widening any axis is an above-the-line change (idée → miroir →
// /goal → approbation), never a sandbox knob.
package agentimpl

import (
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// PostgresAgentRole is the Postgres role the build-agent's sandbox runs under — the
// level-3 fail-closed backstop. The migration agent_layer_baseline.sql (S52) GRANTs this
// role SELECT-only on the truth schemas (kernel/mirrors/fitness) and INSERT-only on the
// telemetry tables; it has NO write GRANT above the waterline. This constant single-sources
// the role name so the binding and the docs name the SAME role the migration created.
const PostgresAgentRole = "aidos_agent"

// FSBoundary is the OS mirror of the PathAllowed allow-list: the app tree is the ONLY
// writable root. MayWrite DEFERS to PathAllowed (the BA09 verdict) so the boundary and the
// gate can never disagree — the OS root IS the allow-list.
type FSBoundary struct {
	impl AgentImplementation
}

// MayWrite is the level-1 FS verdict: may the agent write target at the OS boundary? It is
// EXACTLY PathAllowed (the OS root mirrors the allow-list, minus ForbiddenPaths). Pure, total.
func (b FSBoundary) MayWrite(target string) PathDecision {
	return PathAllowed(b.impl, target)
}

// EgressBoundary is the OS mirror of the AllowedNetworkHosts allow-list: fail-closed egress
// (an empty allow-list reaches NO host). MayReach DEFERS to EgressAllowed (the BA09 verdict).
type EgressBoundary struct {
	impl AgentImplementation
}

// MayReach is the level-1 network verdict: may the agent reach host? EXACTLY EgressAllowed —
// fail-closed (empty allow-list ⇒ no egress). Pure, total.
func (b EgressBoundary) MayReach(host string) EgressDecision {
	return EgressAllowed(b.impl, host)
}

// ExecBoundary is the OS mirror of the AllowedExec allow-list: fail-closed subprocess exec
// (an empty allow-list runs NO command). MayRun DEFERS to ExecAllowed (the BA09 verdict).
type ExecBoundary struct {
	impl AgentImplementation
}

// MayRun is the level-1 exec verdict: may the agent run cmd? EXACTLY ExecAllowed —
// fail-closed (empty allow-list ⇒ no subprocess). Pure, total.
func (b ExecBoundary) MayRun(cmd string) ExecDecision {
	return ExecAllowed(b.impl, cmd)
}

// ResourceCaps is the cgroup/ulimit descriptor the sandbox enforces against runaway/fork-bomb
// — the OS mirror of the declared ResourceLimits (BA01). It carries the SAME axes the
// governed layer declared (memory / CPU / wall-clock); the OS enforces them via cgroup +
// ulimit at mount time. Here it is a deterministic DESCRIPTOR (the binding is code; the mount
// is deployment). A zero axis means "no cap declared on that axis".
type ResourceCaps struct {
	MaxMemoryMB    int `json:"max_memory_mb"`
	MaxCPUMillis   int `json:"max_cpu_millis"`
	MaxWallSeconds int `json:"max_wall_seconds"`
}

// Sandbox is the bound OS/container confinement of a governed build-agent run. It is a PURE
// descriptor: the four boundaries (FS / egress / exec / resource caps), the Postgres role the
// run executes under (the level-3 backstop), and the underlying projection (so the gate/hook
// can be consulted). Mounting the boundary is a deployment concern; the VERDICTS are code, so
// the same impl ⇒ the same sandbox ⇒ the same defense-in-depth proof.
type Sandbox struct {
	FS     FSBoundary
	Egress EgressBoundary
	Exec   ExecBoundary
	Caps   ResourceCaps
	// Role is the Postgres role the sandboxed run executes under — always PostgresAgentRole,
	// the SELECT-only-above-the-line backstop the migration created.
	Role string
	impl AgentImplementation
}

// BindSandbox binds a resolved AgentImplementation to its OS/Postgres sandbox: the app tree
// (AllowedPaths) becomes the writable FS root, egress/exec become fail-closed allow-lists, the
// ResourceLimits become the cgroup/ulimit caps, and the run executes under the aidos_agent
// role. Pure, total: same impl ⇒ same Sandbox. It NARROWS only — it adds nothing the
// projection did not declare.
func BindSandbox(impl AgentImplementation) Sandbox {
	return Sandbox{
		FS:     FSBoundary{impl: impl},
		Egress: EgressBoundary{impl: impl},
		Exec:   ExecBoundary{impl: impl},
		Caps: ResourceCaps{
			MaxMemoryMB:    impl.ResourceLimits.MaxMemoryMB,
			MaxCPUMillis:   impl.ResourceLimits.MaxCPUMillis,
			MaxWallSeconds: impl.ResourceLimits.MaxWallSeconds,
		},
		Role: PostgresAgentRole,
		impl: impl,
	}
}

// GateWrite consults the GATE (level-1', the single composed verdict the S04 hook also reads)
// for a write to target — the ZONE deny-list AND the PATH allow-list. It is the gate's
// write-relevant axes (no MCP/skill/host on a bare write). Pure, total.
func (s Sandbox) GateWrite(target string) Decision {
	return GateAction(s.impl, Action{Target: target}, RunMeter{}, economics.HarnessCostBudget{}, goal.Budgets{}, 0, nil)
}

// GateEgress consults the GATE (level-1') for reaching host — the EGRESS axis. Pure, total.
func (s Sandbox) GateEgress(host string) Decision {
	return GateAction(s.impl, Action{Host: host}, RunMeter{}, economics.HarnessCostBudget{}, goal.Budgets{}, 0, nil)
}

// GrantWouldDeny is the level-3 Postgres GRANT backstop, as a PURE predicate over the
// canonical role posture: the aidos_agent role is SELECT-only on the truth zones (the
// migration agent_layer_baseline.sql GRANTed it no write above the waterline). A target above
// the waterline WOULD miss the write GRANT — so even past the FS boundary (level 1) and the
// hook (level 1'), the Postgres role refuses it (level 3). This asserts the binding KNOWS the
// role posture; the migration is the actual truth. Pure, total, deterministic.
func (s Sandbox) GrantWouldDeny(target string) bool {
	// The role has no write GRANT above the waterline — a truth-zone write misses the GRANT.
	return IsAboveWaterline(target)
}

// WriteVerdict is the COMBINED defense-in-depth verdict for a write: allowed only when EVERY
// level allows, and on a deny it names ALL the levels that refused (so the proof is "refused
// at level 1 AND 1' AND 3", never a single point of failure).
type WriteVerdict struct {
	Allowed      bool     `json:"allowed"`
	DeniedLevels []string `json:"denied_levels,omitempty"`
}

// Defense-in-depth level names (stable, declared order — determinism-first).
const (
	LevelFS    = "fs_boundary"    // level 1 — the OS writable-root mirror of the allow-list
	LevelHook  = "hook_gate"      // level 1' — the S04 PreToolUse deny-list (zone) + path axis
	LevelGrant = "postgres_grant" // level 3 — the aidos_agent role's missing write GRANT
)

// CheckWrite is the one-call defense-in-depth proof for a write: it consults all three levels
// (FS boundary, gate/hook, GRANT backstop) and refuses if ANY refuses, listing every level
// that denied. A non-AllowedPaths truth-zone write is refused at all three (the wall holds
// three times over). Pure, total, deterministic.
func (s Sandbox) CheckWrite(target string) WriteVerdict {
	denied := make([]string, 0, 3)
	if !s.FS.MayWrite(target).Allowed {
		denied = append(denied, LevelFS)
	}
	if !s.GateWrite(target).Allowed {
		denied = append(denied, LevelHook)
	}
	if s.GrantWouldDeny(target) {
		denied = append(denied, LevelGrant)
	}
	return WriteVerdict{Allowed: len(denied) == 0, DeniedLevels: denied}
}

// EgressVerdict is the COMBINED defense-in-depth verdict for egress: allowed only when both
// the boundary and the gate allow, naming every level that refused.
type EgressVerdict struct {
	Allowed      bool     `json:"allowed"`
	DeniedLevels []string `json:"denied_levels,omitempty"`
}

const (
	LevelEgressBoundary = "egress_boundary" // level 1 — the OS fail-closed egress mirror
	LevelEgressGate     = "egress_gate"     // level 1' — the gate's egress axis
)

// CheckEgress is the one-call defense-in-depth proof for reaching host: the OS boundary AND
// the gate must both allow; an undeclared host (fail-closed) is refused at both. Pure, total.
func (s Sandbox) CheckEgress(host string) EgressVerdict {
	denied := make([]string, 0, 2)
	if !s.Egress.MayReach(host).Allowed {
		denied = append(denied, LevelEgressBoundary)
	}
	if !s.GateEgress(host).Allowed {
		denied = append(denied, LevelEgressGate)
	}
	return EgressVerdict{Allowed: len(denied) == 0, DeniedLevels: denied}
}
