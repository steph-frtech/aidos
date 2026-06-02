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
