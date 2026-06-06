package generators_test

// Purity mirror (∀ invariants, rapid) — FN03, the EMITTED-functional mandate (ADR 0036).
// reflects=runtime.generators.{Emit,Project}, test_kind=property, cert_language=rapid,
// liveness=live, authority=below (computational — MEANS-tests toward the human red).
//
// FN02 (ADR 0036) graves three EMITTED invariants; this mirror is FN03's executable
// proof of the purity facet (FN04 adds the fail-closed arch-fitness gates over back/gen/):
//
//  P1. EMITTED_FUNCTION_PURE (re-émission byte-identique) — re-emitting the SAME entity
//      N times yields byte-identical output on every target; a pure emitter has no hidden
//      state, so its output is a function of its input alone (the S34 determinism, rejoué
//      N fois, not just twice). Output is also INPUT-PURE: Emit never mutates the caller's
//      field slice (no aliasing into shared mutable state).
//
//  P2. EMITTED_NO_GLOBAL_MUTABLE (sur le code émis) — every emitted Go projection, parsed
//      as a Go AST, declares ZERO package-level mutable `var`: only const/type/import/func
//      (a struct + its pgtype import). A future emitter that leaks a module-level `var x`
//      into gen/ turns this red — fail-closed, deterministic (an AST walk, never an LLM
//      "is this functional?" judgement, CLAUDE.md §8 determinism-first).
//
//  P3. EMITTED_FUNCTION_PURE (pas d'I/O ni d'état dans la sortie) — the emitted Go has no
//      package-level `init()` (hidden startup effect) and no mutable global, so each emitted
//      symbol is a pure value/type; same input → same output holds structurally, not by luck.
//
// These hold over the SAME closed entity-AST surface as the S34 emitter property mirror;
// the purity facet is additive (the méta-loop only ADDs a guard, §5), it removes nothing.

import (
	"bytes"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/generators"
	"pgregory.net/rapid"
)

// reEmitRounds is the number of independent re-emissions P1 compares. A pure emitter is
// byte-stable across ALL of them (not merely twice — the spike rejoued the pipeline to
// expose any hidden accumulator; we keep that rigor). Declared, not random.
const reEmitRounds = 16

// P1 — EMITTED_FUNCTION_PURE: re-emission is byte-identical over many rounds, and Emit
// never mutates the caller's field slice (input purity).
func TestProp_Emitted_ReEmissionByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		tg := genTarget().Draw(t, "target")

		// Snapshot the caller's fields to detect any in-place mutation (aliasing into
		// shared mutable state would break purity even if output looked stable).
		before := append([]generators.Field(nil), e.Fields...)

		first, br := generators.Emit(e, tg)
		if br != nil {
			t.Fatalf("well-formed entity blocked: %v", br)
		}
		for round := 0; round < reEmitRounds; round++ {
			again, brA := generators.Emit(e, tg)
			if brA != nil {
				t.Fatalf("round %d blocked: %v", round, brA)
			}
			if !bytes.Equal(first.Bytes, again.Bytes) {
				t.Fatalf("EMITTED_FUNCTION_PURE violated: re-emission round %d not byte-identical for %+v target %s", round, e, tg)
			}
			if first.OutputHash != again.OutputHash {
				t.Fatalf("output_hash drifted on re-emission round %d", round)
			}
		}

		if len(e.Fields) != len(before) {
			t.Fatalf("Emit mutated the caller's field slice length (%d != %d)", len(e.Fields), len(before))
		}
		for i := range before {
			if e.Fields[i] != before[i] {
				t.Fatalf("Emit mutated the caller's field[%d] (input not pure): %+v != %+v", i, e.Fields[i], before[i])
			}
		}
	})
}

// P2 + P3 — EMITTED_NO_GLOBAL_MUTABLE: the emitted Go projection, parsed as an AST,
// declares no package-level mutable `var` and no init() (hidden effect). Deterministic
// AST walk, fail-closed: a parse failure or any module-level var/init is red.
func TestProp_Emitted_NoGlobalMutableVar(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		// Only the Go target carries Go declarations to inspect (DDL/TS are not Go).
		art, br := generators.Emit(e, generators.TargetGoSqlc)
		if br != nil {
			t.Fatalf("well-formed entity blocked: %v", br)
		}
		assertEmittedGoIsPure(t, art.Bytes)
	})
}

