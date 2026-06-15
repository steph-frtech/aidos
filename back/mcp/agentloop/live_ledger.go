// live_ledger.go — ADR 0078: the Merkle ledger fed by the REAL Drive runs (the living
// ledger), not by the ledgerRuns() fixture. GV03 (back/runtime/agentrun/ledger.go) already
// implements a tamper-evident Merkle ledger over AgentRun bodies — a pure, total fold with no
// clock and no rng (Append / Root / Verify). The audit w91305w3q found the gap: nothing
// APPENDS a really-executed Drive run to it. This file closes that gap WITHOUT crossing the
// wall and WITHOUT forking the Merkle math:
//
//   - AppendRunToLedger is the single APPEND PATH — each AgentRun the loop really executed
//     (the record returned by agentloop.Drive / DriveWithEconomics) is chained into the
//     append-only ledger by delegating to agentrun.Append (REUSE, never reinvent — §3/§6).
//   - LiveLedger folds a pre-built list of REAL runs into a verified ledger (the ADR's scoped
//     fallback: "ledger accepts a pre-built run list + Append + Verify"). It is the live
//     counterpart of the ledgerRuns() fixture: the fixture is REQUALIFIED as a reproducibility
//     gold (a mirror), the live ledger chains the runs that really happened.
//   - VerifyLiveLedger re-runs agentrun.Verify — the deterministic JUDGE: intact ⇒ OK, any
//     tamper (alter / delete / reorder a row) ⇒ a red verdict. No agent decides; the chain does.
//
// THE WALL (CLAUDE.md §2). This is BELOW the line: an AgentRun is telemetry, the ledger is
// runtime audit telemetry — no truth is written, no kernel/mirrors/fitness touched. Appending a
// real run to the Merkle chain is an OBSERVATION, never a truth-write.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Append / Verify are the pure GV03 hash fold — same
// runs ⇒ same Merkle root (the reproducibility mirror pins it), any tamper ⇒ Verify red (the
// tamper mirror pins it). No LLM, no clock, no rng. ANTI-OVERWRITE (§9): the ledger is
// append-only — AppendRunToLedger copies-on-grow (agentrun.Append never mutates a prior row).
package main

import (
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// AppendRunToLedger appends ONE really-executed AgentRun to the append-only Merkle ledger and
// returns the grown ledger. It is the APPEND PATH ADR 0078 asks for: each real Drive run record
// is chained into the ledger here. It delegates to agentrun.Append — the GV03 fold (REUSE, not
// a fork) — so the live ledger and the gold fixture share ONE Merkle implementation. PURE,
// TOTAL, APPEND-ONLY: never mutates a prior entry, no clock, no rng; same (ledger, run) ⇒ same
// grown ledger.
func AppendRunToLedger(ledger []agentrun.LedgerEntry, run agentrun.AgentRun) ([]agentrun.LedgerEntry, error) {
	return agentrun.Append(ledger, run)
}

// LiveLedger folds a list of REAL runs (the ones the loop really executed, in execution order)
// into a verified Merkle ledger by appending each through AppendRunToLedger. This is the ADR's
// scoped cut — "ledger accepts a pre-built run list + Append + Verify" — and the live source the
// ledgerRuns() fixture used to stand in for: pass the runs that really happened. PURE, TOTAL,
// DETERMINISTIC: same ordered runs ⇒ same ledger (hence same Root). The ledger is append-only
// (each run chains from the prior tip root).
func LiveLedger(runs []agentrun.AgentRun) ([]agentrun.LedgerEntry, error) {
	var ledger []agentrun.LedgerEntry
	for _, r := range runs {
		grown, err := AppendRunToLedger(ledger, r)
		if err != nil {
			return nil, err
		}
		ledger = grown
	}
	return ledger, nil
}

// LiveLedgerRoot is the tip Merkle root of a list of real runs — the content-address of the
// WHOLE ordered ledger. The reproducibility property pins same runs ⇒ same root. PURE, TOTAL.
func LiveLedgerRoot(runs []agentrun.AgentRun) (string, error) {
	ledger, err := LiveLedger(runs)
	if err != nil {
		return "", err
	}
	return agentrun.Root(ledger), nil
}

// VerifyLiveLedger recomputes the Merkle chain over the live ledger and reports whether it is
// intact — the deterministic JUDGE (§8). An untampered ledger ⇒ OK=true; ANY alteration,
// deletion, reordering or insertion of a row ⇒ OK=false at the first broken row (the tamper
// mirror pins it). It is the GV03 agentrun.Verify, re-exposed on the live plane (no second
// implementation). PURE, TOTAL — same ledger ⇒ same verdict.
func VerifyLiveLedger(ledger []agentrun.LedgerEntry) agentrun.VerifyResult {
	return agentrun.Verify(ledger)
}
