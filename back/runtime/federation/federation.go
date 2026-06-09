// Package federation is the S103 COMPOSITION layer of KRD §51 — it WIRES the cross-cell
// invariant kinds (S48 GlobalInvariant, S49 SagaInvariant + CoherenceTest, S50
// TemporalInvariant) onto REAL MULTIPLE cells (S100) and the runtime red-wave (S22), so a
// single, transverse rule expressed ONCE drives a fan-out that reddens each violating cell —
// "le red wave déploie globalement, chaque cellule réconcilie localement" (§51).
//
// It INVENTS NO new invariant primitive: it COMPOSES the four frozen contracts of the prior
// steps, none of which is forked here:
//
//   - SagaOverCells(saga, cells, trace) → SagaRun — runs the canonical saga
//     (payment_captured ⇒ order_confirmed ∨ compensation) over TWO REAL cells (e.g. order +
//     payment), each a contracted bounded context (S100 cell). It REUSES sagas.Evaluate to
//     judge the trace and sagas.RunCompensation to drive the compensation when a leg fails —
//     a broken leg (payment captured, order never confirmed) triggers the declared
//     compensation, after which the saga is satisfied VIA compensation. The two cells must be
//     a contracted pair (cell.CheckCrossCellAccess) — a saga over two NON-contracted cells is
//     refused (CROSS_CELL_NO_CONTRACT), because a federation has no implicit channel.
//
//   - FanOut(policy, federation, violations) → []CellRedWave — a GLOBAL policy change (a
//     GlobalInvariant expressed ONCE, e.g. "tout PII oubliable") fans out to a RedWorkQueue
//     PER CELL. It REUSES globalinvariant.RedWave to compute WHICH cells the policy reddens,
//     then for each reddened cell that actually VIOLATES the policy it REUSES redwave.Impact +
//     redwave.Enqueue to materialise that cell's own RedWorkQueue. A cell the policy spans but
//     which does NOT violate it stays GREEN (no work item) — the §51 invariant: "les cellules
//     non affectées restent vertes". Each cell reconciles its OWN queue locally.
//
// THE LAW (§51): the wave deploys globally (one policy → fan-out across the federation), each
// cell reconciles locally (its own RedWorkQueue, its own ratchet, S100). A non-violating cell
// is never reddened by the mere existence of the policy — only a real violation enqueues work.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O, no LLM. Every
// function is TOTAL and DETERMINISTIC — same input ⇒ same output — so the saga run and the
// per-cell fan-out are REPLAYABLE (the rapid property mirror pins this). The judgement REUSES
// the prior steps' pure functions verbatim; this package only ORCHESTRATES them. READ-ONLY
// against truth (the wall, CLAUDE.md §2): FanOut returns the RedWorkQueue rows VALUE per cell;
// the actual INSERT into runtime.red_work_queue (below the waterline) is the harness-invoked
// PostKernelChange hook's job (S22), never above the line. The content-addressed identity of a
// policy/saga reuses the S02 records substrate via the underlying kinds' SerializeBody — it is
// NOT forked here.
package federation

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/steph-frtech/aidos/back/kernel/temporal"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// SagaLeg names whether a saga RUN took the happy path or had to compensate — the terminal
// fact the §51 fixture asserts. It is derived, never declared.
type SagaLeg string

const (
	// LegHappy — every leg committed; the saga is satisfied on the happy path.
	LegHappy SagaLeg = "happy"
	// LegCompensated — a leg failed after capture; the declared compensation ran and the saga
	// is satisfied VIA compensation (the §49.2 / §51 done case).
	LegCompensated SagaLeg = "compensated"
	// LegViolated — a leg failed and the compensation did NOT make the property hold (the
	// dangling-money monster). The saga is still violated after running compensation.
	LegViolated SagaLeg = "violated"
)

// SagaRun is SagaOverCells' result: the terminal leg taken, the final trace (after any
// compensation), the per-cell saga outcome, and a cross-cell BlockReason when the two cells
// are not a contracted pair (the access refusal precedes any saga evaluation).
type SagaRun struct {
	// Leg is the terminal fact: happy | compensated | violated.
	Leg SagaLeg `json:"leg"`
	// FinalTrace is the events after the saga settled (the input trace, plus the compensation
	// events when a leg failed). It is what Evaluate's final verdict reads.
	FinalTrace sagas.Trace `json:"final_trace"`
	// Outcome is the saga's final outcome over FinalTrace (satisfied | violated).
	Outcome sagas.SagaOutcome `json:"outcome"`
	// Compensation is the compensation events the saga ran (empty on the happy path).
	Compensation []string `json:"compensation,omitempty"`
	// AccessBlock is non-nil iff the two cells are NOT a contracted pair (the federation refuses
	// the saga before evaluating it — a saga has no implicit cross-cell channel).
	AccessBlock *cell.BlockReason `json:"access_block,omitempty"`
}

