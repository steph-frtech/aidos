// enforce.go — the CAPACITY-axis (BA07) and SKILL-axis (BA08) enforcers of a governed
// build-agent. ToolAllowed governs MCP (server, tool) pairs; SkillAllowed governs
// skills — both are the same fail-closed allow-list shape as the zone-axis MayWrite.
//
// THE TWO AXES OF THE WALL. The S04/S52 wall (back/hooks/pretooluse, agentlayer.MayWrite)
// applies the ZONE axis: it is a DENY-LIST — ANY target resolving above the waterline
// (kernel / mirrors / fitness) is refused with AGENT_WRITE_ABOVE_WATERLINE, everything
// else passes. That is right for "the forbidden zones are off-limits", but it is NOT
// confinement: a build-agent that must only use the tools its governed layer granted
// needs an ALLOW-LIST, fail-closed (default-deny — anything not explicitly bound is
// refused, never the inverse). BA07 adds the CAPACITY axis as exactly that allow-list.
//
// ToolAllowed is the capability-axis sibling of MayWrite: same fail-closed verdict
// SHAPE (allowed bool + *BlockReason on a deny), but it ranges over (server, tool)
// pairs instead of write targets. It is set-membership against the resolved
// implementation's Tools (the Enabled MCP bindings BA05 resolved): allowed IFF the
// pair is present, denied otherwise with the NEW S13 BlockReason AGENT_TOOL_NOT_BOUND
// (the actionable form naming the idée → miroir → /goal door to grant a binding).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): ToolAllowed is a PURE TOTAL function of its
// input — set-membership, NEVER a judgment. No DB, no clock, no rng, no I/O. Same
// input ⇒ same verdict (the reproducibility mirror enforce_property_test.go pins it).
// An agent deciding "may I use this tool?" by inference would be a determinism gap;
// the verdict is computed from the declared bindings, not reasoned.
//
// THE WALL (CLAUDE.md §2): governance can only NARROW. The capability surface of the
// implementation is a provable subset of the governed layer (BA05); ToolAllowed adds
// no tool — it only refuses what the projection did not carry. A new tool is granted
// only ABOVE the line, through idée → miroir → /goal → approval.
package agentimpl

