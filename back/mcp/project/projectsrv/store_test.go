package projectsrv

// store_test.go — the pure reader mirror for the project Store row-decoding (reflects=
// mcp.project, test_kind=unit, liveness=live). No Postgres: fromRow is a pure function of
// (id, body bytes). It pins the found-by-running fix: a jsonb body stored as a STRING SCALAR
// (the legacy V3 double-encoded write) decodes to the SAME Project as the canonical OBJECT
// body. The reader is tolerant so project_list / project_create (which reads Heads first)
// stop failing on a single legacy row.

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/project"
)

// canonicalObjectBody is a correct project body (a JSON object), the shape the Go store and
// the fixed V3 writer produce.
const canonicalObjectBody = `{"created_at":"2026-06-16T00:00:00Z","kind":"project","lifecycle":"active","name":"Toto","owner_ref":"workbench-human","slug":"toto"}`

// doubleEncodedBody is the SAME object wrapped as a JSON string scalar — the bug pgx reads
// back from a double-encoded jsonb column.
func doubleEncodedBody(t *testing.T) []byte {
	t.Helper()
	b, err := json.Marshal(canonicalObjectBody) // marshals the object-text into a quoted string
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

func TestFromRow_DecodesCanonicalObject(t *testing.T) {
	p, err := fromRow("id-1", []byte(canonicalObjectBody))
	if err != nil {
		t.Fatalf("canonical object body must decode: %v", err)
	}
	if p.Slug != "toto" || p.Name != "Toto" || p.OwnerRef != "workbench-human" || p.Lifecycle != project.Lifecycle("active") {
		t.Fatalf("decoded = %+v, want the canonical fields", p)
	}
}

// TestFromRow_HealsDoubleEncodedString is the found-by-running mirror: a string-scalar body
// decodes to the SAME Project as the object body (no "cannot unmarshal string" error).
func TestFromRow_HealsDoubleEncodedString(t *testing.T) {
	want, err := fromRow("id-1", []byte(canonicalObjectBody))
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	got, err := fromRow("id-1", doubleEncodedBody(t))
	if err != nil {
		t.Fatalf("double-encoded string body must heal, got: %v", err)
	}
	if got != want {
		t.Fatalf("healed = %+v, want = %+v (same Project regardless of encoding)", got, want)
	}
}

// TestUnwrapJSONString_ObjectUntouched: a genuine object is returned byte-identical (the
// normaliser only unwraps a leading string scalar).
func TestUnwrapJSONString_ObjectUntouched(t *testing.T) {
	in := []byte(canonicalObjectBody)
	if got := unwrapJSONString(in); string(got) != canonicalObjectBody {
		t.Fatalf("object must be untouched, got %s", got)
	}
}
