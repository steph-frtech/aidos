// Package desktoppreview turns the EMITTED Electron desktop child (honoemit.DesktopChild) into a
// RUNNABLE, VIEWABLE bundle — the "voir Electron" capability. The desktop child is a real Electron
// app (main.js + preload.js + index.html + renderer.tsx + package.json + the embedded Expr/bridge
// twins); its SOURCE is emitted but, until now, there was no path to SEE its GUI. This package is
// that path: a PURE projection of the child's artifacts to a launch-ready file set (Plan), plus a
// gated I/O adapter (Runner) that boots the app headless under Xvfb and captures its window via the
// Chrome DevTools Protocol screencast — a browser-renderable JPEG frame (the "webVNC" of the GUI,
// no VNC server, no sudo).
//
// DETERMINISM-FIRST / THE WALL (§2/§6/§8). The split is the whole point:
//   - Plan is a PURE function of the DesktopChild: same child → same relative file set, same bytes,
//     same BundleHash (content address). It writes NO truth (below-the-line projection, §9) and is
//     covered by a reproducibility mirror (desktoppreview_property_test.go). The one launch-prep
//     transform — rewriting index.html's `./renderer.tsx` module ref to the esbuild output
//     `./renderer.js` — is itself pure and byte-stable, recorded in the Plan (never an LLM, never a
//     clock, never a guessed edit).
//   - Runner is the GATED EXCEPTION: a live OS process whose output (a JPEG of the rendered window)
//     is inherently non-deterministic I/O. It is isolated to the smallest surface (Frame), every
//     external binary is an INJECTED dependency (no discovery, no $PATH magic — reproducible wiring),
//     and it persists nothing. The Workbench polls Frame on demand and tears the session down — never
//     an always-on process destabilising prod.
//
// REUSE, DON'T REINVENT (ADR 0007). The emitted bytes are honoemit's, verbatim — this package never
// re-derives a single rule of the desktop view; it only PROJECTS the child to disk and STREAMS its
// rendered pixels. esbuild bundles the self-contained React renderer; Electron's built-in CDP gives
// the frames. The renderer carries a deterministic `given` seed, so the window renders the real
// panel grid + action bar out of the box even with no emitted backend running (an honest shell).
package desktoppreview

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// File is one materialised file of the runnable bundle: a path RELATIVE to the bundle root (the
// emitted `gen/<project>/desktop/` prefix stripped) and its verbatim bytes.
type File struct {
	Path  string `json:"path"`
	Bytes []byte `json:"-"`
}

// Bundle is the launch-ready projection of a DesktopChild: the relative file set (path-sorted),
// the content address of the whole set (BundleHash), and the child's own source hash carried
// through. A Bundle is PURE data — writing it to disk (WriteTo) and running it (Runner) are
// separate, gated steps.
type Bundle struct {
	Project    string `json:"project"`
	MasterHash string `json:"master_hash"`
	SourceHash string `json:"source_hash"`
	// Entry is the relative path Electron's package.json "main" points at (always "main.js" for the
	// desktop child) — the launch entry the Runner invokes.
	Entry string `json:"entry"`
	// RendererEntry is the relative TSX the launch-prep step bundles (esbuild) into RendererBundle.
	RendererEntry string `json:"renderer_entry"`
	// RendererBundle is the relative JS path index.html is rewritten to load (the esbuild output the
	// Runner writes next to the sources). Recorded here so the rewrite is part of the pure Plan.
	RendererBundle string `json:"renderer_bundle"`
	Files          []File `json:"files"`
	BundleHash     string `json:"bundle_hash"`
}

const (
	// desktopEntry is the Electron main process the package.json "main" field pins.
	desktopEntry = "main.js"
	// rendererEntry is the emitted renderer the launch-prep step bundles.
	rendererEntry = "renderer.tsx"
	// rendererBundle is the esbuild output index.html is rewritten to load (so the renderer's bare
	// `import "react"` specifiers resolve at launch — a browser/Electron renderer cannot execute TSX
	// nor bare module specifiers directly). The name is fixed → the rewrite is byte-stable.
	rendererBundle = "renderer.js"
)

