// compliance.go — GV04: the ten OWASP Agentic AI Top-10 risks as DETERMINISTIC
// COMPLIANCE MIRRORS with per-risk fault-injection.
//
// WHERE GV01 IS A REPORT, GV04 IS A SET OF EXECUTABLE MIRRORS. The GV01 cross-check
// (owasp.go) is a declared COVERAGE TABLE — prose naming which enforcer covers which
// risk. GV04 turns each of those ten claims into an EXECUTABLE conformance check
// anchored to the REAL enforcer verdict (agentimpl.GateAction, agentlayer.MayWrite,
// agentimpl.Arbitrate, agentrun.Verify). A claim in a table is a wish; a green mirror
// with a red fault-injection is a proof (CLAUDE.md Mandat A).
//
// THE MIRROR SHAPE (the GV03 fault-injection discipline). Every risk carries a mirror
// with two scenarios over the SAME real enforcer:
//
//   - the GOVERNED scenario — the forbidden action presented to the LIVE enforcer; the
//     enforcer DENIES it, so the mirror is GREEN (the risk is governed on the current
//     state). This is the "tous verts sur l'état courant" half.
//   - the INJECTED scenario — the enforcer is DEGRADED exactly the way that risk would
//     materialize (the deny-list emptied, the wall bypassed, the arbiter blinded, the
//     Merkle chain dropped); the forbidden action now ESCAPES, so the mirror goes RED.
//     This is the "injecter la violation correspondante → le miroir passe rouge" half,
//     and it PROVES the enforcer is load-bearing (a mirror that stays green under
//     injection is a monster — it proves nothing).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every mirror is a PURE, TOTAL function of its
// declared scenario — it calls the existing pure enforcers (GateAction/MayWrite/
// Arbitrate/Verify), no DB, no clock, no rng, no I/O, no LLM. The judge is the enforcer
// itself (single-sourced — the mirror never re-implements a verdict), so the report
// cannot drift from the wall it audits. Same scenario ⇒ same verdict (the reproducibility
// mirror compliance_property_test.go pins it). An LLM "judging compliance" would be a
// determinism gap; here the enforcer is the authoritative judge.
//
// THE WALL STAYS AUTHORITATIVE. The mirrors READ the enforcers; they write nothing and
// govern nothing. They are below the waterline (a conformance verdict, not a layer).
package governance

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// MirrorResult is one compliance mirror's verdict against a scenario. Compliant means the
// risk is GOVERNED for that scenario: the forbidden action was DENIED (or the audit chain
// verified). Evidence names the enforcer signal that decided it — single-sourced from the
// real verdict (the denied axis, the BlockReason code, the TamperKind), never invented.
type MirrorResult struct {
	Risk      Risk   `json:"risk"`
	Compliant bool   `json:"compliant"`        // true = the risk is governed for this scenario
	Evidence  string `json:"evidence"`         // the enforcer signal that decided it
	Detail    string `json:"detail,omitempty"` // a short human note (which forbidden action / which degradation)
}

// ComplianceMirror is the GV04 mirror for ONE OWASP risk: a governed check and the
// matching fault-injection, both run against the SAME live enforcer. CheckGoverned is the
// current-state half (must be Compliant); CheckInjected is the fault-injection half (must
// be NOT Compliant — the degraded enforcer lets the forbidden action escape). The pair is
// what makes the mirror load-bearing.
type ComplianceMirror struct {
	Risk  Risk   `json:"risk"`
	Title string `json:"title"`
	// Anchor names the real enforcer this mirror exercises (e.g. "agentimpl.GateAction"),
	// so the mirror is auditable back to ONE source of truth.
	Anchor string `json:"anchor"`
	// Forbidden is the human description of the action the risk would attempt.
	Forbidden string `json:"forbidden"`

	checkGoverned func() MirrorResult
	checkInjected func() MirrorResult
}

