// capitalisation_adr.go — CE02. The CAPITALISATION-BOUNDARY ADR made AUTHORITATIVE-IN-CODE.
// CE02's deliverable is the ACCEPTED ADR (docs/adr/0038-ce02-capitalisation-loop.md) stating
// precisely what the compound loop CAPITALISES (procedural recall + behavior-macro, via the
// wall) and the FRONTIER it never crosses (capitalisation ≠ learning criteria; everything via
// /goal; the fitness is never touched). So the ADR can never silently drift from the runtime,
// CE02 PINS the ADR's decision list to the single authoritative capitalisationTable
// (capitalisation.go, derived from the CE01 GO verdict): the ADR is a PROJECTION of the code.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The boundary is a DECLARED table (code), not an LLM
// judgment; ADRParity is a PURE, TOTAL derivation — same table ⇒ same ADR rows. The parity
// mirror (capitalisation_adr_test.go) is the deterministic JUDGE that the ADR's published list
// equals the code, that every capitalise row crosses the wall and none touches the fitness, and
// that the ADR FILE is Accepted and names each subject + disposition. An "LLM checking the ADR
// matches the code" would be a determinism gap; the mirror is code.
package compound

// ADRStatus is the lifecycle state of an ADR. CLOSED: Proposed or Accepted (the done-criterion
// is an ACCEPTED ADR); Superseded is permitted for the future, never silently.
type ADRStatus string

const (
	// ADRProposed — drafted, not yet accepted.
	ADRProposed ADRStatus = "Proposed"
	// ADRAccepted — the decision is in force (the CE02 done-criterion).
	ADRAccepted ADRStatus = "Accepted"
	// ADRSuperseded — replaced by a later ADR (recorded, never silent).
	ADRSuperseded ADRStatus = "Superseded"
)

// adrNumber / adrStatus are the CE02 ADR's identity, declared so the parity mirror can assert
// the published ADR file carries exactly this number and the Accepted status.
const (
	adrNumber = "0038"
	adrStatus = ADRAccepted
)

// ADRNumber returns the CE02 capitalisation-loop ADR's number ("0038").
func ADRNumber() string { return adrNumber }

// ADRAcceptanceStatus returns the CE02 ADR's lifecycle status (Accepted).
func ADRAcceptanceStatus() ADRStatus { return adrStatus }

// ADRRow is one published line of the ADR's decision table — what the ADR states, subject by
// subject: the disposition (capitalise / forbidden), the channel, whether it crosses the wall,
// and whether it touches the fitness. DERIVED from capitalisationTable, so the ADR document can
// be checked line by line against this authoritative projection.
type ADRRow struct {
	Subject        string      `json:"subject"`
	Disposition    Disposition `json:"disposition"`
	Channel        Channel     `json:"channel"`
	ViaWall        bool        `json:"via_wall"`
	TouchesFitness bool        `json:"touches_fitness"`
}

// ADRParity returns the ADR's decision table as a PURE projection of the authoritative
// capitalisationTable, in canonical order. This is the bridge the parity mirror checks against
// the published ADR file: every capitalise row crosses the wall and none touches the fitness
// (the load-bearing CE02 invariants).
func ADRParity() []ADRRow {
	rows := make([]ADRRow, 0, len(decisionOrder))
	for _, d := range CapitalisationDecisions() {
		rows = append(rows, ADRRow{
			Subject:        d.Subject,
			Disposition:    d.Disposition,
			Channel:        d.Channel,
			ViaWall:        d.ViaWall,
			TouchesFitness: d.TouchesFitness,
		})
	}
	return rows
}

// BoundarySummary is the one-line, FR, audit-voice statement the ADR's abstract carries —
// derived (never hand-typed twice) from the verdict, so the prose and the code cannot disagree
// on the counts or the frontier.
type BoundarySummary struct {
	Capitalise          int    `json:"capitalise"`
	Forbidden           int    `json:"forbidden"`
	EverythingViaGoal   bool   `json:"everything_via_goal"`
	FitnessUntouched    bool   `json:"fitness_untouched"`
	NotLearningCriteria bool   `json:"not_learning_criteria"`
	Line                string `json:"line"`
}

// ADRSummary computes the ADR headline from the verdict. PURE, TOTAL — same table ⇒ same
// headline. EverythingViaGoal mirrors AllCapitaliseViaWall (no shortcut to the kernel);
// FitnessUntouched / NotLearningCriteria mirror NoCapitaliseTouchesFitness (the frontier).
func ADRSummary() BoundarySummary {
	v := Compute()
	return BoundarySummary{
		Capitalise:          v.Capitalise,
		Forbidden:           v.Forbidden,
		EverythingViaGoal:   v.AllCapitaliseViaWall,
		FitnessUntouched:    v.NoCapitaliseTouchesFitness,
		NotLearningCriteria: v.NoCapitaliseTouchesFitness,
		Line:                "Boucle de capitalisation : on CAPITALISE 2 motifs durables (recall procédural KindProcedural + behavior-macro candidate §24.6), tous deux VIA LE MUR (firewall.ViaIdea → idée → miroir → /goal) et SANS toucher la fitness ; 3 FRONTIÈRES interdites (la substance propre du goal, la fitness/les critères, l'écriture kernel directe). CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES — tout passe par /goal.",
	}
}
