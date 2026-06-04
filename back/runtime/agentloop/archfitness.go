// Package agentloop holds the deterministic ARCH-FITNESS rule that makes "the LLM is
// isolated to ONE gated exception" an ENFORCED architectural invariant — not 25
// repetitions of prose (BA14). The rule (CheckLLMIsolation) is the depguard /
// go-arch-lint equivalent expressed as a PURE Go function: given the module's import
// graph + the declared Policy, it returns every package OTHER than the single allowed
// importer (back/runtime/agentloop/provider*) that imports an LLM SDK.
//
// WHY A RULE, NOT PROSE (the BA14 gap J2). Across the build-agent track the
// determinism-first SKILL keeps asserting "the LLM is the gated exception, isolated to
// one place". Asserted as prose, a later step could quietly sprinkle a SECOND live LLM
// call somewhere and every per-step "determinism-first ✓" would still pass. This rule
// turns that aspiration into a build-time guard: a second LLM-SDK import ANYWHERE but
// provider* flips the rule red. The fault-injection mirror (archfitness_fixture_test.go)
// proves the rule fires.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). An import-graph check IS a pure function — an
// AST/import scan, exactly the deterministic family depguard belongs to — so it MUST be
// code, never an "LLM that reads the imports". CheckLLMIsolation is pure and total: same
// (graph, policy) ⇒ same violations, no DB / clock / rng / I/O / LLM. ScanModule is the
// authoritative deterministic builder of the live graph (go/parser over the package
// tree); it does I/O (reads .go files) but is itself deterministic over a fixed tree.
// The reproducibility mirror (archfitness_property_test.go) pins purity.
//
// THE WALL (CLAUDE.md §2). This package WRITES NO TRUTH. The Policy is the
// above-the-line INTENT ("one single LLM function") projected to a below-the-line
// deterministic check; the rule reports, it never edits the kernel. Widening the policy
// (allowing a second importer) is a truth change that goes idée → miroir → /goal, never
// a silent edit here.
package agentloop

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// CodeLLMSDKImportOutsideProvider is the BA14 architectural-invariant violation code: a
// package other than the single allowed importer imports an LLM SDK. It is the
// arch-fitness analogue of the wall's per-action codes — declared here (this is an
// arch-fitness rule, not a per-action gate); the rule reports it on every offending
// import.
const CodeLLMSDKImportOutsideProvider blockreason.Code = "LLM_SDK_IMPORT_OUTSIDE_PROVIDER"

// blockReasonFor builds the canonical actionable refusal for the BA14 invariant. It is a
// local, pure constructor (the closed blockreason registry owns the per-action codes;
// this arch-fitness code lives with its rule) — code, severity, explanation, non-empty
// how_to_fix (never a prison, KRD §44.5).
func blockReasonFor(pkg, imp, allowed string) *blockreason.BlockReason {
	return &blockreason.BlockReason{
		Code:     CodeLLMSDKImportOutsideProvider,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Refus de l'arch-fitness — invariant « une seule fonction LLM » : le paquet " +
			pkg + " importe un SDK LLM (" + imp + "). Seul " + allowed + " peut importer le " +
			"SDK LLM — le LLM est l'EXCEPTION gatée, isolée à un seul endroit (CLAUDE.md §6/§8). " +
			"Un 2ᵉ point d'appel LLM ailleurs ferait passer chaque « determinism-first ✓ » par-pas " +
			"tout en saupoudrant un second LLM ; cette règle le refuse au build.",
		HowToFix: []string{
			"route_through_provider : faites passer tout appel LLM par le paquet provider (" + allowed + ") — l'unique exception gatée ; les autres paquets consomment son interface, pas le SDK.",
			"prefer_deterministic : si l'usage peut être une fonction pure (parse/diff/score/render…), il DOIT l'être (determinism-first) — pas un appel LLM de plus.",
			"widen_via_goal : pour autoriser un 2ᵉ importateur, c'est un changement de vérité (idée → miroir → /goal → approbation) ; jamais un élargissement silencieux de la policy.",
		},
	}
}

// Policy is the BA14 architectural invariant declared as DATA: which import prefixes are
// LLM SDKs, and the single set of packages allowed to import them (the provider, the
// gated exception). It is the above-the-line intent the deterministic rule enforces.
type Policy struct {
	// LLMSDKPrefixes are the import-path prefixes treated as an LLM SDK (e.g.
	// github.com/anthropics/anthropic-sdk-go). A package importing any of these is an
	// LLM consumer.
	LLMSDKPrefixes []string `json:"llm_sdk_prefixes"`
	// AllowedImporters are the package-path prefixes permitted to import an LLM SDK — the
	// single gated exception (back/runtime/agentloop/provider and its sub-packages).
	AllowedImporters []string `json:"allowed_importers"`
}

// PackageImports is one node of the import graph: a package's import path and the import
// paths it pulls in.
type PackageImports struct {
	ImportPath string   `json:"import_path"`
	Imports    []string `json:"imports"`
}

// ImportGraph is the module's import graph — the input the rule checks. Built
// deterministically from disk by ScanModule, or supplied directly by a fixture.
type ImportGraph struct {
	Packages []PackageImports `json:"packages"`
}

