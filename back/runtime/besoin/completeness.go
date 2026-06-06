package besoin

// completeness.go — EL09: the completeness law applied to the BESOIN. BesoinCompleteness(graph,
// mirrors) → CompletenessReport{Complete, Monsters[]} is the need-side mirror of the kernel
// completeness law (S06 / the skill check-completeness): every resolved LevelNode must have its
// statable LEVEL-MIRROR, and no level-mirror may dangle reflecting nothing.
//
// THE LAW, RE-STATED FOR THE NEED (ROADMAP EL09). A truth without a mirror is a wish; an orphan mirror
// is a monster (CLAUDE.md Mandat A). For the BesoinGraph the same shape holds above the wall:
//   - a `resolved` node WITHOUT its statable level-mirror      → monster NEED_LEVEL_WITHOUT_MIRROR
//   - a level-mirror reflecting NO node (or a non-resolved one) → monster ORPHAN_NEED_MIRROR
//   - a level-mirror whose FORM ≠ LevelMirrorForm(node.level)   → monster NEED_MIRROR_WRONG_FORM
//   - a `resolved` node whose four metadata DISAPPEARED         → monster NEED_LEVEL_METADATA_DISAPPEARED
//
// We REUSE the law (the completeness shape, S06) and CONSTRUCT the form table for the above-the-wall
// rungs (LevelMirrorForm, mirrorform.go) — derive-mirror cannot derive product/journey/view (verified).
//
// WHAT A LEVEL-MIRROR IS HERE (the wall, CLAUDE.md §2 + ROADMAP EL09). A BesoinLevelMirror is the
// NEED-SIDE description of "this resolved rung is provable by a mirror of THIS form" — it is NOT a real
// mirror record in the `mirrors` Postgres schema. NO real mirror is written here; the real mirrors are
// written BELOW the wall by the app-builder (S68) via /goal. EL09 only DETECTS monsters by counting and
// matching over the BesoinGraph + the declared need-side level-mirror set, above the line.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): BesoinCompleteness is a PURE TOTAL function — monster detection
// is counting + matching (link present? form matches? metadata present?), never an LLM judgment. Same
// (graph, mirrors, metadata) → same report (the reproducibility mirror completeness_property_test.go
// pins it). The fault-injection mirror proves that breaking the node↔mirror link in EITHER direction
// turns the detector RED (a monster appears).

import (
	"fmt"
	"sort"
)

// MonsterCode is the closed, besoin-local set of completeness-violation codes EL09 emits. SEPARATE from
// blockreason.Code (the kernel registry) and from BesoinBlockCode (the EL07/EL08 gate codes): a monster
// is a completeness defect of the NEED graph, named here, never invented at runtime. Declared (§8).
type MonsterCode string

const (
	// CodeNeedLevelWithoutMirror — a `resolved` LevelNode has no statable level-mirror reflecting it (a
	// need-truth without a mirror is a wish; CLAUDE.md Mandat A applied to the besoin).
	CodeNeedLevelWithoutMirror MonsterCode = "NEED_LEVEL_WITHOUT_MIRROR"
	// CodeOrphanNeedMirror — a level-mirror reflects NO node (or a node that is not resolved): an orphan
	// mirror is a monster (the law's second half).
	CodeOrphanNeedMirror MonsterCode = "ORPHAN_NEED_MIRROR"
	// CodeNeedMirrorWrongForm — a level-mirror reflects a resolved node but with the WRONG MirrorForm
	// (LevelMirrorForm(level) disagrees): the link exists but is mis-shaped (a subtle monster).
	CodeNeedMirrorWrongForm MonsterCode = "NEED_MIRROR_WRONG_FORM"
	// CodeNeedLevelMetadataDisappeared — a `resolved` node whose four per-truth metadata are no longer
	// present/certifiable (EL04): a resolved rung whose metadata vanished is a monster.
	CodeNeedLevelMetadataDisappeared MonsterCode = "NEED_LEVEL_METADATA_DISAPPEARED"
)

