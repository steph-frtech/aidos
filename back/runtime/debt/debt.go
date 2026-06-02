// Package debt is the AIDOS Runtime KernelDebt diagnostic (step S41): the pure,
// read-only function that names the ROT accumulating in the truth-store and ranks
// it, so a human can decide to trim it via the only door (idea → mirror → /goal →
// human approval). It DETECTS; it never deletes, mutates, or writes truth.
//
// THREE DECLARED KINDS, NEVER INVENTED (CLAUDE.md honesty rule). KernelDebt
// classifies rot into EXACTLY three kinds — no more, no fewer:
//
//   - orphan_mirror   — a mirror reflecting no live truth. This is a monster by the
//     completeness law (S12 / S06 `no_orphan_mirror`). We CONSUME S06's detector
//     (records.NoOrphanMirror); we do NOT re-derive or re-type the monster notion.
//   - stale_fixture   — a fixture mirror whose pinned truth @version no longer
//     matches the live head it reflects (the state→cmd→events fixture references a
//     truth that has MOVED). Detected over the same read-only snapshot.
//   - surviving_mutant — a mutation reported ALIVE by the CONSUMED mutation/gremlins
//     run (S40), against a truth a living mirror claims to cover (the mirror did not
//     kill what it should). We CONSUME the mutation run; we never produce mutants.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Scan is a pure, total function of
// (snapshot, now) — no DB, no I/O, no time.Now(): the clock is PASSED IN so the
// report is deterministic and replayable. Same inputs ⇒ same DebtItems (ordered).
// Parsing/ranking is code, never an LLM. The reproducibility property mirror pins
// it.
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over a projection of
// kernel ⋈ mirrors ⋈ the latest mutation run (all passed in). It writes NOTHING.
// Recording a debt snapshot is a SELECT-only-for-the-agent row in
// fitness.kernel_debt_snapshot, written only by the aidos CLI writer role through
// an approved ChangeSet (S20) — never from this package. Scan returns the report,
// never a boolean it then satisfies (anti-Goodhart).
//
// CONTENT-ADDRESSED (S01/S02 REUSED, not forked). A DebtItem's id and a recorded
// snapshot's id are Hash(Canonicalize(body)) over the same scheme S01/S02 use
// (records.Canonicalize + records.Hash) — a debt item lands under the same address
// in either store.
package debt

import (
	"encoding/json"
	"fmt"
	"sort"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	krec "github.com/steph-frtech/aidos/back/kernel/records"
)

// Kind is the nature of one piece of kernel debt. There are EXACTLY three —
// declared here, never invented (the honesty rule; the rapid property pins that no
// DebtItem carries a kind outside this set).
type Kind string

const (
	// KindOrphanMirror — a mirror reflecting no live truth (a monster by the
	// completeness law, S12/S06 no_orphan_mirror). CONSUMED, not re-coined.
	KindOrphanMirror Kind = "orphan_mirror"
	// KindStaleFixture — a fixture mirror whose pinned truth @version no longer
	// matches the live head it reflects (the pinned truth MOVED).
	KindStaleFixture Kind = "stale_fixture"
	// KindSurvivingMutant — a mutation reported ALIVE by the consumed mutation run,
	// against a truth a living mirror claims to cover (the mirror did not kill it).
	KindSurvivingMutant Kind = "surviving_mutant"
)

// kinds is the closed set, for the no-invented-kind invariant.
var kinds = map[Kind]bool{
	KindOrphanMirror:    true,
	KindStaleFixture:    true,
	KindSurvivingMutant: true,
}

// IsKind reports whether k is one of the three declared debt kinds.
func IsKind(k Kind) bool { return kinds[k] }

// Severity ranks how pressing a piece of debt is (declared, never learned — the
// weights are above the line, CLAUDE.md §8). Used only to ORDER the report; it is
// not a gate (KernelDebt blocks nothing — it is a read-only diagnostic).
type Severity string

const (
	// SeverityHigh — an orphan mirror: a completeness-law monster, the most pressing.
	SeverityHigh Severity = "high"
	// SeverityMedium — a surviving mutant: a real test gap a mirror should have closed.
	SeverityMedium Severity = "medium"
	// SeverityLow — a stale fixture: a pin to repin; the proof still runs, it points
	// at a moved head.
	SeverityLow Severity = "low"
)