// Violation is one breach of the BA14 invariant: a Package (not an allowed importer) that
// imports an LLM SDK (Import), with the actionable BlockReason.
type Violation struct {
	Package     string                   `json:"package"`
	Import      string                   `json:"import"`
	BlockReason *blockreason.BlockReason `json:"block_reason"`
}

// matchesAnyPrefix reports whether path is covered by any of prefixes, SEGMENT-AWARE: a
// prefix matches iff path equals it or path == prefix + "/" + rest. So "a/b" matches
// "a/b" and "a/b/c" but NOT "ab/c" (a raw strings.HasPrefix would wrongly match the
// latter). Pure and total.
func matchesAnyPrefix(path string, prefixes []string) bool {
	for _, p := range prefixes {
		if p == "" {
			continue
		}
		if path == p || strings.HasPrefix(path, p+"/") {
			return true
		}
	}
	return false
}

// allowedImporterFor returns the first AllowedImporter that covers pkg, or the first
// declared allowed importer (for the message) when none — used only to name the door in
// the BlockReason. Pure.
func allowedImporterFor(p Policy) string {
	if len(p.AllowedImporters) > 0 {
		return p.AllowedImporters[0]
	}
	return "back/runtime/agentloop/provider"
}

// CheckLLMIsolation is the PURE, TOTAL arch-fitness rule. It returns one Violation for
// every (package, import) pair where the import matches an LLM-SDK prefix AND the package
// is NOT an allowed importer. The result is in graph order (packages as given, then
// imports as given) so it is deterministic and stable: same (graph, policy) ⇒ same
// violations. An empty result means the invariant holds (the build is green).
func CheckLLMIsolation(g ImportGraph, p Policy) []Violation {
	var out []Violation
	allowedName := allowedImporterFor(p)
	for _, pkg := range g.Packages {
		if matchesAnyPrefix(pkg.ImportPath, p.AllowedImporters) {
			continue // the single gated exception — importing the SDK here is allowed
		}
		for _, imp := range pkg.Imports {
			if matchesAnyPrefix(imp, p.LLMSDKPrefixes) {
				out = append(out, Violation{
					Package:     pkg.ImportPath,
					Import:      imp,
					BlockReason: blockReasonFor(pkg.ImportPath, imp, allowedName),
				})
			}
		}
	}
	return out
}

// ScanModule is the authoritative DETERMINISTIC builder of the live import graph — the
// depguard-equivalent scan. It walks the package tree rooted at dir (a filesystem path),
// parses every .go file's import block with go/parser (imports only — fast, no type
// check), and maps each directory to the module import path
// modulePrefix + "/" + relDir. Test files (_test.go) are EXCLUDED — the invariant
// constrains production code, and the BA14 mirrors themselves reference SDK prefixes as
// string literals (never imports). Same tree ⇒ same graph (deterministic over a fixed
// tree); the only I/O is reading the .go files.
func ScanModule(dir, modulePrefix string) (ImportGraph, error) {
	root, err := filepath.Abs(dir)
	if err != nil {
		return ImportGraph{}, err
	}
	byPkg := map[string]map[string]bool{}
	walkErr := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			// skip vendored / hidden / testdata trees — not part of the invariant surface.
			name := d.Name()
			if path != root && (name == "vendor" || name == "testdata" || strings.HasPrefix(name, ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		rel, err := filepath.Rel(root, filepath.Dir(path))
		if err != nil {
			return err
		}
		pkgPath := modulePrefix
		if rel != "." {
			pkgPath = modulePrefix + "/" + filepath.ToSlash(rel)
		}
		fset := token.NewFileSet()
		f, perr := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if perr != nil {
			return perr
		}
		if byPkg[pkgPath] == nil {
			byPkg[pkgPath] = map[string]bool{}
		}
		for _, spec := range f.Imports {
			imp := strings.Trim(spec.Path.Value, `"`)
			byPkg[pkgPath][imp] = true
		}
		return nil
	})
	if walkErr != nil {
		return ImportGraph{}, walkErr
	}

	// Materialize a STABLE graph: packages sorted by import path, imports sorted — so the
	// scan is deterministic regardless of filesystem walk order.
	pkgPaths := make([]string, 0, len(byPkg))
	for k := range byPkg {
		pkgPaths = append(pkgPaths, k)
	}
	sort.Strings(pkgPaths)
	pkgs := make([]PackageImports, 0, len(pkgPaths))
	for _, pp := range pkgPaths {
		imps := make([]string, 0, len(byPkg[pp]))
		for imp := range byPkg[pp] {
			imps = append(imps, imp)
		}
		sort.Strings(imps)
		pkgs = append(pkgs, PackageImports{ImportPath: pp, Imports: imps})
	}
	return ImportGraph{Packages: pkgs}, nil
}

// DefaultPolicy is the live BA14 invariant for the AIDOS back/ module: the LLM-SDK
// prefixes AIDOS would use (none imported yet — the build-agent track has not wired a
// real SDK), and the single gated exception package. It is exported so the arch-fitness
// runner, the CLI, and the Workbench panel share ONE declared policy (never re-typed).
func DefaultPolicy() Policy {
	return Policy{
		LLMSDKPrefixes: []string{
			"github.com/anthropics/anthropic-sdk-go",
			"github.com/openai/openai-go",
			"google.golang.org/genai",
			"github.com/sashabaranov/go-openai",
		},
		AllowedImporters: []string{
			"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
		},
	}
}