// monsterCodes is the closed set, canonical order, for the reproducibility/exhaustiveness mirror.
var monsterCodes = []MonsterCode{
	CodeNeedLevelWithoutMirror,
	CodeOrphanNeedMirror,
	CodeNeedMirrorWrongForm,
	CodeNeedLevelMetadataDisappeared,
}

// MonsterCodes returns the closed monster-code set in canonical order. Never invented at runtime.
func MonsterCodes() []MonsterCode {
	out := make([]MonsterCode, len(monsterCodes))
	copy(out, monsterCodes)
	return out
}

// IsMonsterCode reports whether c is one of the closed monster codes. Pure, total.
func IsMonsterCode(c MonsterCode) bool {
	for _, k := range monsterCodes {
		if k == c {
			return true
		}
	}
	return false
}

// BesoinLevelMirror is the NEED-SIDE description that a resolved rung is provable by a mirror of a
// given form. It is NOT a real mirror in the `mirrors` schema (the wall): EL09 reads it to verify the
// node↔mirror link, it never writes it. Reflects names the rung it claims to reflect; Form is the
// mirror shape it carries (must equal LevelMirrorForm(Reflects)).
type BesoinLevelMirror struct {
	// Reflects is the grammar Level this level-mirror claims to reflect.
	Reflects Level `json:"reflects"`
	// Form is the mirror form this level-mirror carries (must match LevelMirrorForm(Reflects)).
	Form MirrorForm `json:"form"`
}

// Monster is one detected completeness violation: its code, the level it concerns (when applicable),
// a human explanation, and a non-empty how_to_fix (a wall names the door — KRD §44.5).
type Monster struct {
	// Code is the besoin-local monster code (closed set).
	Code MonsterCode `json:"code"`
	// Level is the grammar rung the monster concerns ("" when the orphan reflects a non-level).
	Level Level `json:"level"`
	// Explanation is the human-readable reason.
	Explanation string `json:"explanation"`
	// HowToFix is the actionable resolution path (length ≥ 1 — never a prison).
	HowToFix []string `json:"how_to_fix"`
}

// CompletenessReport is the PURE verdict of BesoinCompleteness. Complete is true iff Monsters is empty.
// Monsters is deterministically ordered (by level descent rank, then by code) so the report is stable.
type CompletenessReport struct {
	// Complete is true iff no monster was found (the need graph satisfies the completeness law).
	Complete bool `json:"complete"`
	// Monsters are the detected violations (empty when Complete). Deterministically ordered.
	Monsters []Monster `json:"monsters,omitempty"`
}

