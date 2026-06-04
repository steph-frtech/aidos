// ledger.go — BA29: the EFFECT-LOG + the fidelity-to-reality LEDGER (gap H2). BA28 proved a
// run RE-DERIVES (Replay(run).ID == run.ID) — but hash-equality only proves the RECORD is
// internally consistent, NOT that the REAL run matched the record. A bash side-effect the loop
// forgot to record, an MCP call it never logged, an FS write outside its self-report — none of
// these move the recorded hash, yet each is a fidelity breach. This file closes that hole with
// an INDEPENDENT effect-log captured AT THE BOUNDARY (not by the loop's self-report) and a
// deterministic RECONCILIATION of the boundary effects against the run's recorded actions.
//
// THE EFFECT-LOG IS CAPTURED AT THE BOUNDARY, NOT SELF-REPORTED (the roadmap, gap H2). An
// Effect is what the OUTSIDE observed the run do: an FS write the filesystem saw, an MCP call
// the MCP transport saw. It is recorded by the harness edge, independently of the AgentRun the
// loop wrote. Reconcile then asks: does every recorded below-the-line action have a matching
// boundary effect, and does every boundary effect have a matching recorded action? An effect
// with no action is an UNRECORDED side-effect (the betrayal); an action with no effect is an
// UNREALISED claim. A faithful run reconciles cleanly.
//
// READ-ONLY SURFACE, NO NEW TRUTH (CLAUDE.md §2). The Ledger is a deterministic QUERY over the
// below-the-line runtime events (runs / actions / assignments) + the effect-log. It writes no
// truth; it derives counts, timelines and reconciliation verdicts from data that already exists.
// Above the line it touches nothing — a fidelity breach is an OBSERVATION, surfaced via the S27
// idea-intake door, never a kernel write.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Reconcile, the BlockReason refusal-count, and the Ledger
// query are PURE, TOTAL functions over their input — no clock, no rng, no I/O, no LLM. A
// reconciliation is set-matching (code, not judgment); a refusal count is a tally; a timeline is
// a stable sort. Same input ⇒ same output (the reproducibility mirror ledger_property_test.go
// pins it). Reconciliation is a DIFF — never an "LLM compares the logs" agent.
package agentloop