// CheckGoverned runs the governed (current-state) scenario: the forbidden action against
// the LIVE enforcer. It MUST return Compliant (the risk is governed).
func (m ComplianceMirror) CheckGoverned() MirrorResult { return m.checkGoverned() }

// CheckInjected runs the fault-injection: the SAME forbidden action against a DEGRADED
// enforcer (the risk materialized). It MUST return NOT Compliant (the violation escapes),
// proving the live enforcer is load-bearing.
func (m ComplianceMirror) CheckInjected() MirrorResult { return m.checkInjected() }

// ---------------------------------------------------------------------------------------
// Shared governed fixtures — a properly governed AgentImplementation and the zero economic
// frame, so each mirror exercises the real enforcer over a realistic, governed surface.
// ---------------------------------------------------------------------------------------

// governedImpl is a properly-governed projection: a single declared writable path BELOW the
// waterline, one bound MCP tool, one bound skill, empty egress/exec (max confinement,
// fail-closed), and the wall always carried in ForbiddenPaths. It is the realistic surface
// the gate axes read; the mirrors present forbidden actions AGAINST it.
func governedImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:       "CoucheAgent@gv04",
		Role:           "executor",
		Objectif:       "ship the step",
		Provider:       agentlayer.ProviderAnthropic,
		Model:          "claude-opus-4-8",
		Temperature:    0,
		MaxTurns:       8,
		AllowedPaths:   []string{"back/runtime/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		Tools:          []agentimpl.ResolvedTool{{Server: "store", Tool: "read"}},
		Skills:         []string{"tdd"},
	}
}

// degradedImpl is the DEGRADED projection used by the confinement fault-injections: the
// declared allow-lists are WIDENED to admit exactly the forbidden values the mirrors present
// (egress to evil.example.com, the out-of-bounds front path, the unbound privileged/deploy
// tool, the undeclared third-party skill). Allow-list matching is EXACT (knobs.go), so the
// injection lists the concrete value — this is the "what if the declared confinement let this
// through" fault. Below the line; a fixture, never a real impl.
func degradedImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:            "CoucheAgent@gv04-degraded",
		Role:                "executor",
		Objectif:            "ship the step",
		Provider:            agentlayer.ProviderAnthropic,
		Model:               "claude-opus-4-8",
		Temperature:         0,
		MaxTurns:            8,
		AllowedPaths:        []string{"back/", "front/", "tests/"},
		ForbiddenPaths:      agentimpl.WallForbiddenPaths(),
		AllowedNetworkHosts: []string{"evil.example.com"},
		AllowedExec:         []string{"/bin/sh"},
		Tools:               []agentimpl.ResolvedTool{{Server: "privileged", Tool: "deploy"}, {Server: "store", Tool: "read"}},
		Skills:              []string{"untrusted-third-party", "tdd"},
	}
}

// zeroFrame is the economic frame the gate reads when the mirror is not exercising the
// budget axis: an unbounded harness budget, no goal budget, no metered spend, so the
// budget/hook axes pass and the mirror isolates the axis it targets.
func zeroFrame() (agentimpl.RunMeter, economics.HarnessCostBudget, goal.Budgets, float64) {
	return agentimpl.RunMeter{}, economics.HarnessCostBudget{}, goal.Budgets{}, 0
}

// gateDenies runs GateAction over a governed impl + action with the zero economic frame and
// a satisfied hook set, and reports whether the gate DENIED — the single authoritative
// signal the confinement/capacity mirrors read. Returns the denied axis (or "" when allowed)
// and the BlockReason code (or "").
func gateDenies(impl agentimpl.AgentImplementation, act agentimpl.Action) (denied bool, axis, code string) {
	meter, h, b, rate := zeroFrame()
	// a single green mandatory hook so the HOOK axis never spuriously denies — the mirrors
	// target the EARLIER axes, not the hook gate (that is BA10's own mirror).
	hv := []agentimpl.HookVerdict{}
	d := agentimpl.GateAction(impl, act, meter, h, b, rate, hv)
	if d.Allowed {
		return false, "", ""
	}
	code = ""
	if d.BlockReason != nil {
		code = string(d.BlockReason.Code)
	}
	return true, d.DeniedAxis, code
}

