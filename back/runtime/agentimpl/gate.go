// gate.go — BA13: the SINGLE composed verdict that closes the perimeter. GateAction
// folds EVERY declared-axis enforcer built across BA-E2 into ONE pure, total function,
// in an EXPLICIT PRECEDENCE (gap D3). Until this step, each enforcer (Arbitrate, the
// zone wall, PathAllowed, EgressAllowed/ExecAllowed, ToolAllowed, SkillAllowed,
// CheckBudget, HooksSatisfied) stood alone; here they become one interceptor-ready
// gate the loop (and the S04 PreToolUse hook) consult with a single call.
//
// THE PRECEDENCE (the roadmap, verbatim). The order is NOT cosmetic — it decides which
// BlockReason a multiply-violating action returns, so it is part of the contract:
//
//  1. Arbitrate  — does this action even have the RIGHT to be LLM-driven, or does a
//     deterministic tool govern it? (the determinism axis, FIRST — gap D3)
//  2. zone       — Classify deny-list (kernel / mirrors / fitness above the waterline)
//  3. path       — PathAllowed allow-list (the agent's writable root — confinement)
//  4. egress     — EgressAllowed (declared network hosts; empty ⇒ no egress)
//  5. exec       — ExecAllowed (declared subprocess allow-list; empty ⇒ no exec)
//  6. capacity   — ToolAllowed (the bound MCP (server, tool))
//  7. skill      — SkillAllowed (the bound skill)
//  8. budget     — CheckBudget (min() of the two declared caps — the tightest wins)
//  9. hook       — HooksSatisfied (every mandatory hook ran AND is green)
//
// Arbitrate is INSIDE GateAction, not beside it — the determinism axis is part of the
// single verdict, not a separate pass. The zone deny-list precedes the path allow-list
// (a kernel write inside an over-broad AllowedPaths still trips the ZONE axis, never
// miscoded as a confinement breach). Each axis is checked only when its inputs are
// present (an action with no Target skips the path axis, etc.) — the gate is total.
//
// THE WALL (CLAUDE.md §2). GateAction WRITES NOTHING — it is a pure classifier the S04
// hook calls to gate a GOVERNED AgentImplementation's tool calls (not only Claude
// Code's). Below-the-line actions, once allowed, act directly; a truth-write is still
// refused by the zone axis (and any truth change still goes idée → miroir → /goal).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). GateAction is a PURE, TOTAL function of its
// input — it only composes the (already pure) enforcers in a fixed order; no DB, no
// clock, no rng, no I/O, no live LLM. Same input ⇒ same verdict (gate_property_test.go
// pins it). The composition is itself deterministic, as it must be: a gate that
// enforces determinism-first cannot itself defer to a judgment.
package agentimpl

