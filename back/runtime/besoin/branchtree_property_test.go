package besoin

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// branchtree_property_test.go — the EL12 REPRODUCIBILITY mirror (CLAUDE.md §6 determinism-first):
// BranchTree, IsResolved and ClassifyAltitude are PURE TOTAL functions — same input → same output,
// the LLM excluded. These properties pin that determinism and the order-independence of the tree.

// arbitraryBody draws a small body map over the union of all declared required fields plus a few
// off-grammar keys, with mixed presence and value types — enough to exercise every branch path.
func arbitraryBody(t *rapid.T) map[string]any {
	keys := []string{
		"intent", "scenarios", "gherkin", "goal", "zones", "data",
		"visible_when", "enabled_when", "triggers", "invoke", "steps", "fixture",
		"attributes", "statement", "rule", "selects", "noise",
	}
	body := map[string]any{}
	for _, k := range keys {
		if rapid.Bool().Draw(t, "has_"+k) {
			switch rapid.IntRange(0, 3).Draw(t, "kind_"+k) {
			case 0:
				body[k] = rapid.String().Draw(t, "str_"+k)
			case 1:
				body[k] = rapid.Bool().Draw(t, "bool_"+k)
			case 2:
				n := rapid.IntRange(0, 4).Draw(t, "len_"+k)
				arr := make([]any, n)
				for i := 0; i < n; i++ {
					arr[i] = rapid.SampledFrom([]string{"onboarding", "core-task", "list", "submit", "x"}).Draw(t, "el")
				}
				body[k] = arr
			case 3:
				// omit (leave absent even though has_ said yes) — exercises empty handling
				delete(body, k)
			}
		}
	}
	return body
}

func arbitraryLevel(t *rapid.T) Level {
	return rapid.SampledFrom(AllLevels()).Draw(t, "level")
}

// BranchTree is DETERMINISTIC: two calls on the same (level, body) yield byte-identical trees.
func TestProp_BranchTree_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := arbitraryLevel(t)
		body := arbitraryBody(t)
		a := BranchTree(l, body)
		b := BranchTree(l, body)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("BranchTree not deterministic for level=%s\n a=%+v\n b=%+v", l, a, b)
		}
	})
}

// BranchTree is ORDER-INDEPENDENT: it is sorted by (kind, field), so the order of map iteration
// never leaks into the output — the tree is stable.
func TestProp_BranchTree_Sorted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := arbitraryLevel(t)
		tree := BranchTree(l, arbitraryBody(t))
		for i := 1; i < len(tree); i++ {
			prev, cur := tree[i-1], tree[i]
			if prev.Kind > cur.Kind || (prev.Kind == cur.Kind && prev.Field > cur.Field) {
				t.Fatalf("BranchTree not sorted at %d: %q/%q then %q/%q", i, prev.Kind, prev.Field, cur.Kind, cur.Field)
			}
		}
	})
}

// ClassifyAltitude is DETERMINISTIC and CONSISTENT with MatchesSchema: when Matched, the body fully
// satisfies Best's schema; and IsOffAltitude(Best, body) is therefore false.
func TestProp_ClassifyAltitude_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		body := arbitraryBody(t)
		a := ClassifyAltitude(body)
		b := ClassifyAltitude(body)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("ClassifyAltitude not deterministic:\n a=%+v\n b=%+v", a, b)
		}
		if a.Matched {
			if !MatchesSchema(a.Best, body) {
				t.Fatalf("Matched=true but body does not satisfy Best=%q schema", a.Best)
			}
			if IsOffAltitude(a.Best, body) {
				t.Fatalf("a body classified at Best=%q must NOT be off-altitude there", a.Best)
			}
		}
	})
}

// IsOffAltitude is the exact negation of MatchesSchema for any grammar level (the schema-mismatch
// definition — no separate judgment path).
func TestProp_OffAltitude_NegatesMatchesSchema(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := arbitraryLevel(t)
		body := arbitraryBody(t)
		if IsOffAltitude(l, body) == MatchesSchema(l, body) {
			t.Fatalf("IsOffAltitude must be the negation of MatchesSchema for level %s", l)
		}
	})
}

// A complete body for any level closes all its branches (the resolution criterion is total): no open
// branch remains. Determinism + completeness in one.
func TestProp_CompleteBody_NoOpenBranch(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := arbitraryLevel(t)
		tree := BranchTree(l, completeBodyFor(l))
		if len(openOnly(tree)) != 0 {
			t.Fatalf("complete body for %s must leave no open branch", l)
		}
	})
}
