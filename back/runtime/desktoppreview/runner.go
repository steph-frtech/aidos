package desktoppreview

import (
	"context"
	_ "embed"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// capture.mjs is the CDP capture leg, embedded so the runner is self-contained (no external script
// path to discover — determinism-first wiring). It is written into the session work dir at launch.
//
//go:embed capture.mjs
var captureScript []byte

// Toolchain is the INJECTED set of external binaries the Runner orchestrates. Nothing is discovered
// from $PATH — every binary is a declared dependency, so a run is reproducible and a CI/host without
// one fails LOUDLY (a typed refusal) rather than silently picking up a stray binary. NodeModulesDir
// is a pre-populated node_modules containing electron + esbuild + react + react-dom (the desktop
// child's deps): the Runner symlinks it into the session dir so esbuild resolves the renderer's bare
// imports and electron is launchable. This makes a Frame ~seconds, not a per-call npm install.
type Toolchain struct {
	NodeBin        string // node (runs the embedded CDP capture script)
	ElectronBin    string // node_modules/.bin/electron (or an electron entry)
	EsbuildBin     string // node_modules/.bin/esbuild (bundles renderer.tsx → renderer.js)
	XvfbRunBin     string // xvfb-run (a virtual X display, headless, no sudo)
	NodeModulesDir string // a node_modules with electron+esbuild+react+react-dom
	WorkRoot       string // parent dir for ephemeral session dirs (e.g. os.TempDir())
}

// FrameResult is one captured frame of the running desktop window: the JPEG bytes, its dimensions,
// and the content addresses that tie it back to the emitted child (so the panel can prove "this
// pixel came from THIS emitted desktop child", never a stand-in).
type FrameResult struct {
	JPEG       []byte `json:"-"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	BundleHash string `json:"bundle_hash"`
	SourceHash string `json:"source_hash"`
	Project    string `json:"project"`
}

// CDPRunner is the reference Runner: it materialises the bundle, bundles the renderer with esbuild,
// launches the Electron app headless under Xvfb with the CDP remote-debugging port open, and captures
// a frame via the embedded script. Stateless across calls (CaptureFrame is one launch→shot→teardown);
// the heavier Session (persistent app, many frames) builds on the same steps.
type CDPRunner struct {
	Tools Toolchain
}

// available reports whether the injected toolchain looks usable (every binary present + a populated
// node_modules). The Workbench consults this to fall back to source:"demo" gracefully (ADR 0074: the
// view never throws — it shows the materialised bundle's file tree instead of a live frame).
func (r CDPRunner) available() (bool, string) {
	for label, p := range map[string]string{
		"node": r.Tools.NodeBin, "electron": r.Tools.ElectronBin,
		"esbuild": r.Tools.EsbuildBin, "xvfb-run": r.Tools.XvfbRunBin,
	} {
		if p == "" {
			return false, label + " binary not configured"
		}
	}
	if r.Tools.NodeModulesDir == "" {
		return false, "node_modules dir not configured"
	}
	if _, err := os.Stat(filepath.Join(r.Tools.NodeModulesDir, "electron")); err != nil {
		return false, "node_modules has no electron"
	}
	return true, ""
}

// CaptureFrame is the on-demand one-shot: emit nothing new — given an already-emitted desktop child,
// PLAN it (pure), materialise + bundle + launch under Xvfb, capture one CDP frame, tear down. Returns
// a typed BlockReason for a non-projectable child (honesty §8) and a plain error for an I/O failure
// (a missing binary, a launch crash) — the two are distinct: a block is "the child can't preview",
// an error is "the host couldn't run it".
func (r CDPRunner) CaptureFrame(ctx context.Context, child honoemit.DesktopChild) (FrameResult, *blockreason.BlockReason, error) {
	bundle, br := Plan(child)
	if br != nil {
		return FrameResult{}, br, nil
	}
	if ok, why := r.available(); !ok {
		return FrameResult{}, nil, fmt.Errorf("desktop preview toolchain unavailable: %s", why)
	}

	dir, err := os.MkdirTemp(r.Tools.WorkRoot, "aidos-desktop-preview-")
	if err != nil {
		return FrameResult{}, nil, fmt.Errorf("session dir: %w", err)
	}
	defer os.RemoveAll(dir)

	if err := r.materialise(bundle, dir); err != nil {
		return FrameResult{}, nil, err
	}
	if err := r.bundleRenderer(ctx, bundle, dir); err != nil {
		return FrameResult{}, nil, err
	}

	port, err := freePort()
	if err != nil {
		return FrameResult{}, nil, err
	}
	stop, err := r.launchElectron(ctx, dir, port)
	if err != nil {
		return FrameResult{}, nil, err
	}
	defer stop()

	if err := waitForCDP(ctx, port, 20*time.Second); err != nil {
		return FrameResult{}, nil, err
	}

	res, err := r.capture(ctx, dir, port)
	if err != nil {
		return FrameResult{}, nil, err
	}
	res.BundleHash = bundle.BundleHash
	res.SourceHash = bundle.SourceHash
	res.Project = bundle.Project
	return res, nil, nil
}

// materialise writes the bundle's files to dir (relative paths, verbatim bytes), writes the embedded
// capture script, and symlinks the injected node_modules so esbuild + electron resolve.
func (r CDPRunner) materialise(bundle Bundle, dir string) error {
	for _, f := range bundle.Files {
		dst := filepath.Join(dir, filepath.FromSlash(f.Path))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", dst, err)
		}
		if err := os.WriteFile(dst, f.Bytes, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", dst, err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "capture.mjs"), captureScript, 0o644); err != nil {
		return fmt.Errorf("write capture.mjs: %w", err)
	}
	if err := os.Symlink(r.Tools.NodeModulesDir, filepath.Join(dir, "node_modules")); err != nil {
		return fmt.Errorf("symlink node_modules: %w", err)
	}
	return nil
}

// bundleRenderer runs esbuild to bundle renderer.tsx → renderer.js (resolving react/react-dom from
// node_modules). The renderer is a self-contained React entry; the bundle is what index.html (already
// rewritten by Plan) loads. iife format so it executes immediately in the Electron renderer.
func (r CDPRunner) bundleRenderer(ctx context.Context, bundle Bundle, dir string) error {
	out := filepath.Join(dir, bundle.RendererBundle)
	cmd := exec.CommandContext(ctx, r.Tools.EsbuildBin,
		bundle.RendererEntry,
		"--bundle",
		"--format=iife",
		"--loader:.tsx=tsx",
		"--jsx=automatic",
		"--outfile="+out,
	)
	cmd.Dir = dir
	if outBytes, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("esbuild renderer: %w\n%s", err, truncate(string(outBytes), 1200))
	}
	return nil
}

// launchElectron starts the app headless under Xvfb with the CDP port open. Returns a stop() that
// kills the whole process group (xvfb-run forks Xvfb + electron + chromium helpers — a plain Kill
// leaks them). --no-sandbox is required for the unprivileged container (no setuid sandbox helper).
func (r CDPRunner) launchElectron(ctx context.Context, dir string, port int) (func(), error) {
	cmd := exec.Command(r.Tools.XvfbRunBin, "-a",
		r.Tools.ElectronBin, dir,
		"--no-sandbox",
		"--disable-gpu",
		fmt.Sprintf("--remote-debugging-port=%d", port),
		"--remote-debugging-address=127.0.0.1",
	)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	logFile, _ := os.Create(filepath.Join(dir, "electron.log"))
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("launch electron: %w", err)
	}
	stop := func() {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		if logFile != nil {
			_ = logFile.Close()
		}
	}
	return stop, nil
}

// capture runs the embedded CDP script against the live app, returning the JPEG it wrote. A short
// settle wait lets the React shell mount + the Tailwind CDN paint before the shot.
func (r CDPRunner) capture(ctx context.Context, dir string, port int) (FrameResult, error) {
	outFile := filepath.Join(dir, "frame.jpg")
	cmd := exec.CommandContext(ctx, r.Tools.NodeBin,
		filepath.Join(dir, "capture.mjs"),
		fmt.Sprintf("http://127.0.0.1:%d", port),
		outFile,
		"900", // settle ms
	)
	cmd.Dir = dir
	stdout, err := cmd.CombinedOutput()
	if err != nil {
		return FrameResult{}, fmt.Errorf("cdp capture: %w\n%s", err, truncate(string(stdout), 800))
	}
	jpeg, err := os.ReadFile(outFile)
	if err != nil || len(jpeg) == 0 {
		return FrameResult{}, fmt.Errorf("capture produced no frame (%v)", err)
	}
	w, h := parseDims(string(stdout))
	return FrameResult{JPEG: jpeg, Width: w, Height: h}, nil
}

// waitForCDP polls the CDP /json/version endpoint until the browser-level devtools is up (the
// renderer page comes a beat later — the capture script waits for that).
func waitForCDP(ctx context.Context, port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/json/version", port)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if resp, err := http.DefaultClient.Do(req); err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("CDP endpoint not up on :%d within %s", port, timeout)
		}
		time.Sleep(250 * time.Millisecond)
	}
}

// freePort asks the kernel for an unused TCP port (bind :0) so concurrent previews never collide.
func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func parseDims(stdout string) (int, int) {
	// "OK <byteLen> <W>x<H>"
	for _, line := range strings.Split(strings.TrimSpace(stdout), "\n") {
		f := strings.Fields(line)
		if len(f) == 3 && f[0] == "OK" {
			var w, h int
			fmt.Sscanf(f[2], "%dx%d", &w, &h)
			return w, h
		}
	}
	return 0, 0
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