import (
	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// Action is the STRUCTURE of one action GateAction evaluates, carrying the inputs each
// axis reads. A field left at its zero value means "this axis does not apply to this
// action" (an action with no Target writes nothing → the path/zone axes are skipped; no
// Server/Tool → the capacity axis is skipped; etc.) — so GateAction is total over any
// shape. The embedded AgentAction (Tool + Args + RequestedLLM) is the STRUCTURAL input
// the determinism arbiter reads (never DisplayedIntent — gap D1).
type Action struct {
	// AgentAction is the structural input the determinism arbiter (Arbitrate) classifies.
	AgentAction AgentAction `json:"agent_action"`

	// Target is the write target the zone (Classify) and path (PathAllowed) axes inspect.
	// Empty ⇒ the action writes nothing; the zone/path axes are skipped.
	Target string `json:"target,omitempty"`

	// Server + Tool are the MCP capacity-axis pair (ToolAllowed). Empty ⇒ no MCP call.
	Server string `json:"server,omitempty"`
	Tool   string `json:"tool,omitempty"`

	// Skill is the skill-axis input (SkillAllowed). Empty ⇒ no skill use.
	Skill string `json:"skill,omitempty"`

	// Host is the network-confinement input (EgressAllowed). Empty ⇒ no egress.
	Host string `json:"host,omitempty"`

	// Exec is the exec-confinement input (ExecAllowed). Empty ⇒ no subprocess.
	Exec string `json:"exec,omitempty"`
}

// Decision is GateAction's single composed verdict: Allowed when EVERY applicable axis
// passes; on the FIRST violation in precedence, Allowed:false with the failing axis's
// BlockReason and DeniedAxis naming which axis refused (for the panel + telemetry).
type Decision struct {
	Allowed     bool                     `json:"allowed"`
	DeniedAxis  string                   `json:"denied_axis,omitempty"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// The canonical axis names, in precedence order — exported so the panel and the
// reproducibility mirror name the axes from ONE source (never a hand-typed string).
const (
	AxisDeterminism = "determinism" // Arbitrate
	AxisZone        = "zone"        // Classify deny-list
	AxisPath        = "path"        // PathAllowed allow-list
	AxisEgress      = "egress"      // EgressAllowed
	AxisExec        = "exec"        // ExecAllowed
	AxisCapacity    = "capacity"    // ToolAllowed
	AxisSkill       = "skill"       // SkillAllowed
	AxisBudget      = "budget"      // CheckBudget
	AxisHook        = "hook"        // HooksSatisfied
)

// PrecedenceAxes is the fixed precedence order GateAction evaluates — the contract the
// fixture mirror pins. Exported so the panel renders the axes in gate order.
var PrecedenceAxes = []string{
	AxisDeterminism, AxisZone, AxisPath, AxisEgress, AxisExec,
	AxisCapacity, AxisSkill, AxisBudget, AxisHook,
}

// deny builds a denied Decision naming the axis and carrying its BlockReason. The
// BlockReason pointer is the enforcer's own (the codes stay single-sourced).
func deny(axis string, br *blockreason.BlockReason) Decision {
	return Decision{Allowed: false, DeniedAxis: axis, BlockReason: br}
}

// adaptWallReason converts the wall package's BlockReason (the single-sourced zone
// classifier emits its own shape) into the canonical blockreason.BlockReason, so the
// composed Decision carries ONE BlockReason type across every axis. The code is
// preserved verbatim (AGENT_WRITE_ABOVE_WATERLINE); the canonical registry supplies the
// full actionable shape (severity + how_to_fix), never re-typed here.
func adaptWallReason(_ *wall.BlockReason) *blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
	return &br
}

// GateAction is the SINGLE composed, pure, total verdict over all declared axes, in the
// explicit precedence (gap D3). It returns the FIRST violation's Decision, or an allowed
// Decision when every applicable axis passes. An axis is checked only when its inputs are
// present, so the gate is total over any action shape.
//
// hookVerdicts are the per-hook BINARY verdicts (never the agent's transcript — §8); a
// nil slice means no hooks ran (a mandatory hook then trips AGENT_MANDATORY_HOOK_SKIPPED).
func GateAction(
	impl AgentImplementation,
	act Action,
	meter RunMeter,
	h economics.HarnessCostBudget,
	b goal.Budgets,
	ratePerToken float64,
	hookVerdicts []HookVerdict,
) Decision {
	// 1. DETERMINISM — Arbitrate is FIRST: does this action even have the right to be
	//    LLM-driven, or does a deterministic tool govern its structure? (gap D3)
	if br := ArbitrateGated(act.AgentAction); br != nil {
		return deny(AxisDeterminism, br)
	}

	// 2. ZONE — the deny-list (Classify): a write above the waterline is refused BEFORE
	//    the path allow-list, so a kernel write inside an over-broad AllowedPaths still
	//    trips the ZONE axis (never miscoded as confinement).
	if act.Target != "" {
		if d := wall.Classify(act.Target); d.Verdict == wall.VerdictDeny {
			return deny(AxisZone, adaptWallReason(d.BlockReason))
		}
	}

	// 3. PATH — the confinement allow-list (default-deny against AllowedPaths).
	if act.Target != "" {
		if pd := PathAllowed(impl, act.Target); !pd.Allowed {
			return deny(AxisPath, pd.BlockReason)
		}
	}

	// 4. EGRESS — network confinement (declared hosts; empty ⇒ no egress).
	if act.Host != "" {
		if ed := EgressAllowed(impl, act.Host); !ed.Allowed {
			return deny(AxisEgress, ed.BlockReason)
		}
	}

	// 5. EXEC — subprocess confinement (declared allow-list; empty ⇒ no exec).
	if act.Exec != "" {
		if xd := ExecAllowed(impl, act.Exec); !xd.Allowed {
			return deny(AxisExec, xd.BlockReason)
		}
	}

	// 6. CAPACITY — the bound MCP (server, tool).
	if act.Server != "" || act.Tool != "" {
		if td := ToolAllowed(impl, act.Server, act.Tool); !td.Allowed {
			return deny(AxisCapacity, td.BlockReason)
		}
	}

	// 7. SKILL — the bound skill.
	if act.Skill != "" {
		if sd := SkillAllowed(impl, act.Skill); !sd.Allowed {
			return deny(AxisSkill, sd.BlockReason)
		}
	}

	// 8. BUDGET — the min() of the two declared caps (the tightest wins — BA11).
	if bv := CheckBudget(meter, h, b, ratePerToken); !bv.WithinBudget {
		return deny(AxisBudget, bv.BlockReason)
	}

	// 9. HOOK — every mandatory hook ran AND is green (the turn-acceptance gate).
	if br := HooksSatisfied(impl, hookVerdicts); br != nil {
		return deny(AxisHook, br)
	}

	return Decision{Allowed: true}
}
