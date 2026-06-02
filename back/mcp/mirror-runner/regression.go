// Package mirrorrunner is the AIDOS Mirror cliquet (ratchet): it replays every
// materialized mirror and decides whether a candidate change reddens a
// previously-green mirror. Activated at S05.
//
// This file holds the CLIQUET CORE: a pure, total, deterministic decision over
// two sets of verdicts (the merge-base baseline and the candidate). Per the
// determinism-first mandate (CLAUDE.md §6), the regression decision MUST be code,
// never an agent — it is a diff of verdict sets, not a judgement. Replaying the
// mirrors (running Godog/rapid/the fixture interpreter) is I/O and lives in the
// runner shell (runner.go); deciding "did anything regress?" is this pure core,
// pinned by a reproducibility property mirror (regression_property_test.go).
package mirrorrunner

import "sort"

// CodeRedRegression is the BlockReason code the ci-ratchet hook returns when a
// previously-green mirror is red on the candidate. It is the cliquet's refusal.
const CodeRedRegression = "RED_REGRESSION"

// Status is a mirror's verdict. Exactly two values — green or red. A mirror is
// either honoured (green) or broken (red); there is no third state.
type Status string

const (
	// StatusGreen means the mirror passed (the truth it proves is honoured).
	StatusGreen Status = "green"
	// StatusRed means the mirror failed (the behaviour it proves is broken).
	StatusRed Status = "red"
)

// MergeVerdict is the cliquet's decision for a candidate against its baseline.
type MergeVerdict string

const (
	// VerdictAllowed means no baseline-green mirror is red on the candidate.
	VerdictAllowed MergeVerdict = "ALLOWED"
	// VerdictRejected means at least one baseline-green mirror regressed.
	VerdictRejected MergeVerdict = "REJECTED"
)

// MirrorVerdict is one mirror's verdict, at the baseline or on the candidate.
// ContentHash content-addresses the exact mirror that was run, so a verdict can
// never be passed off as belonging to a different mirror (KRD §34, S01 hashing).
type MirrorVerdict struct {
	MirrorID    string `json:"mirror_id"`
	Version     string `json:"version"`
	ContentHash string `json:"content_hash"`
	Status      Status `json:"status"`
}

// Regression is one baseline-green mirror that is red on the candidate — exactly
// what the cliquet forbids.
type Regression struct {
	MirrorID        string `json:"mirror_id"`
	Version         string `json:"version"`
	ContentHash     string `json:"content_hash"`
	BaselineStatus  Status `json:"baseline_status"`
	CandidateStatus Status `json:"candidate_status"`
}

// BlockReason is the actionable refusal the ci-ratchet hook emits (CLAUDE.md §2:
// a block always names the door). Shared shape with the wall's BlockReason.
type BlockReason struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// Regressed computes the regressed set: every mirror that is green at the
// baseline and red on the candidate, keyed by mirror id. Pure and total:
//
//   - a mirror absent from the candidate is treated as not-run, hence NOT a
//     regression (we only flag a green→red transition we actually observed);
//   - a mirror red at baseline and red on the candidate is NOT a regression
//     (it was already broken — the cliquet protects green, not red);
//   - a mirror absent from the baseline (newly added) is NOT a regression.
//
// The result is sorted by mirror id so the output is deterministic — the
// reproducibility mirror pins "same input → same output".
func Regressed(baseline, candidate []MirrorVerdict) []Regression {
	cand := make(map[string]MirrorVerdict, len(candidate))
	for _, c := range candidate {
		cand[c.MirrorID] = c
	}

	var out []Regression
	for _, b := range baseline {
		if b.Status != StatusGreen {
			continue // the cliquet only protects what was green.
		}
		c, ok := cand[b.MirrorID]
		if !ok {
			continue // not run on the candidate — not an observed regression.
		}
		if c.Status == StatusRed {
			out = append(out, Regression{
				MirrorID:        b.MirrorID,
				Version:         c.Version,
				ContentHash:     c.ContentHash,
				BaselineStatus:  StatusGreen,
				CandidateStatus: StatusRed,
			})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].MirrorID < out[j].MirrorID })
	return out
}

// Verdict turns a regressed set into the merge verdict. ALLOWED when the set is
// empty; REJECTED + a RED_REGRESSION BlockReason otherwise. Pure and total.
func Verdict(regressed []Regression) (MergeVerdict, *BlockReason) {
	if len(regressed) == 0 {
		return VerdictAllowed, nil
	}
	ids := make([]string, len(regressed))
	for i, r := range regressed {
		ids[i] = r.MirrorID
	}
	return VerdictRejected, &BlockReason{
		Code:     CodeRedRegression,
		Severity: "error",
		Explanation: "Le cliquet refuse la fusion : un miroir vert à la base est rouge sur le candidat (régression). " +
			"Miroirs régressés : " + joinIDs(ids) + ".",
		HowToFix: []string{
			"Réparez le comportement cassé jusqu'à ce que le(s) miroir(s) régressé(s) redevienne(nt) vert(s).",
			"Si le changement est intentionnel (le comportement doit changer), ouvrez un /goal : idea → mirror → /goal → approbation, jamais une écriture furtive du miroir.",
			"Relancez le cliquet (mirror_replay / ratchet_check) et vérifiez que le verdict de fusion passe à ALLOWED.",
		},
	}
}

// Decide is the whole cliquet in one pure call: replay results in, verdict out.
func Decide(baseline, candidate []MirrorVerdict) (MergeVerdict, []Regression, *BlockReason) {
	r := Regressed(baseline, candidate)
	v, br := Verdict(r)
	return v, r, br
}

// joinIDs joins mirror ids with ", " without importing strings for one call —
// keeps the core dependency-free and trivially deterministic.
func joinIDs(ids []string) string {
	out := ""
	for i, id := range ids {
		if i > 0 {
			out += ", "
		}
		out += id
	}
	return out
}
