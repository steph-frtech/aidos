//go:build electronlive

// Integration test for the desktoppreview Runner — the GATED I/O adapter (§6/§8). Build-tagged
// `electronlive` so the default `go test ./...` (and CI without a display/toolchain) never runs it:
// it boots a REAL Electron app headless under Xvfb and captures a REAL frame via CDP. Run with:
//
//	go test -tags electronlive -run TestCaptureFrame_RealElectron -count=1 ./runtime/desktoppreview/
//
// It needs the cached toolchain (electron+esbuild+react+react-dom). Default location is the repo
// cache back/runtime/desktoppreview/.toolchain/node_modules (gitignored); override the node_modules
// dir with AIDOS_DESKTOP_PREVIEW_NM and xvfb-run with AIDOS_XVFB_RUN. The test SKIPS (not fails) when
// the toolchain or xvfb-run is absent — a host without a display is not a red mirror.
package desktoppreview

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

func toolchainOrSkip(t *testing.T) Toolchain {
	t.Helper()
	nm := os.Getenv("AIDOS_DESKTOP_PREVIEW_NM")
	if nm == "" {
		// Default to the repo cache relative to this package.
		nm, _ = filepath.Abs(".toolchain/node_modules")
	}
	if _, err := os.Stat(filepath.Join(nm, "electron")); err != nil {
		t.Skipf("desktop-preview toolchain absent (%s): run `npm install` in back/runtime/desktoppreview/.toolchain", nm)
	}
	xvfb := os.Getenv("AIDOS_XVFB_RUN")
	if xvfb == "" {
		p, err := exec.LookPath("xvfb-run")
		if err != nil {
			t.Skip("xvfb-run not on PATH — no virtual display, skipping the live Electron capture")
		}
		xvfb = p
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not on PATH")
	}
	return Toolchain{
		NodeBin:        node,
		ElectronBin:    filepath.Join(nm, ".bin", "electron"),
		EsbuildBin:     filepath.Join(nm, ".bin", "esbuild"),
		XvfbRunBin:     xvfb,
		NodeModulesDir: nm,
		WorkRoot:       t.TempDir(),
	}
}

func shopDesktopChild(t *testing.T) honoemit.DesktopChild {
	t.Helper()
	master, br := honoemit.EmitMasterView(honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	})
	if br != nil {
		t.Fatalf("EmitMasterView refused: %s", br.Explanation)
	}
	child, br := honoemit.EmitDesktopChild(master)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	return child
}

// TestCaptureFrame_RealElectron — the end-to-end proof: the emitted desktop child boots as a real
// Electron app and its rendered window is captured as a JPEG. This is what makes "voir Electron"
// honest — the source is not just emitted, it RUNS and is VIEWABLE.
func TestCaptureFrame_RealElectron(t *testing.T) {
	runner := CDPRunner{Tools: toolchainOrSkip(t)}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	res, br, err := runner.CaptureFrame(ctx, shopDesktopChild(t))
	if br != nil {
		t.Fatalf("CaptureFrame refused a projectable child: %s", br.Explanation)
	}
	if err != nil {
		t.Fatalf("CaptureFrame failed: %v", err)
	}

	// JPEG magic (SOI marker FF D8 FF) — a real rendered frame, not an empty/placeholder file.
	if len(res.JPEG) < 2000 {
		t.Fatalf("frame implausibly small (%d bytes) — the window likely did not render", len(res.JPEG))
	}
	if !bytes.HasPrefix(res.JPEG, []byte{0xFF, 0xD8, 0xFF}) {
		t.Fatalf("captured bytes are not a JPEG (prefix %x)", res.JPEG[:min(3, len(res.JPEG))])
	}
	if res.BundleHash == "" || res.SourceHash == "" {
		t.Fatalf("frame missing content addresses: bundle=%q source=%q", res.BundleHash, res.SourceHash)
	}
	if res.Project != "shop" {
		t.Fatalf("frame project = %q, want shop", res.Project)
	}
	if dump := os.Getenv("AIDOS_DESKTOP_PREVIEW_DUMP"); dump != "" {
		if err := os.WriteFile(dump, res.JPEG, 0o644); err != nil {
			t.Fatalf("dump frame: %v", err)
		}
		t.Logf("dumped frame to %s", dump)
	}
	t.Logf("captured real Electron frame: %d bytes, %dx%d, bundle=%s", len(res.JPEG), res.Width, res.Height, res.BundleHash[:12])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
