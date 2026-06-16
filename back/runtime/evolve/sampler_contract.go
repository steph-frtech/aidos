// Package evolve — the FROZEN Sampler extension point (EG02, ADR 0089).
//
// This file is ADDITIVE (CLAUDE.md §9): it adds NOTHING to the medium-loop shape
// (Evolve/Confine/Promote in evolve.go are untouched). It only FREEZES and DOCUMENTS
// the `Sampler` seam (already declared in evolve.go) as the STABLE extension point a
// real generator (self-play Proposer/Solver, AlphaEvolve, Novelty-Search/POET/MOME)
// plugs into at EG03+ — exactly as ADR 0089 graves it: the generator is a REPLACEABLE
// port behind this seam, with `DeterministicSampler` (back/mcp/evolve) as the fallback,
// and the /evolve harness (quarantine + promotion-gate + Judge=mirror) UNCHANGED.
//
// THE FROZEN CONTRACT (EG02 — the stable point of extension):
//
//	type Sampler func(cell string, seed int64) (parentID string, variant Variant, evidence Evidence)
//
//	Sampler IS the generator port. A conforming Sampler MUST:
//	  (1) be a PURE, total function of (cell, seed) — no DB, no clock, no ambient rng:
//	      same (cell, seed) ⇒ byte-identical (parentID, variant, evidence). The seed is
//	      PASSED IN so a run is replayable (determinism-first, §6/§8). A real LLM/search
//	      generator is the GATED exception (§6): it is confined BEHIND this seam, in the
//	      sandbox quarantine (S42), and its output is ALWAYS re-judged by the deterministic
//	      Promote gate — it never self-grades.
//	  (2) PROPOSE only — it returns a candidate Variant + its CONSUMED Evidence (mirror,
//	      out-of-sample, authority, fitness). It NEVER decides "good": the Judge=mirror
//	      (Promote) decides, deterministically. A Sampler that wrote truth, invented a
//	      niche from nothing, or graded its own variant would break the contract.
//	  (3) be SUBSTITUTABLE — the /evolve harness is INVARIANT to which conforming Sampler
//	      is injected: Evolve(cell, budget, seed, samplerA) and Evolve(cell, budget, seed,
//	      samplerB) emit the SAME contract of writes (the same can_write zones, in the same
//	      order), and every emitted path is Confined (the loop never governs) — whatever
//	      the sampler. The promotion gate's verdict is a pure function of the Evidence the
//	      sampler reports, NOT of which sampler reported it. This is the EG02 invariance
//	      mirror (sampler_invariance_property_test.go).
//
// THE WALL (CLAUDE.md §2): a Sampler — fallback or real — can only ever cause writes to
// branches/reports/ideas (Evolve emits ONLY can_write paths; Confine refuses the rest).
// A promotion is a PROPOSAL; the freeze is the human /goal. The candidate ideas a run
// emits reach the kernel ONLY via firewall.ViaIdea → /goal — never a direct kernel write.
//
// This file adds (a) the frozen contract doc above, (b) a CONTRACT extractor used by the
// invariance mirror, and (c) a SECOND reference sampler so the mirror can prove
// sampler-independence with two genuinely DISTINCT conforming samplers (the fallback in
// back/mcp/evolve is the first). Neither reference sampler is a real generator — the real
// one is EG03, behind this same seam.
package evolve

import "sort"

