package entities_test

// Schema-validation FIXTURE mirror (the entity's required mirror kind, KRD §27:
// `entity ─mirrors→ schema-validation`). N2 frozen slot: state → command → events,
// interpreted in Go. reflects=kernel.entities.{EmitGo,EmitTS,EmitDDL},
// test_kind=schema-validation/fixture, cert_language=fixture, authority=above.
//
// These are the DONE CRITERIA of S35, restated executable. They are means-tests toward
// the human red (an entity emits a Go struct + a TS type + DDL, all faithful to one
// source) — never new truths the agent invents and grades.
//
// The fixture is materialized here (the mirrors Postgres schema persists it at S06's
// back-fill; this file IS the red→green proof, per the CLAUDE.md bootstrap exception).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// fixture: "the Order entity emits a Go struct + a TS type + DDL" — THE done criterion.
func TestFixture_OrderEmitsGoTsAndDdl(t *testing.T) {
	order := entities.Order()

	// command (emit go): EmitGo(Order) → events [Emitted]
	goArt, br := entities.EmitGo(order)
	if br != nil {
		t.Fatalf("EmitGo(Order) blocked: %+v", br)
	}
	goSrc := string(goArt.Bytes)
	if !strings.Contains(goSrc, "type Order struct") {
		t.Errorf("Go struct missing `type Order struct`:\n%s", goSrc)
	}
	// every Order attribute appears as one struct field, in SOURCE ORDER, mapped type.
	// (gofmt aligns the type column with padding, so assert name then type separately.)
	wantGoFields := []string{"Id", "int64", "Customer", "string", "Total", "pgtype.Numeric", "Discount", "pgtype.Numeric", "Placed_at", "pgtype.Timestamptz"}
	assertInOrder(t, "Go", goSrc, wantGoFields)

	// command (emit ts): EmitTS(Order) → events [Emitted]
	tsArt, br := entities.EmitTS(order)
	if br != nil {
		t.Fatalf("EmitTS(Order) blocked: %+v", br)
	}
	tsSrc := string(tsArt.Bytes)
	if !strings.Contains(tsSrc, "export type Order = {") {
		t.Errorf("TS type missing `export type Order = {`:\n%s", tsSrc)
	}
	// required attrs non-optional; discount (¬required) optional.
	wantTSFields := []string{"id: number;", "customer: string;", "total: string;", "discount?: string;", "placed_at: string;"}
	assertInOrder(t, "TS", tsSrc, wantTSFields)
	if strings.Contains(tsSrc, "id?:") || strings.Contains(tsSrc, "customer?:") || strings.Contains(tsSrc, "total?:") || strings.Contains(tsSrc, "placed_at?:") {
		t.Errorf("required attr rendered optional in TS:\n%s", tsSrc)
	}

	// command (emit ddl): EmitDDL(Order) → events [Emitted]
	ddlArt, br := entities.EmitDDL(order)
	if br != nil {
		t.Fatalf("EmitDDL(Order) blocked: %+v", br)
	}
	ddlSrc := string(ddlArt.Bytes)
	if !strings.Contains(ddlSrc, `CREATE TABLE "order" (`) {
		t.Errorf("DDL missing `CREATE TABLE \"order\" (`:\n%s", ddlSrc)
	}
	// identifier (id) is PRIMARY KEY; required attrs NOT NULL; discount NULLABLE.
	if !strings.Contains(ddlSrc, `"id" BIGINT PRIMARY KEY NOT NULL`) {
		t.Errorf("id not rendered as PRIMARY KEY NOT NULL BIGINT:\n%s", ddlSrc)
	}
	if !strings.Contains(ddlSrc, `"customer" TEXT NOT NULL`) {
		t.Errorf("customer not NOT NULL TEXT:\n%s", ddlSrc)
	}
	if !strings.Contains(ddlSrc, `"discount" NUMERIC`) || strings.Contains(ddlSrc, `"discount" NUMERIC NOT NULL`) {
		t.Errorf("discount must be NULLABLE NUMERIC (no NOT NULL):\n%s", ddlSrc)
	}
	assertInOrder(t, "DDL", ddlSrc, []string{`"id"`, `"customer"`, `"total"`, `"discount"`, `"placed_at"`})
}

