// selfplay.go — EG03 (ADR 0089, ROADMAP-evolve-generator). The REAL self-play Proposer
// behind the FROZEN EG02 `Sampler` seam (sampler_contract.go) — the IA confined to
// PROPOSING candidate variants, ALWAYS re-judged by the deterministic promotion-gate
// (Promote) before any QD niche. This file is ADDITIVE (CLAUDE.md §9): it adds NOTHING to
// the harness (Confine/Promote/Evolve in evolve.go and the frozen Sampler seam are
// untouched). It plugs a genuine generator INTO that seam, exactly as ADR 0089 graves it.
//
// THE FIREWALL (determinism-first, §6/§8 — the keystone of EG03):
//
//	The Proposer chooses ONLY *what to mutate* (which behavioral niche, how aggressively).
//	It NEVER decides "good". The CELL is the deterministic Judge: it DERIVES the variant's
//	mirror / out-of-sample / fitness from the proposal's content (deriveMirror /
//	deriveOutOfSample / deriveFitness) — a PURE function of (cell, candidate), never a
//	generator self-grade. The generator's own confidence is irrelevant: a bold mutation
//	that breaks fidelity yields a RED mirror whatever the Proposer "thinks". Then the
//	already-frozen Promote gate (mirror_green ∧ out_of_sample_green ∧ authority_approval)
//	is the SOLE authority on entering a niche. An LLM Proposer is the GATED exception (§6):
//	it is confined to generation, behind this seam, and re-judged deterministically.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth. A passing gate yields a PROMOTION
// PROPOSAL (Promote already guarantees WritesTruth==false); ProposeViaIdea routes a
// promotable variant to the kernel ONLY through firewall.ViaIdea → an `ideas` draft →
// /goal (the human freeze) — NEVER ToKernel, NEVER a direct kernel/mirrors/fitness write.
//
// TWO PROPOSER IMPLEMENTATIONS behind one injectable Proposer type:
//
//	(a) FixtureProposer — DETERMINISTIC, seeded (splitmix64), NO network. The mirror uses
//	    ONLY this one, so the property test is hermetic (same (cell, seed) → same output).
//	(b) ClaudeProposer  — the REAL self-play Proposer (shells to the claude CLI, claude.go),
//	    WITH a deterministic fallback to FixtureProposer if the CLI is absent / errors. So a
//	    run is never blocked on the network and never fabricates a win.
package evolve

import (
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
)

// --- The cell: the deterministic Judge the Proposer is re-judged against ----------------

// Cell is the minimal plain-data view of ONE kernel cell under /evolve that the self-play
// sampler needs: its DECLARED behavioral niches (the S26 MAP-Elites grammar — the coverage
// denominator, declared never learned, §8), the subset the subgraph AUTHORITY approved for
// promotion (the realistic friction — authority does not rubber-stamp every niche), and the
// out-of-sample fidelity floor (§87). It is CONSUMED (read-only); the sampler never invents
// a niche the cell does not declare.
type Cell struct {
	// ID is the operation/policy cell id (e.g. "createOrder"). Read-only.
	ID string `json:"id"`
	// Niches is the DECLARED set of behavioral niches (S26 descriptors). Declared, never learned.
	Niches []string `json:"niches"`
	// AuthorityApprovedNiches is the subset the subgraph authority approved for promotion.
	// A variant landing OUTSIDE this set fails the authority gate condition.
	AuthorityApprovedNiches []string `json:"authority_approved_niches"`
	// OutOfSampleThreshold is the fidelity floor a variant must clear out-of-sample (§87).
	OutOfSampleThreshold float64 `json:"out_of_sample_threshold"`
}

// setContains reports whether s is in the (small) set. Pure.
func setContains(set []string, s string) bool {
	for _, x := range set {
		if x == s {
			return true
		}
	}
	return false
}

// --- The Proposer seam: the GATED LLM exception (it PROPOSES only) ----------------------

// Candidate is what a Proposer emits per proposal: a behavioral niche it targets and a
// "mutation strength" sketch in [0,1] (how aggressively it diverges from the parent). A
// Candidate carries NO mirror / oos / fitness — those are DERIVED by the cell (Judge), never
// asserted by the generator. This is the firewall: the generator proposes, the gate disposes.
type Candidate struct {
	Niche    string  `json:"niche"`
	Mutation float64 `json:"mutation"` // [0,1] — bigger = more divergent variant
}

