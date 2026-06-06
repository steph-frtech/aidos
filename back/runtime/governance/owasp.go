// Package governance is the GV01 CROSS-CHECK: a deterministic audit of the AIDOS
// agent-governance surface (S52 agentlayer ; BA13 GateAction + the declared-axis
// enforcers ; BA29 agentrun/agentloop ledger) against the OWASP Agentic AI Top-10
// risks (2025) and the Microsoft agent-governance-toolkit (AGT) pillars.
//
// THE DELIVERABLE IS A REPORT, NOT A NEW ENFORCER (the roadmap). GV01 decides which
// AGT pieces add REAL value over AIDOS's already-structural, fail-closed governance —
// and where AIDOS already covers a risk, it says so and STOPS (rien-à-ajouter ⇒
// arrêt). No truth is written; this package only READS the existing surface (the axis
// names, the BlockReason codes, the ledger predicates) and folds it into a coverage
// matrix.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The coverage matrix is a DECLARED, CLOSED table
// — code, never an "LLM auditor judging coverage". Coverage(), the residual-gap tally
// and the adoption Verdict are PURE, TOTAL functions over that table: no DB, no clock,
// no rng, no I/O, no LLM. Same table ⇒ same report (the reproducibility mirror
// owasp_property_test.go pins it). An LLM scoring OWASP coverage would be a determinism
// gap; the matrix is the single authoritative source, and the mirror is the judge.
//
// THE WALL STAYS AUTHORITATIVE (the roadmap). The cross-check NEVER concludes "drop the
// structural wall for the AGT's default-allow middleware". Where the AGT augments
// (tamper-evident Merkle ledger, OWASP mirrors, policy-as-YAML→enforcers, identity/
// trust/SRE), it AUGMENTS the wall and PROVES it; the wall remains the garant.
package governance

// Risk is one of the OWASP Agentic AI Top-10 risks (2025). The set is CLOSED and
// DECLARED — the ten canonical risk codes, never discovered at runtime, so the report
// enumerates exactly these ten and the completeness check can prove all ten are mapped.
type Risk string

const (
	// AAI01 — Agent Authorization & Control Hijacking (an agent acts beyond its
	// granted authority / is hijacked into privileged actions).
	RiskAuthorizationHijacking Risk = "AAI01_authorization_control_hijacking"
	// AAI02 — Agent Critical-System Interaction (unsafe reach into FS / network /
	// subprocess / privileged systems).
	RiskCriticalSystemInteraction Risk = "AAI02_critical_system_interaction"
	// AAI03 — Agent Goal & Instruction Manipulation (prompt/instruction injection
	// steering the agent off its declared goal).
	RiskGoalManipulation Risk = "AAI03_goal_instruction_manipulation"
	// AAI04 — Agent Hallucination & Misinformation Exploitation (the agent's
	// generative output is trusted as truth/authority).
	RiskHallucinationExploitation Risk = "AAI04_hallucination_misinformation"
	// AAI05 — Agent Impact Chain & Blast Radius (one agent's action cascades
	// uncontrolled across systems).
	RiskImpactChainBlastRadius Risk = "AAI05_impact_chain_blast_radius"
	// AAI06 — Agent Memory & Context Manipulation (poisoned memory/context steers or
	// declares truth).
	RiskMemoryContextManipulation Risk = "AAI06_memory_context_manipulation"
	// AAI07 — Agent Orchestration & Multi-Agent Exploitation (trust abuse / identity
	// spoofing between agents/teams).
	RiskOrchestrationExploitation Risk = "AAI07_orchestration_multiagent"
	// AAI08 — Agent Supply Chain & Dependency Attacks (untrusted tool/skill/provider
	// bound without governance).
	RiskSupplyChainDependency Risk = "AAI08_supply_chain_dependency"
	// AAI09 — Agent Untraceability & Repudiation (actions cannot be attributed or are
	// deniable; audit log is forgeable).
	RiskUntraceabilityRepudiation Risk = "AAI09_untraceability_repudiation"
	// AAI10 — Agent Economic & Resource Exhaustion (runaway token/compute/$$ spend).
	RiskEconomicExhaustion Risk = "AAI10_economic_resource_exhaustion"
)

// riskOrder is the canonical AAI01..AAI10 order — declared, never derived from map
// iteration, so the report rows are stable.
var riskOrder = []Risk{
	RiskAuthorizationHijacking,
	RiskCriticalSystemInteraction,
	RiskGoalManipulation,
	RiskHallucinationExploitation,
	RiskImpactChainBlastRadius,
	RiskMemoryContextManipulation,
	RiskOrchestrationExploitation,
	RiskSupplyChainDependency,
	RiskUntraceabilityRepudiation,
	RiskEconomicExhaustion,
}

// Risks returns the ten OWASP Agentic risks in canonical order (a defensive copy).
func Risks() []Risk {
	out := make([]Risk, len(riskOrder))
	copy(out, riskOrder)
	return out
}

