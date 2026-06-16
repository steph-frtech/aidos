// Package gate is the PURE CORE of the AIDOS promotion-gate (S27) — the single
// authoritative predicate "no mirror, no kernel" (KRD §116/§118/§119.1), extracted so
// BOTH consumers defer to the SAME decision (determinism-first, CLAUDE.md §6/§8):
//
//   - the promotion-gate BINARY (hooks/promotion-gate, the PreToolUse hook the harness
//     runs on stdin → exit 0/2);
//   - the GATEWAY DISPATCHER (back/runtime/gatewaydispatch), which calls Evaluate
//     in-process, ABOVE the wall, BEFORE a /goal-flow kernel write is persisted.
//
// The gate DEFERS to ideas.Promote — it does NOT re-implement the predicate. The decision
// is a PURE, TOTAL function of (idea status, mirror ref): the same input always yields the
// same verdict, no clock, no rng, no I/O, never panics. This mirrors the memory-firewall
// precedent (back/archive/brain/firewall.CheckKernelWrite): one pure decider, two callers
// (the hook binary and the in-process server seam), never a forked decision and never an
// LLM. The wiring is plumbing; the algorithm wins.
//
// The gate uses an INJECTED has-mirror signal (the mirror_ref carried by the /goal flow) —
// it does NOT reach into the mirrors schema to author or look up a mirror (that would be a
// truth read/write the agent has no grant for; the wall holds, CLAUDE.md §2). Absent
// mirror_ref ⇒ blocked with NO_MIRROR_NO_KERNEL.
package gate

import (
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Event is the decoded promotion attempt. The harness feeds it on stdin as JSON; the
// gateway dispatcher constructs it from the /goal-flow call's injected args. A promotion
// targets the kernel schema; the gate inspects whether the triggering idea is harvested
// and carries a mirror reference.
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

// Verdict is the gate decision.
type Verdict string

const (
	VerdictAllow Verdict = "allow"
	VerdictDeny  Verdict = "deny"
)

// Decision is the gate's pure decision: an allow, or a deny carrying the actionable
// BlockReason (CLAUDE.md §2: code, severity, explanation, how_to_fix[]).
type Decision struct {
	Verdict     Verdict
	BlockReason *blockreason.BlockReason
}

// Evaluate is the gate's PURE decision, deferring to ideas.Promote — the single
// authoritative predicate. A non-kernel target is not the gate's concern (allow; the wall
// hook handles the rest). For a kernel target it reconstructs the idea's status and asks
// Promote: a mirror-less or non-harvested promotion is refused with NO_MIRROR_NO_KERNEL; a
// harvested idea with a mirror is allowed through to the /goal flow (the aidos CLI role
// writes the kernel, not the agent). Same Event ⇒ same Decision; never panics.
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
