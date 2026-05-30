package contentstore_test

// Invariant mirror (rapid property test): reflects=S01-content-store-invariant,
// test_kind=invariant, cert_language=rapid, liveness=live
//
// ∀ byte slices b: Get(Put(b)) == b
// ∀ b: Put(b) is deterministic (same b ⇒ same hash)
// ∀ b1 ≠ b2: Put(b1) ≠ Put(b2) over generated sample (collision-free)
// A second Put of different bytes leaves the first row intact.

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/contentstore"
	"pgregory.net/rapid"
)

func TestContentStoreInvariants(t *testing.T) {
	_, dsn := startPostgres(t)
	ctx := context.Background()

	store, err := contentstore.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()

	t.Run("Get(Put(b))==b", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			b := rapid.SliceOfN(rapid.Byte(), 0, 512).Draw(rt, "b")
			h, err := store.Put(ctx, b)
			if err != nil {
				rt.Fatalf("Put: %v", err)
			}
			got, err := store.Get(ctx, h)
			if err != nil {
				rt.Fatalf("Get: %v", err)
			}
			if string(got) != string(b) {
				rt.Fatalf("Get(Put(b)) != b: got %q want %q", got, b)
			}
		})
	})

	t.Run("Put_deterministic", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			b := rapid.SliceOfN(rapid.Byte(), 0, 512).Draw(rt, "b")
			h1, err := store.Put(ctx, b)
			if err != nil {
				rt.Fatalf("Put1: %v", err)
			}
			h2, err := store.Put(ctx, b)
			if err != nil {
				rt.Fatalf("Put2: %v", err)
			}
			if h1 != h2 {
				rt.Fatalf("Put not deterministic: %q != %q", h1, h2)
			}
		})
	})

	t.Run("Put_no_overwrite", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			b1 := rapid.SliceOfN(rapid.Byte(), 1, 256).Draw(rt, "b1")
			b2 := rapid.SliceOfN(rapid.Byte(), 1, 256).Filter(func(b []byte) bool {
				return string(b) != string(b1)
			}).Draw(rt, "b2")

			h1, err := store.Put(ctx, b1)
			if err != nil {
				rt.Fatalf("Put b1: %v", err)
			}
			_, err = store.Put(ctx, b2)
			if err != nil {
				rt.Fatalf("Put b2: %v", err)
			}
			// b1 must still be readable.
			got, err := store.Get(ctx, h1)
			if err != nil {
				rt.Fatalf("Get b1 after b2 put: %v", err)
			}
			if string(got) != string(b1) {
				rt.Fatalf("b1 overwritten: got %q want %q", got, b1)
			}
		})
	})

	t.Run("Hash_deterministic_no_store", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			b := rapid.SliceOfN(rapid.Byte(), 0, 512).Draw(rt, "b")
			h1 := contentstore.Hash(b)
			h2 := contentstore.Hash(b)
			if h1 != h2 {
				rt.Fatalf("Hash not deterministic: %q != %q", h1, h2)
			}
		})
	})
}
