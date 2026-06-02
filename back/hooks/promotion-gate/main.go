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
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Event is the decoded PreToolUse promotion attempt. The harness feeds it on stdin
// as JSON. A promotion targets the kernel schema; the gate inspects whether the
// triggering idea is harvested and carries a mirror reference.
type Event struct {
	// Tool is the tool that would run (the kernel write op via the /goal flow).
	Tool string `json:"tool_name"`
	// Schema is the truth schema target; the gate only fires on "kernel".
	Schema string `json:"schema"`
	// IdeaStatus is the lifecycle status of the idea driving the promotion.
	IdeaStatus string `json:"idea_status"`
	// IdeaID is the content-addressed id of the idea (the back-link provenance).
	IdeaID string `json:"idea_id"`
	// MirrorRef is the INJECTED has-mirror signal: the handle to the idea's mirror
	// supplied by the /goal flow. Empty ⇒ no mirror ⇒ the gate blocks.
	MirrorRef string `json:"mirror_ref"`
}

// DecodeEvent reads one JSON promotion event. A decode error fails closed.
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Verdict is the gate decision.
type Verdict string

const (
	VerdictAllow Verdict = "allow"
	VerdictDeny  Verdict = "deny"
)

// Decision is the gate's pure decision: an allow, or a deny carrying the
// actionable BlockReason.
type Decision struct {
	Verdict     Verdict
	BlockReason *blockreason.BlockReason
}

// Evaluate is the gate's PURE decision, deferring to ideas.Promote — the single
// authoritative predicate. A non-kernel target is not the gate's concern (allow;
// the wall hook handles the rest). For a kernel target it reconstructs the idea's
// status and asks Promote: a mirror-less or non-harvested promotion is refused with
// NO_MIRROR_NO_KERNEL; a harvested idea with a mirror is allowed through to the
// /goal flow (the aidos CLI role writes the kernel, not the agent).
func Evaluate(ev Event) Decision {
	if ev.Schema != "kernel" {
		return Decision{Verdict: VerdictAllow}
	}
	idea := ideas.Idea{ID: ev.IdeaID, Status: ideas.Status(ev.IdeaStatus)}
	if _, br := ideas.Promote(idea, ev.MirrorRef); br != nil {
		return Decision{Verdict: VerdictDeny, BlockReason: br}
	}
	return Decision{Verdict: VerdictAllow}
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
