// Package completeness is the AIDOS Mirror enforcement tooth (step S12): it turns
// S06's read-only completeness verdict into a Stop GATE that BLOCKS on any monster
// (KRD §29 la loi de complétude; §74/§77 the Stop line `goal-check &&
// completeness-check`; LIVRE XXII §126-§127 la chasse au monstre).
//
// THE BICEPHALOUS LAW, NOW MECHANICAL. S06 (back/kernel/mirror/records) computes
// the monster set over `mirrors ⋈ kernel`: a kernel layer with no LIVING mirror of
// a required test_kind is `no_truth_without_mirror`; a mirror whose reflects target
// no longer exists is `no_orphan_mirror`. This package CONSUMES that detector — it
// does not re-derive or re-type it — and adds the GATE: block iff |monsters| > 0,
// pass otherwise. There is no third verdict (the rapid property pins it).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Gate is a pure, total function of the monster
// set — no clock, no rng, no I/O. Same monster set ⇒ same decision. The cut hash is
// a stable digest of the sorted join. The reproducibility property mirror pins it.
//
// THE WALL (CLAUDE.md §2): this package is PURE and READ-ONLY over a projection of
// `mirrors ⋈ kernel` (passed in). It writes NOTHING above the waterline. The Stop
// hook (back/hooks/stop) is a thin adapter that reads the head projection, calls
// Gate, records an audit row in runtime.completeness_runs (below the waterline, ADR
// 0014/0015), and returns the decision. Gate returns the decision, never a boolean
// it then satisfies (anti-Goodhart).
//
// ANTI-PASSTHROUGH (KRD §82): an unknown/errored completeness check is a FAILURE
// made explicit that BLOCKS, never a silent pass — see GateErrored.
package completeness

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// Verdict is the Stop gate's decision. There are exactly two — block | pass. There
// is no third verdict (the rapid invariant pins this; the DB CHECK enforces it).
type Verdict string

const (
	// VerdictBlock — at least one monster: the Stop is refused.
	VerdictBlock Verdict = "block"
	// VerdictPass — the cut is complete: the Stop may proceed.
	VerdictPass Verdict = "pass"
)

// BlockCode is the stable, machine-readable code of a Stop refusal.
type BlockCode string

const (
	// CodeMonster — the monster set is non-empty (a truth without a living mirror,
	// or an orphan mirror). The completeness law is red.
	CodeMonster BlockCode = "MONSTER"
	// CodeIncomplete — the completeness check itself could not run (errored /
	// unknown). A failure made explicit (KRD §82), never a silent pass.
	CodeIncomplete BlockCode = "INCOMPLETE"
)

// BlockReason is the actionable refusal shape shared across AIDOS block sites
// (CLAUDE.md §2: code, severity, explanation, how_to_fix[]). It mirrors the S04
// wall / S07 sensors BlockReason JSON contract; each hook declares the shape
// locally (the existing precedent). A block without a BlockReason is a prison; the
// refusal always names the door.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Decision is the gate's output: the verdict, the full monster set (exactly — no
// silent drop), and — on block — the BlockReason. CutHash content-addresses the
// evaluation (ADR 0015): same cut ⇒ same hash.
type Decision struct {
	Verdict     Verdict           `json:"verdict"`
	Monsters    []records.Monster `json:"monsters,omitempty"`
	BlockReason *BlockReason      `json:"block_reason,omitempty"`
	CutHash     string            `json:"cut_hash"`
}

// Gate is the deep, well-named heart of the Stop completeness gate: block IFF the
// monster set is non-empty, pass otherwise (KRD §29). Pure and total. It takes the
// monster set S06's detector produced and the cut it was computed over (for the
// content address); it returns the Decision, never a boolean it then satisfies
// (anti-Goodhart, CLAUDE.md §8). The recorded monster set is EXACTLY the input set
// (no drop — KRD §82 .passthrough() anti-pattern).
func Gate(monsters []records.Monster, cut Cut) Decision {
	hash := cut.Hash()
	if len(monsters) == 0 {
		return Decision{Verdict: VerdictPass, CutHash: hash}
	}
	return Decision{
		Verdict:     VerdictBlock,
		Monsters:    monsters,
		BlockReason: monsterBlockReason(monsters),
		CutHash:     hash,
	}
}

// Check computes the whole gate over a cut: it runs S06's pure detector
// (ComputeCompleteness) and aggregates the verdict. This is the single call the
// Stop hook makes. It re-uses S06; it does not re-implement the law.
func Check(cut Cut) Decision {
	c := records.ComputeCompleteness(cut.Mirrors, cut.Layers)
	return Gate(c.Monsters, cut)
}

// GateErrored is the anti-passthrough path (KRD §82): when the completeness check
// itself could not run (the projection failed to load, the detector errored), the
// gate BLOCKS with code INCOMPLETE. A missing or crashing check is a failure made
// explicit, never a silent pass.
func GateErrored(cut Cut, cause error) Decision {
	return Decision{
		Verdict: VerdictBlock,
		BlockReason: &BlockReason{
			Code:     CodeIncomplete,
			Severity: "error",
			Explanation: fmt.Sprintf(
				"La vérification de complétude n'a pas pu s'exécuter : %v. Un contrôle "+
					"absent ou en erreur est un échec explicite qui BLOQUE le Stop (KRD §82 "+
					".passthrough()) — il ne passe jamais en silence.",
				cause,
			),
			HowToFix: []string{
				"Réparez le chargement de la projection mirrors ⋈ kernel (la coupe courante).",
				"Relancez la vérification ; le Stop reste bloqué tant que la complétude ne peut être calculée.",
			},
		},
		CutHash: cut.Hash(),
	}
}