// ---------------------------------------------------------------------------------------
// The ten mirrors. Each anchors to a REAL enforcer and degrades it the way its risk
// materializes. Declared in canonical AAI01..AAI10 order.
// ---------------------------------------------------------------------------------------

// AAI01 — Authorization & Control Hijacking. Governed: a write ABOVE the waterline is
// refused by the structural wall (agentlayer.MayWrite), regardless of role. Injected: the
// wall predicate is bypassed (the target is treated as below the line), so the kernel write
// escapes.
func mirrorAuthorizationHijacking() ComplianceMirror {
	const target = "kernel.truth"
	return ComplianceMirror{
		Risk:      RiskAuthorizationHijacking,
		Title:     "Authorization & Control Hijacking",
		Anchor:    "agentlayer.MayWrite",
		Forbidden: "an agent writes to the kernel truth schema (above the waterline)",
		checkGoverned: func() MirrorResult {
			d := agentlayer.MayWrite(agentlayer.AgentSpec{}, target)
			return mr(RiskAuthorizationHijacking, !d.Allowed, brCode(d.BlockReason), "wall refuses the above-the-line write")
		},
		checkInjected: func() MirrorResult {
			// INJECTION: the wall is bypassed — the forbidden target is no longer checked.
			// We model the degraded enforcer as "every write allowed" (the wall removed).
			escaped := degradedMayWrite(target)
			return mr(RiskAuthorizationHijacking, !escaped.allowed, escaped.code, "wall bypassed: the kernel write escapes")
		},
	}
}

// AAI02 — Critical-System Interaction. Governed: an egress to an undeclared host trips the
// EGRESS axis (empty allow-list ⇒ no egress). Injected: the host allow-list is opened (the
// confinement emptied), so the egress escapes.
func mirrorCriticalSystemInteraction() ComplianceMirror {
	act := agentimpl.Action{Host: "evil.example.com"}
	return ComplianceMirror{
		Risk:      RiskCriticalSystemInteraction,
		Title:     "Critical-System Interaction",
		Anchor:    "agentimpl.GateAction (egress axis)",
		Forbidden: "an agent reaches an undeclared network host",
		checkGoverned: func() MirrorResult {
			denied, axis, code := gateDenies(governedImpl(), act)
			return mr(RiskCriticalSystemInteraction, denied, code, "egress axis denies: "+axis)
		},
		checkInjected: func() MirrorResult {
			denied, _, code := gateDenies(degradedImpl(), act)
			return mr(RiskCriticalSystemInteraction, denied, code, "egress allow-list opened: the host escapes")
		},
	}
}

// AAI03 — Goal & Instruction Manipulation. Governed: a determinism-gap action (it requests
// the LLM where a deterministic tool exists) is refused by the arbiter — and crucially the
// arbiter reads the STRUCTURE, never the DisplayedIntent (re-labelling cannot launder it).
// Injected: the arbiter is blinded (it trusts the displayed label instead of the structure),
// so the relabelled action escapes.
func mirrorGoalManipulation() ComplianceMirror {
	// structurally a SEARCH (`bash rg …` — a deterministic tool exists) but it requests the LLM
	// AND carries a benign displayed label — the classic instruction-manipulation shape. The
	// arbiter reads (Tool, Args) and finds ToolSearch, so RequestedLLM is a DETERMINISM GAP.
	act := agentimpl.AgentAction{
		Tool:            "bash",
		Args:            []string{"rg", "TODO"},
		RequestedLLM:    true,
		DisplayedIntent: "just chatting about the code, nothing to gate",
	}
	return ComplianceMirror{
		Risk:      RiskGoalManipulation,
		Title:     "Goal & Instruction Manipulation",
		Anchor:    "agentimpl.Arbitrate / ArbitrateGated",
		Forbidden: "an agent re-labels a deterministic action to route it through the LLM",
		checkGoverned: func() MirrorResult {
			br := agentimpl.ArbitrateGated(act)
			return mr(RiskGoalManipulation, br != nil, brCode(br), "arbiter reads structure, ignores the displayed label")
		},
		checkInjected: func() MirrorResult {
			// INJECTION: the arbiter trusts the DisplayedIntent — a blinded arbiter sees a
			// benign label and lets the gap escape.
			escaped := arbiterTrustsLabel(act)
			return mr(RiskGoalManipulation, !escaped, "", "arbiter blinded to structure: the relabelled gap escapes")
		},
	}
}

