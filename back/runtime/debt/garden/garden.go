// Package garden is the AIDOS Runtime KernelDebt GARDENING + per-project /trim (step
// S112, KRD §82.4 « jardinage du KernelDebt + /trim par projet »). It is the pure,
// read-only function that surfaces the FIVE rots accumulating in a project's slice of
// the truth-store and PROPOSES reductions over them — so a human can decide to trim
// the debt via the ONLY door (idea → mirror → /goal → human approval). It DETECTS and
// SUGGESTS; it never deletes, mutates, or writes truth.
//
// FIVE KINDS, EXTENDING S41 — NEVER INVENTED (CLAUDE.md honesty rule). S41 (package
// debt) already classifies THREE rots: orphan_mirror, stale_fixture, surviving_mutant.
// S112 CONSUMES those (it does NOT re-derive them — debt.Scan stays authoritative) and
// adds the TWO §82.4 names the garden was missing:
//
//   - dead_liveness      — a mirror declared DEAD (LivenessDead) that STILL pins a LIVE
//     truth: a dead proof, a never-running monster (KRD §34 « liveness morte »). It is
//     distinct from an orphan_mirror (orphan = reflects NOTHING live; dead_liveness =
//     reflects a live truth but the proof itself is dead). Counted once, never twice.
//   - low_value_constraint — a cell whose MEASURED harness cost exceeds its DECLARED
//     HarnessCostBudget WITHOUT a justified ValueCase (KRD §66.3 « contrainte à faible
//     valeur »). CONSUMED from S51 economics.Evaluate — the garden never re-derives the
//     §66.3 verdict; it surfaces the over_budget_flagged cells as debt.
//
// PROJECT-SCOPED (§82.4, the S112 done-criterion). The garden tends ONE project's
// slice at a time: a ProjectSnapshot carries its ProjectRef, and every GardenItem is
// tagged with it. A scan of project A never surfaces project B's debt (the fixture
// pins it). This is /trim PAR PROJET — the RLS-isolated (S55) gardening of each app's
// own kernel debt.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Tend is a pure, total function of
// (projectSnapshot, now) — no DB, no I/O, no time.Now(): the clock is PASSED IN so the
// report is replayable. Same inputs ⇒ same GardenItems (ordered). Detection/ranking is
// code, never an LLM; the §66.3 verdict is CONSUMED from economics.Evaluate (the
// authoritative deterministic evaluator). The reproducibility property mirror pins it.
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over a projection of a
// project's kernel ⋈ mirrors ⋈ mutation run ⋈ declared budgets (all passed in). It
// writes NOTHING. /trim SUGGESTS; accepting a suggestion OPENS an idea (the OpenIdea
// projection) and routes through idea → mirror → /goal → human approval — never a
// direct removal. Recording a garden snapshot is a row written only by the aidos CLI
// writer role through an approved ChangeSet (S20), never from this package.
//
// CONTENT-ADDRESSED (S01/S02 REUSED, not forked). A GardenItem's id is
// Hash(Canonicalize(body)) over the same scheme S01/S02/S41 use.
package garden

