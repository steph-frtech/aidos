// adoption.go — GV01 the ADOPTION VERDICT. The cross-check's second half: against the
// Microsoft agent-governance-toolkit (AGT) pillars, which pieces add REAL value over
// AIDOS's already-structural fail-closed governance, and where the verdict is "rien à
// ajouter ⇒ arrêt". This is a DECLARED decision table (code, not an LLM judgment), so
// the adoption scope is reproducible and the roadmap (GV02..GV06) is derived from it.
package governance

// AGTPillar is one pillar of the Microsoft agent-governance-toolkit. The set is CLOSED
// (the five AGT pillars the roadmap names: policy-as-YAML, tamper-evident audit,
// OWASP evals, identity/trust, SRE).
type AGTPillar string

const (
	// PillarPolicyYAML — policy declared as YAML, compiled to enforcers.
	PillarPolicyYAML AGTPillar = "policy_as_yaml"
	// PillarTamperEvidentAudit — Merkle-chained, tamper-evident audit ledger + Decision-BOM.
	PillarTamperEvidentAudit AGTPillar = "tamper_evident_audit_merkle"
	// PillarOWASPEvals — the OWASP Agentic Top-10 as runnable conformance evals.
	PillarOWASPEvals AGTPillar = "owasp_agentic_evals"
	// PillarIdentityTrust — agent identity + trust framework.
	PillarIdentityTrust AGTPillar = "identity_trust"
	// PillarSRE — SRE controls (SLO / error-budget / circuit-breaker).
	PillarSRE AGTPillar = "sre_slo_error_budget_circuit_breaker"
)

var pillarOrder = []AGTPillar{
	PillarPolicyYAML,
	PillarTamperEvidentAudit,
	PillarOWASPEvals,
	PillarIdentityTrust,
	PillarSRE,
}

// Decision is the adoption verdict for one AGT pillar. CLOSED: adopt-as-augment (it
// adds real value, AIDOS wires it in WITHOUT abandoning the wall), already-covered
// (AIDOS already has it structurally — rien à ajouter), or reject (it would weaken the
// wall — e.g. a default-allow middleware that replaces the structural deny).
type Decision string

const (
	// DecisionAdoptAugment — adopt it as an AUGMENTATION; the structural wall stays
	// authoritative, the AGT piece proves/extends it.
	DecisionAdoptAugment Decision = "adopt_augment"
	// DecisionAlreadyCovered — AIDOS already provides this structurally; nothing to add.
	DecisionAlreadyCovered Decision = "already_covered"
	// DecisionReject — adopting it as-is would replace a structural guarantee with a
	// softer default; rejected (the wall stays stronger than default-allow middleware).
	DecisionReject Decision = "reject"
)

// PillarVerdict is one row of the adoption decision table: a pillar, the decision, the
// rationale, and the GV step that carries the work (when adopted).
type PillarVerdict struct {
	Pillar    AGTPillar `json:"pillar"`
	Title     string    `json:"title"`
	Decision  Decision  `json:"decision"`
	Rationale string    `json:"rationale"`
	// Step is the GV step that lands the adoption (empty when already-covered/rejected).
	Step string `json:"step,omitempty"`
}