// assertEmittedGoIsPure parses emitted Go source and fails the property if it declares
// ANY package-level mutable `var` or an `init()` function. This is the deterministic,
// fail-closed purity gate the FN04 arch-fitness rule will run over back/gen/; here it
// proves the EMITTER cannot produce a violating projection in the first place.
func assertEmittedGoIsPure(t *rapid.T, src []byte) {
	t.Helper()
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "emitted.go", src, parser.SkipObjectResolution)
	if err != nil {
		// Fail-closed: emitted Go that does not even parse cannot be certified pure.
		t.Fatalf("emitted Go does not parse (fail-closed): %v\n--- source ---\n%s", err, src)
	}
	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			if d.Tok == token.VAR {
				t.Fatalf("EMITTED_NO_GLOBAL_MUTABLE violated: emitted Go declares a package-level `var`\n--- source ---\n%s", src)
			}
		case *ast.FuncDecl:
			if d.Recv == nil && d.Name != nil && d.Name.Name == "init" {
				t.Fatalf("EMITTED_FUNCTION_PURE violated: emitted Go declares init() (hidden startup effect)\n--- source ---\n%s", src)
			}
		}
	}
}

// P4 — EMITTER reformed to pure-functional style (FN03 deliverable, ADR 0036 §Contexte /
// §Conséquences "FN03 reformera l'émetteur pour produire du pur"). The emitter's own
// rendering surface (emit.go) must hold NO package-level mutable binding-table `var`:
// the closed type table is a value RETURNED by a pure constructor (typeBindings()) and
// threaded explicitly, not a module-level `var typeMap = …` accumulator. This is the
// determinism-first reform proven by the FN01 spike, made authoritative here.
//
// RED-FIRST: against the pre-FN03 emitter (which holds `var typeMap = map[string]…`),
// this is red; after the reform it is green. Deterministic AST walk over the source
// file — fail-closed, never an LLM judgement (CLAUDE.md §8).
//
// SCOPE NOTE (ADR 0036 §3): the EMITTED tree (back/gen/) is what the mandate binds; this
// test additionally pins the renderer surface emit.go because FN03's concrete deliverable
// is the functional reform that REMOVES the shared global. It inspects ONLY emit.go's
// binding table, not the whole AIDOS engine (targetOrder etc. in generators.go are
// out of this mandate's scope and untouched).
func TestEmitterRendererHoldsNoMutableBindingTable(t *testing.T) {
	src, err := os.ReadFile(filepath.Join("emit.go"))
	if err != nil {
		t.Fatalf("read emit.go: %v", err)
	}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "emit.go", src, parser.SkipObjectResolution)
	if err != nil {
		t.Fatalf("parse emit.go (fail-closed): %v", err)
	}
	for _, decl := range file.Decls {
		gd, ok := decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.VAR {
			continue
		}
		for _, spec := range gd.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for _, n := range vs.Names {
				t.Fatalf("EMITTER not reformed: emit.go declares a package-level mutable `var %s` "+
					"(the closed type table must be RETURNED by a pure constructor and threaded by value, "+
					"never a module-level accumulator — ADR 0036, FN01 spike)", n.Name)
			}
		}
	}
	// Belt-and-braces: the reformed emitter exposes a pure constructor, not a global.
	// (The AST walk above is authoritative; this guards a literal `var typeMap =`
	// declaration line — comments mentioning the former global are not matched.)
	for _, line := range strings.Split(string(src), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "var typeMap") {
			t.Fatalf("EMITTER not reformed: a `var typeMap` declaration is still present in emit.go")
		}
	}
}

// P1 (Project facet) — re-projecting the same source set is byte-identical across rounds,
// covering the full fan-out (the composition of the renderers, not just one Emit).
func TestProp_Emitted_ProjectByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		first, br := generators.Project([]generators.EntitySource{e}, generators.Targets())
		if br != nil {
			t.Fatalf("project blocked: %v", br)
		}
		for round := 0; round < reEmitRounds; round++ {
			again, brA := generators.Project([]generators.EntitySource{e}, generators.Targets())
			if brA != nil {
				t.Fatalf("project round %d blocked: %v", round, brA)
			}
			if len(first) != len(again) {
				t.Fatalf("project artifact count drifted on round %d", round)
			}
			for i := range first {
				if !bytes.Equal(first[i].Bytes, again[i].Bytes) {
					t.Fatalf("EMITTED_FUNCTION_PURE violated: Project round %d target %s not byte-identical", round, first[i].Target)
				}
			}
		}
	})
}
