// cell.go — THROWAWAY (EG01 spike). A MINIMAL, plain-data representation of ONE kernel
// cell + the DETERMINISTIC gate that stands in for the real promotion-gate. We do NOT
// import the real kernel (the spike module never touches back/) — we model just enough
// of an /evolve cell to ask the one falsifiable question honestly.
//
// THE MODEL (intentionally small, intentionally NOT rigged):
//
//   - A Cell is one operation (e.g. "createOrder") with a small, DECLARED set of
//     behavioral NICHES it could occupy (S26 MAP-Elites grammar) — each niche is a
//     descriptor like "createOrder/discount" the variant must land in. The cell also
//     declares an out-of-sample fidelity threshold and an authority-approved set of
//     niches (authority does not pre-approve every niche — that is the realistic friction).
//
//   - A Variant is a candidate the generator proposes: a Niche it claims, a Mirror
//     verdict (green/red — the deterministic Judge), an OutOfSample fidelity reading
//     (a float the gate thresholds), and a Fitness reading. We DERIVE mirror/oos/fitness
//     from the variant's content + the cell so the gate is a pure check, never a
//     self-grade by the generator (anti-Goodhart, §8).
//
//   - The Gate is the §66.1 promotion gate, modelled as a PURE function of (cell, variant):
//     mirror_green ∧ out_of_sample_green ∧ authority_approval. It is the SAME gate for both
//     samplers — the stub and the self-play are judged by identical, deterministic rules.
//     The generator NEVER decides "good"; the gate does.
package evolvegen

import "sort"

// MirrorStatus mirrors back/runtime/evolve's vocabulary (we re-declare, never import).
type MirrorStatus string

const (
	MirrorGreen MirrorStatus = "green"
	MirrorRed   MirrorStatus = "red"
)

// Cell is the minimal plain-data stand-in for ONE kernel cell under /evolve.
type Cell struct {
	// ID is the operation id (e.g. "createOrder"). Read-only; never invented by the loop.
	ID string
	// Niches is the DECLARED set of behavioral niches (S26 MAP-Elites descriptors) this
	// cell could occupy. The total coverage denominator. Declared, never learned (§8).
	Niches []string
	// AuthorityApprovedNiches is the subset of niches the subgraph authority has approved
	// for promotion. A variant landing OUTSIDE this set fails the authority gate condition
	// (the realistic friction: authority does not rubber-stamp every niche).
	AuthorityApprovedNiches []string
	// OutOfSampleThreshold is the fidelity floor a variant must clear out-of-sample (§87).
	OutOfSampleThreshold float64
}

// Variant is one candidate the generator proposes (a branch in the DAG). It carries the
// niche it claims plus the EVIDENCE the gate consumes — but that evidence is DERIVED by
// the cell (Judge), not asserted by the generator. Fields below are what the generator
// emits; the gate recomputes the verdict from the cell, so a generator cannot self-pass.
type Variant struct {
	// ID is the candidate's branch id under /branches/evolution.
	ID string
	// Niche is the behavioral descriptor the variant claims to occupy.
	Niche string
	// Mirror is the deterministic Judge's verdict for this variant (green/red). In the
	// spike it is set by the sampler from the cell's rules (a pure derivation), never a
	// generator self-grade.
	Mirror MirrorStatus
	// OutOfSample is the variant's out-of-sample fidelity reading (a float the gate
	// thresholds against the cell's OutOfSampleThreshold — §87).
	OutOfSample float64
	// Fitness orders within a niche; it NEVER overrides the gate (it is diagnostic).
	Fitness float64
}

// GateVerdict is the pure promotion-gate outcome for one variant against a cell.
type GateVerdict struct {
	Passed            bool
	MirrorGreen       bool
	OutOfSampleGreen  bool
	AuthorityApproved bool
	NicheValid        bool // the claimed niche is a declared niche of the cell
	Reason            string
}

// niceContains reports whether s is in the (small) set.
func setContains(set []string, s string) bool {
	for _, x := range set {
		if x == s {
			return true
		}
	}
	return false
}

// Gate is the PURE promotion-gate (KRD §66.1) standing in for the real one. A variant is
// promoted into its niche ONLY IF ALL hold:
//
//	niche_valid ∧ mirror_green ∧ out_of_sample_green ∧ authority_approval
//
// It is the SAME gate for the stub and the self-play sampler (identical rules, no bias).
// Total/deterministic: any (cell, variant) yields a verdict; reads no clock, no rng.
func Gate(cell Cell, v Variant) GateVerdict {
	gv := GateVerdict{}
	gv.NicheValid = setContains(cell.Niches, v.Niche)
	gv.MirrorGreen = v.Mirror == MirrorGreen
	gv.OutOfSampleGreen = v.OutOfSample >= cell.OutOfSampleThreshold
	gv.AuthorityApproved = setContains(cell.AuthorityApprovedNiches, v.Niche)

	switch {
	case !gv.NicheValid:
		gv.Reason = "niche non déclarée pour la cellule (honnêteté : pas de niche inventée)"
	case !gv.MirrorGreen:
		gv.Reason = "miroir rouge — le Juge déterministe refuse (anti-Goodhart, §8)"
	case !gv.OutOfSampleGreen:
		gv.Reason = "échec out-of-sample — seul signal honnête (§87)"
	case !gv.AuthorityApproved:
		gv.Reason = "autorité non approuvée pour cette niche (§66.1)"
	default:
		gv.Passed = true
		gv.Reason = "gate passée : mirror_green ∧ out_of_sample_green ∧ authority_approval"
	}
	return gv
}

// RunResult is the measured outcome of running ONE sampler over ONE cell with a budget.
type RunResult struct {
	Sampler         string
	Cell            string
	Candidates      int      // how many variants the sampler proposed
	Promoted        int      // how many passed the gate
	NichesCovered   []string // distinct DECLARED niches won (sorted, deduped)
	GatePassageRate float64  // Promoted / Candidates
	NicheCoverage   float64  // len(NichesCovered) / len(cell.Niches)
}

// EvaluateSampler runs a sampler over a cell, gates every candidate, and computes the two
// metrics the spike rests on: gate-passage rate and niche coverage. PURE/deterministic:
// the sampler is injected and (for the reproducibility test) seeded; the gate is pure.
func EvaluateSampler(name string, cell Cell, budget int, seed int64, sampler Sampler) RunResult {
	candidates := sampler(cell, budget, seed)
	res := RunResult{Sampler: name, Cell: cell.ID, Candidates: len(candidates)}

	won := map[string]bool{}
	for _, v := range candidates {
		gv := Gate(cell, v)
		if gv.Passed {
			res.Promoted++
			won[v.Niche] = true
		}
	}
	for n := range won {
		res.NichesCovered = append(res.NichesCovered, n)
	}
	sort.Strings(res.NichesCovered)

	if res.Candidates > 0 {
		res.GatePassageRate = float64(res.Promoted) / float64(res.Candidates)
	}
	if len(cell.Niches) > 0 {
		res.NicheCoverage = float64(len(res.NichesCovered)) / float64(len(cell.Niches))
	}
	return res
}
