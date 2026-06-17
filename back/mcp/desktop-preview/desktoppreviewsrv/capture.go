package desktoppreviewsrv

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/runtime/desktoppreview"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// CaptureDemoFrame resolves the preview Toolchain from the environment and captures one frame of the
// given (already-emitted) desktop child. It is the single capture seam BOTH the desktop_frame MCP
// tool and main.go's -capture mode call (no twin). Returns (frame, available, reason): available is
// false GRACEFULLY (ADR 0074: the preview never throws on a host without a display/toolchain — it
// reports why and the panel falls back to the bundle's file tree). Resolution is explicit (no $PATH
// guessing beyond node/xvfb-run, which are system tools): AIDOS_DESKTOP_PREVIEW_NM points at a
// node_modules holding electron+esbuild+react+react-dom; .bin/electron + .bin/esbuild derive from it.
func CaptureDemoFrame(ctx context.Context, child honoemit.DesktopChild) (desktoppreview.FrameResult, bool, string) {
	nm := os.Getenv("AIDOS_DESKTOP_PREVIEW_NM")
	if nm == "" {
		for _, cand := range defaultNodeModulesCandidates() {
			if _, err := os.Stat(filepath.Join(cand, "electron")); err == nil {
				nm = cand
				break
			}
		}
	}
	if nm == "" {
		return desktoppreview.FrameResult{}, false, "AIDOS_DESKTOP_PREVIEW_NM non configuré (node_modules electron+esbuild absent)"
	}
	// Make nm ABSOLUTE before deriving the bin paths: the Runner runs esbuild/electron with
	// cmd.Dir=<tempDir>, so a RELATIVE .bin/esbuild would resolve against the temp dir (not the
	// caller's cwd) and fork/exec would fail. The Workbench Server Action runs the binary with
	// cwd=REPO and a relative candidate ("back/runtime/.../node_modules") — without this, capture
	// silently degrades to the fallback (a hollow live view). Found by running from the repo root.
	if abs, err := filepath.Abs(nm); err == nil {
		nm = abs
	}
	node, err := exec.LookPath("node")
	if err != nil {
		return desktoppreview.FrameResult{}, false, "node introuvable sur l'hôte"
	}
	xvfb := os.Getenv("AIDOS_XVFB_RUN")
	if xvfb == "" {
		if p, lerr := exec.LookPath("xvfb-run"); lerr == nil {
			xvfb = p
		} else {
			return desktoppreview.FrameResult{}, false, "xvfb-run introuvable (pas d'affichage virtuel sur l'hôte)"
		}
	}
	runner := desktoppreview.CDPRunner{Tools: desktoppreview.Toolchain{
		NodeBin:        node,
		ElectronBin:    filepath.Join(nm, ".bin", "electron"),
		EsbuildBin:     filepath.Join(nm, ".bin", "esbuild"),
		XvfbRunBin:     xvfb,
		NodeModulesDir: nm,
		WorkRoot:       os.TempDir(),
	}}
	res, br, cerr := runner.CaptureFrame(ctx, child)
	if br != nil {
		return desktoppreview.FrameResult{}, false, br.Explanation
	}
	if cerr != nil {
		return desktoppreview.FrameResult{}, false, cerr.Error()
	}
	return res, true, ""
}

// defaultNodeModulesCandidates are the well-known locations the cached preview toolchain may live
// (the gitignored repo cache, or a prod-installed copy). Checked only when the env is unset.
func defaultNodeModulesCandidates() []string {
	cands := []string{
		"back/runtime/desktoppreview/.toolchain/node_modules",
		"/data/dev/aidos/back/runtime/desktoppreview/.toolchain/node_modules",
	}
	if home, err := os.UserHomeDir(); err == nil {
		cands = append(cands, filepath.Join(home, ".cache", "aidos-desktop-preview", "node_modules"))
	}
	return cands
}