// Status is the coverage verdict for one risk against the existing AIDOS surface. The
// set is CLOSED: a risk is either fully covered by an existing enforcer, partially
// covered (a real but bounded gap remains), or uncovered (a genuine missing enforcer).
type Status string

const (
	// StatusCovered — an existing enforcer already closes this risk fail-closed; the
	// AGT adds nothing structural here (rien-à-ajouter).
	StatusCovered Status = "covered"
	// StatusPartial — covered for the common case, but a real residual gap remains
	// that an AGT piece would augment (and prove).
	StatusPartial Status = "partial"
	// StatusUncovered — no existing enforcer addresses this risk; a real gap.
	StatusUncovered Status = "uncovered"
)

// Coverage is one row of the report: a risk, its status, the AIDOS enforcers/artifacts
// that cover it (by name — single-sourced from the real surface), the residual gap (if
// any), and the GV step that would augment it. All fields are DECLARED from the audited
// code, never generated.
type Coverage struct {
	Risk Risk `json:"risk"`
	// Title is the short human risk title (FR-leaning audit prose lives in the report
	// page; here the title is a stable label).
	Title string `json:"title"`
	// Status — covered | partial | uncovered.
	Status Status `json:"status"`
	// CoveredBy names the existing AIDOS enforcers/axes/artifacts (e.g. the GateAction
	// axis, the BlockReason code, the ledger predicate) that address this risk.
	CoveredBy []string `json:"covered_by"`
	// Residual is the real, honest gap that remains (empty when fully covered).
	Residual string `json:"residual,omitempty"`
	// AugmentedBy names the GV step that would close the residual (empty when covered).
	AugmentedBy string `json:"augmented_by,omitempty"`
}

// matrix is the SINGLE AUTHORITATIVE coverage table — the cross-check result, declared
// from the audited surface (S52 / BA13 / BA29). It is what the property mirror checks
// for totality (all ten risks, each known status) and what the Workbench renders. The
// enforcer names are the REAL exported identifiers from the audited packages, so the
// report cannot drift into invented coverage.
var matrix = map[Risk]Coverage{
	RiskAuthorizationHijacking: {
		Risk:   RiskAuthorizationHijacking,
		Title:  "Authorization & Control Hijacking",
		Status: StatusCovered,
		CoveredBy: []string{
			"agentlayer.MayWrite (S04 structural wall — PeutModifierNoyau/Fitness always false)",
			"GateAction axis zone (Classify deny-list above the waterline)",
			"GateAction axis path (PathAllowed default-deny confinement)",
			"BlockReason AGENT_WRITE_ABOVE_WATERLINE / AGENT_PATH_NOT_ALLOWED",
		},
	},
	RiskCriticalSystemInteraction: {
		Risk:   RiskCriticalSystemInteraction,
		Title:  "Critical-System Interaction",
		Status: StatusCovered,
		CoveredBy: []string{
			"GateAction axis egress (EgressAllowed — empty allow-list ⇒ no egress, fail-closed)",
			"GateAction axis exec (ExecAllowed — empty allow-list ⇒ no subprocess)",
			"GateAction axis capacity (ToolAllowed — bound MCP server/tool only)",
			"BlockReason AGENT_EGRESS_NOT_ALLOWED / AGENT_EXEC_NOT_ALLOWED / AGENT_TOOL_NOT_BOUND",
		},
	},
	RiskGoalManipulation: {
		Risk:   RiskGoalManipulation,
		Title:  "Goal & Instruction Manipulation",
		Status: StatusCovered,
		CoveredBy: []string{
			"GateAction axis determinism (ArbitrateGated reads STRUCTURAL AgentAction, never DisplayedIntent — gap D1)",
			"agentimpl.Arbitrate (a deterministic tool governs an action the agent cannot redirect by prose)",
			"BlockReason AGENT_DETERMINISM_GAP",
		},
	},
	RiskHallucinationExploitation: {
		Risk:   RiskHallucinationExploitation,
		Title:  "Hallucination & Misinformation Exploitation",
		Status: StatusCovered,
		CoveredBy: []string{
			"agentlayer.Propose always yields `proposed` (never `admitted`) — an agent never declares truth alone (§8)",
			"BlockReason PROPOSAL_NOT_ADMITTED / MEMORY_CANNOT_DECLARE_TRUTH / REALITY_CANNOT_DECLARE_TRUTH",
			"the deterministic judge: done is computed (mirror + reality), never declared by the agent",
		},
	},
	RiskImpactChainBlastRadius: {
		Risk:   RiskImpactChainBlastRadius,
		Title:  "Impact Chain & Blast Radius",
		Status: StatusCovered,
		CoveredBy: []string{
			"S20 ChangeSet + S22 SemanticDiff red-wave (blast radius computed before apply)",
			"GateAction axis path (confinement bounds the writable root)",
			"agentrun is below-the-line telemetry — a run can never cascade into a kernel write",
		},
	},
	RiskMemoryContextManipulation: {
		Risk:   RiskMemoryContextManipulation,
		Title:  "Memory & Context Manipulation",
		Status: StatusCovered,
		CoveredBy: []string{
			"S30 memory-firewall (MEMORY_CANNOT_DECLARE_TRUTH) — memory proposes, never freezes",
			"agentrun.Redact scrubs secrets from the persisted transcript BEFORE the ledger (gap H1)",
			"the ContextRouter is an algorithm, not a prompt (context cannot be steered into a write)",
		},
	},
	RiskOrchestrationExploitation: {
		Risk:   RiskOrchestrationExploitation,
		Title:  "Orchestration & Multi-Agent Exploitation",
		Status: StatusCovered,
		CoveredBy: []string{
			"BA18 identity: agentimpl.MintToken/VerifyToken — owner_agent is the content-hash of the impl, PROVEN not chain-declared",
			"scheduler lease/fence (AGENT_LEASE_FENCED — a stale orchestration lease is fenced)",
			"BlockReason AGENT_IDENTITY_UNVERIFIED",
		},
	},
	RiskSupplyChainDependency: {
		Risk:   RiskSupplyChainDependency,
		Title:  "Supply Chain & Dependency Attacks",
		Status: StatusCovered,
		CoveredBy: []string{
			"GateAction axis capacity (ToolAllowed) + axis skill (SkillAllowed) — only DECLARED, bound tools/skills run",
			"closed Provider set (anthropic|openai|google — no provider discovered at runtime)",
			"BlockReason AGENT_TOOL_NOT_BOUND / AGENT_SKILL_NOT_BOUND",
		},
	},
	RiskUntraceabilityRepudiation: {
		Risk:   RiskUntraceabilityRepudiation,
		Title:  "Untraceability & Repudiation",
		Status: StatusPartial,
		CoveredBy: []string{
			"BA28 agentrun content-address + ReplayMatches (a TAMPERED row re-derives to a different id — per-run integrity)",
			"BA29 agentloop ledger Reconcile (boundary effect-log vs recorded actions — fidelity-to-reality, gap H2)",
			"BA16 postcheck + the redacted, append-only transcript",
		},
		Residual:    "Per-run hashing detects an ALTERED row, but NOT a DELETED or REORDERED row: there is no cross-row Merkle chain over the ledger, so a whole run silently removed leaves no signal. Repudiation of a removed run is still possible.",
		AugmentedBy: "GV03 (tamper-evident Merkle ledger: each entry chains the prior root → any deletion/reordering changes the root → verification goes red)",
	},
	RiskEconomicExhaustion: {
		Risk:   RiskEconomicExhaustion,
		Title:  "Economic & Resource Exhaustion",
		Status: StatusPartial,
		CoveredBy: []string{
			"GateAction axis budget (BA11 CheckBudget — min() of the two declared caps, the tightest wins)",
			"agentlayer ResourceLimits (MaxMemoryMB/MaxCPUMillis/MaxWallSeconds) + MaxTurns/MaxConcurrency knobs",
			"BlockReason AGENT_BUDGET_EXCEEDED",
		},
		Residual:    "Hard per-action/per-run caps exist, but there is no SRE-style error-budget / circuit-breaker that trips on a RATE of failures or burn across many runs (a slow-burn exhaustion below each single cap).",
		AugmentedBy: "GV06 (SRE controls: error-budget + circuit-breaker aligned on BA budgets)",
	},
}

