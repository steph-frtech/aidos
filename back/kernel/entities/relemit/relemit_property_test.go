// relemit_property_test.go — the S74 REPRODUCIBILITY mirror (∀, rapid). It pins the
// determinism-first invariant the done-criterion names: the SAME multi-entity AST →
// byte-identical output. It also pins the stronger property that emission is INVARIANT to
// INPUT ORDER (entities/async permuted → identical bytes), since the emitter canonicalises
// before rendering. An LLM could never satisfy this; a pure function does by construction.
package relemit

import (
	"math/rand"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"pgregory.net/rapid"
)

// genName draws a short lowercase identifier (a valid entity/attr/relation token).
func genName(t *rapid.T, label string) string {
	letters := rapid.StringMatching(`[a-z]{3,8}`).Draw(t, label)
	return letters
}

// genSchema draws a small, VALID multi-entity schema: 2–4 entities each with an id +
// 1–2 scalar attrs, plus 0–2 relations from a later entity to an earlier one (so the
// target is always declared), plus 0–1 async op.
func genSchema(t *rapid.T) Schema {
	n := rapid.IntRange(2, 4).Draw(t, "n_entities")
	names := map[string]bool{}
	var ents []EntityRelations
	var order []string
	for i := 0; i < n; i++ {
		var name string
		for {
			name = genName(t, "entity")
			if !names[name] {
				break
			}
		}
		names[name] = true
		order = append(order, name)
		attrs := []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
		}
		extra := rapid.IntRange(1, 2).Draw(t, "n_attrs")
		used := map[string]bool{"id": true}
		for j := 0; j < extra; j++ {
			var an string
			for {
				an = genName(t, "attr")
				if !used[an] {
					break
				}
			}
			used[an] = true
			ty := rapid.SampledFrom(entities.ScalarTypes()).Draw(t, "type")
			attrs = append(attrs, entities.Attribute{Name: an, Type: ty, Required: rapid.Bool().Draw(t, "req")})
		}
		ents = append(ents, EntityRelations{Entity: entities.Entity{Name: name, Attributes: attrs}})
	}
	// Relations: each entity (after the first) may reference an EARLIER entity (always declared).
	for i := 1; i < len(ents); i++ {
		nr := rapid.IntRange(0, 2).Draw(t, "n_rel")
		usedRel := map[string]bool{}
		for k := 0; k < nr; k++ {
			target := order[rapid.IntRange(0, i-1).Draw(t, "target_idx")]
			var rn string
			for {
				rn = genName(t, "rel")
				if !usedRel[rn] {
					break
				}
			}
			usedRel[rn] = true
			card := rapid.SampledFrom(ref.Cardinalities()).Draw(t, "card")
			sem := rapid.SampledFrom(ref.Semantics()).Draw(t, "sem")
			ents[i].Relations = append(ents[i].Relations, ref.Relation{
				Name: rn, Target: target, Cardinality: card, Semantic: sem, Required: rapid.Bool().Draw(t, "rel_req"),
			})
		}
	}
	s := Schema{Project: "proj", Entities: ents}
	if rapid.Bool().Draw(t, "has_async") {
		s.AsyncOps = []AsyncOp{{
			Name: "op" + genName(t, "op"),
			Async: operation.Async{
				Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue},
				Effects: []operation.Effect{{Kind: operation.TriggerQueue, Target: "q", Payload: map[string]any{"a": 1}}},
			},
		}}
	}
	return s
}