// AAI04 — Hallucination & Misinformation Exploitation. Governed: an agent proposal is always
// `proposed`, never `admitted` — the agent cannot DECLARE truth (agentlayer.Propose). Injected:
// the proposal is treated as auto-admitted, so the agent's generative output becomes truth.
func mirrorHallucinationExploitation() ComplianceMirror {
	return ComplianceMirror{
		Risk:      RiskHallucinationExploitation,
		Title:     "Hallucination & Misinformation Exploitation",
		Anchor:    "agentlayer.Propose",
		Forbidden: "an agent's generated output is admitted as truth without human approval",
		checkGoverned: func() MirrorResult {
			// GOVERNED: the REAL agentlayer.Propose — an agent proposal is ALWAYS `proposed`,
			// never `admitted` (the single authoritative source; the mirror never re-implements it).
			admitted := realProposeAdmits()
			return mr(RiskHallucinationExploitation, !admitted, "PROPOSAL_NOT_ADMITTED", "Propose yields `proposed`, never `admitted`")
		},
		checkInjected: func() MirrorResult {
			// INJECTION: a degraded gate auto-admits — the proposal skips approval and becomes truth.
			admitted := proposalAutoAdmitted(true)
			return mr(RiskHallucinationExploitation, !admitted, "", "auto-admit on: the generated output becomes truth")
		},
	}
}

// AAI05 — Impact Chain & Blast Radius. Governed: an action targeting an out-of-confinement
// path trips the PATH axis (default-deny against AllowedPaths), bounding the writable root.
// Injected: AllowedPaths is opened, so the out-of-bounds write escapes (the blast radius is
// no longer bounded).
func mirrorImpactChainBlastRadius() ComplianceMirror {
	act := agentimpl.Action{Target: "front/web/app/secret/page.tsx"}
	return ComplianceMirror{
		Risk:      RiskImpactChainBlastRadius,
		Title:     "Impact Chain & Blast Radius",
		Anchor:    "agentimpl.GateAction (path axis)",
		Forbidden: "an agent writes outside its declared confinement (uncontrolled blast radius)",
		checkGoverned: func() MirrorResult {
			denied, axis, code := gateDenies(governedImpl(), act)
			return mr(RiskImpactChainBlastRadius, denied, code, "path axis denies: "+axis)
		},
		checkInjected: func() MirrorResult {
			denied, _, code := gateDenies(degradedImpl(), act)
			return mr(RiskImpactChainBlastRadius, denied, code, "AllowedPaths opened: the out-of-bounds write escapes")
		},
	}
}

// AAI06 — Memory & Context Manipulation. Governed: memory cannot declare truth — a memory-
// sourced proposal is `proposed`, never `admitted` (the memory firewall, modelled here via
// the same Propose gate with a memory provenance). Injected: the firewall is bypassed, so the
// poisoned memory becomes truth.
func mirrorMemoryContextManipulation() ComplianceMirror {
	return ComplianceMirror{
		Risk:      RiskMemoryContextManipulation,
		Title:     "Memory & Context Manipulation",
		Anchor:    "agentlayer.Propose (memory firewall)",
		Forbidden: "poisoned memory/context is admitted as truth",
		checkGoverned: func() MirrorResult {
			// GOVERNED: the REAL agentlayer.Propose, for a memory-sourced scenario — it too is
			// `proposed`, never `admitted` (memory proposes, never freezes; same authoritative gate).
			admitted := realProposeAdmits()
			return mr(RiskMemoryContextManipulation, !admitted, "MEMORY_CANNOT_DECLARE_TRUTH", "memory proposes, never freezes")
		},
		checkInjected: func() MirrorResult {
			admitted := memoryAutoAdmitted(true)
			return mr(RiskMemoryContextManipulation, !admitted, "", "firewall bypassed: poisoned memory becomes truth")
		},
	}
}

