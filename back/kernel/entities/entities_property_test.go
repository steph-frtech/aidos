package entities_test

// Property mirror (∀ invariants, rapid). reflects=kernel.entities.{EmitGo,EmitTS,EmitDDL},
// test_kind=property, cert_language=rapid, liveness=live, authority=below (computational
// — MEANS-tests toward the human red, not new truths the agent grades).
//
// The invariants (S35 spec):
//  1. DETERMINISM — Emit(e,t) == Emit(e,t) (byte-identical; no clock/RNG/map-order).
//  2. TOTALITY — well-typed entity never panics; unknown type ⇒ BlockReason.
//  3. NO ADD/DROP/RENAME — the projection field/column set == the source attribute set.
//  4. ORDER PRESERVED — source attribute order is kept in Go + TS + DDL.
//  5. NULLABILITY — attr.required ⇔ DDL NOT NULL ⇔ TS non-optional; ¬required ⇔ NULLABLE ⇔ TS optional.
//  6. EXACTLY ONE PK — an entity with one identifier ⇒ exactly one DDL PRIMARY KEY, on it.
//  7. CONTENT-ADDRESSED — entity.id == Hash(Canonicalize(body)); any byte change ⇒ new version.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

var knownTypes = []entities.ScalarType{
	entities.TypeString, entities.TypeInt, entities.TypeDecimal, entities.TypeBool, entities.TypeTimestamptz,
}

// genEntity draws a well-typed entity: a non-empty name, 1..6 distinct-named attributes
// over the closed scalar set, at most one identifier. Attribute ORDER is whatever the
// generator draws — the properties check the emitters PRESERVE it.
func genEntity(t *rapid.T) entities.Entity {
	name := rapid.StringMatching(`[A-Za-z][A-Za-z0-9]{0,7}`).Draw(t, "name")
	n := rapid.IntRange(1, 6).Draw(t, "natt")
	attrs := make([]entities.Attribute, 0, n)
	seen := map[string]bool{}
	idChosen := rapid.IntRange(-1, n-1).Draw(t, "idIdx") // -1 ⇒ no identifier
	for i := 0; i < n; i++ {
		var an string
		for {
			an = rapid.StringMatching(`[a-z][a-z0-9_]{0,7}`).Draw(t, "attr")
			if !seen[an] {
				break
			}
		}
		seen[an] = true
		ty := knownTypes[rapid.IntRange(0, len(knownTypes)-1).Draw(t, "ty")]
		attrs = append(attrs, entities.Attribute{
			Name:       an,
			Type:       ty,
			Required:   rapid.Bool().Draw(t, "req"),
			Identifier: i == idChosen,
		})
	}
	return entities.Entity{Name: name, Attributes: attrs}
}

func emitAll(e entities.Entity) (g, ts, ddl entities.Artifact, ok bool) {
	ga, gb := entities.EmitGo(e)
	ta, tb := entities.EmitTS(e)
	da, db := entities.EmitDDL(e)
	if gb != nil || tb != nil || db != nil {
		return entities.Artifact{}, entities.Artifact{}, entities.Artifact{}, false
	}
	return ga, ta, da, true
}

// 1. DETERMINISM.
func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		for _, target := range entities.Targets() {
			a1, b1 := entities.Emit(e, target)
			a2, b2 := entities.Emit(e, target)
			if (b1 == nil) != (b2 == nil) {
				rt.Fatalf("%s: block non-determinism", target)
			}
			if b1 == nil && string(a1.Bytes) != string(a2.Bytes) {
				rt.Fatalf("%s: byte non-determinism", target)
			}
			if b1 == nil && a1.OutputHash != a2.OutputHash {
				rt.Fatalf("%s: output_hash non-determinism", target)
			}
		}
	})
}

// 2. TOTALITY — well-typed never panics; an unknown type always blocks.
func TestProp_TotalityAndUnknownTypeBlocks(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		for _, target := range entities.Targets() {
			_, _ = entities.Emit(e, target) // must not panic
		}
		// inject an unknown-typed attribute ⇒ all targets block, none emits bytes.
		bad := e
		bad.Attributes = append([]entities.Attribute{}, e.Attributes...)
		bad.Attributes = append(bad.Attributes, entities.Attribute{
			Name: "x_unknown", Type: entities.ScalarType("Nope"), Required: true,
		})
		for _, target := range entities.Targets() {
			art, br := entities.Emit(bad, target)
			if br == nil {
				rt.Fatalf("%s: unknown type not blocked", target)
			}
			if len(art.Bytes) != 0 {
				rt.Fatalf("%s: emitted bytes despite unknown type", target)
			}
		}
	})
}