// adoptionTable is the SINGLE authoritative adoption decision — derived from the
// coverage matrix. It says, pillar by pillar, what AIDOS adopts (as an augmentation),
// what it already covers, and what it rejects to keep the wall stronger than the AGT's
// default-allow posture.
var adoptionTable = map[AGTPillar]PillarVerdict{
	PillarPolicyYAML: {
		Pillar:    PillarPolicyYAML,
		Title:     "Policy-as-YAML → enforcers",
		Decision:  DecisionAdoptAugment,
		Rationale: "AIDOS's enforcers are Go projections of a declared policy; a YAML source that COMPILES to the SAME GateAction verdict adds a readable, auditable policy surface — adopted ONLY with an equivalence mirror proving the YAML can EQUAL or TIGHTEN the wall, never widen it (determinism-first: declared policy is source, the enforcer is projection).",
		Step:      "GV05",
	},
	PillarTamperEvidentAudit: {
		Pillar:    PillarTamperEvidentAudit,
		Title:     "Tamper-evident (Merkle) audit ledger + Decision-BOM",
		Decision:  DecisionAdoptAugment,
		Rationale: "Real gap (AAI09 partial): BA28 per-run hashing catches an ALTERED row but not a DELETED/REORDERED one. A Merkle chain over the ledger makes any deletion/reordering change the root → verification goes red. Adopted as an augmentation of the existing append-only ledger.",
		Step:      "GV03",
	},
	PillarOWASPEvals: {
		Pillar:    PillarOWASPEvals,
		Title:     "OWASP Agentic Top-10 conformance mirrors",
		Decision:  DecisionAdoptAugment,
		Rationale: "AIDOS covers the risks structurally but has no per-risk RUNNABLE conformance mirror with fault-injection. Turning the ten risks into deterministic mirrors (inject the violation → the mirror goes red) makes the coverage this very report asserts continuously PROVEN, not just claimed.",
		Step:      "GV04",
	},
	PillarIdentityTrust: {
		Pillar:    PillarIdentityTrust,
		Title:     "Agent identity & trust framework",
		Decision:  DecisionAlreadyCovered,
		Rationale: "BA18 already proves owner_agent as the content-hash of the governed impl (MintToken/VerifyToken) and the scheduler fences stale leases. The AGT's identity pillar adds nothing structural; GV06 only SURFACES it in the audit panel — no new enforcer.",
		Step:      "GV06",
	},
	PillarSRE: {
		Pillar:    PillarSRE,
		Title:     "SRE controls (SLO / error-budget / circuit-breaker)",
		Decision:  DecisionAdoptAugment,
		Rationale: "Real gap (AAI10 partial): BA11 enforces hard per-action/per-run caps but no error-budget/circuit-breaker over a RATE of failures across runs (slow-burn exhaustion below each single cap). Adopted aligned on the existing BA budgets.",
		Step:      "GV06",
	},
}

// PillarVerdicts returns the adoption decision table in canonical pillar order.
func PillarVerdicts() []PillarVerdict {
	out := make([]PillarVerdict, 0, len(pillarOrder))
	for _, p := range pillarOrder {
		out = append(out, adoptionTable[p])
	}
	return out
}

// AdoptionVerdict is the GV01 top-level decision: STOP (rien à ajouter — every risk is
// fully covered and every pillar already-covered) or CONTINUE (a real residual gap
// remains, so the GV roadmap is justified), with the count of pillars to adopt.
type AdoptionVerdict struct {
	// Stop is true iff the cross-check found nothing to add (no residual, no adopt).
	Stop bool `json:"stop"`
	// ToAdopt is the number of AGT pillars adopted as augmentations.
	ToAdopt int `json:"to_adopt"`
	// AlreadyCovered is the number of pillars AIDOS already provides structurally.
	AlreadyCovered int `json:"already_covered"`
	// Rejected is the number of pillars rejected to keep the wall authoritative.
	Rejected int `json:"rejected"`
	// ResidualRisks is the number of OWASP risks not yet fully covered (partial/uncovered).
	ResidualRisks int `json:"residual_risks"`
	// Summary is the one-line verdict (FR — the audit speaks French).
	Summary string `json:"summary"`
}

// Verdict computes the adoption verdict from the two declared tables. PURE, TOTAL —
// same tables ⇒ same verdict (the reproducibility mirror pins it). The wall is NEVER
// abandoned: even a STOP verdict keeps the structural wall as the garant.
func Verdict() AdoptionVerdict {
	v := AdoptionVerdict{}
	for _, p := range pillarOrder {
		switch adoptionTable[p].Decision {
		case DecisionAdoptAugment:
			v.ToAdopt++
		case DecisionAlreadyCovered:
			v.AlreadyCovered++
		case DecisionReject:
			v.Rejected++
		}
	}
	t := Count()
	v.ResidualRisks = t.Partial + t.Uncovered
	v.Stop = v.ToAdopt == 0 && v.ResidualRisks == 0
	if v.Stop {
		v.Summary = "Gouvernance déjà complète et fail-closed : rien à ajouter (arrêt)."
	} else {
		v.Summary = "Le mur structurel couvre déjà 8/10 risques fail-closed ; il reste des écarts réels (AAI09 ledger non Merkle, AAI10 sans error-budget/circuit-breaker) — la roadmap GV03/GV04/GV05/GV06 les AUGMENTE sans jamais abandonner le mur."
	}
	return v
}
