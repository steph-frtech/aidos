package main

import (
	"context"

	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// CompletenessRun is one immutable record of a Stop completeness evaluation — what
// runtime.completeness_runs (+ child completeness_monster_findings) stores.
// Content-addressed by the cut hash; append-only (ADR 0015).
type CompletenessRun struct {
	RunID        string               `json:"run_id"`
	CutHash      string               `json:"cut_hash"`
	Verdict      completeness.Verdict `json:"verdict"`
	MonsterCount int                  `json:"monster_count"`
	Monsters     []records.Monster    `json:"monsters,omitempty"`
}

// RunLog records completeness runs append-only. A real impl writes
// runtime.completeness_runs (below the waterline — ADR 0014/0015; the agent role has
// INSERT + SELECT only). In-memory impls back the journey + unit mirrors.
type RunLog interface {
	Record(ctx context.Context, run CompletenessRun) error
}

// CutSource loads the current cut — the head projection of mirrors ⋈ kernel the
// completeness law reads (ADR 0015: the cut is the head join, not a Stop-event
// payload). The seam lets the journey feed a fixed cut and the production hook read
// real Postgres. A load error is surfaced so the gate can BLOCK (KRD §82): a cut
// that cannot be loaded is a failure made explicit, never a silent pass.
type CutSource interface {
	Load(ctx context.Context) (completeness.Cut, error)
}

// CheckCompleteness is the hook's orchestration: load the current cut, run the
// completeness gate over it (S06 detector + S12 aggregator), record the run
// append-only, and return the decision. Determinism-first: the verdict is a pure
// function of the cut; only Load and Record perform I/O. A cut that fails to load
// is an INCOMPLETE block (KRD §82), never a silent pass.
func CheckCompleteness(ctx context.Context, src CutSource, log RunLog) completeness.Decision {
	cut, err := src.Load(ctx)
	if err != nil {
		// Anti-passthrough: we cannot compute the law → BLOCK, do not pass.
		d := completeness.GateErrored(cut, err)
		recordRun(ctx, log, d)
		return d
	}

	decision := completeness.Check(cut)
	recordRun(ctx, log, decision)
	return decision
}

// recordRun appends the audit row best-effort. The audit log is part of the
// guardrail, but a record failure must never SILENTLY allow — the verdict already
// holds; the caller surfaces a write error if one is wired.
func recordRun(ctx context.Context, log RunLog, d completeness.Decision) {
	if log == nil {
		return
	}
	_ = log.Record(ctx, CompletenessRun{
		RunID:        "cr-" + d.CutHash[:min(16, len(d.CutHash))],
		CutHash:      d.CutHash,
		Verdict:      d.Verdict,
		MonsterCount: len(d.Monsters),
		Monsters:     d.Monsters,
	})
}