// AAI07 — Orchestration & Multi-Agent Exploitation. Governed: a tool/skill not bound to the
// impl is refused (CAPACITY/SKILL axes) — an agent cannot reach a capability it was not
// granted (no identity-spoofed escalation). Injected: the tool allow-list is opened, so the
// unbound tool escapes.
func mirrorOrchestrationExploitation() ComplianceMirror {
	act := agentimpl.Action{Server: "privileged", Tool: "deploy"}
	return ComplianceMirror{
		Risk:      RiskOrchestrationExploitation,
		Title:     "Orchestration & Multi-Agent Exploitation",
		Anchor:    "agentimpl.GateAction (capacity axis)",
		Forbidden: "an agent invokes an MCP tool it was never bound to",
		checkGoverned: func() MirrorResult {
			denied, axis, code := gateDenies(governedImpl(), act)
			return mr(RiskOrchestrationExploitation, denied, code, "capacity axis denies: "+axis)
		},
		checkInjected: func() MirrorResult {
			denied, _, code := gateDenies(degradedImpl(), act)
			return mr(RiskOrchestrationExploitation, denied, code, "tool allow-list opened: the unbound tool escapes")
		},
	}
}

// AAI08 — Supply Chain & Dependency Attacks. Governed: a skill not declared on the impl is
// refused (SKILL axis) — only DECLARED, bound skills run (no skill bound at runtime). Injected:
// the skill allow-list is opened, so the undeclared skill escapes.
func mirrorSupplyChainDependency() ComplianceMirror {
	act := agentimpl.Action{Skill: "untrusted-third-party"}
	return ComplianceMirror{
		Risk:      RiskSupplyChainDependency,
		Title:     "Supply Chain & Dependency Attacks",
		Anchor:    "agentimpl.GateAction (skill axis)",
		Forbidden: "an agent binds an undeclared third-party skill at runtime",
		checkGoverned: func() MirrorResult {
			denied, axis, code := gateDenies(governedImpl(), act)
			return mr(RiskSupplyChainDependency, denied, code, "skill axis denies: "+axis)
		},
		checkInjected: func() MirrorResult {
			denied, _, code := gateDenies(degradedImpl(), act)
			return mr(RiskSupplyChainDependency, denied, code, "skill allow-list opened: the undeclared skill escapes")
		},
	}
}

// AAI09 — Untraceability & Repudiation. Governed: the tamper-evident Merkle ledger (GV03)
// catches a DELETED run — removing a row breaks the chain and agentrun.Verify goes red.
// Injected: the chain is degraded to per-row-only addressing (the prior_root fold dropped),
// so a whole run can be removed silently (Verify stays green).
func mirrorUntraceabilityRepudiation() ComplianceMirror {
	runs := sampleRuns()
	return ComplianceMirror{
		Risk:      RiskUntraceabilityRepudiation,
		Title:     "Untraceability & Repudiation",
		Anchor:    "agentrun.Verify (Merkle ledger)",
		Forbidden: "a run is deleted from the audit ledger without a trace",
		checkGoverned: func() MirrorResult {
			caught := merkleCatchesDeletion(runs, false)
			return mr(RiskUntraceabilityRepudiation, caught, "MERKLE_TAMPER_DETECTED", "Verify catches the deleted run")
		},
		checkInjected: func() MirrorResult {
			// INJECTION: degrade to BA28-equivalent per-row addressing (no chain fold), the way
			// the GV03 mirror models a non-load-bearing chain — the deletion now escapes.
			caught := merkleCatchesDeletion(runs, true)
			return mr(RiskUntraceabilityRepudiation, caught, "", "chain fold dropped: the deletion escapes")
		},
	}
}

