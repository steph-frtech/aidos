package generators_test

// Fixture mirror (N2: state entity AST → command Project/Emit → events Artifacts).
// reflects=runtime.generators.{Emit,Project}, test_kind=fixture,
// cert_language=operation-dsl/go, liveness=live, authority=below.
//
// This is the Go interpreter of tests/runtime/emitters.fixture.md — the lien
// porteur. Each sub-test mirrors one fixture row by row. THE done criteria:
//   - the same source ⇒ byte-identical output (Fixture B);
//   - gen/ is never hand-edited — a hand-edit cannot survive a re-emit (Fixture D).

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// Fixture A — one source → three projections, each content-addressed + protected.
func TestFixtureA_EmitAcrossTargets(t *testing.T) {
	order := generators.ExampleOrder()
	arts, br := generators.Project([]generators.EntitySource{order}, generators.Targets())
	if br != nil {
		t.Fatalf("Project returned a BlockReason on a well-formed entity: %+v", br)
	}
	if len(arts) != 3 {
		t.Fatalf("want 3 artifacts (one per target), got %d", len(arts))
	}
	wantSourceBody, err := generators.SourceBody(order)
	if err != nil {
		t.Fatalf("SourceBody: %v", err)
	}
	wantSourceHash := generators.HashForTest(wantSourceBody)

	seen := map[generators.Target]bool{}
	for _, a := range arts {
		seen[a.Target] = true
		if a.SourceHash != wantSourceHash {
			t.Errorf("target %s: source_hash %q != Hash(Canonicalize(body)) %q", a.Target, a.SourceHash, wantSourceHash)
		}
		head := string(a.Bytes)
		if !strings.Contains(head, generators.ProtectedMarker) {
			t.Errorf("target %s: header missing protected marker %q", a.Target, generators.ProtectedMarker)
		}
		if !strings.Contains(head, a.SourceHash) {
			t.Errorf("target %s: header missing source hash", a.Target)
		}
		if !a.Protected {
			t.Errorf("target %s: artifact not marked protected", a.Target)
		}
	}
	for _, want := range generators.Targets() {
		if !seen[want] {
			t.Errorf("missing projection for target %s", want)
		}
	}
	// go-sqlc/pg-ddl land under back/gen/, ts-types under front/web/.
	for _, a := range arts {
		switch a.Target {
		case generators.TargetGoSqlc, generators.TargetPgDDL:
			if !strings.HasPrefix(a.Path, "back/gen/") {
				t.Errorf("target %s: path %q not under back/gen/", a.Target, a.Path)
			}
		case generators.TargetTSTypes:
			if !strings.HasPrefix(a.Path, "front/web/") {
				t.Errorf("target %s: path %q not under front/web/", a.Target, a.Path)
			}
		}
	}
}

// Fixture B — THE done criterion: the same source gives byte-identical output.
func TestFixtureB_ByteIdentical(t *testing.T) {
	order := generators.ExampleOrder()
	a, bra := generators.Emit(order, generators.TargetGoSqlc)
	b, brb := generators.Emit(order, generators.TargetGoSqlc)
	if bra != nil || brb != nil {
		t.Fatalf("Emit blocked a well-formed entity: %v %v", bra, brb)
	}
	if !bytes.Equal(a.Bytes, b.Bytes) {
		t.Errorf("same source did NOT give byte-identical output:\n--- a ---\n%s\n--- b ---\n%s", a.Bytes, b.Bytes)
	}
	if a.OutputHash != b.OutputHash {
		t.Errorf("output_hash differs across re-emit: %q != %q", a.OutputHash, b.OutputHash)
	}
}

// Fixture C — a changed source yields a new output and a new source_hash (no drift).
func TestFixtureC_ChangedSourceNewHash(t *testing.T) {
	before, _ := generators.Emit(generators.ExampleOrder(), generators.TargetTSTypes)
	after, br := generators.Emit(generators.ExampleOrderChanged(), generators.TargetTSTypes)
	if br != nil {
		t.Fatalf("Emit blocked the changed entity: %+v", br)
	}
	if after.SourceHash == before.SourceHash {
		t.Errorf("changed source kept the old source_hash %q (silent drift)", before.SourceHash)
	}
	if bytes.Equal(after.Bytes, before.Bytes) {
		t.Errorf("changed source produced identical bytes")
	}
	// The prior artifact's bytes are still valid (append-only) and now stale: its
	// source_hash no longer equals the new head's source_hash.
	if !generators.Drifted(before.OutputHash, after.Bytes) {
		t.Errorf("the new bytes should differ from the prior output_hash (stale relative to head)")
	}
}

// Fixture D — THE second done criterion: a hand-edited gen/ file cannot survive a
// re-emit; the drift is computable.
func TestFixtureD_HandEditDoesNotSurvive(t *testing.T) {
	order := generators.ExampleOrder()
	emitted, _ := generators.Emit(order, generators.TargetGoSqlc)
	h0 := emitted.OutputHash

	tampered := append([]byte("// sneaky hand-edit\n"), emitted.Bytes...)
	if !generators.Drifted(h0, tampered) {
		t.Errorf("hand-edit not detected as drift (ledger output_hash %q == tampered hash)", h0)
	}

	reEmitted, _ := generators.Emit(order, generators.TargetGoSqlc)
	if reEmitted.OutputHash != h0 {
		t.Errorf("re-emit did not reproduce the original output_hash: %q != %q", reEmitted.OutputHash, h0)
	}
	if generators.Drifted(reEmitted.OutputHash, reEmitted.Bytes) {
		t.Errorf("re-emitted bytes drift from their own output_hash (impossible)")
	}
	if generators.Drifted(h0, reEmitted.Bytes) {
		t.Errorf("the hand-edit survived a re-emit (gen/ is never hand-edited)")
	}
}

// Fixture E — an entity field the AST does not pin is never invented.
func TestFixtureE_NoInventedField(t *testing.T) {
	thin := generators.ExampleThin()
	a, br := generators.Emit(thin, generators.TargetGoSqlc)
	if br != nil {
		t.Fatalf("Emit blocked the thin entity: %+v", br)
	}
	body := string(a.Bytes)
	if !strings.Contains(body, "Id") {
		t.Errorf("the pinned field id is missing from the projection:\n%s", body)
	}
	for _, invented := range []string{"Total", "Discount", "CreatedAt", "Name"} {
		if strings.Contains(body, invented) {
			t.Errorf("invented field %q appears though the AST does not pin it:\n%s", invented, body)
		}
	}
}

// Fixture F — a malformed/empty AST yields a BlockReason, never a panic, never an
// invented field.
func TestFixtureF_MalformedYieldsBlockReason(t *testing.T) {
	_, br := generators.Project([]generators.EntitySource{generators.ExampleBroken()}, []generators.Target{generators.TargetGoSqlc})
	if br == nil {
		t.Fatalf("malformed entity did NOT yield a BlockReason")
	}
	if len(br.HowToFix) == 0 {
		t.Errorf("BlockReason is a prison (empty how_to_fix)")
	}
}
