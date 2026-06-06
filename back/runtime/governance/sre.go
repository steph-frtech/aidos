// sre.go — GV06: the SRE alignment (error-budget / circuit-breaker) and the identity/trust
// BOM-cover, both as PURE deterministic functions over the BA agentrun stream. The Microsoft
// agent-governance-toolkit (AGT) offers SRE controls (SLO / error-budget / circuit-breaker)
// and an identity/trust pillar; AIDOS adopts them as AUGMENTATIONS over the structural wall
// (ADR 0037, GV02), never as a default-allow middleware.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). An error budget IS a count; a circuit-breaker IS a
// threshold on an observed rate; a trust chain IS the GV03 Merkle fold of the recorded runs.
// All three are pure, total functions of their inputs — never an "SRE agent" or an "LLM that
// decides whether to trip". The reproducibility/monotonicity mirror (sre_property_test.go,
// RED-first) pins it.
//
// FAIL-CLOSED. The breaker defaults OPEN under breach and a failure can never improve the
// budget nor silently re-close an open breaker — the same default-deny posture the wall and
// the BA enforcers carry.
package governance

import (
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// BreakerState is the closed circuit-breaker enum: a binary SRE control over the run stream.
type BreakerState string

const (
	// BreakerClosed — traffic flows: the observed error rate is within the SLO target.
	BreakerClosed BreakerState = "closed"
	// BreakerOpen — fail-closed: the error rate breached the SLO target; new work is shed.
	BreakerOpen BreakerState = "open"
)

// SREState is the deterministic verdict of EvaluateSRE over an ordered window of run results.
// Comparable by value (no slices/maps) so the reproducibility mirror can assert equality.
type SREState struct {
	Window          int          `json:"window"`           // number of runs evaluated
	Failures        int          `json:"failures"`         // runs whose Result is not green
	ErrorRate       float64      `json:"error_rate"`       // failures / window (0 for an empty window)
	Target          float64      `json:"target"`           // the SLO error budget target (max tolerated error rate)
	TotalBudget     int          `json:"total_budget"`     // floor(target * window): the absolute failures allowed
	RemainingBudget int          `json:"remaining_budget"` // max(0, total - failures): clamped to [0, total]
	Breaker         BreakerState `json:"breaker"`          // open iff error_rate > target (fail-closed)
}

// isFailure folds the run Result enum into the SRE binary: only a closed-green run counts as a
// success; still_red / blocked / abandoned all burn error budget.
func isFailure(r agentrun.Result) bool { return r != agentrun.ResultGreen }

// EvaluateSRE computes the error-budget + breaker over an ordered window of run results against
// an SLO target (the maximum tolerated error rate, in [0,1]). PURE, TOTAL, DETERMINISTIC: same
// (results, slo) ⇒ same SREState, no clock, no rng, no I/O. An empty window is fully healthy
// (rate 0, breaker closed). The target is clamped to [0,1] so a caller cannot inject a
// nonsensical budget.
func EvaluateSRE(results []agentrun.Result, slo float64) SREState {
	target := slo
	if target < 0 {
		target = 0
	} else if target > 1 {
		target = 1
	}
	window := len(results)
	failures := 0
	for _, r := range results {
		if isFailure(r) {
			failures++
		}
	}
	var rate float64
	if window > 0 {
		rate = float64(failures) / float64(window)
	}
	total := int(target * float64(window)) // floor — the absolute number of failures the budget allows
	remaining := total - failures
	if remaining < 0 {
		remaining = 0
	}
	breaker := BreakerClosed
	if rate > target {
		breaker = BreakerOpen // fail-closed: a breach trips the breaker
	}
	return SREState{
		Window:          window,
		Failures:        failures,
		ErrorRate:       rate,
		Target:          target,
		TotalBudget:     total,
		RemainingBudget: remaining,
		Breaker:         breaker,
	}
}

// ── Identity / trust ──────────────────────────────────────────────────────────────────────
//
// The AGT's identity/trust pillar asks "WHO decided, under WHICH identity, and is it bound to
// a tamper-evident record?". AIDOS already answers this: every AgentRun carries the agent
// @version and the AgentImplementation hash (BA26), and GV03 folds the Decision-BOMs into a
// Merkle ledger. The TrustChain is the projection that BINDS each run's identity to its
// position in that tamper-evident root — so an identity claim cannot float free of the audit.

// TrustRow binds one run's identity (the agent + impl that decided) to its Merkle entry root.
type TrustRow struct {
	Index     int    `json:"index"`      // 0-based ledger position
	Run       string `json:"run"`        // the run content-address
	Agent     string `json:"agent"`      // the CoucheAgent @version that decided
	Impl      string `json:"impl"`       // the AgentImplementation hash (BA26)
	EntryRoot string `json:"entry_root"` // the GV03 ledger Root AFTER this entry — identity bound to audit
}

// TrustChain is the full identity cover: one row per run, plus the tip Merkle root binding the
// whole ordered prefix. Reproducible: same runs ⇒ same Root.
type TrustChain struct {
	Rows []TrustRow `json:"rows"`
	Root string     `json:"root"` // the GV03 tamper-evident tip root over all runs (GenesisRoot if empty)
}

// BuildTrustChain projects every recorded run onto a TrustRow bound to the GV03 Merkle ledger.
// REUSES agentrun.Append/Root (single-sourced with GV03 — no parallel hash) so identity is
// bound to the SAME tamper-evident root the audit verifies. PURE, TOTAL, DETERMINISTIC: same
// runs ⇒ same chain. Returns an error only if the ledger fold does (it does not, for well-formed
// runs) — surfaced rather than swallowed.
func BuildTrustChain(runs []agentrun.AgentRun) (TrustChain, error) {
	var ledger []agentrun.LedgerEntry
	rows := make([]TrustRow, 0, len(runs))
	for i, r := range runs {
		grown, err := agentrun.Append(ledger, r)
		if err != nil {
			return TrustChain{}, err
		}
		ledger = grown
		rows = append(rows, TrustRow{
			Index:     i,
			Run:       r.ID,
			Agent:     r.Agent,
			Impl:      r.Impl,
			EntryRoot: agentrun.Root(ledger),
		})
	}
	return TrustChain{Rows: rows, Root: agentrun.Root(ledger)}, nil
}

// SREDefaultSLO is the demo SLO target the Workbench audit panel renders against: a 25% error
// budget (≤ 1 failure in 4 runs tolerated). Declared, not learned (§8).
const SREDefaultSLO = 0.25
