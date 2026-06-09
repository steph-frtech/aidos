// erasure_property_test.go — the S116 invariant mirror (∀, rapid): the reproducibility +
// determinism + irrecoverability band:
//   - Erase is REPRODUCIBLE: same (scope, cells, whenRef) ⇒ byte-identical result;
//   - selection is a deterministic scoped query (same scope/cells ⇒ same set);
//   - AFTER erasure, NO query returns the subject's PII — CROSS-PROJECT and CROSS-PLAN;
//   - the phase hash is INVARIANT under erasure (append-only preserved);
//   - a non-erased subject NEVER loses PII (scope is exact).
package erasure

import (
	"fmt"
	"testing"

	"pgregory.net/rapid"
)

// genCells draws a random multi-plan, multi-project, multi-subject PII landscape.
func genCells(t *rapid.T) []Cell {
	n := rapid.IntRange(0, 14).Draw(t, "n")
	cells := make([]Cell, 0, n)
	for i := 0; i < n; i++ {
		plan := rapid.SampledFrom(PLANS).Draw(t, "plan")
		subj := rapid.SampledFrom([]string{"s1", "s2", "s3"}).Draw(t, "subj")
		proj := rapid.SampledFrom([]string{"p1", "p2"}).Draw(t, "proj")
		app := ""
		if plan == PlanApp {
			app = rapid.SampledFrom([]string{"app1", "app2"}).Draw(t, "app")
		}
		np := rapid.IntRange(0, 3).Draw(t, "np")
		pii := make([]PiiCipher, 0, np)
		for j := 0; j < np; j++ {
			path := fmt.Sprintf("f%d", j)
			pii = append(pii, PiiCipher{
				Path:       path,
				Ciphertext: fmt.Sprintf("enc(%s.%s)", subj, path),
				KeyID:      "k-" + subj,
				Plaintext:  fmt.Sprintf("%s-%s-plain", subj, path),
			})
		}
		cells = append(cells, Cell{
			Plan: plan, Subject: subj, Project: proj, App: app,
			RowID: fmt.Sprintf("r%d", i), Structure: "shape", Pii: pii,
		})
	}
	return cells
}

// Erase is REPRODUCIBLE: same input ⇒ byte-identical result (determinism §6/§8).
func TestProp_EraseReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cells := genCells(t)
		scope := Scope{Plan: rapid.SampledFrom(PLANS).Draw(t, "p"), Subject: rapid.SampledFrom([]string{"s1", "s2", "s3"}).Draw(t, "s")}
		a := Erase(scope, cells, "ref")
		b := Erase(scope, cells, "ref")
		if a.Decision.ID != b.Decision.ID {
			t.Fatalf("decision id not reproducible: %s vs %s", a.Decision.ID, b.Decision.ID)
		}
		if len(a.Tombstoned) != len(b.Tombstoned) {
			t.Fatalf("tombstoned count not reproducible: %d vs %d", len(a.Tombstoned), len(b.Tombstoned))
		}
		for i := range a.Tombstoned {
			if a.Tombstoned[i].RowID != b.Tombstoned[i].RowID {
				t.Fatalf("tombstoned order not reproducible at %d", i)
			}
		}
	})
}

// AFTER erasure, NO query returns the subject's PII — cross-project AND cross-plan.
func TestProp_PiiIrrecoverableCrossProjectCrossPlan(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cells := genCells(t)
		subj := rapid.SampledFrom([]string{"s1", "s2", "s3"}).Draw(t, "subj")
		// Erase the subject under BOTH plans (a full subject erasure spans every plan it owns).
		post := cells
		for _, plan := range PLANS {
			post = ApplyErasure(Scope{Plan: plan, Subject: subj}, post)
		}
		// No PII of the subject is queryable anywhere — across every project and plan.
		if PiiVisible(subj, post) {
			t.Fatalf("subject %s PII still queryable after full erasure", subj)
		}
		// And the export is empty for the erased subject under every plan.
		for _, plan := range PLANS {
			for _, r := range Export(Scope{Plan: plan, Subject: subj}, post) {
				if len(r.Fields) != 0 {
					t.Fatalf("erased subject %s still exports %+v", subj, r)
				}
			}
		}
	})
}

// The phase hash is INVARIANT under erasure (append-only / DAG integrity preserved).
func TestProp_PhaseHashInvariantUnderErasure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cells := genCells(t)
		subj := rapid.SampledFrom([]string{"s1", "s2", "s3"}).Draw(t, "subj")
		before := PhaseHash(cells)
		post := cells
		for _, plan := range PLANS {
			post = ApplyErasure(Scope{Plan: plan, Subject: subj}, post)
		}
		if before != PhaseHash(post) {
			t.Fatal("phase hash changed under erasure (append-only broken)")
		}
		// The row count is preserved — nothing destroyed.
		if len(post) != len(cells) {
			t.Fatalf("row count changed: %d -> %d", len(cells), len(post))
		}
	})
}

// A NON-erased subject never loses PII — selection is exact (no over-shred).
func TestProp_NonErasedSubjectUntouched(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cells := genCells(t)
		target := "s1"
		post := cells
		for _, plan := range PLANS {
			post = ApplyErasure(Scope{Plan: plan, Subject: target}, post)
		}
		// Every OTHER subject keeps exactly its original PII visibility.
		for _, other := range []string{"s2", "s3"} {
			if PiiVisible(other, cells) != PiiVisible(other, post) {
				t.Fatalf("non-erased subject %s PII visibility changed", other)
			}
		}
	})
}

// Select and Export consume the SAME scoped query — export completeness equals erasure reach.
func TestProp_ExportReachEqualsEraseReach(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cells := genCells(t)
		scope := Scope{Plan: rapid.SampledFrom(PLANS).Draw(t, "p"), Subject: rapid.SampledFrom([]string{"s1", "s2", "s3"}).Draw(t, "s")}
		sel := Select(scope, cells)
		erased := Erase(scope, cells, "ref")
		if len(sel) != len(erased.Tombstoned) {
			t.Fatalf("select reach %d != erase reach %d", len(sel), len(erased.Tombstoned))
		}
	})
}
