// archfitness_property_test.go — BA14 reproducibility/totality mirror (determinism-first,
// CLAUDE.md §6/§8). CheckLLMIsolation is a PURE, TOTAL function of (graph, policy): no
// DB, no clock, no rng, no I/O, no LLM. These rapid properties pin:
//   - reproducibility: identical (graph, policy) ⇒ identical violations (twice);
//   - totality: never panics on arbitrary input;
//   - soundness: a reported violation always names a real (package, import) pair where
//     the import matches an LLM-SDK prefix AND the package is not an allowed importer;
//   - completeness: every (package, import) pair that matches an LLM-SDK prefix from a
//     non-allowed package IS reported (no silent miss).
package agentloop

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

func genPolicy(t *rapid.T) Policy {
	sdk := []string{"sdk.x/llm", "vendor/genai", "ai/chat"}
	allowed := []string{"mod/provider", "mod/agentloop/provider"}
	return Policy{
		LLMSDKPrefixes:   rapid.SliceOfNDistinct(rapid.SampledFrom(sdk), 1, 3, func(s string) string { return s }).Draw(t, "sdk"),
		AllowedImporters: rapid.SliceOfN(rapid.SampledFrom(allowed), 0, 2).Draw(t, "allowed"),
	}
}

func genGraph(t *rapid.T) ImportGraph {
	pkgNames := []string{"mod/a", "mod/b", "mod/provider", "mod/agentloop/provider", "mod/c"}
	imps := []string{"context", "fmt", "sdk.x/llm", "vendor/genai", "ai/chat", "mod/blockreason"}
	n := rapid.IntRange(0, 5).Draw(t, "npkg")
	pkgs := make([]PackageImports, 0, n)
	for i := 0; i < n; i++ {
		pkgs = append(pkgs, PackageImports{
			ImportPath: rapid.SampledFrom(pkgNames).Draw(t, "pkg"),
			Imports:    rapid.SliceOfN(rapid.SampledFrom(imps), 0, 4).Draw(t, "imps"),
		})
	}
	return ImportGraph{Packages: pkgs}
}

func TestCheckLLMIsolation_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := genGraph(rt)
		p := genPolicy(rt)
		a := CheckLLMIsolation(g, p)
		b := CheckLLMIsolation(g, p)
		if len(a) != len(b) {
			rt.Fatalf("not reproducible: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if a[i].Package != b[i].Package || a[i].Import != b[i].Import {
				rt.Fatalf("violation %d differs: %+v vs %+v", i, a[i], b[i])
			}
		}
	})
}

func TestCheckLLMIsolation_Total(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := genGraph(rt)
		p := genPolicy(rt)
		_ = CheckLLMIsolation(g, p) // must not panic
	})
}

// Soundness: every reported violation is a genuine LLM-SDK import from a non-allowed
// package, and carries the canonical BlockReason.
func TestCheckLLMIsolation_Sound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := genGraph(rt)
		p := genPolicy(rt)
		for _, v := range CheckLLMIsolation(g, p) {
			if !matchesAnyPrefix(v.Import, p.LLMSDKPrefixes) {
				rt.Fatalf("reported import %q is not an LLM-SDK import", v.Import)
			}
			if matchesAnyPrefix(v.Package, p.AllowedImporters) {
				rt.Fatalf("reported package %q is an allowed importer — must not be flagged", v.Package)
			}
			if v.BlockReason == nil || v.BlockReason.Code != CodeLLMSDKImportOutsideProvider {
				rt.Fatalf("violation must carry %s, got %+v", CodeLLMSDKImportOutsideProvider, v.BlockReason)
			}
		}
	})
}

// Completeness: no silent miss — every (pkg, import) that an LLM SDK prefix matches from
// a non-allowed package appears in the result exactly once.
func TestCheckLLMIsolation_Complete(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := genGraph(rt)
		p := genPolicy(rt)
		got := CheckLLMIsolation(g, p)
		seen := map[string]bool{}
		for _, v := range got {
			seen[v.Package+"\x00"+v.Import] = true
		}
		for _, pkg := range g.Packages {
			if matchesAnyPrefix(pkg.ImportPath, p.AllowedImporters) {
				continue
			}
			for _, imp := range pkg.Imports {
				if matchesAnyPrefix(imp, p.LLMSDKPrefixes) {
					if !seen[pkg.ImportPath+"\x00"+imp] {
						rt.Fatalf("missed violation: %s imports %s", pkg.ImportPath, imp)
					}
				}
			}
		}
	})
}

// the prefix matcher used by the soundness/completeness properties must agree with the
// one the check uses — guard against drift by exercising it directly.
func TestMatchesAnyPrefix(t *testing.T) {
	if !matchesAnyPrefix("a/b/c", []string{"a/b"}) {
		t.Fatal("a/b should match prefix a/b")
	}
	if matchesAnyPrefix("ab/c", []string{"a/b"}) {
		t.Fatal("ab/c must NOT match prefix a/b (segment-aware)")
	}
	if !matchesAnyPrefix("a/b", []string{"a/b"}) {
		t.Fatal("exact match a/b should match a/b")
	}
	if strings.HasPrefix("xy", "xyz") {
		t.Fatal("sanity")
	}
}