// SamplerOutputContract is the STABLE, sampler-independent shape of what an Evolve run
// produces — the part the /evolve harness guarantees is INVARIANT to the choice of
// conforming Sampler (EG02). It captures the can_write zones emitted (sorted, dedup-free
// to mirror Evolve's own output) and whether every emitted path is confined. It does NOT
// capture the variant id / niche / parent — those legitimately VARY per sampler (a real
// generator proposes different candidates); the CONTRACT is the harness behaviour around
// them, not the candidate's content.
type SamplerOutputContract struct {
	// EmittedZones is the sorted list of can_write zones the run emitted to (e.g.
	// "/branches/evolution", "/reports", "/ideas/proposed"). The CONTRACT: a non-empty
	// cell always yields these three zones, in this order, whatever the sampler.
	EmittedZones []string `json:"emitted_zones"`
	// AllConfined is true iff every emitted write path is Confined (Allowed). The
	// CONTRACT: ALWAYS true — the loop never governs, whatever the sampler.
	AllConfined bool `json:"all_confined"`
	// WritesTruth is ALWAYS false — a run writes no truth, whatever the sampler.
	WritesTruth bool `json:"writes_truth"`
}

// ExtractContract derives the sampler-independent SamplerOutputContract from a run. It is
// PURE/total: it reads the run's emitted writes, sorts their zones, and Confines every
// emitted path. It is the lens the EG02 invariance mirror compares across two distinct
// conforming samplers — it deliberately drops the candidate content (id/niche/parent) so
// the comparison is on the HARNESS contract, not on what a generator happened to propose.
func ExtractContract(run EvolutionRun) SamplerOutputContract {
	zones := make([]string, 0, len(run.Emitted))
	allConfined := true
	for _, w := range run.Emitted {
		zones = append(zones, w.Zone)
		if Confine(WriteAttempt{Path: w.Path}).Verdict != VerdictAllowed {
			allConfined = false
		}
	}
	sort.Strings(zones)
	return SamplerOutputContract{
		EmittedZones: zones,
		AllConfined:  allConfined,
		WritesTruth:  false, // a run never writes truth — structurally (Evolve writes nothing).
	}
}

// FallbackSampler is the canonical fallback referenced by ADR 0089: a pure, deterministic
// sampler returning a stable parent + a green-evidence variant keyed off the cell. It is
// the SAME shape as back/mcp/evolve.deterministicSampler (the wired fallback) — exposed
// here so the runtime package and its invariance mirror have a first reference Sampler that
// is byte-identical in CONTRACT to the wired one. The real generator REPLACES this behind
// the seam at EG03; it never rewrites the harness (additive, §9).
func FallbackSampler(cell string, seed int64) (string, Variant, Evidence) {
	return "parent-" + cell,
		Variant{ID: "var-" + cell, Niche: cell + "/baseline"},
		Evidence{Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, AuthorityApproved: false, Fitness: 0.5}
}

// AltReferenceSampler is a SECOND conforming reference Sampler, genuinely DISTINCT from
// FallbackSampler: it proposes a different parent, a different variant id, a different
// niche, and a different (still pure, deterministic) evidence reading derived from the
// seed via a splitmix64 step — i.e. it stands in for "a different generator". It exists
// ONLY so the EG02 invariance mirror can prove the harness is invariant to the CHOICE of
// sampler with two genuinely different conforming samplers (not the same function twice).
// It is NOT a real generator (no LLM, no search, no network) — the real one is EG03.
//
// It deliberately picks DIFFERENT candidate content from FallbackSampler so that, were the
// harness NOT invariant, the contracts would diverge — the mirror would then go red.
func AltReferenceSampler(cell string, seed int64) (string, Variant, Evidence) {
	// splitmix64 step — a pure, seeded mix; no ambient rng. Used only to vary the
	// candidate content deterministically, never to grade it.
	z := uint64(seed) + 0x9e3779b97f4a7c15
	z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9
	z = (z ^ (z >> 27)) * 0x94d049bb133111eb
	z ^= z >> 31
	// a deterministic fitness in [0,1) from the mixed seed — ORDERS within a niche only,
	// never overrides the gate (Evidence.Fitness is consumed, not the Judge).
	fitness := float64(z%1000) / 1000.0
	return "ancestor-" + cell,
		Variant{ID: "alt-" + cell, Niche: cell + "/variant"},
		Evidence{Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, AuthorityApproved: true, Fitness: fitness}
}