// TestProp_Deterministic — same schema → byte-identical output across all three targets.
func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := genSchema(rt)
		ddl1, br := EmitDDL(s)
		if br != nil {
			rt.Fatalf("EmitDDL refused a generated valid schema: %s", br.Explanation)
		}
		ddl2, _ := EmitDDL(s)
		if string(ddl1.Bytes) != string(ddl2.Bytes) {
			rt.Fatalf("EmitDDL not byte-stable for an identical schema")
		}
		if ddl1.OutputHash != ddl2.OutputHash {
			rt.Fatalf("EmitDDL output hash not stable")
		}
		ts1, br := EmitTS(s)
		if br != nil {
			rt.Fatalf("EmitTS refused: %s", br.Explanation)
		}
		ts2, _ := EmitTS(s)
		if string(ts1.Bytes) != string(ts2.Bytes) {
			rt.Fatalf("EmitTS not byte-stable")
		}
		if len(s.AsyncOps) > 0 {
			w1, br := EmitWorker(s)
			if br != nil {
				rt.Fatalf("EmitWorker refused an async schema: %s", br.Explanation)
			}
			w2, _ := EmitWorker(s)
			if string(w1.Bytes) != string(w2.Bytes) {
				rt.Fatalf("EmitWorker not byte-stable")
			}
		}
	})
}

// TestProp_InputOrderInvariant — permuting the input entity order yields IDENTICAL bytes
// (the emitter canonicalises by name first). This is the order-leak guard.
func TestProp_InputOrderInvariant(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := genSchema(rt)
		ddl1, br := EmitDDL(s)
		if br != nil {
			rt.Fatalf("EmitDDL refused: %s", br.Explanation)
		}
		// Shuffle the entity slice (relations stay attached to their entity).
		shuffled := Schema{Project: s.Project, AsyncOps: s.AsyncOps}
		shuffled.Entities = append([]EntityRelations(nil), s.Entities...)
		seed := rapid.Int64().Draw(rt, "seed")
		r := rand.New(rand.NewSource(seed))
		r.Shuffle(len(shuffled.Entities), func(i, j int) {
			shuffled.Entities[i], shuffled.Entities[j] = shuffled.Entities[j], shuffled.Entities[i]
		})
		ddl2, br := EmitDDL(shuffled)
		if br != nil {
			rt.Fatalf("EmitDDL refused the shuffled schema: %s", br.Explanation)
		}
		if string(ddl1.Bytes) != string(ddl2.Bytes) {
			rt.Fatalf("EmitDDL leaked input order:\n--- canonical ---\n%s\n--- shuffled ---\n%s", ddl1.Bytes, ddl2.Bytes)
		}
		if ddl1.SourceHash != ddl2.SourceHash {
			rt.Fatalf("SchemaHash leaked input order")
		}
	})
}

// TestProp_FKReferencesDeclaredTable — every generated schema's DDL has all REFERENCES
// pointing at a CREATEd table (no dangling FK ever emitted).
func TestProp_FKReferencesDeclaredTable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := genSchema(rt)
		art, br := EmitDDL(s)
		if br != nil {
			rt.Fatalf("EmitDDL refused: %s", br.Explanation)
		}
		ddl := string(art.Bytes)
		assertEveryFKReferencesADeclaredTable(rt, ddl)
	})
}

// assertEveryFKReferencesADeclaredTable is the shared check used by the fixture + property.
func assertEveryFKReferencesADeclaredTable(t rapid.TB, ddl string) {
	declared := map[string]bool{}
	for _, line := range strings.Split(ddl, "\n") {
		if strings.HasPrefix(line, "CREATE TABLE ") {
			name := strings.TrimSuffix(strings.TrimPrefix(line, "CREATE TABLE "), " (")
			declared[strings.Trim(name, `"`)] = true
		}
	}
	for _, line := range strings.Split(ddl, "\n") {
		idx := strings.Index(line, "REFERENCES ")
		if idx < 0 {
			continue
		}
		rest := line[idx+len("REFERENCES "):]
		tbl := rest
		if p := strings.Index(rest, "("); p >= 0 {
			tbl = rest[:p]
		}
		tbl = strings.Trim(strings.TrimSpace(tbl), `"`)
		if !declared[tbl] {
			t.Fatalf("FK references undeclared table %q in line %q", tbl, line)
		}
	}
}