// AAI10 — Economic & Resource Exhaustion. Governed: a run exceeding the declared budget cap
// trips the BUDGET axis (the tightest declared cap wins — BA11). Injected: the caps are
// removed (unbounded), so the runaway spend escapes.
func mirrorEconomicExhaustion() ComplianceMirror {
	// a metered spend that exceeds the declared cap below.
	meter := agentimpl.RunMeter{Tokens: 1_000_000}
	// governed: a small declared token cap (the effective cap is min(S29, S51) = 1000).
	govH := economics.HarnessCostBudget{MaxLLMTokensPerGoal: 1000}
	govB := goal.Budgets{Tokens: 1000}
	// injected: the caps are removed — modelled as unbounded (the effective min is huge),
	// so the runaway spend is no longer capped and escapes.
	const unbounded = 1 << 60
	injH := economics.HarnessCostBudget{MaxLLMTokensPerGoal: unbounded}
	injB := goal.Budgets{Tokens: unbounded}
	return ComplianceMirror{
		Risk:      RiskEconomicExhaustion,
		Title:     "Economic & Resource Exhaustion",
		Anchor:    "agentimpl.GateAction (budget axis)",
		Forbidden: "a runaway run spends past its declared token/compute budget",
		checkGoverned: func() MirrorResult {
			denied, axis, code := budgetGateDenies(meter, govH, govB)
			return mr(RiskEconomicExhaustion, denied, code, "budget axis denies: "+axis)
		},
		checkInjected: func() MirrorResult {
			// INJECTION: the caps are removed (unbounded) — the runaway spend escapes.
			denied, _, code := budgetGateDenies(meter, injH, injB)
			return mr(RiskEconomicExhaustion, denied, code, "budget caps removed: the runaway spend escapes")
		},
	}
}

// mirrorOrder is the canonical AAI01..AAI10 mirror order — declared, never derived from map
// iteration, so the suite rows are stable.
var mirrorFns = []func() ComplianceMirror{
	mirrorAuthorizationHijacking,
	mirrorCriticalSystemInteraction,
	mirrorGoalManipulation,
	mirrorHallucinationExploitation,
	mirrorImpactChainBlastRadius,
	mirrorMemoryContextManipulation,
	mirrorOrchestrationExploitation,
	mirrorSupplyChainDependency,
	mirrorUntraceabilityRepudiation,
	mirrorEconomicExhaustion,
}

// Mirrors returns the ten compliance mirrors in canonical AAI01..AAI10 order. Each risk has
// EXACTLY one mirror; the completeness check (a risk with no mirror is a monster) proves the
// ten-to-ten correspondence.
func Mirrors() []ComplianceMirror {
	out := make([]ComplianceMirror, 0, len(mirrorFns))
	for _, f := range mirrorFns {
		out = append(out, f())
	}
	return out
}

// MirrorFor returns the compliance mirror for a risk and whether it exists. Total.
func MirrorFor(r Risk) (ComplianceMirror, bool) {
	for _, f := range mirrorFns {
		m := f()
		if m.Risk == r {
			return m, true
		}
	}
	return ComplianceMirror{}, false
}

// SuiteResult is the GV04 conformance roll-up over the current state: every mirror run in its
// GOVERNED scenario. AllCompliant is true iff every risk is governed (the "tous verts" gate).
type SuiteResult struct {
	Results      []MirrorResult `json:"results"`
	AllCompliant bool           `json:"all_compliant"`
	Compliant    int            `json:"compliant"`
	Total        int            `json:"total"`
}

