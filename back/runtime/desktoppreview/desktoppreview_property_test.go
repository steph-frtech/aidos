package desktoppreview

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"pgregory.net/rapid"
)

// shopChild emits the canonical demo desktop child (the same shop master the honoemit fixtures use):
// one entity (Order) + one control→action (the checkout button → createOrder). A real emitted
// Electron child, not a hand-built fixture.
func shopChild(t rapid.TB) honoemit.DesktopChild {
	master, br := honoemit.EmitMasterView(honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	})
	if br != nil {
		t.Fatalf("EmitMasterView refused the shop spec: %s", br.Explanation)
	}
	child, br := honoemit.EmitDesktopChild(master)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused the shop master: %s", br.Explanation)
	}
	return child
}

// TestPlan_Reproducible — the reproducibility mirror (determinism-first §6/§8): the SAME desktop
// child PLANNED twice yields the byte-identical bundle and the identical content address. A pure
// projection has no clock, no RNG, no path drift.
func TestPlan_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		child := shopChild(rt)

		a, br := Plan(child)
		if br != nil {
			rt.Fatalf("Plan refused a projectable child: %s", br.Explanation)
		}
		b, br := Plan(child)
		if br != nil {
			rt.Fatalf("Plan refused on the second call: %s", br.Explanation)
		}

		if a.BundleHash != b.BundleHash {
			rt.Fatalf("BundleHash not reproducible: %s != %s", a.BundleHash, b.BundleHash)
		}
		if len(a.Files) != len(b.Files) {
			rt.Fatalf("file count drift: %d != %d", len(a.Files), len(b.Files))
		}
		for i := range a.Files {
			if a.Files[i].Path != b.Files[i].Path {
				rt.Fatalf("path drift at %d: %q != %q", i, a.Files[i].Path, b.Files[i].Path)
			}
			if string(a.Files[i].Bytes) != string(b.Files[i].Bytes) {
				rt.Fatalf("byte drift in %q", a.Files[i].Path)
			}
		}
	})
}

// TestPlan_FilesPathSortedAndRelative — every file is bundle-RELATIVE (the gen/<project>/desktop/
// prefix stripped) and the set is path-sorted (so the content address is stable regardless of the
// emitter's artifact order).
func TestPlan_FilesPathSortedAndRelative(t *testing.T) {
	bundle, br := Plan(shopChild(t))
	if br != nil {
		t.Fatalf("Plan refused: %s", br.Explanation)
	}
	var prev string
	for _, f := range bundle.Files {
		if strings.Contains(f.Path, "/desktop/") || strings.HasPrefix(f.Path, "gen/") {
			t.Fatalf("file %q is not bundle-relative (carries the emitted prefix)", f.Path)
		}
		if prev != "" && f.Path < prev {
			t.Fatalf("files not path-sorted: %q before %q", prev, f.Path)
		}
		prev = f.Path
	}
}

// TestPlan_RewritesRendererToBundle — the ONE launch-prep transform: index.html's emitted
// `./renderer.tsx` module ref becomes `./renderer.js` (the esbuild output the Runner produces),
// because a renderer cannot execute TSX nor bare module specifiers directly. The renderer.tsx
// SOURCE itself stays verbatim (we bundle it, we don't edit it).
func TestPlan_RewritesRendererToBundle(t *testing.T) {
	bundle, br := Plan(shopChild(t))
	if br != nil {
		t.Fatalf("Plan refused: %s", br.Explanation)
	}
	var index, renderer *File
	for i := range bundle.Files {
		switch bundle.Files[i].Path {
		case "index.html":
			index = &bundle.Files[i]
		case "renderer.tsx":
			renderer = &bundle.Files[i]
		}
	}
	if index == nil || renderer == nil {
		t.Fatalf("missing index.html or renderer.tsx in bundle: %v", bundle.Files)
	}
	if strings.Contains(string(index.Bytes), "./renderer.tsx") {
		t.Fatalf("index.html still references ./renderer.tsx — the launch-prep rewrite did not run")
	}
	if !strings.Contains(string(index.Bytes), "./renderer.js") {
		t.Fatalf("index.html does not reference the esbuild output ./renderer.js")
	}
	if !strings.Contains(string(renderer.Bytes), "createRoot") {
		t.Fatalf("renderer.tsx was edited — it must stay verbatim (we bundle it, never edit it)")
	}
	if bundle.RendererBundle != "renderer.js" || bundle.Entry != "main.js" {
		t.Fatalf("unexpected entries: entry=%q rendererBundle=%q", bundle.Entry, bundle.RendererBundle)
	}
}

// TestPlan_EmptyChildRefused — an empty (non-projectable) child is a typed BlockReason, never a
// partial bundle (honesty §8). Discriminant: a child missing a launch-critical file also refuses.
func TestPlan_EmptyChildRefused(t *testing.T) {
	if _, br := Plan(honoemit.DesktopChild{}); br == nil {
		t.Fatal("Plan accepted an empty desktop child — it must refuse (no partial bundle)")
	} else if br.Code != "OUT_OF_SCOPE" {
		t.Fatalf("unexpected block code: %s", br.Code)
	}

	// A child with artifacts but missing main.js (launch-critical) must also refuse.
	partial := honoemit.DesktopChild{Artifacts: []honoemit.Artifact{
		{Path: "gen/shop/desktop/index.html", Bytes: []byte("<html></html>")},
	}}
	if _, br := Plan(partial); br == nil {
		t.Fatal("Plan accepted a child missing main.js/renderer.tsx — it must refuse")
	}
}
