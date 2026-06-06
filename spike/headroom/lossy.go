// lossy.go — THROWAWAY (HR01 spike). The SECOND compression mode the spike must measure to be
// honest. headroom's advertised 60–95% gain comes from SEMANTIC/structural compression that
// does NOT round-trip byte-losslessly — it drops redundant restatements, collapses boilerplate,
// and keeps only the load-bearing facts. We model a CONSERVATIVE, RULE-BASED lossy compressor
// (deterministic, no LLM) that removes declared-redundant spans while PROVABLY preserving every
// carrier fact, and measure: (a) how much it actually saves, (b) whether the carrier facts
// survive (they must), (c) that it is NOT byte-lossless (so HR02's port must expose this mode
// as fidelity-checked, never assumed reversible).
//
// This is the crux of the go/no-go: lossless mode = modest gain, perfect fidelity; lossy mode =
// real gain, carrier-fidelity must be ASSERTED (a property mirror at HR03), never assumed.
package headroom

import "strings"

// redundantSpans are declared-redundant restatements the lossy compressor drops. They are
// RESTATEMENTS of facts carried elsewhere (the wall is stated once in Boundaries; the per-turn
// "I do NOT touch /kernel/**" and "I do NOT touch ..." are restatements; the verbose wall
// enforcement sentence is a restatement of forbidden_paths). Dropping a restatement does NOT
// drop the fact — the carrier-fidelity check proves the fact still appears at least once.
var redundantSpans = []string{
	"The wall: you NEVER write /kernel/** or /mirror/**. To change a truth you open an idea, write its mirror, open a /goal. The wall is enforced by the PreToolUse hook AND the Postgres GRANTs. Writing /kernel/** is refused. Writing /mirror/** is refused.",
	"THE WALL: never write /kernel/** or /mirror/**; truth changes go idea -> mirror -> /goal.",
	"I do NOT touch /kernel/** or /mirror/**.",
	"I do NOT touch /kernel/**.",
	"The crossed PUBLIC contract PaymentGateway@hash is unchanged.",
	"## Skills / tools\nskills: context, tdd\ntools: context_compile",
}

// CompressLossy drops declared-redundant restatements (deterministic, rule-based). It is the
// modeled high-reduction mode. Carrier facts are NOT in redundantSpans, so they survive — the
// FidelityLossy check proves it rather than assuming it.
func CompressLossy(prompt string) string {
	out := prompt
	for _, span := range redundantSpans {
		out = strings.ReplaceAll(out, span, "")
	}
	return Normalize(out)
}

// LossyReport is the lossy-mode measurement for one prompt.
type LossyReport struct {
	Prompt        string
	TokensBefore  int
	TokensAfter   int
	ReductionFrac float64
	ByteLossless  bool     // expected FALSE — lossy by design
	CarriersLost  []string // expected EMPTY — carrier facts must survive even lossy
}

// MeasureLossy runs the lossy compressor and checks carrier fidelity (deterministic).
func MeasureLossy(name, prompt string, carriers []CarrierFact) LossyReport {
	compacted := CompressLossy(prompt)
	before := EstimateTokens(Normalize(prompt))
	after := EstimateTokens(compacted)
	frac := 0.0
	if before > 0 {
		frac = float64(before-after) / float64(before)
	}
	rep := LossyReport{
		Prompt:        name,
		TokensBefore:  before,
		TokensAfter:   after,
		ReductionFrac: frac,
		ByteLossless:  compacted == Normalize(prompt),
	}
	norm := Normalize(prompt)
	for _, cf := range carriers {
		if !strings.Contains(norm, Normalize(cf.Value)) {
			continue
		}
		if !strings.Contains(compacted, Normalize(cf.Value)) {
			rep.CarriersLost = append(rep.CarriersLost, cf.Name)
		}
	}
	return rep
}