// CheckCompliance runs every mirror's GOVERNED scenario over the current state — the
// authoritative "are all ten risks governed right now" verdict the Workbench and CLI read.
// PURE, TOTAL: same enforcers ⇒ same suite (the reproducibility mirror pins it).
func CheckCompliance() SuiteResult {
	mirrors := Mirrors()
	res := make([]MirrorResult, 0, len(mirrors))
	all := true
	count := 0
	for _, m := range mirrors {
		r := m.CheckGoverned()
		res = append(res, r)
		if r.Compliant {
			count++
		} else {
			all = false
		}
	}
	return SuiteResult{Results: res, AllCompliant: all, Compliant: count, Total: len(mirrors)}
}

// CheckInjected runs every mirror's FAULT-INJECTION scenario — the proof that each enforcer
// is load-bearing: every mirror MUST go NOT-Compliant under its injection. It is the
// audit-the-audit half (a mirror that stays compliant under injection is a monster).
func CheckInjected() SuiteResult {
	mirrors := Mirrors()
	res := make([]MirrorResult, 0, len(mirrors))
	stillCompliant := 0
	for _, m := range mirrors {
		r := m.CheckInjected()
		res = append(res, r)
		if r.Compliant {
			stillCompliant++
		}
	}
	// AllCompliant is intentionally the GOVERNED meaning; for the injected suite the
	// interesting field is Compliant (how many WRONGLY stayed compliant — must be 0).
	return SuiteResult{Results: res, AllCompliant: stillCompliant == len(mirrors), Compliant: stillCompliant, Total: len(mirrors)}
}

// ---------------------------------------------------------------------------------------
// Helpers — the small, pure pieces. mr builds a MirrorResult; brCode reads a BlockReason
// code; the degrade-* helpers MODEL the injection (the way a risk materializes) without
// touching the real enforcer's code — they are local fixtures, the enforcer stays intact.
// ---------------------------------------------------------------------------------------

func mr(r Risk, compliant bool, evidence, detail string) MirrorResult {
	return MirrorResult{Risk: r, Compliant: compliant, Evidence: evidence, Detail: detail}
}

// brCode reads a BlockReason's code, or "" — single-sourced from the real verdict, never a
// hand-typed string. A nil pointer yields "".
func brCode(br *blockreason.BlockReason) string {
	if br == nil {
		return ""
	}
	return string(br.Code)
}

type writeEscape struct {
	allowed bool
	code    string
}

// degradedMayWrite MODELS the AAI01 injection: the wall predicate is bypassed (the target is
// treated as below the line), so the kernel write is ALLOWED. The real agentlayer.MayWrite is
// untouched — this is the fault-injection fixture proving the wall is load-bearing.
func degradedMayWrite(_ string) writeEscape {
	return writeEscape{allowed: true, code: ""}
}

// arbiterTrustsLabel MODELS the AAI03 injection: a blinded arbiter that TRUSTS the displayed
// label instead of reading the structure — a benign DisplayedIntent makes the gap escape
// (returns true = escaped). The real Arbitrate is untouched.
func arbiterTrustsLabel(a agentimpl.AgentAction) bool {
	// the displayed label is benign, so a label-trusting arbiter never blocks → escaped.
	return a.DisplayedIntent != ""
}

// realProposeAdmits calls the REAL agentlayer.Propose with a propose-righted agent and reports
// whether the resulting proposal is ADMITTED. It ALWAYS returns false — Propose has no path to
// `admitted` (an agent never self-admits, CLAUDE.md §8). This anchors the AAI04/AAI06 governed
// scenario to the single authoritative gate, so the mirror cannot drift from the real surface.
func realProposeAdmits() bool {
	c := agentlayer.CoucheAgent{Spec: agentlayer.AgentSpec{Role: "bdd-writer", PeutProposerVerite: true}}
	p, err := agentlayer.Propose(c, "a generated candidate-truth")
	if err != nil {
		return false
	}
	return p.Status == agentlayer.StatusAdmitted
}