import (
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ToolDecision is ToolAllowed's verdict: allowed or denied, with the S13 BlockReason
// on a deny. There are exactly two outcomes — the SAME shape as agentlayer.WriteDecision
// (the zone axis), here on the capability axis (the property mirror pins this).
type ToolDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// ToolAllowed is the PURE, TOTAL, fail-closed CAPACITY-axis verdict: may this
// resolved implementation exercise the MCP tool (server, tool)? It is set-membership
// over impl.Tools (the Enabled bindings BA05 resolved):
//
//	allowed == true  IFF  (server, tool) ∈ impl.Tools
//
// Anything not explicitly bound is DENIED (default-deny — an empty Tools denies
// every tool, the max-confinement default), carrying the S13 BlockReason
// AGENT_TOOL_NOT_BOUND (which names the idée → miroir → /goal door to add a binding).
// An allowed verdict carries no BlockReason. Pure, total, deterministic — no DB, no
// clock, no rng, no I/O; same input ⇒ same verdict. Set-membership, never a judgment.
func ToolAllowed(impl AgentImplementation, server, tool string) ToolDecision {
	for _, rt := range impl.Tools {
		if rt.Server == server && rt.Tool == tool {
			return ToolDecision{Allowed: true}
		}
	}
	br := blockreason.For(blockreason.CodeAgentToolNotBound)
	return ToolDecision{Allowed: false, BlockReason: &br}
}

// SkillDecision is SkillAllowed's verdict: allowed or denied, with the S13 BlockReason
// on a deny. There are exactly two outcomes — the SAME shape as ToolDecision (the
// capacity axis) and agentlayer.WriteDecision (the zone axis), here on the SKILL axis.
type SkillDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// SkillAllowed is the PURE, TOTAL, fail-closed SKILL-axis verdict — the 3rd of the
// four declared axes: may this resolved implementation use the named skill? It is
// set-membership over impl.Skills (the Enabled SkillBindings BA05 resolved):
//
//	allowed == true  IFF  skillName ∈ impl.Skills
//
// Anything not explicitly bound is DENIED (default-deny — an empty Skills denies every
// skill, the max-confinement default), carrying the S13 BlockReason
// AGENT_SKILL_NOT_BOUND (which names the idée → miroir → /goal door to add a binding).
// An allowed verdict carries no BlockReason. Pure, total, deterministic — no DB, no
// clock, no rng, no I/O; same input ⇒ same verdict. Set-membership, never a judgment.
//
// Without this enforcer SkillBinding.Enabled is mere documentation: an ungoverned
// skill is the same leak class as an ungoverned tool (BA07). A skill is never widened
// below the line — the only door to grant one is the governed layer.
func SkillAllowed(impl AgentImplementation, skillName string) SkillDecision {
	for _, s := range impl.Skills {
		if s == skillName {
			return SkillDecision{Allowed: true}
		}
	}
	br := blockreason.For(blockreason.CodeAgentSkillNotBound)
	return SkillDecision{Allowed: false, BlockReason: &br}
}

// ── BA09 — the CONFINEMENT enforcers (the 4th wall axis) ───────────────────────────
//
// THE CONFINEMENT AXIS, DISTINCT FROM THE ZONE DENY-LIST. The S04/S52 wall (Classify /
// agentlayer.MayWrite, IsAboveWaterline) is a DENY-LIST on the ZONE axis: ANY target
// above the waterline (kernel / mirrors / fitness) is refused, everything else passes.
// That is right for "the forbidden truth zones are off-limits", but it is NOT
// confinement: a governed build-agent must only touch the writable root its layer
// granted (the app tree), reach only the declared hosts, run only the declared
// commands. BA09 adds the CONFINEMENT axis as exactly that — an ALLOW-LIST, fail-closed
// (default-deny), DISTINCT from the zone deny-list (a path can be denied by confinement
// while NOT being above the waterline). PathAllowed/EgressAllowed/ExecAllowed carry the
// SAME verdict SHAPE as ToolAllowed/SkillAllowed/MayWrite (allowed bool + *BlockReason).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): all three are PURE TOTAL set/prefix predicates —
// no DB, no clock, no rng, no I/O — never a judgment. Same input ⇒ same verdict (the
// reproducibility mirror enforce_property_test.go pins it).

// PathDecision is PathAllowed's verdict — the SAME fail-closed shape as ToolDecision /
// SkillDecision, here on the CONFINEMENT (path) axis.
type PathDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// coveredBy reports whether target is covered by at least one NON-EMPTY prefix in
// prefixes. An empty target is never covered; an empty prefix is ignored (it would
// match everything — that is never an allow-list entry's intent). Pure, total.
func coveredBy(prefixes []string, target string) bool {
	if target == "" {
		return false
	}
	for _, p := range prefixes {
		if p == "" {
			continue
		}
		if strings.HasPrefix(target, p) {
			return true
		}
	}
	return false
}

// PathAllowed is the PURE, TOTAL, fail-closed CONFINEMENT-axis verdict — the 4th axis:
// may this resolved implementation touch target? It is an ALLOW-LIST over impl.AllowedPaths
// MINUS impl.ForbiddenPaths (the wall is always carried in ForbiddenPaths):
//
//	allowed == true  IFF  (∃ a ∈ AllowedPaths: prefix(a, target)) ∧ (∄ f ∈ ForbiddenPaths: prefix(f, target))
//
// Anything not covered by an AllowedPaths prefix is DENIED (default-deny — an empty
// AllowedPaths denies EVERY path, the max-confinement default), as is anything under a
// ForbiddenPaths prefix, carrying the S13 BlockReason AGENT_PATH_NOT_ALLOWED. This is
// DISTINCT from the zone deny-list (IsAboveWaterline): a path NOT above the waterline
// can still be denied here for falling outside the agent's declared writable root. An
// allowed verdict carries no BlockReason. Set/prefix membership, never a judgment.
func PathAllowed(impl AgentImplementation, target string) PathDecision {
	if coveredBy(impl.AllowedPaths, target) && !coveredBy(impl.ForbiddenPaths, target) {
		return PathDecision{Allowed: true}
	}
	br := blockreason.For(blockreason.CodeAgentPathNotAllowed)
	return PathDecision{Allowed: false, BlockReason: &br}
}

// EgressDecision is EgressAllowed's verdict — the SAME fail-closed shape, on the
// network-confinement axis.
type EgressDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// EgressAllowed is the PURE, TOTAL, fail-closed NETWORK-confinement verdict: may this
// resolved implementation reach host? It DEFERS to the governed-layer allow-list
// semantics (AgentImplementation.EgressAllowed → agentlayer.EgressAllowed): an EMPTY
// AllowedNetworkHosts denies EVERY host (no egress by default — fail-closed). On a deny
// it carries the S13 BlockReason AGENT_EGRESS_NOT_ALLOWED; an allow carries none.
func EgressAllowed(impl AgentImplementation, host string) EgressDecision {
	if impl.EgressAllowed(host) {
		return EgressDecision{Allowed: true}
	}
	br := blockreason.For(blockreason.CodeAgentEgressNotAllowed)
	return EgressDecision{Allowed: false, BlockReason: &br}
}

// ExecDecision is ExecAllowed's verdict — the SAME fail-closed shape, on the
// exec-confinement axis.
type ExecDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// ExecAllowed is the PURE, TOTAL, fail-closed EXEC-confinement verdict: may this
// resolved implementation run the subprocess cmd? It DEFERS to
// AgentImplementation.ExecAllowed → agentlayer.ExecAllowed: an EMPTY AllowedExec denies
// EVERY command (no subprocess by default — fail-closed). The agent's Bash is itself
// gated — every command passes ExecAllowed, never a free shell. On a deny it carries the
// S13 BlockReason AGENT_EXEC_NOT_ALLOWED; an allow carries none.
func ExecAllowed(impl AgentImplementation, cmd string) ExecDecision {
	if impl.ExecAllowed(cmd) {
		return ExecDecision{Allowed: true}
	}
	br := blockreason.For(blockreason.CodeAgentExecNotAllowed)
	return ExecDecision{Allowed: false, BlockReason: &br}
}

// ── BA10 — the MANDATORY-HOOK enforcer (the turn-acceptance gate) ────────────────────
//
// THE HOOK AXIS OF ACCEPTANCE, DISTINCT FROM THE FOUR WALL AXES. ToolAllowed (capacity),
// SkillAllowed (skill), PathAllowed (confinement) and the S04/S52 wall (zone) gate what an
// action may TOUCH. BA10 gates whether a TURN may be ACCEPTED: a governed build-agent's
// turn is admissible ONLY when every HooksObligatoires{Mandatory:true} declared in its
// resolved implementation actually RAN and is GREEN. Presence ≠ green — a mandatory hook
// that ran and FAILED blocks acceptance just as one that never ran does (hook-honesty,
// CLAUDE.md §5: a hook that never fires is dead).
//
// THE VERDICT COMES FROM THE BINARY, NEVER THE TRANSCRIPT (CLAUDE.md §8). HooksSatisfied
// consumes a per-hook HookVerdict — the hook BINARY's own deterministic exit/BlockReason —
// NEVER a set of names the agent self-reports. The judge is deterministic; an agent that
// claimed "my hooks all passed" without the binary's verdict would be the circularity §8
// forbids.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): HooksSatisfied is a PURE TOTAL function of
// (impl, verdicts) — set/predicate evaluation over the declared mandatory hooks and the
// binary-emitted verdicts, no DB/clock/rng/I/O, never a judgment. Same input ⇒ same
// verdict (the reproducibility + fault-injection mirror hooks_property_test.go pins it).

// HookVerdict is one hook binary's deterministic outcome for a turn: the (Phase, Hook)
// it ran for, whether it RAN at all, and whether it is GREEN. It is the binary's OWN
// verdict (its exit / BlockReason), NEVER an agent-self-reported claim (CLAUDE.md §8).
// A hook absent from the verdict slice never ran; one present with Ran:false likewise
// never ran; one with Ran:true ∧ Green:false ran and failed (present, not green).
type HookVerdict struct {
	Phase string `json:"phase"`
	Hook  string `json:"hook"`
	Ran   bool   `json:"ran"`
	Green bool   `json:"green"`
}

// verdictFor returns the first HookVerdict matching (phase, hook), if any. Pure, total.
func verdictFor(verdicts []HookVerdict, phase, hook string) (HookVerdict, bool) {
	for _, v := range verdicts {
		if v.Phase == phase && v.Hook == hook {
			return v, true
		}
	}
	return HookVerdict{}, false
}

// HooksSatisfied is the PURE, TOTAL turn-acceptance gate over the MANDATORY hooks: may
// this turn be ACCEPTED? It asserts that every HooksObligatoires{Mandatory:true} declared
// in impl.Hooks actually RAN and is GREEN, judged by the hook BINARY's own verdict
// (verdicts), never the agent's transcript:
//
//	HooksSatisfied(impl, verdicts) == nil  IFF  ∀ h ∈ impl.Hooks where h.Mandatory:
//	                                              (∃ v ∈ verdicts: v matches h ∧ v.Ran ∧ v.Green)
//
// On a violation it returns a BlockReason:
//   - a mandatory hook with NO verdict (or a verdict with Ran:false) — it never ran —
//     ⇒ AGENT_MANDATORY_HOOK_SKIPPED (reported first: an absent hook is "skipped", never
//     miscoded "red");
//   - a mandatory hook that RAN but is NOT green ⇒ AGENT_MANDATORY_HOOK_RED (presence ≠
//     green).
//
// Non-mandatory hooks are advisory: they never block acceptance. Hooks are scanned in
// declared order, with skipped reported before red, so the verdict is stable
// (determinism-first). Returns nil — the turn is accepted — when every mandatory hook ran
// green (or there are none). Pure: no DB, no clock, no rng, no I/O.
func HooksSatisfied(impl AgentImplementation, verdicts []HookVerdict) *blockreason.BlockReason {
	// First pass: any mandatory hook that NEVER ran is SKIPPED (reported before red).
	for _, h := range impl.Hooks {
		if !h.Mandatory {
			continue
		}
		v, ok := verdictFor(verdicts, h.Phase, h.Hook)
		if !ok || !v.Ran {
			br := blockreason.For(blockreason.CodeAgentMandatoryHookSkipped)
			return &br
		}
	}
	// Second pass: any mandatory hook that ran but is NOT green is RED (presence ≠ green).
	for _, h := range impl.Hooks {
		if !h.Mandatory {
			continue
		}
		v, _ := verdictFor(verdicts, h.Phase, h.Hook)
		if !v.Green {
			br := blockreason.For(blockreason.CodeAgentMandatoryHookRed)
			return &br
		}
	}
	return nil
}
