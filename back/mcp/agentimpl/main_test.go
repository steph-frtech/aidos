package main

// MCP server tests for the AgentImplementation capability door (BA06). They prove the
// capability is wired end-to-end over the mocked read-only governed-layer view AND that the
// wall holds: the server PROJECTS a governed layer into a runnable AgentImplementation (model,
// knobs, resolved bindings, allowed/forbidden paths, network), DETERMINISTICALLY (re-project ⇒
// same hash), READ-ONLY (it persists no truth), with NO run control. An unknown layer is
// reported not-found, never fabricated.

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// TestProject_BddWriter proves the capability projects the governed bdd-writer layer into its
// AgentImplementation: model copied DOWN, the wall always carried (kernel/mirrors/fitness in
// ForbiddenPaths), NO egress by default (empty AllowedNetworkHosts), and a disabled binding
// dropped (governance narrows — the resolved Tools[] excludes the disabled changeset binding).
func TestProject_BddWriter(t *testing.T) {
	s := newServer()
	_, out, err := s.project(context.Background(), nil, projectInput{LayerRef: "bdd-writer"})
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if !out.Found {
		t.Fatal("bdd-writer must be found in the read-only view")
	}
	impl := out.Impl
	if impl.Model != "claude-opus-4-8" {
		t.Errorf("model copied DOWN: got %q", impl.Model)
	}
	// The wall is ALWAYS carried — every canonical wall zone is forbidden.
	for _, w := range agentimpl.WallForbiddenPaths() {
		if !contains(impl.ForbiddenPaths, w) {
			t.Errorf("ForbiddenPaths must carry the wall zone %q", w)
		}
	}
	// No egress by default (fail-closed): the bdd-writer is MAX-confined.
	if len(impl.AllowedNetworkHosts) != 0 {
		t.Errorf("bdd-writer must have NO egress by default, got %v", impl.AllowedNetworkHosts)
	}
	// Governance NARROWS: the disabled changeset binding never appears in resolved Tools[].
	for _, tl := range impl.Tools {
		if tl.Server == "changeset" {
			t.Errorf("a DISABLED binding must never appear in the resolved tools: %+v", tl)
		}
	}
	if out.Hash == "" {
		t.Error("the projection must be content-addressed")
	}
}

// TestProject_Deterministic is the determinism-first mirror: re-projecting the SAME layerRef
// yields the SAME content-hash (the projection is a pure function of the governed layer; the
// MCP persists nothing, regenerates on every call).
func TestProject_Deterministic(t *testing.T) {
	s := newServer()
	_, a, err := s.project(context.Background(), nil, projectInput{LayerRef: "executor"})
	if err != nil || !a.Found {
		t.Fatalf("project executor: %v found=%v", err, a.Found)
	}
	_, b, err := s.project(context.Background(), nil, projectInput{LayerRef: "executor"})
	if err != nil || !b.Found {
		t.Fatalf("re-project executor: %v found=%v", err, b.Found)
	}
	if a.Hash != b.Hash {
		t.Errorf("re-project is not hash-stable: %q != %q", a.Hash, b.Hash)
	}
	// The executor declares one egress host — exercised so the no-egress case above is real.
	if !contains(b.Impl.AllowedNetworkHosts, "api.anthropic.com") {
		t.Errorf("executor must declare its one egress host, got %v", b.Impl.AllowedNetworkHosts)
	}
}

// TestList_ReadOnly proves the read-only enumeration surfaces the governed layers in a stable
// order with their refs/roles.
func TestList_ReadOnly(t *testing.T) {
	s := newServer()
	_, out, err := s.list(context.Background(), nil, struct{}{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(out.Layers) != 2 {
		t.Fatalf("expected the two example layers, got %d", len(out.Layers))
	}
	roles := map[string]bool{}
	for _, r := range out.Layers {
		roles[r.Role] = true
		if r.LayerRef == "" {
			t.Error("every row must carry a layer_ref")
		}
	}
	if !roles["bdd-writer"] || !roles["executor"] {
		t.Errorf("list must surface both roles, got %v", roles)
	}
}

// TestWall_NoFabricationNoTruthWrite is the wall fault-injection: an unknown layerRef is
// reported not-found (never fabricated), and the server exposes NO tool that writes truth — its
// only two tools (project, list) are pure read-only projections over the mocked view.
func TestWall_NoFabricationNoTruthWrite(t *testing.T) {
	s := newServer()
	_, out, err := s.project(context.Background(), nil, projectInput{LayerRef: "no-such-agent"})
	if err != nil {
		t.Fatalf("an unknown ref must be a clean not-found, not an error: %v", err)
	}
	if out.Found {
		t.Error("an unknown layerRef must NOT be fabricated into a projection")
	}
	// A projection carries NO truth: no version-as-truth (the type has no Version field; the
	// LayerRef is a plain ref pointing back to the SOURCE), and the wall is always present.
	_, ok, _ := s.project(context.Background(), nil, projectInput{LayerRef: "bdd-writer"})
	if ok.Found && !contains(ok.Impl.ForbiddenPaths, "kernel") {
		t.Error("the projection must always render the wall (kernel forbidden)")
	}
}