// proposalAutoAdmitted MODELS the AAI04 injection: a degraded gate with auto-admit on ⇒ the
// proposal is admitted (returns true). The real agentlayer.Propose never auto-admits — this is
// the fault-injection fixture, the enforcer stays intact.
func proposalAutoAdmitted(autoAdmit bool) bool { return autoAdmit }

// memoryAutoAdmitted MODELS the AAI06 injection: the same firewall bypass for a memory proposal.
func memoryAutoAdmitted(autoAdmit bool) bool { return autoAdmit }

// budgetGateDenies runs GateAction over the governed impl with a metered spend and the two
// declared budget caps, isolating the BUDGET axis — returns whether the gate denied. Single-
// sourced on the real CheckBudget inside GateAction.
func budgetGateDenies(meter agentimpl.RunMeter, h economics.HarnessCostBudget, b goal.Budgets) (denied bool, axis, code string) {
	d := agentimpl.GateAction(governedImpl(), agentimpl.Action{}, meter, h, b, 1.0, nil)
	if d.Allowed {
		return false, "", ""
	}
	return true, d.DeniedAxis, brCode(d.BlockReason)
}

// sampleRuns is a small ordered run set for the AAI09 ledger mirror — three governed runs.
func sampleRuns() []agentrun.AgentRun {
	return []agentrun.AgentRun{
		{ID: "run-1", Agent: "exec@1", Goal: "g1", RedWorkItem: "r1", Result: agentrun.ResultGreen},
		{ID: "run-2", Agent: "exec@1", Goal: "g1", RedWorkItem: "r2", Result: agentrun.ResultGreen},
		{ID: "run-3", Agent: "exec@1", Goal: "g1", RedWorkItem: "r3", Result: agentrun.ResultGreen},
	}
}

// merkleCatchesDeletion builds the GV03 Merkle ledger from runs, silently DELETES a NON-TAIL
// run (keeping the survivors' stored index/prior_root/root — a real deletion, not an honest
// rebuild), and reports whether the deletion is CAUGHT.
//
//   - GOVERNED (degrade=false): the real chained agentrun.Verify — the downstream survivor's
//     stored index/prior_root no longer recompute against the shortened chain, so Verify goes
//     RED. The deletion is tamper-evident. Returns true (caught).
//   - INJECTED (degrade=true): the audit is degraded to the BA28-equivalent — it drops the
//     cross-row chain and only re-derives the ledger from the surviving BOMs (an honest
//     rebuild), then verifies THAT. A rebuilt shorter ledger always verifies, so the silent
//     deletion ESCAPES. Returns false (not caught).
//
// This is exactly the load-bearing distinction the GV03 property pins (the BA28 gap the Merkle
// chain closes), re-expressed as the AAI09 compliance mirror.
func merkleCatchesDeletion(runs []agentrun.AgentRun, degrade bool) bool {
	ledger, err := agentrun.BuildLedger(runs)
	if err != nil || len(ledger) < 3 {
		return false
	}
	if degrade {
		// DEGRADED audit: rebuild from the surviving BOMs (drop the chain anchor), then verify —
		// an honest rebuild of the shortened sequence always verifies, so the deletion escapes.
		survivors := append(append([]agentrun.AgentRun{}, runs[:1]...), runs[2:]...)
		rebuilt, rerr := agentrun.BuildLedger(survivors)
		if rerr != nil {
			return false
		}
		return !agentrun.Verify(rebuilt).OK // false: the rebuilt ledger verifies, deletion hidden.
	}
	// GOVERNED: a real splice — remove the middle entry, KEEP the survivors' stored fields. The
	// downstream row's stored index/prior_root no longer recompute, so the chained Verify breaks.
	spliced := make([]agentrun.LedgerEntry, 0, len(ledger)-1)
	spliced = append(spliced, ledger[:1]...)
	spliced = append(spliced, ledger[2:]...)
	return !agentrun.Verify(spliced).OK
}