// fixture: "all three projections agree on the same source" — one source, never
// double-typed (CLAUDE.md §3). The field set of Go == TS == DDL columns == source
// attribute set; none adds, drops, or renames an attribute.
func TestFixture_AllThreeProjectionsAgree(t *testing.T) {
	order := entities.Order()
	want := entities.AttributeSet(order) // [id customer total discount placed_at]

	goArt, _ := entities.EmitGo(order)
	tsArt, _ := entities.EmitTS(order)
	ddlArt, _ := entities.EmitDDL(order)

	for _, attr := range want {
		// Go field is the exported name; TS/DDL keep the source token.
		if !strings.Contains(string(goArt.Bytes), goNameForTest(attr)) {
			t.Errorf("Go projection drops attribute %q", attr)
		}
		if !strings.Contains(string(tsArt.Bytes), attr) {
			t.Errorf("TS projection drops attribute %q", attr)
		}
		if !strings.Contains(string(ddlArt.Bytes), `"`+attr+`"`) {
			t.Errorf("DDL projection drops attribute %q", attr)
		}
	}
	// none introduces an attribute the source does not have: count columns in DDL.
	if got := strings.Count(string(ddlArt.Bytes), "    \""); got != len(want) {
		t.Errorf("DDL column count = %d, want %d (no add/drop)", got, len(want))
	}
}

// fixture: "the recorded entity id is the content hash of its body" — content-addressed
// (S02 reused). entity.id == Hash(Canonicalize(body)).
func TestFixture_EntityIdIsContentHash(t *testing.T) {
	order := entities.Order()
	id, err := entities.ID(order)
	if err != nil {
		t.Fatalf("ID(Order): %v", err)
	}
	body, err := entities.Body(order)
	if err != nil {
		t.Fatalf("Body(Order): %v", err)
	}
	want := records.Hash(body)
	if id != want {
		t.Errorf("entity id = %q, want Hash(Canonicalize(body)) = %q", id, want)
	}
	// the artifact's source_hash equals the entity head hash (the staleness inequality).
	goArt, _ := entities.EmitGo(order)
	if goArt.SourceHash != want {
		t.Errorf("artifact source_hash = %q, want entity id %q", goArt.SourceHash, want)
	}
}

// fixture: "an attribute with an unknown scalar type is rejected, not guessed" — honesty.
func TestFixture_UnknownTypeIsBlocked(t *testing.T) {
	bad := entities.Entity{
		Name: "Order",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "foo", Type: entities.ScalarType("Unobtainium"), Required: true},
		},
	}
	for _, target := range entities.Targets() {
		art, br := entities.Emit(bad, target)
		if br == nil {
			t.Fatalf("Emit(%s) on unknown type should Block, got artifact %q", target, art.Path)
		}
		// no projection emitted (no silent fallback to any/text).
		if len(art.Bytes) != 0 {
			t.Errorf("Emit(%s) emitted bytes despite block:\n%s", target, art.Bytes)
		}
		// reuse the S13 BlockReason shape with a non-empty fix path (no prison).
		if len(br.HowToFix) == 0 {
			t.Errorf("BlockReason for %s has empty how_to_fix (prison)", target)
		}
		if !strings.Contains(br.Explanation, "UNKNOWN_ATTRIBUTE_TYPE") {
			t.Errorf("BlockReason explanation missing UNKNOWN_ATTRIBUTE_TYPE: %q", br.Explanation)
		}
	}
}

// --- fixture helpers ---

// assertInOrder asserts each needle appears in src, and in the given order.
func assertInOrder(t *testing.T, label, src string, needles []string) {
	t.Helper()
	last := 0
	for _, n := range needles {
		idx := strings.Index(src[last:], n)
		if idx < 0 {
			t.Errorf("%s: missing or out-of-order token %q in:\n%s", label, n, src)
			return
		}
		last += idx + len(n)
	}
}

// goNameForTest mirrors the emitter's goName for the agreement fixture.
func goNameForTest(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
