package functional

// funcemit_test.go — the FN01 mirror (written first, red before funcemit.go existed).
// It pins the spike's falsifiable claim and the go/no-go gate:
//
//   - TestByteParity*: the functional re-emitter reproduces the imperative emitter's
//     output BYTE-IDENTICALLY on the checkout slice's three targets (the S34
//     determinism is preserved under a functional style).
//   - TestReproducible: same input → same output over 100 replays (the PURITY /
//     reproducibility property — the determinism-first reproducibility mirror).
//   - TestNoGlobalMutableVar: the functional emitter introduces NO package-level
//     mutable `var` (the FN no-global mandate), checked structurally over its source.
//   - TestVerdictIsGo: the COMPUTED verdict, asserting the spike concludes GO only
//     when every gate holds (the gate is non-gameable — it reads bytes, not opinion).
//
// REPRODUCE: `cd spike/functional && go test ./...`.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestByteParityGo(t *testing.T) {
	if got := EmitFunctional(orderSlice()).Go; got != expectedGo {
		t.Fatalf("Go projection not byte-identical to imperative emitter.\n--- got ---\n%s\n--- want ---\n%s", got, expectedGo)
	}
}

func TestByteParityDDL(t *testing.T) {
	if got := EmitFunctional(orderSlice()).DDL; got != expectedDDL {
		t.Fatalf("DDL projection not byte-identical.\n--- got ---\n%s\n--- want ---\n%s", got, expectedDDL)
	}
}

func TestByteParityTS(t *testing.T) {
	if got := EmitFunctional(orderSlice()).TS; got != expectedTS {
		t.Fatalf("TS projection not byte-identical.\n--- got ---\n%s\n--- want ---\n%s", got, expectedTS)
	}
}

// TestReproducible is the reproducibility mirror: the pure pipeline must yield the
// EXACT same Projection on every one of 100 replays (no hidden state, no clock).
func TestReproducible(t *testing.T) {
	e := orderSlice()
	first := EmitFunctional(e)
	for i := 0; i < 100; i++ {
		if EmitFunctional(e) != first {
			t.Fatalf("replay %d diverged — pipeline is not pure", i)
		}
	}
}

// TestNoGlobalMutableVar parses funcemit.go and slice.go and asserts NO top-level
// `var` declaration exists (only `const`, `type`, `func`). A package-level `var` is
// mutable shared state — exactly what the FN mandate forbids. This is the structural
// proof the binding table is a returned value, not a global. Deterministic (AST walk,
// no LLM judgement).
func TestNoGlobalMutableVar(t *testing.T) {
	for _, name := range []string{"funcemit.go", "slice.go", "measure.go"} {
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, name, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, decl := range f.Decls {
			gd, ok := decl.(*ast.GenDecl)
			if ok && gd.Tok == token.VAR {
				t.Fatalf("%s declares a package-level `var` (global mutable state) — forbidden by the FN no-global mandate", name)
			}
		}
	}
}

// TestVerdictIsGo asserts the computed verdict over the live measure is GO — i.e. the
// spike's done-criterion ("an emitter CAN produce the slice in functional pure") holds.
func TestVerdictIsGo(t *testing.T) {
	m := computeMeasure(50)
	v := Decide(m)
	if !v.Go {
		t.Fatalf("verdict is NO-GO: %s", v.Rationale)
	}
	if !m.AllParity() || !m.Reproducible || m.GlobalMutableVars != 0 {
		t.Fatalf("measure gates not all satisfied: %+v", m)
	}
}

// TestConfinement asserts the spike imports nothing from back/ (module isolation, the
// wall): no import path contains "steph-frtech/aidos". Deterministic AST scan.
func TestConfinement(t *testing.T) {
	entries, _ := os.ReadDir(".")
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, e.Name(), nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", e.Name(), err)
		}
		for _, imp := range f.Imports {
			if strings.Contains(imp.Path.Value, "steph-frtech/aidos") {
				t.Fatalf("%s imports the real AIDOS module (%s) — breaks spike confinement", e.Name(), imp.Path.Value)
			}
		}
	}
	_ = filepath.Separator
}
