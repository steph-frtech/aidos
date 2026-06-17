package desktoppreviewsrv

import (
	"context"
	"testing"
)

// TestDesktopChildrenTool — the master view emits its THREE distinct children (web/mobile/desktop),
// all sharing the SAME parent (the composes edge), each with emitted artifacts. This is the data the
// /v3/emetteurs panel reads live from the engine (never a twin).
func TestDesktopChildrenTool(t *testing.T) {
	_, out, err := desktopChildren(context.Background(), nil, childrenInput{})
	if err != nil {
		t.Fatalf("desktop_children: %v", err)
	}
	if len(out.Children) != 3 {
		t.Fatalf("want 3 children (web/mobile/desktop), got %d", len(out.Children))
	}
	targets := map[string]bool{}
	for _, c := range out.Children {
		targets[c.Target] = true
		if c.ParentID != out.MasterHash {
			t.Errorf("child %s parent %q != master %q (composes edge broken)", c.Target, c.ParentID, out.MasterHash)
		}
		if len(c.Artifacts) == 0 {
			t.Errorf("child %s emitted no artifacts", c.Target)
		}
	}
	for _, want := range []string{"web-app", "mobile-app", "desktop-app"} {
		if !targets[want] {
			t.Errorf("missing child target %q", want)
		}
	}
}

// TestDesktopBundleTool_Reproducible — the desktop bundle is content-addressed and PURE: two calls
// yield the identical BundleHash + file set. The renderer.tsx → renderer.js launch-prep rewrite is
// reflected (Entry main.js, RendererBundle renderer.js). This is the determinism the Runner relies on.
func TestDesktopBundleTool_Reproducible(t *testing.T) {
	_, a, err := desktopBundle(context.Background(), nil, childrenInput{})
	if err != nil {
		t.Fatalf("desktop_bundle: %v", err)
	}
	_, b, err := desktopBundle(context.Background(), nil, childrenInput{})
	if err != nil {
		t.Fatalf("desktop_bundle (2nd): %v", err)
	}
	if a.BundleHash == "" || a.BundleHash != b.BundleHash {
		t.Fatalf("bundle hash not reproducible: %q vs %q", a.BundleHash, b.BundleHash)
	}
	if a.Entry != "main.js" || a.RendererBundle != "renderer.js" {
		t.Fatalf("unexpected entries: entry=%q rendererBundle=%q", a.Entry, a.RendererBundle)
	}
	if len(a.Files) == 0 {
		t.Fatal("bundle has no files")
	}
	var sawIndex, sawMain, sawRenderer bool
	for _, f := range a.Files {
		switch f.Path {
		case "index.html":
			sawIndex = true
		case "main.js":
			sawMain = true
		case "renderer.tsx":
			sawRenderer = true
		}
		if f.Size <= 0 {
			t.Errorf("file %q has non-positive size", f.Path)
		}
	}
	if !sawIndex || !sawMain || !sawRenderer {
		t.Fatalf("bundle missing a launch-critical file (index.html/main.js/renderer.tsx): %+v", a.Files)
	}
}

// TestDesktopFrameTool_GracefulWhenUnavailable — desktop_frame NEVER throws: on a host without the
// toolchain/display it returns available=false + a reason (ADR 0074), so the panel degrades to the
// bundle file tree. On a host WITH the toolchain it returns a real frame. Either is a valid pass —
// the invariant under test is "never an error, always a typed verdict".
func TestDesktopFrameTool_GracefulWhenUnavailable(t *testing.T) {
	_, out, err := desktopFrame(context.Background(), nil, childrenInput{})
	if err != nil {
		t.Fatalf("desktop_frame must not return an error (graceful availability): %v", err)
	}
	if out.Available {
		if out.JPEGBase64 == "" || out.BundleHash == "" {
			t.Fatalf("available frame missing payload: %+v", out)
		}
	} else if out.Reason == "" {
		t.Fatal("unavailable frame must carry a reason")
	}
}

// TestNewServer — the server builds with its three tools wired (a smoke test of the registration).
func TestNewServer(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}