// Proposer is the GATED LLM exception behind the Sampler seam: given a cell + budget + seed
// it PROPOSES a handful of candidate variants. Injectable: FixtureProposer (deterministic,
// no network — the mirror uses it) and ClaudeProposer (the real self-play CLI, with a
// deterministic fallback). It returns candidates ONLY — it can NEVER decide promotion.
type Proposer func(cell Cell, budget int, seed int64) ([]Candidate, error)

// --- The cell-side deterministic Judge (the generator never self-grades) ----------------

// deriveMirror is the cell-side Judge for the mirror verdict: a proposal whose mutation is
// too aggressive (> 0.85) breaks behavioral fidelity → mirror RED (the realistic failure
// mode: a bold mutation often breaks the spec). A modest mutation keeps the mirror green.
// PURE derivation from the candidate — the generator never grades itself (anti-Goodhart, §8).
func deriveMirror(c Candidate) MirrorStatus {
	if c.Mutation > 0.85 {
		return MirrorRed
	}
	return MirrorGreen
}

// deriveOutOfSampleValue is the cell-side §87 fidelity reading: out-of-sample fidelity
// DEGRADES with mutation strength (a bolder change overfits / generalises worse). Modelled
// as 1 - 0.6*mutation, clamped to [0,1]. PURE.
func deriveOutOfSampleValue(c Candidate) float64 {
	v := 1.0 - 0.6*c.Mutation
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// deriveOutOfSample turns the §87 fidelity reading into the gate's OutOfSampleStatus by
// thresholding against the cell's declared floor — green iff it clears the floor. PURE.
func deriveOutOfSample(cell Cell, c Candidate) OutOfSampleStatus {
	if deriveOutOfSampleValue(c) >= cell.OutOfSampleThreshold {
		return OutOfSampleGreen
	}
	return OutOfSampleRed
}

// deriveFitness is diagnostic only (it ORDERS within a niche; it NEVER overrides the gate).
// A mild reward for exploring (mutation) tempered by the fidelity cost. PURE.
func deriveFitness(c Candidate) float64 {
	return 0.5 + 0.3*c.Mutation*deriveOutOfSampleValue(c)
}

// JudgeCandidate is the cell-side deterministic Judge: it turns a Proposer's Candidate into
// the non-gameable Evidence the frozen Promote gate consumes — deriving mirror / oos /
// fitness from the proposal's content, and reading authority approval from the cell's
// declared approved-niche set. The Proposer's say-so is NEVER trusted: every evidence field
// is derived here, not asserted by the generator. PURE/total.
func JudgeCandidate(cell Cell, c Candidate) Evidence {
	return Evidence{
		Mirror:            deriveMirror(c),
		OutOfSample:       deriveOutOfSample(cell, c),
		AuthorityApproved: setContains(cell.AuthorityApprovedNiches, c.Niche),
		Fitness:           deriveFitness(c),
	}
}

// --- The self-play Sampler: adapts the multi-candidate Proposer to the frozen seam -------

// candidateVariantID is the deterministic branch id for the i-th candidate of a cell.
func candidateVariantID(cellID string, i int) string {
	return fmt.Sprintf("var-%s-sp%02d", cellID, i)
}

// rankedCandidate pairs a derived variant + its evidence with whether the FROZEN Promote
// gate admits it — used to pick the variant the single-output seam returns.
type rankedCandidate struct {
	variant  Variant
	evidence Evidence
	promoted bool
}

// NewSelfPlaySampler adapts a multi-candidate Proposer to the FROZEN single-output Sampler
// seam (sampler_contract.go: `func(cell string, seed int64) (parentID, Variant, Evidence)`).
// It runs the injected Proposer over the cell, has the CELL (the deterministic Judge) derive
// each candidate's Evidence, then SELECTS — deterministically — the variant the seam returns:
//
//	the gate-PASSING candidate with the highest Fitness (ties broken by variant id);
//	if NONE passes the frozen Promote gate, the first candidate (its honest, FAILING
//	evidence) — the gate will then refuse it. The generator never gets a free pass.
//
// On a Proposer error / empty output, it falls back to FallbackSampler (the EG02 reference)
// — the harness stays VERT, sampler-invariant (the IA-off path). PURE for a PURE Proposer:
// same (cell, seed) ⇒ same selection (the splitmix-seeded FixtureProposer makes the mirror
// hermetic). The selection NEVER overrides the gate — Promote is still re-run downstream and
// is the sole authority; selection only decides WHICH single candidate the seam surfaces.
func NewSelfPlaySampler(cell Cell, p Proposer, budget int) Sampler {
	return func(seamCell string, seed int64) (string, Variant, Evidence) {
		cands, err := p(cell, budget, seed)
		if err != nil || len(cands) == 0 {
			// Honest fallback: no candidates ⇒ defer to the deterministic reference sampler.
			// The harness is invariant to the sampler (EG02) and stays green — never a fake win.
			return FallbackSampler(seamCell, seed)
		}
		// Stable candidate order so the run is byte-replayable (niche, then mutation).
		sort.Slice(cands, func(i, j int) bool {
			if cands[i].Niche != cands[j].Niche {
				return cands[i].Niche < cands[j].Niche
			}
			return cands[i].Mutation < cands[j].Mutation
		})

		ranked := make([]rankedCandidate, 0, len(cands))
		for i, c := range cands {
			ev := JudgeCandidate(cell, c)
			v := Variant{ID: candidateVariantID(cell.ID, i), Niche: c.Niche}
			ranked = append(ranked, rankedCandidate{
				variant:  v,
				evidence: ev,
				// re-judged by the FROZEN gate — the generator's confidence is never read.
				promoted: Promote(v, ev).Verdict == PromotionProposed,
			})
		}

		best := selectBest(ranked)
		return "parent-" + cell.ID, best.variant, best.evidence
	}
}

// selectBest deterministically picks the variant the single-output seam returns: the
// gate-PASSING candidate with the highest fitness (ties broken by variant id for full
// determinism); if none passes, the first candidate (its failing evidence). It NEVER
// fabricates a pass — a no-passing set surfaces a variant the gate WILL refuse. PURE.
func selectBest(ranked []rankedCandidate) rankedCandidate {
	bestIdx := -1
	for i, r := range ranked {
		if !r.promoted {
			continue
		}
		if bestIdx == -1 {
			bestIdx = i
			continue
		}
		b := ranked[bestIdx]
		if r.evidence.Fitness > b.evidence.Fitness ||
			(r.evidence.Fitness == b.evidence.Fitness && r.variant.ID < b.variant.ID) {
			bestIdx = i
		}
	}
	if bestIdx == -1 {
		return ranked[0] // none passed — surface the first (honest, failing) candidate.
	}
	return ranked[bestIdx]
}

// --- The promotion door: candidate → truth ONLY via firewall.ViaIdea → /goal ------------

// ProposeViaIdea is the ONLY legal door a promotable self-play variant walks toward truth:
// it requires the FROZEN Promote gate to PASS (mirror_green ∧ out_of_sample_green ∧
// authority_approval) and then routes the candidate through firewall.ViaIdea → an `ideas`
// DRAFT (no version, no mirror) → /goal (the human freeze). It NEVER calls ToKernel, never
// writes kernel/mirrors/fitness, and never trusts the generator's confidence: a variant whose
// gate did not pass is REFUSED here (it cannot reach even the idea door). The returned
// IdeaCandidate.WroteKernel is ALWAYS false (firewall guarantees it). PURE: no DB, no clock.
//
// This is the EG03 wall guarantee made concrete: the generator proposes, the deterministic
// gate disposes, and the only path to truth is the human /goal — never a direct write.
func ProposeViaIdea(v Variant, e Evidence) (firewall.IdeaCandidate, error) {
	if Promote(v, e).Verdict != PromotionProposed {
		return firewall.IdeaCandidate{}, fmt.Errorf(
			"evolve: ProposeViaIdea refused — the frozen Promote gate did not pass for variant %q "+
				"(mirror_green ∧ out_of_sample_green ∧ authority_approval); a self-play variant reaches "+
				"the idea door ONLY through the deterministic gate, never on the generator's confidence", v.ID)
	}
	// The variant is a quarantine artifact carried forward as a candidate-truth sketch. It
	// becomes truth ONLY by acquiring its mirror via /goal — ViaIdea writes no kernel.
	mem := firewall.MemoryItem{
		ID:         "evolve-variant:" + v.ID,
		Content:    "self-play variant " + v.ID + " proposed for niche " + v.Niche,
		Provenance: "evolve:self-play",
		Confidence: e.Fitness,
		Taint:      []firewall.Taint{firewall.TaintUnverified},
	}
	return firewall.ViaIdea(mem)
}
