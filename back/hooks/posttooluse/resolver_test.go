package main

import (
	"sort"
	"strings"
	"testing"
)

// Unit mirror (N4) for the changed-code resolver. reflects=runtime.sensors,
// test_kind=unit, cert_language=go, liveness=live, authority=below.
//
// The resolver is the deep, well-named heart of the affected set (ADR 0014,
// CONTEXT.md "affected set"): event → changed files → affected package dirs,
// never the whole repo. Pure and total — same event ⇒ same set.

func TestChangedFilesReadsFlatAndNestedShape(t *testing.T) {
	// Flat shape.
	flat := Event{Tool: "Edit", Path: "back/gen/order.go"}
	if got := ChangedFiles(flat); len(got) != 1 || got[0] != "back/gen/order.go" {
		t.Fatalf("flat path: got %v", got)
	}
	// Claude Code nested shape.
	nested := Event{Tool: "Write"}
	nested.ToolInput.FilePath = "front/web/lib/sensors.ts"
	if got := ChangedFiles(nested); len(got) != 1 || got[0] != "front/web/lib/sensors.ts" {
		t.Fatalf("nested path: got %v", got)
	}
	// Multi-file shape.
	multi := Event{Tool: "MultiEdit"}
	multi.ToolInput.FilePaths = []string{"a/x.go", "a/y.go", "b/z.go"}
	if got := ChangedFiles(multi); len(got) != 3 {
		t.Fatalf("multi paths: got %v", got)
	}
}

func TestAffectedGoPackagesDedupesByDir(t *testing.T) {
	files := []string{
		"back/gen/order.go",
		"back/gen/cart.go",         // same dir as order.go
		"back/runtime/foo/x.go",    // distinct dir
		"front/web/lib/sensors.ts", // not Go — excluded from Go packages
		"docs/plan/S07-sensors.md", // not Go — excluded
	}
	got := AffectedGoPackages(files)
	sort.Strings(got)
	want := []string{"back/gen", "back/runtime/foo"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("affected packages: got %v want %v", got, want)
	}
}

func TestHasGoChangesDetectsGoFiles(t *testing.T) {
	if !HasGoChanges([]string{"front/web/x.ts", "back/gen/y.go"}) {
		t.Fatalf("should detect a .go file in the set")
	}
	if HasGoChanges([]string{"front/web/x.ts", "docs/z.md"}) {
		t.Fatalf("should report no Go changes for a TS/MD-only set")
	}
}