// 3 & 4. NO ADD/DROP/RENAME + ORDER PRESERVED in Go and TS.
func TestProp_NoDriftAndOrderPreserved(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		g, ts, ddl, ok := emitAll(e)
		if !ok {
			return
		}
		set := entities.AttributeSet(e)
		// DDL column count == attribute count (no add/drop).
		if c := strings.Count(string(ddl.Bytes), "    \""); c != len(set) {
			rt.Fatalf("DDL column count %d != attrs %d", c, len(set))
		}
		// order preserved in Go (exported names) and TS (source tokens).
		assertOrderProp(rt, "Go", string(g.Bytes), set, true)
		assertOrderProp(rt, "TS", string(ts.Bytes), set, false)
	})
}

// 5. NULLABILITY — required ⇔ NOT NULL ⇔ TS non-optional.
func TestProp_Nullability(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		_, ts, ddl, ok := emitAll(e)
		if !ok {
			return
		}
		for _, a := range e.Attributes {
			// The TS field line is the field-declaration line (tab-indented), matched on
			// the exact `\t<name>:` / `\t<name>?:` prefix so the header hash never aliases it.
			tsReq := fieldLine(string(ts.Bytes), "\t"+a.Name+":")
			tsOpt := fieldLine(string(ts.Bytes), "\t"+a.Name+"?:")
			optional := tsOpt != ""
			if a.Required && optional {
				rt.Fatalf("required attr %q optional in TS", a.Name)
			}
			if !a.Required && !(optional && tsReq == "") {
				rt.Fatalf("¬required attr %q not optional in TS", a.Name)
			}
			ddlLine := fieldLine(string(ddl.Bytes), `"`+a.Name+`"`)
			notNull := strings.Contains(ddlLine, "NOT NULL")
			if a.Required != notNull {
				rt.Fatalf("attr %q required=%v but DDL NOT NULL=%v", a.Name, a.Required, notNull)
			}
		}
	})
}

// 6. EXACTLY ONE PK on the identifier.
func TestProp_OnePrimaryKey(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		_, _, ddl, ok := emitAll(e)
		if !ok {
			return
		}
		id, has := entities.Identifier(e)
		pkCount := strings.Count(string(ddl.Bytes), "PRIMARY KEY")
		if has {
			if pkCount != 1 {
				rt.Fatalf("identifier entity: %d PRIMARY KEY, want 1", pkCount)
			}
			if !strings.Contains(fieldLine(string(ddl.Bytes), `"`+id.Name+`"`), "PRIMARY KEY") {
				rt.Fatalf("PRIMARY KEY not on identifier %q", id.Name)
			}
		} else if pkCount != 0 {
			rt.Fatalf("no identifier but %d PRIMARY KEY", pkCount)
		}
	})
}

// 7. CONTENT-ADDRESSED — id == Hash(Canonicalize(body)); any byte change ⇒ new version.
func TestProp_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genEntity(rt)
		id, err := entities.ID(e)
		if err != nil {
			rt.Fatalf("ID: %v", err)
		}
		body, _ := entities.Body(e)
		if id != records.Hash(body) {
			rt.Fatalf("id != Hash(Canonicalize(body))")
		}
		// reorder the attributes (if >1) ⇒ a DIFFERENT id (attribute order is semantic).
		if len(e.Attributes) > 1 {
			rev := entities.Entity{Name: e.Name, Attributes: reversed(e.Attributes)}
			rid, _ := entities.ID(rev)
			if rid == id {
				rt.Fatalf("reorder did not change id (order must be semantic)")
			}
		}
	})
}

// --- property helpers ---

func assertOrderProp(rt *rapid.T, label, src string, attrs []string, exported bool) {
	last := 0
	for _, a := range attrs {
		needle := a
		if exported {
			needle = strings.ToUpper(a[:1]) + a[1:]
		}
		idx := strings.Index(src[last:], needle)
		if idx < 0 {
			rt.Fatalf("%s: attr %q missing/out-of-order", label, a)
		}
		last += idx + len(needle)
	}
}

// fieldLine returns the first tab-indented body line whose content contains prefix —
// i.e. a field/column declaration, never the comment header (which is not tab-indented)
// nor the `export type`/`CREATE TABLE` line.
func fieldLine(src, prefix string) string {
	for _, ln := range strings.Split(src, "\n") {
		if strings.HasPrefix(ln, "\t") && strings.Contains(ln, prefix) {
			return ln
		}
		// DDL columns are 4-space indented, not tab.
		if strings.HasPrefix(ln, "    ") && strings.Contains(ln, prefix) {
			return ln
		}
	}
	return ""
}

func reversed(in []entities.Attribute) []entities.Attribute {
	out := make([]entities.Attribute, len(in))
	for i := range in {
		out[len(in)-1-i] = in[i]
	}
	return out
}
