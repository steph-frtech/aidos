// Package docmirror implements FK07 (ROADMAP-fke, FKE-1.3 décision (a)): the DOC-MIRROR
// and the DATA-MIRROR comparators — the structural set-comparison that pairs the
// human-authored upper half of a doc (s2 / s1) against the code-derived lower half
// (s9 / s10) and decides, DETERMINISTICALLY, whether they diverge.
//
// THE DOC-MIRROR (FKE-1.3 décision (a), the load-bearing rule of this step). KRD's
// 1-for-1 anatomy pairs a human-authored doc with a code-derived doc:
//
//   - s2 (human concept doc)        ↔ s9 (DeriveDoc(kernel), FK06)
//   - s1 (human spec/requirements)  ↔ s10 (code-derived spec)
//
// FK07 compares each pair on TWO planes, and ONLY the structural plane is the judge:
//
//   - STRUCTURAL (the judge, §8). The concepts present/absent, the behaviours enumerated
//     (by ID), the errors covered — three sets. A structural divergence (a concept the
//     human documents that the code does not expose, a behaviour the code exposes that
//     the human never documents, an error covered on one side only) is BLOCKING. This is
//     a pure set-difference: deterministic, same pair → same verdict.
//   - PROSE (advisory, never the judge). The free-text descriptions. Prose that drifts
//     produces an ADVISORY signal — the LLM (elsewhere) may SIGNAL it, it NEVER ARBITRATES.
//     Editing only the prose leaves the structural verdict GREEN; it surfaces as advisory.
//
// This realizes §8 "le juge est un calcul" and the determinism-first mandate: the verdict
// is a pure function of the two structured docs; no LLM enters the comparator. The prose
// channel is the gated, advisory exception — it informs, it cannot block.
//
// THE DATA-MIRROR (s3 ↔ s7), DECLARED. FKE-1.3 also pairs a human data-shape doc (s3)
// with the code-derived data shape (s7). FK07 DECLARES this pairing as a first-class,
// content-addressed comparator using the SAME structural engine (entities/fields as the
// compared sets), so a later step (the entity/migration plane) can wire the real s7
// emitter into it. The declaration is honest: DataMirror runs the identical structural
// diff over whatever entity/field sets it is handed.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Compare is PURE + TOTAL: it sorts/dedupes both
// sides, takes set differences, and renders a canonical, hashable Report. Same (s2, s9)
// ⇒ byte-identical Report and identical Verdict, invariant under input ordering. The
// reproducibility mirror is docmirror_property_test.go.
//
// THE WALL (CLAUDE.md §2). Compare READS two structured docs and writes NOTHING — the
// Report is a projection (below the waterline), never a truth. A red doc-mirror is a
// SIGNAL the runner surfaces; acting on it goes idea → mirror → /goal. This package adds
// a new artifact (the comparator); it shifts no prior contract (anti-overwrite §9).
//
// REUSE, DON'T REINVENT (ADR 0007). s9 is read verbatim from FK06 (runtime/generators/
// derivedoc); the canonical JSON + hash reuse kernel/records. Only the structural diff is
// ours.
package docmirror

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// HumanDoc is the human-authored upper half of a doc-mirror (s2 for the concept doc, s1
// for the spec doc). It carries the SAME three enumerable sections as the derived s9 so
// the structural comparison is a pure set-difference. Prose lives only in the descriptions.
type HumanDoc struct {
	// KernelID pairs this human doc with its kernel/s9 (the pairing must match, else the
	// comparison is between unrelated docs — a structural error in itself).
	KernelID string `json:"kernel_id"`
	// Concepts is the human-documented lexicon set (kind-prefixed, same convention as s9).
	Concepts []string `json:"concepts"`
	// Behaviors is the human-documented behaviour list (by ID + prose description).
	Behaviors []derivedoc.Behavior `json:"behaviors"`
	// Errors is the human-documented error surface.
	Errors []string `json:"errors"`
}

// Plane names the comparison plane a Divergence belongs to.
type Plane string

const (
	// PlaneStructural is the judging plane — a divergence here is BLOCKING.
	PlaneStructural Plane = "structural"
	// PlaneProse is the advisory plane — a divergence here is ADVISORY (never blocks).
	PlaneProse Plane = "prose"
)

// Side names which document a one-sided structural divergence is missing from.
type Side string

const (
	// SideHumanMissing: the code (s9) exposes a concept/behaviour/error the human (s2)
	// never documented — the doc is BEHIND the code (an undocumented capability).
	SideHumanMissing Side = "human_missing"
	// SideCodeMissing: the human (s2) documents a concept/behaviour/error the code (s9)
	// does not expose — the doc is AHEAD of the code (a documented-but-absent capability).
	SideCodeMissing Side = "code_missing"
)