// monsterBlockReason builds the canonical actionable refusal naming each monster
// and its reason, with a how_to_fix path per reason.
func monsterBlockReason(monsters []records.Monster) *BlockReason {
	first := monsters[0]
	explanation := fmt.Sprintf(
		"Monstre détecté : %s.", describeMonster(first),
	)
	if len(monsters) > 1 {
		explanation += fmt.Sprintf(" (et %d autre(s))", len(monsters)-1)
	}
	explanation += " La loi de complétude interdit les monstres : pas de vérité sans " +
		"miroir vivant, pas de miroir orphelin (KRD §29, LIVRE XXII). Le Stop est " +
		"bloqué tant qu'un monstre subsiste (on_fail: block)."
	return &BlockReason{
		Code:        CodeMonster,
		Severity:    "error",
		Explanation: explanation,
		HowToFix:    howToFix(monsters),
	}
}

// describeMonster renders one monster for the BlockReason explanation.
func describeMonster(m records.Monster) string {
	switch m.Reason {
	case records.ReasonNoTruthWithoutMirror:
		s := fmt.Sprintf("la couche %s@%s (kind %s) n'a aucun miroir vivant",
			m.LayerID, m.Version, m.Kind)
		if m.MissingTestKind != "" {
			s += fmt.Sprintf(" de test_kind requis « %s »", m.MissingTestKind)
		}
		return s + " (no_truth_without_mirror)"
	case records.ReasonNoOrphanMirror:
		return fmt.Sprintf("le miroir %s reflète une cible disparue %s@%s, liveness=dead (no_orphan_mirror)",
			m.MirrorID, m.LayerID, m.Version)
	default:
		return fmt.Sprintf("monstre de raison inconnue %q", m.Reason)
	}
}

// howToFix gives the per-reason repair path, deduplicated and stable-ordered.
func howToFix(monsters []records.Monster) []string {
	var hasTruth, hasOrphan bool
	for _, m := range monsters {
		switch m.Reason {
		case records.ReasonNoTruthWithoutMirror:
			hasTruth = true
		case records.ReasonNoOrphanMirror:
			hasOrphan = true
		}
	}
	var out []string
	if hasTruth {
		out = append(out,
			"no_truth_without_mirror : écrivez un miroir VIVANT (cert_language exécutable) du test_kind requis pour la couche, via idea → mirror → /goal → approbation humaine.")
	}
	if hasOrphan {
		out = append(out,
			"no_orphan_mirror : re-pointez le miroir orphelin vers une cible @version existante, ou retirez-le par lifecycle (jamais une suppression directe — ChangeSet + SemanticDiff).")
	}
	out = append(out,
		"Inspectez le détail sur la route Workbench /completeness, puis relancez ; le Stop reste bloqué tant qu'un monstre subsiste.")
	return out
}

// Cut is the projection of `mirrors ⋈ kernel` at the head the completeness law
// reads — exactly the inputs S06's pure detector consumes (ADR 0015: the cut is the
// head join, not a Stop-event payload). It is content-addressed by Hash().
type Cut struct {
	Layers  []records.Layer  `json:"layers"`
	Mirrors []records.Mirror `json:"mirrors"`
}

// Hash is the content address of the cut: a stable SHA-256 digest of the sorted
// layer set joined to the sorted mirror set. Same cut ⇒ same hash
// (determinism-first); the order of the input slices does not change the hash.
func (c Cut) Hash() string {
	layers := make([]records.Layer, len(c.Layers))
	copy(layers, c.Layers)
	sort.Slice(layers, func(i, j int) bool { return layerSortKey(layers[i]) < layerSortKey(layers[j]) })
	mirrors := make([]records.Mirror, len(c.Mirrors))
	copy(mirrors, c.Mirrors)
	// Total order: MirrorID alone is not unique within a cut (the same id may
	// appear with different reflects in a test draw), so fall back to the full
	// reflects + kind tuple to keep the sort — and thus the hash — stable.
	sort.Slice(mirrors, func(i, j int) bool { return mirrorSortKey(mirrors[i]) < mirrorSortKey(mirrors[j]) })

	h := sha256.New()
	for _, l := range layers {
		fmt.Fprintf(h, "L\x00%s\x00%s\x00%s\x00", l.LayerID, l.Version, l.Kind)
	}
	for _, m := range mirrors {
		fmt.Fprintf(h, "M\x00%s\x00%s\x00%s\x00%s\x00%s\x00%s\x00",
			m.MirrorID, m.Reflects.LayerID, m.Reflects.Version,
			m.TestKind, m.CertLanguage, m.Liveness)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// layerSortKey is the total ordering key for a layer within a cut — id, version
// and kind, so two layers sharing (id, version) but differing in kind still sort
// (and hash) deterministically.
func layerSortKey(l records.Layer) string {
	return strings.Join([]string{l.LayerID, l.Version, l.Kind}, "\x00")
}

// mirrorSortKey is the total ordering key for a mirror within a cut — every field
// that distinguishes one mirror row from another, so the sort (and thus the cut
// hash) is stable even when two rows share a MirrorID.
func mirrorSortKey(m records.Mirror) string {
	return strings.Join([]string{
		m.MirrorID, m.Reflects.LayerID, m.Reflects.Version,
		string(m.TestKind), string(m.CertLanguage), string(m.Authority), string(m.Liveness),
	}, "\x00")
}