// severityRank orders severities for the stable report sort (high first).
var severityRank = map[Severity]int{SeverityHigh: 0, SeverityMedium: 1, SeverityLow: 2}

// MutationStatus is the per-target verdict of the CONSUMED mutation run (S40). We
// read only what KernelDebt needs: did the mutant SURVIVE against this target.
type MutationStatus string

const (
	// MutationSurvived — a mutant lived: the covering mirror did not kill it.
	MutationSurvived MutationStatus = "survived"
	// MutationKilled — a mutant was killed: the mirror did its job.
	MutationKilled MutationStatus = "killed"
)

// TruthRow is the minimal read-model of one live kernel truth the scan needs: its
// id, its live head version, and whether it is live. The full AST lives in the
// kernel schema; this is the read-only projection (the wall). REUSES no kernel
// write path — Scan never touches the DB.
type TruthRow struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Live    bool   `json:"live"`
}

// MirrorRow is the minimal read-model of one mirror record the scan needs. Reflects
// is the truth id @version this mirror proves; TestKind distinguishes fixtures (the
// only kind that can go stale); Liveness mirrors S06's notion. This projects the
// mirrors.mirror_record row shape; Scan never writes it. Reflects REUSES S06's
// mirror/records.LayerRef (the canonical `reflects` ref) — no fork.
type MirrorRow struct {
	ID       string        `json:"id"`
	Reflects mrec.LayerRef `json:"reflects"`
	TestKind mrec.TestKind `json:"test_kind"`
	Liveness mrec.Liveness `json:"liveness"`
}

// MutationRow is the minimal read-model of one consumed mutation result: the truth
// target it mutated and whether the mutant survived. CONSUMED from S40, never
// produced here.
type MutationRow struct {
	Target string         `json:"target"`
	Status MutationStatus `json:"status"`
	// File/Line/Operator carry the surviving-mutant detail (S40 shape) for the
	// panel; optional, never invented when absent.
	File     string `json:"file,omitempty"`
	Line     int    `json:"line,omitempty"`
	Operator string `json:"operator,omitempty"`
}

// Snapshot is the read-only view Scan diagnoses: the live kernel truths, the mirror
// records (with reflects/test_kind/liveness/pinned-version), and the latest consumed
// mutation run. Scan never mutates it (the rapid property pins the input is
// unchanged). MutationRunRef is the content address of the consumed run (S40), for
// provenance; nil when no run was consumed.
type Snapshot struct {
	Truths         []TruthRow    `json:"truths"`
	Mirrors        []MirrorRow   `json:"mirrors"`
	Mutation       []MutationRow `json:"mutation"`
	KernelHead     string        `json:"kernel_head"`
	MutationRunRef *string       `json:"mutation_run_ref,omitempty"`
}

// DebtItem is one named, ranked piece of kernel debt. id is the content hash of the
// canonical item body (REUSE S01/S02 — Hash(Canonicalize(body))). kind is one of the
// three declared kinds. TargetRef traces to a REAL input truth/mirror/mutation (the
// honesty rule: never an invented target). Reason names WHY in the ubiquitous
// language. Severity ranks it for the ordered report.
type DebtItem struct {
	ID        string   `json:"id"`
	Kind      Kind     `json:"kind"`
	TargetRef string   `json:"target_ref"`
	Reason    string   `json:"reason"`
	Severity  Severity `json:"severity"`
}

// canonicalBody is the hashed shape of a DebtItem (id excluded — the id IS its
// hash). Keys are sorted by records.Canonicalize, so field order here is irrelevant.
type canonicalBody struct {
	Kind      Kind     `json:"kind"`
	Reason    string   `json:"reason"`
	Severity  Severity `json:"severity"`
	TargetRef string   `json:"target_ref"`
}

// itemID computes the content address of a DebtItem body, REUSING S01/S02's
// Canonicalize + Hash (never forked). Same logical item ⇒ same id.
func itemID(kind Kind, targetRef, reason string, sev Severity) string {
	b, _ := json.Marshal(canonicalBody{Kind: kind, Reason: reason, Severity: sev, TargetRef: targetRef})
	canon, err := krec.Canonicalize(b)
	if err != nil {
		// b is always valid JSON we just marshaled; defensively hash the raw bytes.
		return krec.Hash(b)
	}
	return krec.Hash(canon)
}