// Plan projects a DesktopChild into a launch-ready Bundle. PURE: no I/O, no clock, no RNG. It
//   - strips the emitted `gen/<project>/desktop/` directory prefix to a bundle-relative path,
//   - rewrites index.html's `<script ... src="./renderer.tsx">` to `./renderer.js` (the esbuild
//     output the Runner will produce) — the ONE launch-prep transform, byte-stable,
//   - path-sorts the file set and content-addresses the whole bundle.
//
// An empty/non-projectable child is a typed BlockReason, never a partial bundle (honesty §8).
func Plan(child honoemit.DesktopChild) (Bundle, *blockreason.BlockReason) {
	if len(child.Artifacts) == 0 {
		return Bundle{}, blockEmpty("la vue desktop émise ne porte AUCUN artefact — il n'y a rien à matérialiser ni à lancer.")
	}

	files := make([]File, 0, len(child.Artifacts))
	var sawEntry, sawRenderer, sawIndex bool
	for _, a := range child.Artifacts {
		rel := relPath(a.Path)
		if rel == "" {
			return Bundle{}, blockEmpty(fmt.Sprintf("le chemin d'artefact %q n'a aucune composante relative au desktop.", a.Path))
		}
		bytesOut := a.Bytes
		switch rel {
		case desktopEntry:
			sawEntry = true
		case rendererEntry:
			sawRenderer = true
		case "index.html":
			sawIndex = true
			bytesOut = rewriteIndexRendererRef(bytesOut)
		}
		files = append(files, File{Path: rel, Bytes: bytesOut})
	}
	if !sawEntry || !sawRenderer || !sawIndex {
		return Bundle{}, blockEmpty("la vue desktop émise manque un fichier critique au lancement (main.js, renderer.tsx, index.html) — l'enfant Electron complet est requis.")
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })

	return Bundle{
		Project:        projectOf(child.Artifacts),
		MasterHash:     child.MasterHash,
		SourceHash:     child.Artifacts[0].SourceHash,
		Entry:          desktopEntry,
		RendererEntry:  rendererEntry,
		RendererBundle: rendererBundle,
		Files:          files,
		BundleHash:     hashFiles(files),
	}, nil
}

// blockEmpty renders the typed refusal for a non-projectable desktop child. Like honoemit's
// blockDesktop it uses CodeOutOfScope (the source is outside what projects to a runnable bundle),
// carries a non-empty French how_to_fix (no prison), and never returns a partial bundle (honesty §8).
func blockEmpty(detail string) *blockreason.BlockReason {
	return &blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Aperçu DESKTOP (Electron) impossible : " + detail,
		HowToFix: []string{
			"emit_the_desktop_child : émettez d'abord l'enfant desktop complet (EmitDesktopChild) depuis une vue maître projetable.",
			"complete_the_master : la maître doit porter ≥1 section ou ≥1 action — un enfant Electron vide ne se lance pas.",
		},
	}
}

// relPath returns the bundle-relative path of an emitted artifact path: everything after the last
// `/desktop/` segment (the emitted prefix is gen/<project>/desktop/). If the path has no such
// segment it falls back to the base name; an empty result signals a bad path.
func relPath(p string) string {
	const marker = "/desktop/"
	if i := strings.LastIndex(p, marker); i >= 0 {
		return strings.TrimPrefix(p[i+len(marker):], "/")
	}
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}

// projectOf extracts the <project> segment from an emitted artifact path of the canonical shape
// gen/<project>/desktop/<file>. Falls back to "" if the shape differs (the Bundle still runs — the
// project name is a label, not a launch dependency).
func projectOf(arts []honoemit.Artifact) string {
	if len(arts) == 0 {
		return ""
	}
	parts := strings.Split(arts[0].Path, "/")
	for i, p := range parts {
		if p == "desktop" && i > 0 {
			return parts[i-1]
		}
	}
	return ""
}

// rewriteIndexRendererRef swaps the emitted `<script type="module" src="./renderer.tsx">` for the
// esbuild output `./renderer.js`. PURE + byte-stable: a literal string replace of the one known
// emitted ref. If the emitted ref ever changes shape this is a no-op (the Runner's launch then
// surfaces it) — we never guess.
func rewriteIndexRendererRef(html []byte) []byte {
	return []byte(strings.ReplaceAll(string(html), "./"+rendererEntry, "./"+rendererBundle))
}

// hashFiles content-addresses the whole bundle: sha256 over each path-sorted file's path + a NUL +
// its bytes + a record separator. Deterministic: same files → same hash (the reproducibility mirror
// asserts it).
func hashFiles(files []File) string {
	h := sha256.New()
	for _, f := range files {
		h.Write([]byte(f.Path))
		h.Write([]byte{0})
		h.Write(f.Bytes)
		h.Write([]byte{0x1e})
	}
	return hex.EncodeToString(h.Sum(nil))
}
