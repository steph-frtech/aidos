package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// Unit mirror (Go test, N4): the PreToolUse event decode + the Evaluate→exit-code
// wiring. The hook reads a tool-call event on stdin, classifies the write target,
// and emits a verdict. A deny is a non-zero exit with the BlockReason on stdout
// (the harness reads it to surface the actionable refusal).

func TestEvaluateEventDenyOnKernelWrite(t *testing.T) {
	ev := Event{Tool: "Write", Path: "back/kernel/records/store.go", Actor: "agent"}
	d := Evaluate(ev)
	if d.Verdict != VerdictDeny {
		t.Fatalf("kernel write should deny, got %q", d.Verdict)
	}
	if d.BlockReason == nil || d.BlockReason.Code != CodeAgentWriteAboveWaterline {
		t.Fatalf("expected %s, got %+v", CodeAgentWriteAboveWaterline, d.BlockReason)
	}
}

func TestEvaluatePrefersExplicitSchema(t *testing.T) {
	// When the event names a schema target, it wins over the path heuristic.
	ev := Event{Tool: "sql.exec", Schema: "mirrors", Actor: "agent"}
	if Evaluate(ev).Verdict != VerdictDeny {
		t.Fatalf("mirrors schema write should deny")
	}
}

func TestEvaluateAllowsBelowWaterline(t *testing.T) {
	ev := Event{Tool: "Write", Path: "back/gen/order.go", Actor: "agent"}
	if Evaluate(ev).Verdict != VerdictAllow {
		t.Fatalf("back/gen write should allow")
	}
}

func TestDecodeEvent(t *testing.T) {
	raw := `{"tool_name":"Write","path":"back/kernel/x.go","actor":"agent"}`
	ev, err := DecodeEvent(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ev.Tool != "Write" || ev.Path != "back/kernel/x.go" {
		t.Fatalf("decoded wrong event: %+v", ev)
	}
}

func TestDecodeEventToolInputPath(t *testing.T) {
	// Claude Code PreToolUse shape: the path lives under tool_input.file_path.
	raw := `{"tool_name":"Edit","tool_input":{"file_path":"back/kernel/mirror/cart.feature"}}`
	ev, err := DecodeEvent(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ev.Path != "back/kernel/mirror/cart.feature" {
		t.Fatalf("expected path from tool_input.file_path, got %q", ev.Path)
	}
}

// Run is the binary entrypoint: read event on stdin, emit verdict, return exit
// code (0 = allow, non-zero = deny). Deny prints the BlockReason JSON on stdout.
func TestRunDenyExitsNonZeroWithBlockReason(t *testing.T) {
	in := strings.NewReader(`{"tool_name":"Write","tool_input":{"file_path":"back/kernel/x.go"}}`)
	var out bytes.Buffer
	code := Run(in, &out)
	if code == 0 {
		t.Fatalf("deny should exit non-zero, got %d", code)
	}
	var br BlockReason
	if err := json.Unmarshal(out.Bytes(), &br); err != nil {
		t.Fatalf("stdout is not a BlockReason JSON: %v (%q)", err, out.String())
	}
	if br.Code != CodeAgentWriteAboveWaterline {
		t.Fatalf("expected %s, got %s", CodeAgentWriteAboveWaterline, br.Code)
	}
}

func TestRunAllowExitsZero(t *testing.T) {
	in := strings.NewReader(`{"tool_name":"Write","tool_input":{"file_path":"back/gen/order.go"}}`)
	var out bytes.Buffer
	if code := Run(in, &out); code != 0 {
		t.Fatalf("allow should exit 0, got %d (%q)", code, out.String())
	}
}
