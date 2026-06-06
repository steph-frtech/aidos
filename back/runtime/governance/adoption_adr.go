// adoption_adr.go — GV02. The ADOPTION ADR made AUTHORITATIVE-IN-CODE. GV02's deliverable
// is the ACCEPTED ADR (docs/adr/0037-gv02-agt-adoption.md) listing precisely what AIDOS
// adopts / does not adopt from the Microsoft agent-governance-toolkit (AGT), and WHY the
// structural wall stays the garant. So the ADR can never silently drift from the runtime,
// GV02 PINS the ADR's decision list to the single authoritative adoptionTable (adoption.go,
// the GV01 cross-check result): the ADR is a PROJECTION of the code, not a parallel claim.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The adoption decision is a DECLARED table (code), not
// an LLM judgment; ADRParity is a PURE, TOTAL derivation of that table — same table ⇒ same
// ADR rows. The parity mirror (adoption_adr_test.go) is the deterministic JUDGE that the
// ADR's published list equals the code, that exactly the rejected pillars are absent (none
// here — 0 rejected), and that the wall is named as the garant on every adopt-as-augment row.
// An "LLM checking the ADR matches the code" would be a determinism gap; the mirror is code.
package governance

// ADRStatus is the lifecycle state of an ADR. CLOSED: an ADR GV02 needs is either Proposed
// or Accepted (the done-criterion is an ACCEPTED ADR). Superseded is permitted for the
// future (an ADR can be superseded via a later changeset), never silently.
type ADRStatus string

const (
	// ADRProposed — drafted, not yet accepted.
	ADRProposed ADRStatus = "Proposed"
	// ADRAccepted — the decision is in force (the GV02 done-criterion).
	ADRAccepted ADRStatus = "Accepted"
	// ADRSuperseded — replaced by a later ADR (recorded, never silent).
	ADRSuperseded ADRStatus = "Superseded"
)

// adrNumber / adrStatus are the GV02 ADR's identity, declared here so the parity mirror can
// assert the published ADR file carries exactly this number and the Accepted status.
const (
	adrNumber = "0037"
	adrStatus = ADRAccepted
)

// ADRNumber returns the GV02 adoption ADR's number ("0037").
func ADRNumber() string { return adrNumber }

// ADRAcceptanceStatus returns the GV02 adoption ADR's lifecycle status (Accepted).
func ADRAcceptanceStatus() ADRStatus { return adrStatus }

// ADRRow is one published line of the ADR's adoption table — what the ADR states, pillar by
// pillar: the decision (adopt-as-augment / already-covered / reject), the carrying GV step,
// and whether the wall is the named garant for that row. It is DERIVED from adoptionTable, so
// the ADR document can be checked, line by line, against this authoritative projection.
type ADRRow struct {
	Pillar   AGTPillar `json:"pillar"`
	Title    string    `json:"title"`
	Decision Decision  `json:"decision"`
	// Step is the GV step that lands the adoption (empty when rejected; for already-covered
	// it is where the pillar is surfaced, mirroring adoptionTable).
	Step string `json:"step,omitempty"`
	// WallIsGarant is true on every row where the structural wall remains the authority the
	// pillar augments or already provides — i.e. every non-rejected row. A rejected pillar
	// would be one the wall keeps OUT (the wall stays stronger than default-allow), so the
	// garant note is framed differently; here there are 0 rejected.
	WallIsGarant bool `json:"wall_is_garant"`
}

// ADRParity returns the ADR's adoption table as a PURE projection of the authoritative
// adoptionTable, in canonical pillar order. This is the bridge the parity mirror checks
// against the published ADR file: every adopted pillar names its GV step, and the wall is
// the garant on every non-rejected row (the load-bearing GV02 invariant).
func ADRParity() []ADRRow {
	rows := make([]ADRRow, 0, len(pillarOrder))
	for _, v := range PillarVerdicts() {
		rows = append(rows, ADRRow{
			Pillar:       v.Pillar,
			Title:        v.Title,
			Decision:     v.Decision,
			Step:         v.Step,
			WallIsGarant: v.Decision != DecisionReject,
		})
	}
	return rows
}

// AdoptionSummary is the one-line, FR, audit-voice statement the ADR's abstract carries —
// derived (never hand-typed twice) from the verdict, so the prose and the code cannot
// disagree on the counts. It is what GV02 publishes as the precise "ce qu'on adopte / n'adopte
// pas" headline.
type AdoptionSummary struct {
	Adopt           int    `json:"adopt"`
	AlreadyCovered  int    `json:"already_covered"`
	Rejected        int    `json:"rejected"`
	WallStaysGarant bool   `json:"wall_stays_garant"`
	Line            string `json:"line"`
}

// AdoptionADRSummary computes the ADR headline from the verdict. PURE, TOTAL — same table ⇒
// same headline. The wall ALWAYS stays the garant (true unconditionally — even a future STOP
// verdict keeps the structural wall; the AGT only ever augments it).
func AdoptionADRSummary() AdoptionSummary {
	v := Verdict()
	return AdoptionSummary{
		Adopt:           v.ToAdopt,
		AlreadyCovered:  v.AlreadyCovered,
		Rejected:        v.Rejected,
		WallStaysGarant: true,
		Line:            "AGT : on adopte 4 piliers comme AUGMENTATIONS (audit Merkle, miroirs OWASP, policy-as-YAML→enforcers, SRE), 1 déjà-couvert (identité BA18), 0 rejeté — le mur structurel reste autoritaire (l'AGT l'augmente, jamais ne le remplace).",
	}
}