import (
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// EffectKind is the closed kind of a boundary-observed effect. The set is CLOSED — the two
// observable side-effect classes a run can produce that the harness edge can witness: a write
// to the filesystem, and a call out over the MCP transport. (A read produces no observable
// mutation, so it is not an effect; only mutations and outward calls are.)
type EffectKind string

const (
	// EffectFSWrite — the filesystem observed a write at the boundary (a file created/edited).
	EffectFSWrite EffectKind = "fs_write"
	// EffectMCPCall — the MCP transport observed a call out to a tool at the boundary.
	EffectMCPCall EffectKind = "mcp_call"
)

var effectKindOrder = []EffectKind{EffectFSWrite, EffectMCPCall}

// EffectKinds returns the closed effect-kind set in canonical order.
func EffectKinds() []EffectKind {
	out := make([]EffectKind, len(effectKindOrder))
	copy(out, effectKindOrder)
	return out
}

// IsKnownEffectKind reports whether k is one of the closed effect kinds.
func IsKnownEffectKind(k EffectKind) bool {
	for _, kk := range effectKindOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// Effect is one side-effect WITNESSED AT THE BOUNDARY, independently of the loop's self-report.
// Run is the AgentRun.ID it is attributed to; Target is the path/tool it touched. It is NOT
// derived from the AgentRun — it is the harness edge's own record of what the world saw the run
// do. Reconcile diffs these against the run's recorded actions. Pure data; below the line.
type Effect struct {
	Run    string     `json:"run"`    // the AgentRun.ID this effect is attributed to
	Kind   EffectKind `json:"kind"`   // fs_write | mcp_call
	Target string     `json:"target"` // the path written / the MCP tool called
}

// Drift is one reconciliation discrepancy between the boundary effect-log and a run's recorded
// actions — the fidelity signal. UnrecordedEffect: the boundary saw an effect the run never
// recorded (the bash-side-effect betrayal). UnrealisedAction: the run recorded a mutating action
// the boundary never witnessed (a claimed write that did not happen). Both are observations, not
// truths.
type Drift struct {
	Kind   DriftKind `json:"kind"`   // unrecorded_effect | unrealised_action
	Target string    `json:"target"` // the path/tool at issue
}

// DriftKind is the closed kind of a reconciliation discrepancy.
type DriftKind string

const (
	// DriftUnrecordedEffect — a boundary effect with NO matching recorded action (the betrayal:
	// the run did something it never wrote down).
	DriftUnrecordedEffect DriftKind = "unrecorded_effect"
	// DriftUnrealisedAction — a recorded MUTATING action with NO matching boundary effect (a
	// claimed write the world never saw).
	DriftUnrealisedAction DriftKind = "unrealised_action"
)

// Reconciliation is the deterministic verdict of matching a run's recorded actions against the
// boundary effect-log. Reconciled iff there is NO drift — every boundary effect maps to a
// recorded action AND every recorded mutating action maps to a boundary effect. Drifts is the
// full, ordered list when it fails (each a fidelity observation). This is the gap-H2 proof that
// the REAL run matched the record, beyond BA28's hash re-derivation.
type Reconciliation struct {
	Run        string  `json:"run"`
	Reconciled bool    `json:"reconciled"`
	Drifts     []Drift `json:"drifts"`
}

// mutatesBoundary reports whether a recorded action SHOULD have produced a boundary effect — i.e.
// it is an action that mutates the outside world (a below-the-line write, or an MCP-backed
// propose/run_mirror that calls out). A read produces no observable effect; an action REFUSED by
// the wall (Autorisee=false) never reached the boundary, so it must NOT expect an effect.
func mutatesBoundary(a agentrun.AgentAction) bool {
	if !a.Autorisee {
		return false
	}
	switch a.Type {
	case agentrun.ActionWrite:
		return true
	default:
		return false
	}
}

// effectKindFor maps a recorded mutating action to the boundary EffectKind it should produce. A
// below-the-line write maps to an fs_write at the boundary. (Propose / run_mirror, when they go
// over MCP, would map to mcp_call — kept open for the future; today only writes mutate the FS.)
func effectKindFor(a agentrun.AgentAction) EffectKind {
	return EffectFSWrite
}

// Reconcile diffs a run's recorded actions against the boundary effect-log for that run, PURELY:
// it pairs each allowed mutating action with a boundary effect of the matching (kind,target), and
// reports a Drift for every unpaired effect (unrecorded_effect) and every unpaired action
// (unrealised_action). DETERMINISTIC and TOTAL — set-matching with stable ordering, no clock, no
// I/O, no LLM. A faithful run (every effect recorded, every recorded write realised) reconciles
// with zero drift. effects may include effects for OTHER runs; only those whose Run == run.ID are
// considered.
func Reconcile(run agentrun.AgentRun, effects []Effect) Reconciliation {
	// Multiset of boundary effects for this run, keyed by (kind,target), with a remaining count.
	type key struct {
		kind   EffectKind
		target string
	}
	remaining := map[key]int{}
	for _, e := range effects {
		if e.Run != run.ID {
			continue
		}
		remaining[key{e.Kind, e.Target}]++
	}

	var drifts []Drift

	// Each allowed mutating action must consume one matching boundary effect; an action with none
	// left is an unrealised_action.
	for _, a := range run.Actions {
		if !mutatesBoundary(a) {
			continue
		}
		k := key{effectKindFor(a), a.Cible}
		if remaining[k] > 0 {
			remaining[k]--
		} else {
			drifts = append(drifts, Drift{Kind: DriftUnrealisedAction, Target: a.Cible})
		}
	}

	// Whatever boundary effects remain were never matched by a recorded action — unrecorded_effect
	// (the betrayal). Emit in a stable order (target, then kind) so the verdict is deterministic.
	leftover := make([]key, 0, len(remaining))
	for k, n := range remaining {
		for i := 0; i < n; i++ {
			leftover = append(leftover, k)
		}
	}
	sort.Slice(leftover, func(i, j int) bool {
		if leftover[i].target != leftover[j].target {
			return leftover[i].target < leftover[j].target
		}
		return leftover[i].kind < leftover[j].kind
	})
	for _, k := range leftover {
		drifts = append(drifts, Drift{Kind: DriftUnrecordedEffect, Target: k.target})
	}

	return Reconciliation{
		Run:        run.ID,
		Reconciled: len(drifts) == 0,
		Drifts:     drifts,
	}
}

// ── The LEDGER query (read-only) ─────────────────────────────────────────────────────────────

// LedgerFilter narrows a ledger query. Empty fields match everything (a total filter). All fields
// are exact string equality — a deterministic predicate, never a fuzzy/LLM match.
type LedgerFilter struct {
	Agent  string          `json:"agent,omitempty"`  // only runs by this CoucheAgent @version
	Goal   string          `json:"goal,omitempty"`   // only runs serving this /goal
	Result agentrun.Result `json:"result,omitempty"` // only runs with this terminal result
}

// matches reports whether a run satisfies the filter (empty field = wildcard). Pure, total.
func (f LedgerFilter) matches(r agentrun.AgentRun) bool {
	if f.Agent != "" && r.Agent != f.Agent {
		return false
	}
	if f.Goal != "" && r.Goal != f.Goal {
		return false
	}
	if f.Result != "" && r.Result != f.Result {
		return false
	}
	return true
}

// RunEntry is one row of the ledger: a run, its replay-integrity verdict (BA28
// ReplayMatches), its boundary reconciliation (gap H2), and its per-code refusal counts.
// AUDITABLE iff the run both re-derives (replay) AND reconciles (effects) — the two proofs
// BA28+BA29 give together (the roadmap: "replay-equality + réconciliation-effets ensemble =
// auditable").
type RunEntry struct {
	Run            agentrun.AgentRun        `json:"run"`
	ReplayMatches  bool                     `json:"replay_matches"`   // BA28: the record re-derives
	Reconciliation Reconciliation           `json:"reconciliation"`   // BA29: the real run matched the record
	Auditable      bool                     `json:"auditable"`        // replay_matches ∧ reconciled
	RefusalsByCode map[blockreason.Code]int `json:"refusals_by_code"` // wall refusals tallied by S13 code
}

// Ledger is the deterministic read-only view a query returns: the matching run entries (in
// stable order) plus the aggregate refusal counts across them. No truth; pure derivation.
type Ledger struct {
	Entries       []RunEntry               `json:"entries"`
	TotalRefusals map[blockreason.Code]int `json:"total_refusals"`
}

// refusalsOf tallies a run's wall refusals (Autorisee=false actions carrying a BlockReason) by
// their S13 code. Pure, total.
func refusalsOf(r agentrun.AgentRun) map[blockreason.Code]int {
	out := map[blockreason.Code]int{}
	for _, a := range r.Actions {
		if !a.Autorisee && a.RaisonBlocage != nil {
			out[a.RaisonBlocage.Code]++
		}
	}
	return out
}

// QueryLedger is the deterministic ledger query (the MCP `agentloop.ledger(filter)` op): it
// filters runs, computes per-run replay + reconciliation + refusal counts, and aggregates the
// refusals. Entries come back in a STABLE order (by StartedAt then run id) so the query is
// reproducible. PURE, TOTAL — no clock, no I/O, no LLM. effects is the boundary effect-log; only
// the effects whose Run matches an entry's id are reconciled against it. Same input ⇒ same Ledger
// (the reproducibility mirror pins it).
func QueryLedger(runs []agentrun.AgentRun, effects []Effect, filter LedgerFilter) Ledger {
	entries := make([]RunEntry, 0, len(runs))
	total := map[blockreason.Code]int{}
	for _, r := range runs {
		if !filter.matches(r) {
			continue
		}
		refusals := refusalsOf(r)
		for code, n := range refusals {
			total[code] += n
		}
		rec := Reconcile(r, effects)
		replay := agentrun.ReplayMatches(r)
		entries = append(entries, RunEntry{
			Run:            r,
			ReplayMatches:  replay,
			Reconciliation: rec,
			Auditable:      replay && rec.Reconciled,
			RefusalsByCode: refusals,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Run.StartedAt != entries[j].Run.StartedAt {
			return entries[i].Run.StartedAt < entries[j].Run.StartedAt
		}
		return entries[i].Run.ID < entries[j].Run.ID
	})
	return Ledger{Entries: entries, TotalRefusals: total}
}
