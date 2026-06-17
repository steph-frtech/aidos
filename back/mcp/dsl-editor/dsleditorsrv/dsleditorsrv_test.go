package dsleditorsrv

import (
	"context"
	"testing"
)

// The dsl-editor MCP server is PURE computation (the wall): these tests prove each S77 tool returns
// deterministically without any I/O — the editable kinds, a typed parse verdict, and a propose that
// opens a DRAFT ChangeSet (never applied). No apply tool exists (the wall). Moved from
// mcp/dsl-editor/main_test.go at ADR 0092 batch-3; Body/Canonical are now OBJECT (map[string]any)
// to be dispatch-safe over HTTP (the S59 byte-array scar guard).

func policyDoc() docInput {
	return docInput{
		Kind: "policy", Name: "canPlaceOrder", ParentPhase: "phase-0",
		Body: map[string]any{
			"kind": "policy", "name": "canPlaceOrder", "scope": "OPERATION", "target": "createOrder",
			"effect": "ALLOW", "rule": map[string]any{"kind": "exists", "sel": "$.auth"},
		},
	}
}

func TestKindsAreCanonical(t *testing.T) {
	_, out, err := kindsTool(context.Background(), nil, kindsInput{})
	if err != nil {
		t.Fatalf("kinds: %v", err)
	}
	want := []string{"operation", "policy", "control", "action"}
	if len(out.Kinds) != len(want) {
		t.Fatalf("kinds size %d, want %d", len(out.Kinds), len(want))
	}
	for i := range want {
		if out.Kinds[i] != want[i] {
			t.Fatalf("kinds[%d] = %q, want %q", i, out.Kinds[i], want[i])
		}
	}
}

func TestParseOKAndRejected(t *testing.T) {
	_, ok, _ := parseTool(context.Background(), nil, policyDoc())
	if !ok.OK || len(ok.Canonical) == 0 {
		t.Fatalf("a well-formed policy must parse + canonicalise (object), got %+v", ok)
	}
	// A free-code escape is refused.
	bad := policyDoc()
	bad.Body = map[string]any{"kind": "policy", "code": "rm -rf /"}
	_, no, _ := parseTool(context.Background(), nil, bad)
	if no.OK || no.Error == "" {
		t.Fatal("a free-code body must be refused with an actionable error")
	}
}

func TestProposeOpensDraftNeverApplied(t *testing.T) {
	_, out, err := proposeTool(context.Background(), nil, policyDoc())
	if err != nil {
		t.Fatalf("propose: %v", err)
	}
	if !out.OK || out.WroteKernel {
		t.Fatalf("propose must succeed and write no kernel, got %+v", out)
	}
	if out.ChangeSetStatus != "DRAFT" || out.ChangeSetRef == "" {
		t.Fatalf("propose must open a content-addressed DRAFT, got %+v", out)
	}
}

func TestProposeDeterministic(t *testing.T) {
	_, a, _ := proposeTool(context.Background(), nil, policyDoc())
	_, b, _ := proposeTool(context.Background(), nil, policyDoc())
	if a.ChangeSetRef != b.ChangeSetRef {
		t.Fatalf("propose not deterministic: %s vs %s", a.ChangeSetRef, b.ChangeSetRef)
	}
}
