// Command sandbox-confinement is the AIDOS PreToolUse sandbox-confinement hook (S42,
// KRD §66.1).
//
// It is the runtime enforcement of the EvolutionSandbox: while an `/evolve` run is
// ACTIVE (the sandbox is open), every file/DB write the agent attempts is REFUSED
// unless its path is under one of the three can_write zones {/branches/evolution,
// /reports, /ideas/proposed}. Any write to /kernel, /mirrors/above, /authority, or
// /fitness (the cannot_write set) — or any path outside the can_write set — is blocked
// with BlockReason SANDBOX_WRITE_ESCAPES_ZONE. "L'évolution explore, elle ne gouverne
// pas." It ALSO refuses any attempt by the loop to write a TRUTH / APPROVAL / EXCEPTION
// / RIGHT directly (the evolution PROPOSES; the human FREEZES via /goal): SANDBOX_
// CANNOT_GOVERN.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the hook DEFERS to the pure evolve.Confine
// classifier — it does not re-implement the confinement rule. The decision is a pure,
// total function of (run active, path, govern attempt); the same input always yields
// the same verdict. The fault-injection test (main_test.go) breaks what it watches (an
// active /evolve run writing /kernel and /fitness) and asserts the hook goes red.
//
// THE WALL (CLAUDE.md §2): the hook learns whether an /evolve run is active from an
// INJECTED event field — it does NOT reach into the kernel/mirrors schemas (the agent
// has no grant). The signal is fed by the harness / the evolve MCP. An unparseable
// event fails CLOSED (deny).
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// Event is the decoded PreToolUse write attempt during an /evolve run. The harness
// feeds it on stdin as JSON.
type Event struct {
	// RunActive is the INJECTED signal that an /evolve run is open (the sandbox is in
	// quarantine). The hook only confines writes while a run is active.
	RunActive bool `json:"run_active"`
	// Path is the write target, e.g. "/branches/evolution/var-7" or "/kernel/x".
	Path string `json:"path"`
	// Govern is set when the loop attempts to write a truth/approval/exception/right
	// DIRECTLY (a freeze, a mirror, an authority approval, a fitness) — never allowed:
	// the evolution proposes, the human freezes via /goal.
	Govern bool `json:"govern"`
}

// DecodeEvent reads one JSON event. A decode error is surfaced; Run fails closed.
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Verdict is the hook decision.
type Verdict string

const (
	VerdictAllow Verdict = "allow"
	VerdictDeny  Verdict = "deny"
)

// Decision is the hook's pure decision: an allow, or a deny carrying the actionable
// BlockReason.
type Decision struct {
	Verdict     Verdict
	BlockReason *blockreason.BlockReason
}

// Evaluate is the hook's PURE decision, deferring to evolve.Confine:
//
//   - a run that attempts to GOVERN (write a truth/approval/right) ⇒ SANDBOX_CANNOT_GOVERN ;
//   - an active run's write outside can_write           ⇒ SANDBOX_WRITE_ESCAPES_ZONE ;
//   - anything else (no active run)                     ⇒ allow (not this hook's concern).
func Evaluate(ev Event) Decision {
	if !ev.RunActive {
		return Decision{Verdict: VerdictAllow}
	}
	if ev.Govern {
		br := blockreason.For(blockreason.CodeSandboxCannotGovern)
		return Decision{Verdict: VerdictDeny, BlockReason: &br}
	}
	res := evolve.Confine(evolve.WriteAttempt{Path: ev.Path})
	if res.Verdict == evolve.VerdictRefused {
		return Decision{Verdict: VerdictDeny, BlockReason: res.BlockReason}
	}
	return Decision{Verdict: VerdictAllow}
}

// Run is the binary entrypoint: read the event on stdin, evaluate it, return the exit
// code (0 = allow, 2 = deny). On deny it writes the BlockReason as JSON to stdout. A
// decode error fails closed (deny) — an unparseable write during an /evolve run must
// not slip out of the quarantine.
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		br := blockreason.For(blockreason.CodeSandboxWriteEscapesZone)
		writeBlock(stdout, &br)
		return exitDeny
	}
	d := Evaluate(ev)
	if d.Verdict == VerdictDeny {
		writeBlock(stdout, d.BlockReason)
		return exitDeny
	}
	return exitAllow
}

const (
	exitAllow = 0
	exitDeny  = 2
)

func writeBlock(w io.Writer, br *blockreason.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

func main() { os.Exit(Run(os.Stdin, os.Stdout)) }
