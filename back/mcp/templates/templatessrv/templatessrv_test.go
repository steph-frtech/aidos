package templatessrv

import (
	"context"
	"testing"
)

// The templates MCP server is PURE computation (the wall): these tests prove each S81 tool returns
// deterministically without any I/O — list the curated bundles, get one, instantiate a deterministic
// GREEN starter, and fork from a stable phase. Moved from mcp/templates/main_test.go at ADR 0092
// batch-3 (the tools moved into this reusable library so the gateway dispatcher reuses the SAME
// server in-process).

func TestListCurated(t *testing.T) {
	_, out, err := listTool(context.Background(), nil, listInput{})
	if err != nil || !out.OK {
		t.Fatalf("list: %v %+v", err, out)
	}
	if len(out.Templates) != 3 {
		t.Fatalf("expected 3 curated templates, got %d", len(out.Templates))
	}
	for _, b := range out.Templates {
		if b.BundleID == "" || b.Labels["fr"] == "" {
			t.Fatalf("bundle %s missing BundleID or FR label", b.ID)
		}
	}
}

func TestGetBundle(t *testing.T) {
	_, out, err := getTool(context.Background(), nil, getInput{ID: "ecommerce"})
	if err != nil || !out.OK || out.Bundle == nil {
		t.Fatalf("get: %v %+v", err, out)
	}
	if len(out.Bundle.Entities) != 3 {
		t.Fatalf("ecommerce should have 3 entities, got %d", len(out.Bundle.Entities))
	}
	// honesty: an unknown id errors.
	_, bad, _ := getTool(context.Background(), nil, getInput{ID: "nope"})
	if bad.OK {
		t.Fatalf("unknown id must error")
	}
}

func TestInstantiateStarter(t *testing.T) {
	_, out, err := instantiateTool(context.Background(), nil, instantiateInput{ID: "ecommerce", Target: "shop-app"})
	if err != nil || !out.OK {
		t.Fatalf("instantiate: %v %+v", err, out)
	}
	if out.WroteKernel {
		t.Fatalf("instantiate must not write the kernel (the wall)")
	}
	if !out.HasAppAuth {
		t.Fatalf("ecommerce starter must carry the app-auth subsystem")
	}
	if out.StarterID == "" {
		t.Fatalf("instantiate must content-address the starter")
	}
	// determinism: same (id, target) ⇒ same StarterID.
	_, out2, _ := instantiateTool(context.Background(), nil, instantiateInput{ID: "ecommerce", Target: "shop-app"})
	if out.StarterID != out2.StarterID {
		t.Fatalf("instantiate not deterministic: %s vs %s", out.StarterID, out2.StarterID)
	}
	// honesty: an empty target errors.
	_, bad, _ := instantiateTool(context.Background(), nil, instantiateInput{ID: "ecommerce", Target: ""})
	if bad.OK {
		t.Fatalf("empty target must error")
	}
}

func TestForkFromPhase(t *testing.T) {
	_, a, err := forkTool(context.Background(), nil, forkInput{ID: "crm", Target: "acme-fork", ParentPhase: "phaseA"})
	if err != nil || !a.OK {
		t.Fatalf("fork: %v %+v", err, a)
	}
	if a.WroteKernel {
		t.Fatalf("fork must not write the kernel (the wall)")
	}
	// a fork from a different phase differs.
	_, b, _ := forkTool(context.Background(), nil, forkInput{ID: "crm", Target: "acme-fork", ParentPhase: "phaseB"})
	if a.StarterID == b.StarterID {
		t.Fatalf("forks from different phases must differ")
	}
}

func TestServerRegistersTools(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("server must be constructed")
	}
}