import (
	"encoding/json"
	"fmt"
	"sort"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	krec "github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// Kind is the nature of one piece of garden debt. There are EXACTLY five — the three
// S41 kinds (CONSUMED) plus the two §82.4 adds — declared here, never invented (the
// honesty rule; the rapid property pins no GardenItem carries a kind outside this set).
type Kind string

const (
	// KindOrphanMirror — CONSUMED from S41: a mirror reflecting no live truth.
	KindOrphanMirror Kind = Kind(debt.KindOrphanMirror)
	// KindStaleFixture — CONSUMED from S41: a fixture pinned to a moved head.
	KindStaleFixture Kind = Kind(debt.KindStaleFixture)
	// KindSurvivingMutant — CONSUMED from S41: a mutant the covering mirror let live.
	KindSurvivingMutant Kind = Kind(debt.KindSurvivingMutant)
	// KindDeadLiveness — S112 ADD: a mirror declared DEAD that still pins a LIVE truth
	// (a dead proof, KRD §34 « liveness morte »). Distinct from an orphan_mirror.
	KindDeadLiveness Kind = "dead_liveness"
	// KindLowValueConstraint — S112 ADD: a cell over its HarnessCostBudget without a
	// justified ValueCase (KRD §66.3 « contrainte à faible valeur »). CONSUMED from S51.
	KindLowValueConstraint Kind = "low_value_constraint"
)

// kinds is the closed set, for the no-invented-kind invariant.
var kinds = map[Kind]bool{
	KindOrphanMirror:       true,
	KindStaleFixture:       true,
	KindSurvivingMutant:    true,
	KindDeadLiveness:       true,
	KindLowValueConstraint: true,
}

// IsKind reports whether k is one of the five declared garden-debt kinds.
func IsKind(k Kind) bool { return kinds[k] }

// Severity ranks how pressing a piece of debt is (declared, never learned — §8). Used
// only to ORDER the report; the garden blocks nothing (read-only diagnostic).
type Severity string

const (
	SeverityHigh   Severity = "high"
	SeverityMedium Severity = "medium"
	SeverityLow    Severity = "low"
)

var severityRank = map[Severity]int{SeverityHigh: 0, SeverityMedium: 1, SeverityLow: 2}

// CellBudget pairs a cell's DECLARED HarnessCostBudget with its MEASURED cost and an
// optional ValueCase — the exact triple S51 economics.Evaluate consumes. The garden
// READS these (the budget is above the line, fitness zone, SELECT-only); it never
// authors them. The metered Cost is CONSUMED from S111 costmeter.MeterCell.
type CellBudget struct {
	Budget    economics.HarnessCostBudget `json:"budget"`
	Cost      economics.MeasuredCost      `json:"cost"`
	ValueCase *economics.ValueCase        `json:"value_case,omitempty"`
}

// ProjectSnapshot is the read-only view Tend gardens for ONE project (§82.4). It wraps
// the S41 debt.Snapshot (truths ⋈ mirrors ⋈ mutation) with the project ref and the
// per-cell budgets the §66.3 low-value detector consumes. Tend never mutates it.
type ProjectSnapshot struct {
	ProjectRef string        `json:"project_ref"`
	Snapshot   debt.Snapshot `json:"snapshot"`
	Budgets    []CellBudget  `json:"budgets"`
}

// GardenItem is one named, ranked, PROJECT-SCOPED piece of debt. It carries the S41
// DebtItem shape (id/kind/target/reason/severity) plus the ProjectRef (the §82.4
// scoping). id is the content hash of the canonical body (S01/S02 reuse). TargetRef
// traces to a REAL input mirror/cell (never invented — the honesty rule).
type GardenItem struct {
	ID         string   `json:"id"`
	ProjectRef string   `json:"project_ref"`
	Kind       Kind     `json:"kind"`
	TargetRef  string   `json:"target_ref"`
	Reason     string   `json:"reason"`
	Severity   Severity `json:"severity"`
}

// Garden is the typed, ordered, project-scoped diagnostic: the GardenItems Tend found,
// ranked (high severity first, then kind, then target, then id), the project they
// belong to, and the kernel head the scan was taken against.
type Garden struct {
	ProjectRef string       `json:"project_ref"`
	Items      []GardenItem `json:"items"`
	KernelHead string       `json:"kernel_head"`
}

// canonicalBody is the hashed shape of a GardenItem (id excluded — id IS its hash).
type canonicalBody struct {
	Kind       Kind     `json:"kind"`
	ProjectRef string   `json:"project_ref"`
	Reason     string   `json:"reason"`
	Severity   Severity `json:"severity"`
	TargetRef  string   `json:"target_ref"`
}

// itemID computes the content address of a GardenItem body, REUSING S01/S02's
// Canonicalize + Hash (never forked). Same logical item ⇒ same id.
func itemID(project string, kind Kind, targetRef, reason string, sev Severity) string {
	b, _ := json.Marshal(canonicalBody{Kind: kind, ProjectRef: project, Reason: reason, Severity: sev, TargetRef: targetRef})
	canon, err := krec.Canonicalize(b)
	if err != nil {
		return krec.Hash(b)
	}
	return krec.Hash(canon)
}

// Tend is the deep, pure heart of S112: it gardens ONE project's snapshot and returns
// its ranked, project-scoped Garden. Pure and total — no DB, no I/O, no time.Now()
// (now passed for replayability). It DETECTS and RANKS; it NEVER mutates, deletes, or
// writes truth (the wall). It CONSUMES S41's debt.Scan for the three base kinds, then
// adds the two §82.4 detectors (dead liveness, low-value constraint), then tags every
// item with the project ref (§82.4 scoping).
func Tend(p ProjectSnapshot, now int64) Garden {
	var items []GardenItem

	// CONSUME S41 for the three base kinds (orphan, stale, surviving) — never re-derived.
	base := debt.Scan(p.Snapshot, now)
	for _, d := range base.Items {
		items = append(items, GardenItem{
			ID:         itemID(p.ProjectRef, Kind(d.Kind), d.TargetRef, d.Reason, Severity(d.Severity)),
			ProjectRef: p.ProjectRef,
			Kind:       Kind(d.Kind),
			TargetRef:  d.TargetRef,
			Reason:     d.Reason,
			Severity:   Severity(d.Severity),
		})
	}

	// S112 adds.
	items = append(items, deadLiveness(p)...)
	items = append(items, lowValueConstraints(p)...)

	rank(items)
	return Garden{ProjectRef: p.ProjectRef, Items: items, KernelHead: p.Snapshot.KernelHead}
}

// liveHeads indexes the live truths by id → live head version.
func liveHeads(s debt.Snapshot) map[string]string {
	heads := make(map[string]string, len(s.Truths))
	for _, t := range s.Truths {
		if t.Live {
			heads[t.ID] = t.Version
		}
	}
	return heads
}

// deadLiveness surfaces a mirror declared DEAD (LivenessDead) that STILL reflects a
// LIVE truth — a dead proof (KRD §34 « liveness morte »). It is DISTINCT from an
// orphan_mirror: an orphan reflects NOTHING live (S41 already counts it); a
// dead_liveness mirror reflects a live truth but its own proof is dead, so it never
// runs and never fails. Counting only dead mirrors on LIVE truths keeps each rot under
// exactly one kind (a dead mirror reflecting nothing is the orphan, not this). Pure.
func deadLiveness(p ProjectSnapshot) []GardenItem {
	heads := liveHeads(p.Snapshot)
	var out []GardenItem
	for _, m := range p.Snapshot.Mirrors {
		if m.Liveness != mrec.LivenessDead {
			continue
		}
		if _, idLive := heads[m.Reflects.LayerID]; !idLive {
			continue // reflects no live truth → an orphan_mirror (S41), not dead_liveness.
		}
		reason := fmt.Sprintf(
			"liveness morte (KRD §34) : le miroir %s reflète une vérité vivante %s@%s mais sa liveness est `dead` — une preuve morte qui ne tourne jamais (ni ne casse jamais)",
			m.ID, m.Reflects.LayerID, m.Reflects.Version)
		out = append(out, GardenItem{
			ID:         itemID(p.ProjectRef, KindDeadLiveness, m.ID, reason, SeverityHigh),
			ProjectRef: p.ProjectRef,
			Kind:       KindDeadLiveness,
			TargetRef:  m.ID,
			Reason:     reason,
			Severity:   SeverityHigh,
		})
	}
	return out
}

// lowValueConstraints surfaces a cell over its DECLARED HarnessCostBudget without a
// justified ValueCase (KRD §66.3 « contrainte à faible valeur »). It CONSUMES S51's
// economics.Evaluate as the AUTHORITATIVE verdict — the garden never re-derives §66.3;
// it surfaces the over_budget_flagged cells. A within_budget or over_budget_justified
// cell is NOT debt (the §66.3 rule: a justified cost earned its keep). Pure.
func lowValueConstraints(p ProjectSnapshot) []GardenItem {
	var out []GardenItem
	for _, cb := range p.Budgets {
		dec := economics.Evaluate(cb.Budget, cb.Cost, cb.ValueCase)
		if dec.Verdict != economics.VerdictOverBudgetFlagged {
			continue // within budget or justified → not low-value (earned its keep).
		}
		reason := fmt.Sprintf(
			"contrainte à faible valeur (KRD §66.3) : la cellule %s dépasse son HarnessCostBudget sur %v sans ValueCase `justified` — « plus une contrainte coûte cher, plus elle doit justifier sa valeur »",
			cb.Budget.CellRef, dec.OverAxes)
		out = append(out, GardenItem{
			ID:         itemID(p.ProjectRef, KindLowValueConstraint, cb.Budget.CellRef, reason, SeverityMedium),
			ProjectRef: p.ProjectRef,
			Kind:       KindLowValueConstraint,
			TargetRef:  cb.Budget.CellRef,
			Reason:     reason,
			Severity:   SeverityMedium,
		})
	}
	return out
}

// rank orders the report deterministically: severity (high → low), kind, target, id.
func rank(items []GardenItem) {
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

// SnapshotID is the content address of a recorded garden snapshot body, REUSING
// S01/S02's Canonicalize + Hash (never forked).
func SnapshotID(body []byte) (string, error) {
	canon, err := krec.Canonicalize(body)
	if err != nil {
		return "", fmt.Errorf("garden: canonicalize snapshot body: %w", err)
	}
	return krec.Hash(canon), nil
}
