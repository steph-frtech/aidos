// Command memory-firewall is the AIDOS PreToolUse MemoryFirewall hook (S30) — the runtime
// enforcement of KRD §119.1: "aucun MemoryItem ne peut entrer dans /kernel sans passer par
// Idea → Mirror → Goal → Kernel."
//
// It REFUSES any write into the kernel schema whose provenance is a raw MemoryItem (the direct
// Memory → Kernel edge), returning the actionable MEMORY_CANNOT_DECLARE_TRUTH BlockReason. A
// write whose provenance is a properly-mirrored idea (the S27 legal path) is allowed through
// this gate — "Memory proposes; the kernel declares the true."
//
// COMPOSES ADDITIVELY (CLAUDE.md §5 meta-loop): this is a SEPARATE hook binary that ADDS one
// guardrail and removes none. It composes with — does not replace — the S04 waterline wall
// (which blocks any agent write above the line) and the S27 promotion-gate (which blocks
// idea → kernel without a mirror). S30 owns exactly the memory → kernel shortcut.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the hook DEFERS to the pure decider
// firewall.CheckKernelWrite — it never re-implements the rule. The verdict is a pure, total
// function of the injected provenance kind; same input ⇒ same verdict. The fault-injection
// test (main_test.go) forges a memory-provenance kernel write and asserts the gate BLOCKS it,
// and flips the provenance to a mirrored idea and asserts it stays GREEN.
//
// THE WALL (CLAUDE.md §2): the hook reads the provenance kind from an INJECTED event field —
// it does NOT reach into the kernel/mirrors schemas (the agent has no grant; that would itself
// be a truth read). The provenance is established by the harness. An unparseable event — or an
// unknown provenance — fails CLOSED (block): an unverifiable kernel write does not pass (KRD
// §82 anti-passthrough).
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

const (
	exitAllow = 0 // allow the kernel write (this gate passes; the wall + S27 still apply)
	exitBlock = 2 // block the write (a memory tried to declare truth)
)

// Event is the decoded PreToolUse kernel-write attempt the harness feeds on stdin. It carries
// the INJECTED provenance kind of the write — never a kernel read.
type Event struct {
	// TargetSchema is the schema the write targets. The firewall only guards kernel writes;
	// a write that does not target the kernel is not this hook's concern (allowed here — the
	// S04 wall / other gates handle the rest).
	TargetSchema string `json:"target_schema"`
	// Provenance is the INJECTED provenance kind of the write: "memory" (the forbidden
	// shortcut), "mirrored_idea" (the S27 legal path), or "" (unknown ⇒ fail closed).
	Provenance string `json:"provenance"`
}

// DecodeEvent reads one JSON event. A decode error is surfaced; Run fails closed (block).
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Decision is the hook's verdict: allow the write, or block it with the actionable
// MEMORY_CANNOT_DECLARE_TRUTH BlockReason.
type Decision struct {
	Block       bool
	BlockReason *blockreason.BlockReason
}

// Evaluate is the hook's PURE decision. A write that does not target the kernel is allowed
// here (this gate guards only the kernel edge). For a kernel write it DEFERS to
// firewall.CheckKernelWrite over the injected provenance kind: a raw MemoryItem (or an unknown
// provenance) is blocked with MEMORY_CANNOT_DECLARE_TRUTH; a mirrored idea passes.
func Evaluate(ev Event) Decision {
	if ev.TargetSchema != "kernel" {
		return Decision{Block: false}
	}
	if br := firewall.CheckKernelWrite(firewall.ProvenanceKind(ev.Provenance)); br != nil {
		return Decision{Block: true, BlockReason: br}
	}
	return Decision{Block: false}
}

// Run is the binary entrypoint: read the event on stdin, evaluate it, return the exit code
// (0 = allow, 2 = block). On block it writes the BlockReason as JSON to stdout. A decode error
// fails CLOSED (block) — an unverifiable write does not pass (KRD §82).
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		br := blockreason.For(blockreason.CodeMemoryCannotDeclareTruth)
		writeBlock(stdout, &br)
		return exitBlock
	}
	d := Evaluate(ev)
	if d.Block {
		writeBlock(stdout, d.BlockReason)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br *blockreason.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

func main() { os.Exit(Run(os.Stdin, os.Stdout)) }