// BesoinCompleteness computes the EL09 completeness report over a BesoinGraph and its declared
// need-side level-mirror set, given the per-node metadata (keyed by Level — the EL04 metadata the
// resolved node was certified with). PURE, TOTAL, DETERMINISTIC. It writes NO truth and no real mirror
// (the wall): it reads the need graph + the declared mirror set and DETECTS monsters by counting and
// matching. Same input → same report.
//
// Detection, in deterministic order:
//  1. for each `resolved` node: there must be exactly the right level-mirror (link present AND of the
//     right form) AND its four metadata must still be present/certifiable;
//  2. for each declared level-mirror: it must reflect a `resolved` node of the graph (else orphan).
func BesoinCompleteness(graph BesoinGraph, mirrors []BesoinLevelMirror, metadata map[Level]Metadata) CompletenessReport {
	var monsters []Monster

	// Index the declared level-mirrors by the level they claim to reflect (last write wins; duplicates
	// of the same level are harmless — the form check below catches a wrong-form duplicate).
	mirrorByLevel := make(map[Level]BesoinLevelMirror, len(mirrors))
	for _, m := range mirrors {
		mirrorByLevel[m.Reflects] = m
	}

	// 1. Every resolved node must have its statable level-mirror of the right form + live metadata.
	for i := range graph.Nodes {
		n := graph.Nodes[i]
		if n.Status != NodeResolved {
			continue // only resolved rungs carry the completeness obligation (a need-truth).
		}
		wantForm, _ := LevelMirrorForm(n.Level) // always ok for a graph node (IsLevel guaranteed by AddNode).

		mir, hasMirror := mirrorByLevel[n.Level]
		switch {
		case !hasMirror:
			monsters = append(monsters, Monster{
				Code:  CodeNeedLevelWithoutMirror,
				Level: n.Level,
				Explanation: fmt.Sprintf(
					"Le niveau %q est `resolved` mais aucun miroir-de-niveau ne le reflète : une vérité-besoin sans miroir est un souhait (loi de complétude, CLAUDE.md Mandat A).",
					n.Level),
				HowToFix: []string{
					"state_level_mirror",
					fmt.Sprintf("énoncez le miroir-de-niveau de forme %q pour le rung %q (via /goal, sous le mur)", wantForm, n.Level),
				},
			})
		case mir.Form != wantForm:
			monsters = append(monsters, Monster{
				Code:  CodeNeedMirrorWrongForm,
				Level: n.Level,
				Explanation: fmt.Sprintf(
					"Le miroir-de-niveau du rung %q porte la forme %q alors que LevelMirrorForm exige %q.",
					n.Level, mir.Form, wantForm),
				HowToFix: []string{
					"fix_mirror_form",
					fmt.Sprintf("ré-énoncez le miroir avec la forme %q", wantForm),
				},
			})
		}

		// The four metadata of a resolved node must still be present/certifiable: a resolved rung whose
		// metadata vanished is a monster (EL04 CertifyMetadata reused, never re-judged).
		meta := metadata[n.Level]
		if v := CertifyMetadata(n, meta); !v.Complete {
			monsters = append(monsters, Monster{
				Code:  CodeNeedLevelMetadataDisappeared,
				Level: n.Level,
				Explanation: fmt.Sprintf(
					"Le niveau %q est `resolved` mais ses métadonnées par-vérité ne sont plus présentes/certifiables (EL04).",
					n.Level),
				HowToFix: []string{
					"declare_missing_metadata",
					"re-certifiez les quatre métadonnées (truth_kind/verifiability/scope/authority)",
				},
			})
		}
	}

	// 2. Every declared level-mirror must reflect a `resolved` node of the graph — else it is an orphan.
	for _, m := range mirrors {
		n, present := graph.Node(m.Reflects)
		if !present || n.Status != NodeResolved {
			monsters = append(monsters, Monster{
				Code:  CodeOrphanNeedMirror,
				Level: m.Reflects,
				Explanation: fmt.Sprintf(
					"Un miroir-de-niveau prétend refléter le rung %q mais aucun nœud `resolved` ne lui correspond : un miroir orphelin est un monstre (loi de complétude).",
					m.Reflects),
				HowToFix: []string{
					"reflect_a_resolved_node",
					"supprimez le miroir orphelin OU résolvez le nœud qu'il prétend refléter",
				},
			})
		}
	}

	sortMonsters(monsters)
	return CompletenessReport{Complete: len(monsters) == 0, Monsters: monsters}
}

// sortMonsters orders the monsters deterministically: by the level's descent rank (orphan non-levels
// rank last), then by monster code, then by explanation — so the report is byte-stable across runs.
func sortMonsters(ms []Monster) {
	sort.SliceStable(ms, func(a, b int) bool {
		ra, rb := monsterLevelRank(ms[a].Level), monsterLevelRank(ms[b].Level)
		if ra != rb {
			return ra < rb
		}
		if ms[a].Code != ms[b].Code {
			return ms[a].Code < ms[b].Code
		}
		return ms[a].Explanation < ms[b].Explanation
	})
}

// monsterLevelRank ranks a level for monster ordering: a valid grammar level by its node rank (source
// rungs then bands), and a non-level (an orphan reflecting garbage) after everything. Pure.
func monsterLevelRank(l Level) int {
	if IsLevel(l) {
		return levelRank(l)
	}
	return len(sourceOrder) + len(transversalBands) + 1
}