// Section names which of the three enumerable sections a divergence is in.
type Section string

const (
	SectionConcepts  Section = "concepts"
	SectionBehaviors Section = "behaviors"
	SectionErrors    Section = "errors"
)

// Divergence is one item present on one side and absent on the other (structural), or one
// behaviour whose prose differs across sides (prose). It is rendered deterministically.
type Divergence struct {
	// Plane is "structural" (blocking) or "prose" (advisory).
	Plane Plane `json:"plane"`
	// Section is concepts/behaviors/errors.
	Section Section `json:"section"`
	// Key is the compared identifier (a concept term, a behaviour ID, an error name).
	Key string `json:"key"`
	// Side is which side it is missing from (structural only; empty for prose).
	Side Side `json:"side,omitempty"`
	// HumanProse / CodeProse carry the two descriptions (prose plane only) so the advisory
	// signal can show the drift. Empty on the structural plane.
	HumanProse string `json:"human_prose,omitempty"`
	CodeProse  string `json:"code_prose,omitempty"`
}

// Report is the doc-mirror verdict: the deterministic, content-addressed result of one
// comparison. StructuralDivergences are BLOCKING (Verdict is red iff any exist OR the
// pairing mismatches); ProseAdvisories are ADVISORY (never affect Verdict). The Report is
// a projection — never written as truth (the wall).
type Report struct {
	// KernelID is the pairing both docs claim. PairingMismatch is true when they disagree.
	KernelID        string `json:"kernel_id"`
	PairingMismatch bool   `json:"pairing_mismatch"`
	// StructuralDivergences are the blocking set-differences (sorted, deterministic).
	StructuralDivergences []Divergence `json:"structural_divergences"`
	// ProseAdvisories are the advisory prose drifts (sorted, deterministic, non-blocking).
	ProseAdvisories []Divergence `json:"prose_advisories"`
	// Verdict is "green" (structurally aligned) or "red" (a blocking structural divergence
	// or a pairing mismatch). It NEVER depends on prose — prose is advisory only.
	Verdict string `json:"verdict"`
	// Bytes is the canonical JSON of the report sans Bytes/Hash (the byte-identity surface).
	Bytes []byte `json:"-"`
	// Hash is records.Hash(Bytes) — content-addressed, parity with the truth-store.
	Hash string `json:"-"`
}

// Green reports whether the doc-mirror passes (no blocking structural divergence).
func (r Report) Green() bool { return r.Verdict == "green" }

// Compare runs the doc-mirror: a PURE, TOTAL, deterministic structural set-comparison of a
// human doc (s2/s1) against a derived doc (s9/s10), plus an ADVISORY prose comparison. The
// structural plane is the judge; the prose plane never blocks. Same pair ⇒ same verdict
// AND byte-identical Report (invariant under input ordering — Compare canonicalizes).
func Compare(human HumanDoc, derived derivedoc.S9) Report {
	rep := Report{KernelID: derived.KernelID}

	// Pairing: the two docs must describe the same kernel. A mismatch is a structural,
	// blocking error in itself (comparing unrelated docs is never green).
	rep.PairingMismatch = human.KernelID != derived.KernelID

	// STRUCTURAL — three set-differences. Each side is sorted+deduped first so the diff is
	// order-independent (the byte-identity property).
	rep.StructuralDivergences = append(rep.StructuralDivergences,
		diffSet(SectionConcepts, toSet(human.Concepts), toSet(derived.Concepts))...)
	rep.StructuralDivergences = append(rep.StructuralDivergences,
		diffSet(SectionErrors, toSet(human.Errors), toSet(derived.Errors))...)
	rep.StructuralDivergences = append(rep.StructuralDivergences,
		diffSet(SectionBehaviors, behaviorIDs(human.Behaviors), behaviorIDs(derived.Behaviors))...)

	// PROSE — advisory only. For behaviours PRESENT ON BOTH sides (so not a structural
	// divergence), compare the descriptions; a drift is an advisory, never a block.
	rep.ProseAdvisories = proseDrift(human.Behaviors, derived.Behaviors)

	// Sort both lists deterministically (the byte-identity surface).
	sortDivergences(rep.StructuralDivergences)
	sortDivergences(rep.ProseAdvisories)

	// VERDICT — depends ONLY on the structural plane + pairing. Prose NEVER enters.
	if rep.PairingMismatch || len(rep.StructuralDivergences) > 0 {
		rep.Verdict = "red"
	} else {
		rep.Verdict = "green"
	}

	rep.Bytes, rep.Hash = canonicalReport(rep)
	return rep
}

