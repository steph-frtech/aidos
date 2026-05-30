package records_test

// Invariant mirror (rapid property test): reflects=records.Hash/Canonicalize/Validate,
// test_kind=property, cert_language=rapid, liveness=live, authority=below
//
// ∀ body:  Hash(Canonicalize(body)) is stable under key reordering
// ∀ body:  any byte change to a body's logical content ⇒ a different hash (a new
//          version, never an in-place mutation)
// ∀ kind:  Validate(NewRecord(kind, EmptyExampleBody(kind))) == OK
//          and id == version == Hash(Canonicalize(body))

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// genJSONObject draws a small JSON object (string→scalar) as a Go map. We render
// it twice in two different key orders to prove canonicalization is order-stable.
func genJSONObject(rt *rapid.T) map[string]any {
	n := rapid.IntRange(0, 6).Draw(rt, "n")
	m := make(map[string]any, n)
	for i := 0; i < n; i++ {
		k := rapid.StringMatching(`[a-z]{1,6}`).Draw(rt, "k")
		v := rapid.OneOf(
			rapid.StringMatching(`[a-zA-Z0-9 ]{0,8}`).AsAny(),
			rapid.Bool().AsAny(),
			rapid.IntRange(-1000, 1000).AsAny(),
		).Draw(rt, "v")
		m[k] = v
	}
	return m
}

// renderInRandomKeyOrder marshals m by shuffling its keys, producing valid JSON
// whose object key order is permuted. Canonicalize must erase that permutation.
func renderInRandomKeyOrder(rt *rapid.T, m map[string]any) []byte {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Draw a permutation by sorting on random priorities.
	prio := make(map[string]int, len(keys))
	for _, k := range keys {
		prio[k] = rapid.Int().Draw(rt, "prio_"+k)
	}
	sort.SliceStable(keys, func(i, j int) bool { return prio[keys[i]] < prio[keys[j]] })

	var buf []byte
	buf = append(buf, '{')
	for i, k := range keys {
		if i > 0 {
			buf = append(buf, ',')
		}
		kb, _ := json.Marshal(k)
		buf = append(buf, kb...)
		buf = append(buf, ':')
		vb, _ := json.Marshal(m[k])
		buf = append(buf, vb...)
	}
	buf = append(buf, '}')
	return buf
}

func TestCanonicalizeStableUnderKeyReorder(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genJSONObject(rt)
		a := renderInRandomKeyOrder(rt, m)
		b := renderInRandomKeyOrder(rt, m)

		ca, err := records.Canonicalize(a)
		if err != nil {
			rt.Fatalf("canonicalize a: %v", err)
		}
		cb, err := records.Canonicalize(b)
		if err != nil {
			rt.Fatalf("canonicalize b: %v", err)
		}
		if string(ca) != string(cb) {
			rt.Fatalf("canonical forms differ under key reorder:\n a=%s\n b=%s", ca, cb)
		}
		if records.Hash(ca) != records.Hash(cb) {
			rt.Fatalf("hashes differ under key reorder")
		}
	})
}

func TestByteChangeYieldsNewHash(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genJSONObject(rt)
		base := renderInRandomKeyOrder(rt, m)
		h1 := records.Hash(mustCanon(rt, base))

		// Add or change one key with a fresh value — a logical content change.
		extraK := rapid.StringMatching(`Z[a-z]{1,5}`).Draw(rt, "extraK") // 'Z' prefix avoids clashing with [a-z]{1,6} keys
		m2 := make(map[string]any, len(m)+1)
		for k, v := range m {
			m2[k] = v
		}
		m2[extraK] = rapid.StringMatching(`x[a-z]{0,5}`).Draw(rt, "extraV")
		changed := renderInRandomKeyOrder(rt, m2)
		h2 := records.Hash(mustCanon(rt, changed))

		if h1 == h2 {
			rt.Fatalf("byte/content change did not change hash (collision): %s", h1)
		}
	})
}

func mustCanon(rt *rapid.T, b []byte) []byte {
	c, err := records.Canonicalize(b)
	if err != nil {
		rt.Fatalf("canonicalize: %v", err)
	}
	return c
}

func TestEmptyExampleEachKindValidates(t *testing.T) {
	for _, k := range records.Kinds() {
		k := k
		t.Run(string(k), func(t *testing.T) {
			r, err := records.NewRecord(k, records.EmptyExampleBody(k))
			if err != nil {
				t.Fatalf("NewRecord(%s): %v", k, err)
			}
			if err := records.Validate(r); err != nil {
				t.Fatalf("Validate(%s): %v", k, err)
			}
			want := records.Hash(mustCanonT(t, records.EmptyExampleBody(k)))
			if r.ID != want || r.Version != want {
				t.Fatalf("%s: id/version != content hash: id=%s version=%s want=%s", k, r.ID, r.Version, want)
			}
		})
	}
}

func mustCanonT(t *testing.T, b []byte) []byte {
	t.Helper()
	c, err := records.Canonicalize(b)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	return c
}

// Validate must reject a tampered record: flip the id away from the content hash.
func TestValidateRejectsTamperedAddress(t *testing.T) {
	r, err := records.NewRecord(records.KindTruth, records.EmptyExampleBody(records.KindTruth))
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}
	r.ID = "deadbeef"
	if err := records.Validate(r); err == nil {
		t.Fatal("Validate accepted a record whose id is not its content hash")
	}
}
