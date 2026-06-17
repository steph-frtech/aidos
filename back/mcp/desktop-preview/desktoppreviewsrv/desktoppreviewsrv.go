// Package desktoppreviewsrv is the MCP server over the "voir Electron" capability
// (back/runtime/desktoppreview) — ADR 0009: every backend op is an MCP tool. It exposes the EMITTED
// desktop child (and its web/mobile siblings) as inspectable, runnable artifacts:
//
//	desktop_children — emit the master view's THREE distinct children (web React / mobile Expo /
//	                   desktop Electron) and return their content addresses + artifact paths. PURE.
//	desktop_bundle   — the launch-ready desktop bundle (relative file set + BundleHash) the Runner
//	                   materialises and boots. PURE (desktoppreview.Plan).
//	desktop_frame    — capture ONE frame of the running Electron window (CDP screencast). The gated
//	                   I/O exception (§6/§8): isolated, host-dependent; returns available=false
//	                   gracefully (ADR 0074) when the toolchain/display is absent, never throws.
//
// The pure tools are cheap reads (gateway-dispatchable); desktop_frame is HEAVY (boots Electron
// ~2s) so it stays EXPOSED but is not a synchronous cheap dispatch — the Workbench spawns the
// binary's -capture mode for the live view. THE WALL (§2): every tool is a below-the-line
// projection, WroteKernel is always false; a preview is never a truth-write. DETERMINISM-FIRST:
// the children/bundle are pure functions of the emitted master (the reproducibility mirror);
// only the live frame is non-deterministic, and it is the smallest possible gated surface.
//
// The server lives in this LIBRARY so the gateway dispatcher (S59) can reuse the SAME server
// in-process — no duplicated logic, no twin (ADR 0092). main.go wires it to stdio (or -capture).
package desktoppreviewsrv

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/desktoppreview"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// childrenInput selects what to preview. For now the only previewable source is the built-in demo
// master (the shop slice — one Order entity + the checkout button → createOrder), so an empty/"shop"
// project resolves to it. A real project resolves to its emitted master once the found pipeline
// exposes a spec here (a documented OpenQuestion — the wiring is additive).
type childrenInput struct {
	Project string `json:"project,omitempty"`
}

// childRef is one emitted child's identity + its artifact paths (NOT the bytes — the bundle tool
// carries those for the desktop child). path-sorted, content-addressed.
type childRef struct {
	Target    string   `json:"target"`    // web-app | mobile-app | desktop-app
	ParentID  string   `json:"parent_id"` // the master's content address (the composes parent edge)
	Artifacts []string `json:"artifacts"` // the emitted file paths (path-sorted)
}

type childrenOutput struct {
	Project    string     `json:"project"`
	MasterHash string     `json:"master_hash"`
	Children   []childRef `json:"children"`
}

type bundleFile struct {
	Path string `json:"path"`
	Size int    `json:"size"`
}

type bundleOutput struct {
	Project        string       `json:"project"`
	MasterHash     string       `json:"master_hash"`
	SourceHash     string       `json:"source_hash"`
	BundleHash     string       `json:"bundle_hash"`
	Entry          string       `json:"entry"`
	RendererBundle string       `json:"renderer_bundle"`
	Files          []bundleFile `json:"files"`
}