// DataMirror DECLARES the s3 ↔ s7 comparator (FKE-1.3). It runs the IDENTICAL structural
// engine over entity/field SETS: a field documented but absent in the code shape (or vice
// versa) is a blocking structural divergence. The s7 emitter is owned by a later
// entity/migration step; until then DataMirror is driven with the sets a caller supplies,
// so the comparator is real and proven even though its derived source is declared. The
// sets are kind-prefixed strings ("entity:Order", "field:Order.total") — same convention.
func DataMirror(kernelID string, s3, s7 []string) Report {
	rep := Report{KernelID: kernelID}
	rep.StructuralDivergences = diffSet(SectionConcepts, toSet(s3), toSet(s7))
	sortDivergences(rep.StructuralDivergences)
	if len(rep.StructuralDivergences) > 0 {
		rep.Verdict = "red"
	} else {
		rep.Verdict = "green"
	}
	rep.Bytes, rep.Hash = canonicalReport(rep)
	return rep
}

// diffSet renders the symmetric difference of two sets as structural divergences: items in
// `human` but not `code` are SideCodeMissing (doc ahead of code); items in `code` but not
// `human` are SideHumanMissing (code ahead of doc). Deterministic (built then sorted).
func diffSet(section Section, human, code map[string]struct{}) []Divergence {
	var out []Divergence
	for k := range human {
		if _, ok := code[k]; !ok {
			out = append(out, Divergence{Plane: PlaneStructural, Section: section, Key: k, Side: SideCodeMissing})
		}
	}
	for k := range code {
		if _, ok := human[k]; !ok {
			out = append(out, Divergence{Plane: PlaneStructural, Section: section, Key: k, Side: SideHumanMissing})
		}
	}
	return out
}

// proseDrift returns advisory divergences for behaviours present on BOTH sides whose prose
// descriptions differ. Behaviours present on only one side are structural (handled by
// diffSet on the IDs) and never appear here — prose is compared only where the structure
// already agrees, so an advisory is purely about wording.
func proseDrift(human, code []derivedoc.Behavior) []Divergence {
	codeByID := map[string]string{}
	for _, b := range code {
		codeByID[b.ID] = b.Description
	}
	var out []Divergence
	for _, hb := range human {
		cd, ok := codeByID[hb.ID]
		if !ok {
			continue // structural (handled by diffSet on behaviour IDs).
		}
		if hb.Description != cd {
			out = append(out, Divergence{
				Plane:      PlaneProse,
				Section:    SectionBehaviors,
				Key:        hb.ID,
				HumanProse: hb.Description,
				CodeProse:  cd,
			})
		}
	}
	return out
}

// behaviorIDs collapses a behaviour list to its ID set (the structural key; prose is
// compared separately and advisorily).
func behaviorIDs(bs []derivedoc.Behavior) map[string]struct{} {
	s := make(map[string]struct{}, len(bs))
	for _, b := range bs {
		if b.ID == "" {
			continue
		}
		s[b.ID] = struct{}{}
	}
	return s
}

// toSet builds a string set (sorted accessors elsewhere give order-independence).
func toSet(xs []string) map[string]struct{} {
	s := make(map[string]struct{}, len(xs))
	for _, x := range xs {
		if x == "" {
			continue
		}
		s[x] = struct{}{}
	}
	return s
}

// sortDivergences imposes the canonical, total order on a divergence list so the Report is
// byte-identical regardless of input ordering: by section, then key, then side, then plane.
func sortDivergences(ds []Divergence) {
	sort.SliceStable(ds, func(i, j int) bool {
		a, b := ds[i], ds[j]
		if a.Section != b.Section {
			return a.Section < b.Section
		}
		if a.Key != b.Key {
			return a.Key < b.Key
		}
		if a.Side != b.Side {
			return a.Side < b.Side
		}
		return a.Plane < b.Plane
	})
}

// canonicalReport renders the Report (sans Bytes/Hash) to canonical JSON and hashes it —
// the content-addressed byte-identity surface. Marshal/Canonicalize never error for the
// Report value space (no funcs/channels); the guards keep Compare total.
func canonicalReport(r Report) ([]byte, string) {
	// Marshal the comparable view (Bytes/Hash are json:"-", so excluded).
	raw, err := json.Marshal(r)
	if err != nil {
		panic(fmt.Sprintf("docmirror: marshal report: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("docmirror: canonicalize report: %v", err))
	}
	return canon, records.Hash(canon)
}