// SagaOverCells runs the canonical KRD §49.2 saga over a federation of REAL cells (S100,
// §51). It is the composition that PROVES a saga holds on two real cells AND that breaking a
// leg triggers compensation:
//
//   - first, the two saga participant cells must be a CONTRACTED pair in the federation
//     (cell.CheckCrossCellAccess, REUSED) — a saga over two non-contracted cells is refused
//     (CROSS_CELL_NO_CONTRACT), returned in AccessBlock with Leg=violated and no evaluation
//     (a federation has no implicit channel between strangers);
//   - then Evaluate the input trace (sagas.Evaluate, REUSED). If it is ALREADY satisfied
//     (the happy path — payment_captured, order_confirmed) ⇒ Leg=happy, no compensation;
//   - if it is violated (a leg failed — payment captured, order never confirmed), RUN the
//     declared compensation (sagas.RunCompensation, REUSED), then RE-Evaluate the
//     post-compensation trace. If it is now satisfied ⇒ Leg=compensated (the §51 done case:
//     "casser une jambe déclenche compensation"); if STILL violated ⇒ Leg=violated.
//
// SagaOverCells is PURE, TOTAL, DETERMINISTIC. It REUSES sagas.Evaluate / RunCompensation and
// cell.CheckCrossCellAccess verbatim; it forks no judgement. No DB, no clock, no rng, no I/O.
func SagaOverCells(saga sagas.SagaInvariant, fed cell.Federation, trace sagas.Trace) SagaRun {
	// The saga's two participant cells must be a contracted pair (S100). Check both directions —
	// a contract is between two cells; the saga consumes the partner's events either way.
	if len(saga.Participants) >= 2 {
		from := cell.Ref(saga.Participants[0].Cell)
		to := cell.Ref(saga.Participants[1].Cell)
		if block := cell.CheckCrossCellAccess(from, to, fed); block != nil {
			return SagaRun{Leg: LegViolated, FinalTrace: trace, AccessBlock: block,
				Outcome: sagas.SagaOutcome{Outcome: sagas.OutcomeViolated}}
		}
	}

	// Evaluate the input trace as-is. The happy path is already satisfied.
	first := sagas.Evaluate(saga, trace)
	if first.Outcome == sagas.OutcomeSatisfied {
		return SagaRun{Leg: LegHappy, FinalTrace: trace, Outcome: first}
	}

	// A leg failed: run the declared compensation, then re-evaluate the settled trace.
	comp := sagas.RunCompensation(saga, trace)
	after := sagas.Evaluate(saga, comp.Trace)
	leg := LegViolated
	if after.Outcome == sagas.OutcomeSatisfied {
		leg = LegCompensated
	}
	return SagaRun{Leg: leg, FinalTrace: comp.Trace, Outcome: after, Compensation: comp.Events}
}

// CellViolation is one cell's verdict against a global policy: the cell, whether it VIOLATES
// the policy, and the (already-stale) edges the violation reddens inside that cell's own
// sub-Kernel. The caller (a sensor, S22) supplies these — federation never invents a violation.
type CellViolation struct {
	// Cell is the cell the policy spans.
	Cell gi.CellRef `json:"cell"`
	// Violates reports whether this cell actually breaks the policy. A cell the policy spans
	// but which does NOT violate it stays GREEN — no RedWorkQueue rows (§51).
	Violates bool `json:"violates"`
	// Edges are the cell's own stale links the violation reddens (S22 redwave.Edge), supplied
	// by the caller. Only consulted when Violates is true.
	Edges []redwave.Edge `json:"edges"`
	// Bumped are the cell's source ids the policy change bumped (the wave seed for this cell).
	Bumped []string `json:"bumped"`
	// Heads is the cell's current head map (S17), against which the edges resolve.
	Heads links.Heads `json:"heads"`
}

// CellRedWave is FanOut's per-cell result: the cell, whether it was reddened, and its OWN
// RedWorkQueue rows (S22) stamped with the policy wave id. A non-affected cell carries
// Reddened=false and ZERO rows — the §51 "les cellules non affectées restent vertes".
type CellRedWave struct {
	// Cell is the cell this wave belongs to.
	Cell gi.CellRef `json:"cell"`
	// Reddened reports whether the policy actually reddened this cell (it spans it AND the cell
	// violates it). A spanned-but-non-violating cell is NOT reddened.
	Reddened bool `json:"reddened"`
	// Queue is the cell's OWN RedWorkQueue rows (S22 redwave.RedWorkItem), each stamped with
	// the policy wave id. Empty when the cell is not reddened.
	Queue []redwave.RedWorkItem `json:"queue"`
}

