// Command promotion-gate is the AIDOS PreToolUse promotion-gate hook (S27).
//
// It is the runtime enforcement of the only door into the kernel (KRD §116/§118/
// §119.1): promoting an idea = writing its mirror = the /goal = the freeze. A write
// into the kernel schema whose provenance is an idea LACKING a mirror is REFUSED
// with the actionable NO_MIRROR_NO_KERNEL BlockReason. "Aucun MemoryItem ne peut
// entrer dans /kernel sans passer par Idea → Mirror → Goal → Kernel" — the same
// one-way door (§119.1).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the gate DEFERS to the pure function
// ideas.Promote — it does not re-implement the predicate. The decision is a pure,
// total function of (idea status, mirror ref); the same input always yields the
// same verdict. The fault-injection test (main_test.go) breaks what it watches
// (a mirror-less promotion) and asserts the gate goes red.
//
// The gate uses an INJECTED has-mirror signal (the `mirror_ref` on the event) — it
// does NOT reach into the mirrors schema to author or look up a mirror (that would
// be a truth-write the agent has no grant for; the wall holds, CLAUDE.md §2). It
// reads whether a mirror reference was supplied by the /goal flow; absent ⇒ blocked.
//
// The PURE decision lives in the importable sibling package gate (the cœur pur), so
// BOTH this binary and the S59 gateway dispatcher defer to the SAME Evaluate — one
// decision, never a forked predicate (the memory-firewall precedent: one pure decider,
// two callers). This file is the thin stdin → exit-code wrapper.
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/hooks/promotion-gate/gate"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Event / Verdict / Decision / Evaluate re-export the pure core (package gate) so the
// binary's wrapper + its fault-injection tests are unchanged while the gateway
// dispatcher imports the SAME decider in-process.
type (
	Event    = gate.Event
	Verdict  = gate.Verdict
	Decision = gate.Decision
)

const (
	VerdictAllow = gate.VerdictAllow
	VerdictDeny  = gate.VerdictDeny
)

// Evaluate defers to the pure core (gate.Evaluate) — the single authoritative
// predicate. It does not re-implement the decision.
func Evaluate(ev Event) Decision { return gate.Evaluate(ev) }

// DecodeEvent reads one JSON promotion event. A decode error fails closed.
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Run is the binary entrypoint: read the event on stdin, evaluate it, return the
// exit code (0 = allow, 2 = deny). On deny it writes the BlockReason as JSON to
// stdout. A decode error fails closed (deny) — an unparseable promotion must not
// slip a mirror-less idea into the kernel.
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		br := blockreason.For(blockreason.CodeNoMirrorNoKernel)
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