type frameOutput struct {
	Available  bool   `json:"available"`        // false when the toolchain/display is absent (graceful)
	Reason     string `json:"reason,omitempty"` // why unavailable (a host without xvfb/electron)
	JPEGBase64 string `json:"jpeg_base64,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	BundleHash string `json:"bundle_hash,omitempty"`
	SourceHash string `json:"source_hash,omitempty"`
	Project    string `json:"project,omitempty"`
}

// demoMaster is the built-in previewable master — the shop slice the honoemit fixtures use (one
// Order entity + one control→action: the checkout button → createOrder). A real emitted master,
// not a hand-built mock.
func demoMaster() (honoemit.MasterView, *struct{ Explanation string }) {
	m, br := honoemit.EmitMasterView(honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	})
	if br != nil {
		return honoemit.MasterView{}, &struct{ Explanation string }{br.Explanation}
	}
	return m, nil
}

func desktopChildren(_ context.Context, _ *mcp.CallToolRequest, _ childrenInput) (*mcp.CallToolResult, childrenOutput, error) {
	out, err := demoChildren()
	if err != nil {
		return nil, childrenOutput{}, err
	}
	return nil, out, nil
}

// demoChildren emits the demo master's three distinct children and returns their identities. The
// single source the desktop_children tool AND DemoChildrenJSON (the CLI mode) share — no twin. PURE.
func demoChildren() (childrenOutput, error) {
	m, ferr := demoMaster()
	if ferr != nil {
		return childrenOutput{}, fmt.Errorf("emit demo master: %s", ferr.Explanation)
	}
	web, br := honoemit.EmitWebChild(masterSpec())
	if br != nil {
		return childrenOutput{}, fmt.Errorf("emit web child: %s", br.Explanation)
	}
	mob, br := honoemit.EmitMobileChild(m)
	if br != nil {
		return childrenOutput{}, fmt.Errorf("emit mobile child: %s", br.Explanation)
	}
	desk, br := honoemit.EmitDesktopChild(m)
	if br != nil {
		return childrenOutput{}, fmt.Errorf("emit desktop child: %s", br.Explanation)
	}
	return childrenOutput{
		Project:    "shop",
		MasterHash: m.Hash(),
		Children: []childRef{
			{Target: "web-app", ParentID: web.ParentID, Artifacts: artifactPaths(web.Artifacts)},
			{Target: "mobile-app", ParentID: mob.ParentID, Artifacts: artifactPaths(mob.Artifacts)},
			{Target: "desktop-app", ParentID: desk.ParentID, Artifacts: artifactPaths(desk.Artifacts)},
		},
	}, nil
}

// DemoChildrenJSON returns the demo master's three children as indented JSON — the CLI -children mode
// the Workbench route handler spawns to populate the "3 enfants" view from the engine (no twin). PURE.
func DemoChildrenJSON() (string, error) {
	out, err := demoChildren()
	if err != nil {
		return "", err
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func desktopBundle(_ context.Context, _ *mcp.CallToolRequest, _ childrenInput) (*mcp.CallToolResult, bundleOutput, error) {
	m, ferr := demoMaster()
	if ferr != nil {
		return nil, bundleOutput{}, fmt.Errorf("emit demo master: %s", ferr.Explanation)
	}
	child, br := honoemit.EmitDesktopChild(m)
	if br != nil {
		return nil, bundleOutput{}, fmt.Errorf("emit desktop child: %s", br.Explanation)
	}
	bundle, pbr := desktoppreview.Plan(child)
	if pbr != nil {
		return nil, bundleOutput{}, fmt.Errorf("plan desktop bundle: %s", pbr.Explanation)
	}
	files := make([]bundleFile, len(bundle.Files))
	for i, f := range bundle.Files {
		files[i] = bundleFile{Path: f.Path, Size: len(f.Bytes)}
	}
	return nil, bundleOutput{
		Project: bundle.Project, MasterHash: bundle.MasterHash, SourceHash: bundle.SourceHash,
		BundleHash: bundle.BundleHash, Entry: bundle.Entry, RendererBundle: bundle.RendererBundle,
		Files: files,
	}, nil
}

func desktopFrame(ctx context.Context, _ *mcp.CallToolRequest, _ childrenInput) (*mcp.CallToolResult, frameOutput, error) {
	m, ferr := demoMaster()
	if ferr != nil {
		return nil, frameOutput{}, fmt.Errorf("emit demo master: %s", ferr.Explanation)
	}
	child, br := honoemit.EmitDesktopChild(m)
	if br != nil {
		return nil, frameOutput{}, fmt.Errorf("emit desktop child: %s", br.Explanation)
	}
	res, available, reason := CaptureDemoFrame(ctx, child)
	if !available {
		// Graceful (ADR 0074): a host without xvfb/electron is not an error — the panel falls back
		// to the bundle's file tree (source:"demo") and shows the reason.
		return nil, frameOutput{Available: false, Reason: reason}, nil
	}
	return nil, frameOutput{
		Available:  true,
		JPEGBase64: base64.StdEncoding.EncodeToString(res.JPEG),
		Width:      res.Width, Height: res.Height,
		BundleHash: res.BundleHash, SourceHash: res.SourceHash, Project: res.Project,
	}, nil
}

// NewServer builds the desktop-preview MCP server. PURE tools (children/bundle) + the gated frame.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "desktop-preview", Version: "0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "desktop_children", Description: "Voir Electron: emit the master view's THREE distinct emitted children (web React / mobile Expo / desktop Electron) and return their content addresses + artifact paths. PURE projection of the emitted master, writes nothing (the wall)."}, desktopChildren)
	mcp.AddTool(srv, &mcp.Tool{Name: "desktop_bundle", Description: "Voir Electron: the launch-ready desktop bundle (the Electron child's relative file set + BundleHash) the Runner materialises and boots. PURE (desktoppreview.Plan), content-addressed, writes nothing."}, desktopBundle)
	mcp.AddTool(srv, &mcp.Tool{Name: "desktop_frame", Description: "Voir Electron: capture ONE frame of the running Electron desktop window (boots the emitted child headless under Xvfb, CDP screencast). HEAVY/host-dependent — the gated I/O exception. Returns available=false gracefully when the toolchain/display is absent (ADR 0074), never throws. Writes nothing (the wall)."}, desktopFrame)
	return srv
}

func artifactPaths(arts []honoemit.Artifact) []string {
	out := make([]string, len(arts))
	for i, a := range arts {
		out[i] = a.Path
	}
	return out
}

// masterSpec is the web spec for the demo (the web child is emitted from the SPEC, the desktop/
// mobile from the MASTER — honoemit's two entry shapes for the same shop slice).
func masterSpec() honoemit.WebAppSpec {
	return honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	}
}
