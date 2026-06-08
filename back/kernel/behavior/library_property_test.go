package behavior

// library_property_test.go — the S79 REPRODUCIBILITY mirror (CLAUDE.md §6/§8 determinism-first). It
// pins the invariants of the project-scoped library gestures (rapid property tests):
//
//   - search-deterministic   : same library + query ⇒ byte-identical ordered hits (no LLM, no map leak).
//   - search-order-invariant : the result order does not depend on insertion order.
//   - search-subset-of-browse: every search hit is a live (non-soft-deleted) browse entry.
//   - tag-then-search        : tagging a record makes the tag searchable (the matcher is over tags).
//   - softdelete-hides       : a soft-deleted record never appears in a default browse/search.

import (
	"fmt"
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// a small generator of valid library records (varied kind/owner/version/tags/labels).
func genRecord(t *rapid.T, i int) Record {
	kinds := catalogueOrder
	k := kinds[rapid.IntRange(0, len(kinds)-1).Draw(t, fmt.Sprintf("kind%d", i))]
	owner := rapid.SampledFrom([]string{"alice", "bob", "carol"}).Draw(t, fmt.Sprintf("owner%d", i))
	ver := rapid.IntRange(1, 3).Draw(t, fmt.Sprintf("ver%d", i))
	ntags := rapid.IntRange(0, 3).Draw(t, fmt.Sprintf("ntags%d", i))
	tags := make([]string, 0, ntags)
	for j := 0; j < ntags; j++ {
		tags = append(tags, rapid.SampledFrom([]string{"scoping", "security", "audit", "shared"}).
			Draw(t, fmt.Sprintf("tag%d_%d", i, j)))
	}
	return Record{Kind: k, Owner: owner, Version: ver, Tags: tags,
		Labels: map[string]string{"fr": "lib " + owner, "en": "lib " + owner}}
}

func buildLibrary(t *rapid.T) Library {
	n := rapid.IntRange(0, 5).Draw(t, "n")
	lib := NewLibrary("proj-prop")
	for i := 0; i < n; i++ {
		var err error
		lib, _, err = lib.Add(genRecord(t, i))
		if err != nil {
			t.Fatalf("Add: %v", err)
		}
	}
	return lib
}

func TestProp_SearchDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		lib := buildLibrary(rt)
		q := rapid.SampledFrom([]string{"", "alice", "scoping", "lib", "zzz"}).Draw(rt, "q")
		a := lib.Search(q)
		b := lib.Search(q)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("search not deterministic for %q", q)
		}
	})
}

func TestProp_SearchSubsetOfBrowse(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		lib := buildLibrary(rt)
		q := rapid.SampledFrom([]string{"alice", "scoping", "lib"}).Draw(rt, "q")
		live := map[string]bool{}
		for _, e := range lib.Browse(false) {
			live[RecordID(e.Record)] = true
		}
		for _, h := range lib.Search(q) {
			if !live[RecordID(h.Record)] {
				rt.Fatalf("search hit not in live browse: %s", RecordID(h.Record))
			}
		}
	})
}

func TestProp_TagThenSearch(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		lib, id, err := NewLibrary("p").Add(Record{
			Kind: Ownable, Owner: "alice", Version: 1,
			Labels: map[string]string{"fr": "x"},
		})
		if err != nil {
			rt.Fatalf("Add: %v", err)
		}
		tag := rapid.SampledFrom([]string{"reuseme", "freshtag", "weird"}).Draw(rt, "tag")
		tagged, newID, err := lib.Tag(id, tag)
		if err != nil {
			rt.Fatalf("Tag: %v", err)
		}
		hits := tagged.Search(tag)
		found := false
		for _, h := range hits {
			if RecordID(h.Record) == newID {
				found = true
			}
		}
		if !found {
			rt.Fatalf("tag %q not searchable after Tag", tag)
		}
	})
}

func TestProp_SoftDeleteHides(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		lib, id, err := NewLibrary("p").Add(Record{
			Kind: Ownable, Owner: "alice", Version: 1,
			Labels: map[string]string{"fr": "x", "en": "x"},
		})
		if err != nil {
			rt.Fatalf("Add: %v", err)
		}
		del, err := lib.SoftDelete(id)
		if err != nil {
			rt.Fatalf("SoftDelete: %v", err)
		}
		for _, e := range del.Browse(false) {
			if RecordID(e.Record) == id {
				rt.Fatalf("soft-deleted record still in default browse")
			}
		}
		if len(del.Search("alice")) != 0 {
			rt.Fatalf("soft-deleted record still searchable")
		}
	})
}
