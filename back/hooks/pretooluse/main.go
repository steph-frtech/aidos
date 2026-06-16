package main

import (
	"encoding/json"
	"io"
	"os"
)

// Event is the decoded PreToolUse tool-call the hook evaluates. The harness feeds
// it on stdin as JSON. We accept both the flat shape (path/schema at top level)
// and the Claude Code shape (tool_name + tool_input.file_path), so the same hook
// serves the build harness and a raw probe. Determinism-first: decode is pure.
type Event struct {
	// Tool is the tool that would run (Write / Edit / sql.exec / an MCP write…).
	Tool string `json:"tool_name"`
	// Path is the on-disk write target, when the tool writes a file.
	Path string `json:"path"`
	// Schema is the truth schema target, when the tool writes Postgres directly.
	Schema string `json:"schema"`
	// Actor is the role attempting the write (the agent, by construction here).
	Actor string `json:"actor"`
	// IdeaStatus is the INJECTED lifecycle status of the idea driving this write (e.g.
	// "spiking"). The harness / the idea-intake MCP sets it when an idea is being probed;
	// it is empty for an ordinary write. The spike-confinement gate confines writes only
	// while it is "spiking" (KRD §84). The agent never reads this from the kernel — it is
	// fed on the event (the wall, §2: no truth read).
	IdeaStatus string `json:"idea_status"`
	// Gesture is the exploration gesture performing the write — "spike" or "harvest" — when
	// the call rides one (empty ⇒ an ordinary write; the bare zone wall handles it). A
	// "harvest" gesture is gated for a direct kernel/mirror freeze (KRD §116/§118).
	Gesture string `json:"gesture"`
	// SpikePath is the RAW (un-normalised) write target the spike-confinement gate inspects.
	// The spike zone "/spike" is an ABSOLUTE top-level disk prefix (KRD §84) — NOT a
	// repo-relative path — so the shim must NOT strip its leading slash (the zone-wall
	// normalisation that makes `back/kernel/` repo-relative would corrupt it). When set, the
	// spike gate reads this; when empty it falls back to the normalised Path.
	SpikePath string `json:"spike_path"`
	// ToolInput is the Claude Code nested payload; file_path lives under it.
	ToolInput struct {
		FilePath string `json:"file_path"`
		Schema   string `json:"schema"`
	} `json:"tool_input"`
}

// target returns the write target the classifier should inspect: an explicit
// schema wins over a path (a direct truth write is unambiguous), then the flat
// path, then the Claude Code nested file_path.
func (e Event) target() string {
	if e.Schema != "" {
		return e.Schema
	}
	if e.ToolInput.Schema != "" {
		return e.ToolInput.Schema
	}
	if e.Path != "" {
		return e.Path
	}
	return e.ToolInput.FilePath
}

// DecodeEvent reads one JSON PreToolUse event. A decode error fails closed at the
// caller (Run treats an undecodable event conservatively).
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	dec := json.NewDecoder(r)
	if err := dec.Decode(&ev); err != nil {
		return Event{}, err
	}
	// Normalize the Claude Code nested shape onto the flat fields, so callers can
	// read ev.Path / ev.Schema regardless of which shape the harness sent.
	if ev.Path == "" && ev.ToolInput.FilePath != "" {
		ev.Path = ev.ToolInput.FilePath
	}
	if ev.Schema == "" && ev.ToolInput.Schema != "" {
		ev.Schema = ev.ToolInput.Schema
	}
	return ev, nil
}

// Evaluate is the hook's pure decision over a decoded event.
func Evaluate(ev Event) Decision {
	return Classify(ev.target())
}

// Run is the binary entrypoint: read the event on stdin, classify it, and return
// the process exit code (0 = allow, 2 = deny). On deny it writes the BlockReason
// as JSON to stdout so the harness can surface the actionable refusal. A decode
// error fails closed (deny) — an unparseable event must not slip past the wall.
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		writeBlock(stdout, &BlockReason{
			Code:        CodeAgentWriteAboveWaterline,
			Severity:    "error",
			Explanation: "Événement PreToolUse illisible — le mur échoue fermé (fail-closed) : aucune écriture non vérifiable ne passe.",
			HowToFix: []string{
				"Vérifiez la forme de l'événement PreToolUse (JSON : tool_name + tool_input.file_path, ou path/schema).",
			},
		})
		return exitDeny
	}

	// SPIKE-CONFINEMENT GATE FIRST (wired here, S28/ADR 0023). When the harness injected a
	// spiking idea status or an exploration gesture, the gate fires and decides with the
	// gesture-specific actionable BlockReason (SPIKE_WRITE_ESCAPES_ZONE / HARVEST_CANNOT_FREEZE)
	// — deferring to the pure exploration predicates (determinism-first). It is strictly
	// ADDITIVE: when the event carries no spike context the gate declines (ok=false) and the
	// bare zone wall decides exactly as before (anti-overwrite §9).
	if sd, ok := EvaluateSpike(ev); ok {
		if sd.Verdict == VerdictDeny {
			writeBlock(stdout, sd.BlockReason)
			return exitDeny
		}
		return exitAllow
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

func writeBlock(w io.Writer, br *BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

func main() {
	os.Exit(Run(os.Stdin, os.Stdout))
}