// FanOut is the §51 GLOBAL-policy fan-out: a policy expressed ONCE (a GlobalInvariant) fans
// out to a RedWorkQueue PER CELL, each cell reconciling locally. It is the composition that
// PROVES "un changement de policy globale fan-out vers une RedWorkQueue par cellule, les
// cellules non affectées restent vertes":
//
//   - REUSE globalinvariant.RedWave to compute WHICH cells the policy reddens (the §49 cross-
//     cell reach). For a federation_policy this is EVERY cell the policy spans; the violating
//     cell is the seed;
//   - for each spanned cell that ACTUALLY VIOLATES the policy (CellViolation.Violates), REUSE
//     redwave.Impact over THAT cell's own edges/heads + redwave.Enqueue(policyWaveID) to
//     materialise its OWN RedWorkQueue — the cell reconciles locally (S100 per-cell ratchet);
//   - a cell the policy spans but which does NOT violate it carries Reddened=false and an
//     EMPTY queue (§51: non-affected cells stay green).
//
// The policyWaveID is the policy's content-addressed id (the bump id, S02) — supplied by the
// caller so the fan-out is replayable. FanOut returns one CellRedWave per supplied cell, in
// canonical (sorted by cell) order. It is PURE, TOTAL, DETERMINISTIC: it REUSES
// globalinvariant.RedWave and redwave.Impact/Enqueue verbatim and forks no closure logic. No
// DB, no clock, no rng, no I/O — it writes NOTHING (the wall); the per-cell INSERT is the S22
// hook's job below the waterline.
func FanOut(policy gi.GlobalInvariant, violatedCell gi.CellRef, policyWaveID string, cells []CellViolation) []CellRedWave {
	// The cross-cell reach: which cells the policy reddens (REUSE globalinvariant.RedWave). For
	// a federation_policy this is the full span; the violating cell seeds it.
	reach := gi.RedWave(policy, violatedCell)
	inReach := make(map[gi.CellRef]bool, len(reach))
	for _, c := range reach {
		inReach[c] = true
	}

	out := make([]CellRedWave, 0, len(cells))
	for _, cv := range cells {
		crw := CellRedWave{Cell: cv.Cell, Reddened: false, Queue: nil}
		// A cell is reddened iff the policy's reach spans it AND it actually violates the policy.
		// A spanned-but-non-violating cell stays green (§51); a violating cell outside the reach
		// (a non-spanned cell) is not the policy's concern.
		if inReach[cv.Cell] && cv.Violates {
			wave := redwave.Impact(cv.Bumped, cv.Edges, cv.Heads)
			rows := redwave.Enqueue(wave, policyWaveID)
			crw.Reddened = len(rows) > 0
			crw.Queue = rows
		}
		out = append(out, crw)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Cell < out[j].Cell })
	return out
}

// TemporalRun is TemporalOverCells' result: the temporal verdict and a cross-cell BlockReason
// when the two cells are not a contracted pair (the access refusal precedes any evaluation).
type TemporalRun struct {
	// Verdict is the temporal property's verdict over the observation (held | violated).
	Verdict temporal.TemporalVerdict `json:"verdict"`
	// AccessBlock is non-nil iff the antecedent/consequent cells are NOT a contracted pair.
	AccessBlock *cell.BlockReason `json:"access_block,omitempty"`
}

// TemporalOverCells wires S50 TemporalInvariant (§49.3) onto a federation of REAL cells (§51):
// a temporal deadline (e.g. payment_captured ⇒ order_confirmed within 5m) crosses the
// `payment` and `order` cells. It first checks the two cells are a CONTRACTED pair
// (cell.CheckCrossCellAccess, REUSED) — a temporal deadline over two non-contracted cells is
// refused (CROSS_CELL_NO_CONTRACT) — then REUSES temporal.Evaluate verbatim to judge the
// observation. PURE, TOTAL, DETERMINISTIC; it forks no temporal judgement. No DB, no clock
// (temporal.Evaluate reads no wall clock — the elapsed time is passed in), no rng, no I/O.
func TemporalOverCells(inv temporal.TemporalInvariant, antecedentCell, consequentCell cell.Ref, fed cell.Federation, obs temporal.Observation) TemporalRun {
	if block := cell.CheckCrossCellAccess(antecedentCell, consequentCell, fed); block != nil {
		return TemporalRun{
			Verdict:     temporal.TemporalVerdict{Verdict: temporal.VerdictViolated},
			AccessBlock: block,
		}
	}
	return TemporalRun{Verdict: temporal.Evaluate(inv, obs)}
}

// AffectedCells returns the cells FanOut actually reddened (Reddened=true), in canonical
// order — the Workbench groups the federation red wave by these. A convenience over FanOut's
// result; it adds no logic, only a projection (so the screen and the CLI never diverge).
func AffectedCells(waves []CellRedWave) []gi.CellRef {
	out := []gi.CellRef{}
	for _, w := range waves {
		if w.Reddened {
			out = append(out, w.Cell)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