// KernelDebt is the typed, ordered diagnostic report: the list of DebtItems Scan
// found, ranked (high severity first, then by kind, then by id for stability). It
// carries the kernel head the scan was taken against (version-pinned, so a recorded
// snapshot stays inspectable after heads move) and the consumed mutation run ref.
type KernelDebt struct {
	Items          []DebtItem `json:"items"`
	KernelHead     string     `json:"kernel_head"`
	MutationRunRef *string    `json:"mutation_run_ref,omitempty"`
}

// Scan is the deep, pure heart of S41: it diagnoses the snapshot and returns the
// ranked KernelDebt. Pure and total — no DB, no I/O, no time.Now() (now is passed,
// for replayability and so a recorded snapshot is deterministic). It DETECTS and
// RANKS; it NEVER mutates the snapshot, deletes, or writes truth (the wall). The
// three detectors are pure predicates; their union, ranked, is the report.
//
// now is reserved for the recorded snapshot's scanned_at (the recorder passes it);
// Scan's CLASSIFICATION does not read the clock, so the DebtItems are a pure
// function of the snapshot alone (the determinism property).
func Scan(s Snapshot, now int64) KernelDebt {
	_ = now // the clock is passed for the recorder; classification never reads it.
	var items []DebtItem
	items = append(items, orphanMirrors(s)...)
	items = append(items, staleFixtures(s)...)
	items = append(items, survivingMutants(s)...)
	rank(items)
	return KernelDebt{Items: items, KernelHead: s.KernelHead, MutationRunRef: s.MutationRunRef}
}

// liveHeads indexes the live truths by id → live head version.
func liveHeads(s Snapshot) map[string]string {
	heads := make(map[string]string, len(s.Truths))
	for _, t := range s.Truths {
		if t.Live {
			heads[t.ID] = t.Version
		}
	}
	return heads
}

// orphanMirrors CONSUMES S06's no_orphan_mirror detector (records.NoOrphanMirror) —
// it does NOT re-derive the monster notion. A mirror reflecting no live truth (at
// any version) is an orphan_mirror DebtItem. We translate the snapshot's rows into
// the S06 detector's shape, run it, and re-express each Monster as a DebtItem.
func orphanMirrors(s Snapshot) []DebtItem {
	// Build the S06 inputs: live layers and the mirror set (in mrec shapes).
	var layers []mrec.Layer
	for _, t := range s.Truths {
		if t.Live {
			layers = append(layers, mrec.Layer{LayerID: t.ID, Version: t.Version})
		}
	}
	mirrors := make([]mrec.Mirror, 0, len(s.Mirrors))
	for _, m := range s.Mirrors {
		mirrors = append(mirrors, mrec.Mirror{
			MirrorID: m.ID,
			Reflects: m.Reflects,
			TestKind: m.TestKind,
			Liveness: m.Liveness,
		})
	}
	monsters := mrec.NoOrphanMirror(mirrors, layers)

	// S06's no_orphan_mirror keys on the exact (layer_id @version) ref, so a mirror
	// reflecting a MOVED head (same id, different version) is in the monster set too.
	// At S41 we split that population: a mirror whose reflected truth id is STILL
	// live (only the version moved) is NOT an orphan — it is version drift (a
	// stale_fixture for fixtures). An orphan_mirror is reserved for a mirror whose
	// reflected truth id has NO live truth AT ALL (truly reflects nothing live). This
	// keeps each rot counted once, under exactly one of the three declared kinds.
	heads := liveHeads(s)
	out := make([]DebtItem, 0, len(monsters))
	for _, mon := range monsters {
		if _, idLive := heads[mon.LayerID]; idLive {
			continue // the truth id is live, only the version moved → not an orphan.
		}
		reason := fmt.Sprintf(
			"miroir orphelin (no_orphan_mirror, S12) : %s reflète une cible disparue %s@%s — aucune vérité vivante (monstre de la loi de complétude)",
			mon.MirrorID, mon.LayerID, mon.Version)
		out = append(out, newItem(KindOrphanMirror, mon.MirrorID, reason, SeverityHigh))
	}
	return out
}

