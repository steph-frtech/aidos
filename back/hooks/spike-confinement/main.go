// Command spike-confinement is the AIDOS PreToolUse spike-confinement hook (S28,
// ADR 0023).
//
// It is the runtime enforcement of the throwaway /spike zone (KRD §84/§60.x): while
// an Idea is `spiking` (ratchet OFF, rigor T0), every file/DB write the agent
// attempts is REFUSED unless its path is under the `/spike` prefix. The spike is
// throwaway and must not leak into /kernel or /src. It ALSO refuses any attempt by
// /harvest to write the kernel or a mirror directly — harvest PROPOSES a DRAFT
// Truth, the human freezes via /goal (KRD §116/§118).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the hook DEFERS to the pure exploration
// predicates (exploration.CheckSpikeWrite, exploration.CheckHarvestWrite) — it does
// not re-implement the confinement rule. The decision is a pure, total function of
// (idea status, path, gesture, target schema); the same input always yields the same
// verdict. The fault-injection test (main_test.go) breaks what it watches (a spiking
// write to /kernel) and asserts the hook goes red.
//
// THE WALL (CLAUDE.md §2): the hook learns the current Idea status from an INJECTED
// event field — it does NOT reach into the kernel/mirrors schemas (the agent has no
// grant; that would be a truth read/write). The status is fed by the harness/the
// idea-intake MCP. An unparseable event fails CLOSED (deny).
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
)

// Event is the decoded PreToolUse write attempt during exploration. The harness
// feeds it on stdin as JSON.
type Event struct {
	// IdeaStatus is the INJECTED lifecycle status of the idea driving the write
	// (e.g. "spiking"). The hook only confines writes while the idea is spiking.
	IdeaStatus string `json:"idea_status"`
	// Gesture is the exploration gesture performing the write: "spike" or "harvest"
	// (empty ⇒ not an exploration write; the wall hook handles the rest).
	Gesture string `json:"gesture"`
	// Path is the write target (for a spike write), e.g. "/spike/retry-probe.go".
	Path string `json:"path"`
	// Schema is the truth schema a harvest write would target (for the harvest gesture).
	Schema string `json:"schema"`
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

// Evaluate is the hook's PURE decision, deferring to the exploration predicates:
//
//   - gesture "harvest" targeting a truth schema ⇒ HARVEST_CANNOT_FREEZE ;
//   - a spiking idea's write outside /spike      ⇒ SPIKE_WRITE_ESCAPES_ZONE ;
//   - anything else                              ⇒ allow (not this hook's concern).
func Evaluate(ev Event) Decision {
	if ev.Gesture == "harvest" {
		if br := exploration.CheckHarvestWrite(ev.Schema); br != nil {
			return Decision{Verdict: VerdictDeny, BlockReason: br}
		}
		return Decision{Verdict: VerdictAllow}
	}
	// Confinement applies only while the idea is spiking (ratchet OFF, T0).
	if ev.IdeaStatus == string(statusSpiking) {
		if br := exploration.CheckSpikeWrite(exploration.SpikeWrite{Path: ev.Path}); br != nil {
			return Decision{Verdict: VerdictDeny, BlockReason: br}
		}
	}
	return Decision{Verdict: VerdictAllow}
}

// statusSpiking mirrors ideas.StatusSpiking without importing the kernel here — the
// hook is below the waterline and reads only the injected string. (The canonical
// value is kept in sync by the exploration BDD/property mirrors.)
const statusSpiking = "spiking"

// Run is the binary entrypoint: read the event on stdin, evaluate it, return the
// exit code (0 = allow, 2 = deny). On deny it writes the BlockReason as JSON to
// stdout. A decode error fails closed (deny) — an unparseable write during a spike
// must not slip out of the zone.
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		br := blockreason.For(blockreason.CodeSpikeWriteEscapesZone)
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
