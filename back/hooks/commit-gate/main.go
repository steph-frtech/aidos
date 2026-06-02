// Command commit-gate is the AIDOS commit-gate hook (CLAUDE.md §5 non-bypassable rule, KRD §44,
// §98): it is the gate on the temporal axis of the Archive. It REFUSES the DRAFT → APPLIED
// transition of a ChangeSet unless the COMPLETENESS LAW is satisfied (every spec_delta layer has
// its living mirror — no orphan, no monster), and it REFUSES any in-place UPDATE/DELETE of an
// APPLIED or REVERTED envelope (an applied envelope is IMMUTABLE; the only legal write to its
// lineage is APPENDING an inverse ChangeSet).
//
// It is invoked with a JSON request on stdin:
//
//	{"op":"apply",  "changeset":{...}}        — gate a DRAFT→APPLIED commit (runs the completeness gate)
//	{"op":"mutate", "changeset":{...}}        — gate an in-place edit/update/delete of an envelope
//
// It returns exit 0 (allow) or exit 2 (block); on block it writes the actionable BlockReason JSON
// (KRD §44.5: code, severity, explanation, how_to_fix[]) to stdout so the harness surfaces the
// refusal. A decode error FAILS CLOSED (block) — an unparseable request must never slip a commit
// past the completeness law.
//
// DETERMINISM-FIRST (CLAUDE.md §6): the gate is a pure decision over the request — it reuses the
// pure changeset.Apply / changeset.Edit functions (the same logic the state machine runs), never a
// reimplementation. The fault-injection test (§5 hook honesty) drops the mirror_delta from a
// complete envelope (manufactures an orphan) and asserts the gate goes red.
package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"time"

	cs "github.com/steph-frtech/aidos/back/archive/changeset"
)

const (
	exitAllow = 0
	exitBlock = 2
)

// Request is the commit-gate input: an op and the envelope it concerns.
type Request struct {
	Op        string       `json:"op"` // "apply" | "mutate"
	ChangeSet cs.ChangeSet `json:"changeset"`
}

// CodeUnknownOp is returned when the request op is neither apply nor mutate (fail-closed).
const CodeUnknownOp cs.BlockCode = "UNKNOWN_GATE_OP"

// CodeBadRequest is returned when the request cannot be decoded (fail-closed).
const CodeBadRequest cs.BlockCode = "BAD_GATE_REQUEST"

// Decide runs the gate over a decoded request and returns nil (allow) or a *BlockReason (block).
// PURE: it reuses changeset.Apply (completeness gate) and changeset.Edit (immutability), so the gate
// can never diverge from the state machine. The applied_at handed to Apply is irrelevant to the
// verdict (the gate only inspects whether Apply is admitted), so a zero time is used.
func Decide(req Request) *cs.BlockReason {
	switch req.Op {
	case "apply":
		// admit DRAFT→APPLIED only if the completeness law holds (SpecHasMirror — no orphan).
		_, br := cs.Apply(req.ChangeSet, time.Time{}, cs.SpecHasMirror)
		return br
	case "mutate":
		// refuse any in-place edit/update/delete of an APPLIED/REVERTED envelope (immutable).
		return cs.Edit(req.ChangeSet)
	default:
		return &cs.BlockReason{
			Code:        CodeUnknownOp,
			Severity:    "error",
			Explanation: "op de commit-gate inconnu — attendu \"apply\" ou \"mutate\".",
			HowToFix:    []string{"send_op_apply_or_op_mutate"},
		}
	}
}

// Run is the binary entrypoint: decode the request on stdin, decide, and return the exit code. A
// decode error FAILS CLOSED (block) — an unparseable request is a failure made explicit, never a
// silent pass past the completeness law.
func Run(stdin io.Reader, stdout io.Writer) int {
	var req Request
	if err := json.NewDecoder(stdin).Decode(&req); err != nil {
		writeBlock(stdout, &cs.BlockReason{
			Code:        CodeBadRequest,
			Severity:    "error",
			Explanation: "requête commit-gate illisible — le gate échoue fermé (fail-closed) : un commit non vérifiable ne passe pas.",
			HowToFix:    []string{"send_valid_json_with_op_and_changeset"},
		})
		return exitBlock
	}
	if br := Decide(req); br != nil {
		writeBlock(stdout, br)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br *cs.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

func main() {
	_ = context.Background()
	os.Exit(Run(os.Stdin, os.Stdout))
}