// Coverages returns the full coverage matrix in canonical AAI01..AAI10 order (a
// defensive copy). It is the authoritative report body the Workbench and the CLI read.
func Coverages() []Coverage {
	out := make([]Coverage, 0, len(riskOrder))
	for _, r := range riskOrder {
		out = append(out, matrix[r])
	}
	return out
}

// CoverageFor returns the coverage row for a risk and whether it is known. Total.
func CoverageFor(r Risk) (Coverage, bool) {
	c, ok := matrix[r]
	return c, ok
}

// Tally is the deterministic roll-up of the matrix: how many risks fall in each status.
// Pure derivation — the panel header and the adoption verdict both read it.
type Tally struct {
	Covered   int `json:"covered"`
	Partial   int `json:"partial"`
	Uncovered int `json:"uncovered"`
	Total     int `json:"total"`
}

// Count tallies the matrix by status. Pure, total — same matrix ⇒ same tally.
func Count() Tally {
	t := Tally{Total: len(riskOrder)}
	for _, r := range riskOrder {
		switch matrix[r].Status {
		case StatusCovered:
			t.Covered++
		case StatusPartial:
			t.Partial++
		case StatusUncovered:
			t.Uncovered++
		}
	}
	return t
}

// Residuals returns the risks with a real remaining gap (partial or uncovered), in
// canonical order, each carrying the GV step that would augment it. This is the
// "écarts réels" half of the report — the honest list of what is NOT yet closed.
func Residuals() []Coverage {
	out := make([]Coverage, 0)
	for _, r := range riskOrder {
		c := matrix[r]
		if c.Status != StatusCovered {
			out = append(out, c)
		}
	}
	return out
}