// staleFixtures detects a fixture mirror whose pinned truth @version no longer
// matches the live head it reflects (the pinned truth MOVED). It only considers
// fixture mirrors that DO reflect a live truth (a fixture reflecting no live truth
// is already an orphan_mirror — counted once, not double-classified). Pure.
func staleFixtures(s Snapshot) []DebtItem {
	heads := liveHeads(s)
	var out []DebtItem
	for _, m := range s.Mirrors {
		if m.TestKind != mrec.TestKindFixture {
			continue
		}
		head, live := heads[m.Reflects.LayerID]
		if !live {
			continue // orphan (no live truth) — handled by orphanMirrors, not stale.
		}
		if head != m.Reflects.Version {
			reason := fmt.Sprintf(
				"fixture périmée : %s est épinglée sur %s@%s alors que la tête vivante est @%s (l'épingle a bougé)",
				m.ID, m.Reflects.LayerID, m.Reflects.Version, head)
			out = append(out, newItem(KindStaleFixture, m.ID, reason, SeverityLow))
		}
	}
	return out
}

// survivingMutants detects a mutation reported ALIVE (CONSUMED from S40) against a
// truth that a LIVING mirror claims to cover (the mirror did not kill what it
// should). A survived mutation against a truth NO mirror covers is not a
// surviving_mutant for THIS step (it is a coverage gap, a different diagnostic) — we
// only flag survivors the completeness law says a mirror should have killed. Pure.
func survivingMutants(s Snapshot) []DebtItem {
	// Index living mirrors by the live truth id they cover.
	covering := make(map[string][]string) // truthID → coveringMirrorIDs
	heads := liveHeads(s)
	for _, m := range s.Mirrors {
		if m.Liveness != mrec.LivenessAlive {
			continue
		}
		if _, live := heads[m.Reflects.LayerID]; !live {
			continue // an orphan mirror covers nothing live.
		}
		covering[m.Reflects.LayerID] = append(covering[m.Reflects.LayerID], m.ID)
	}
	var out []DebtItem
	for _, mut := range s.Mutation {
		if mut.Status != MutationSurvived {
			continue
		}
		mirrorsForTarget, covered := covering[mut.Target]
		if !covered {
			continue // not covered by a living mirror → not THIS step's debt.
		}
		sort.Strings(mirrorsForTarget)
		var loc string
		if mut.File != "" {
			loc = fmt.Sprintf(" [%s:%d %s]", mut.File, mut.Line, mut.Operator)
		}
		reason := fmt.Sprintf(
			"mutant survivant : une mutation contre %s a survécu — le(s) miroir(s) %v aurai(en)t dû le tuer%s",
			mut.Target, mirrorsForTarget, loc)
		out = append(out, newItem(KindSurvivingMutant, mut.Target, reason, SeverityMedium))
	}
	return out
}

// newItem builds a DebtItem with its content-addressed id (S01/S02 reuse).
func newItem(kind Kind, targetRef, reason string, sev Severity) DebtItem {
	return DebtItem{
		ID:        itemID(kind, targetRef, reason, sev),
		Kind:      kind,
		TargetRef: targetRef,
		Reason:    reason,
		Severity:  sev,
	}
}

// rank orders the report deterministically: by severity (high → low), then kind,
// then target_ref, then id — a total order, so Scan is replayable.
func rank(items []DebtItem) {
	sort.Slice(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if severityRank[a.Severity] != severityRank[b.Severity] {
			return severityRank[a.Severity] < severityRank[b.Severity]
		}
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		if a.TargetRef != b.TargetRef {
			return a.TargetRef < b.TargetRef
		}
		return a.ID < b.ID
	})
}

// SnapshotID is the content address of a recorded KernelDebt snapshot body (the
// debt items + the trim plan), REUSING S01/S02's Canonicalize + Hash. The recorder
// (aidos CLI, via a ChangeSet) hashes the body and stores it as the row's id; the
// fixture pins snapshot.id == Hash(Canonicalize(body)).
func SnapshotID(body []byte) (string, error) {
	canon, err := krec.Canonicalize(body)
	if err != nil {
		return "", fmt.Errorf("debt: canonicalize snapshot body: %w", err)
	}
	return krec.Hash(canon), nil
}
