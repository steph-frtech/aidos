// blob_property_test.go — the S72 reproducibility/property mirror (∀ invariants, rapid).
// reflects=kernel.entities.blob.{ID,Body,Parse,ValidateUpload,StorageKey,CrossProjectAccess,
// EmitHandler}, test_kind=property, cert_language=rapid, liveness=live, authority=below
// (computational). It pins the S72 done-criteria as universally-quantified invariants:
//
//   - a blob attribute ROUND-TRIPS as a content-addressed AST (Body→Parse→ID is stable);
//   - the content address is byte-stable & deterministic (same node → same ID);
//   - the emitted upload handler is DETERMINISTIC (same (project,entity,node) → byte-identical);
//   - the closed scalar set is NEVER widened by the blob node (the honesty invariant);
//   - an over-MIME / over-size upload is ALWAYS refused (never coerced);
//   - a storage key is project-scoped (a key of A is NEVER accessible from B≠A).
package blob

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"pgregory.net/rapid"
)

// genBlob draws a well-shaped BlobAttribute (non-empty name, ≥1 non-blank MIME, positive ceiling).
func genBlob(t *rapid.T) BlobAttribute {
	name := rapid.StringMatching(`[a-z][a-z0-9_]{0,7}`).Draw(t, "name")
	n := rapid.IntRange(1, 4).Draw(t, "nmime")
	mimes := make([]string, n)
	for i := range mimes {
		mimes[i] = rapid.StringMatching(`[a-z]{1,6}/[a-z0-9.+-]{1,8}`).Draw(t, "mime")
	}
	return BlobAttribute{
		Name:        name,
		AllowedMIME: mimes,
		MaxBytes:    rapid.Int64Range(1, 1<<40).Draw(t, "max"),
		Required:    rapid.Bool().Draw(t, "req"),
	}
}

// TestProp_RoundTrip — a well-shaped blob round-trips: Parse(Body(b)) equals b, and the ID
// of the parsed node equals the ID of the original (the content-addressed round-trip).
func TestProp_RoundTrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		body, err := Body(b)
		if err != nil {
			rt.Fatalf("Body: %v", err)
		}
		got, err := Parse(body)
		if err != nil {
			rt.Fatalf("Parse: %v", err)
		}
		id1, err := ID(b)
		if err != nil {
			rt.Fatalf("ID(b): %v", err)
		}
		id2, err := ID(got)
		if err != nil {
			rt.Fatalf("ID(parsed): %v", err)
		}
		if id1 != id2 {
			rt.Fatalf("round-trip changed the content address: %q vs %q", id1, id2)
		}
	})
}

// TestProp_ContentAddressed — the ID is exactly Hash(Canonicalize(Body)); a byte change in the
// node (here a MaxBytes change) yields a different ID (a new version).
func TestProp_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		id1, err := ID(b)
		if err != nil {
			rt.Fatalf("ID: %v", err)
		}
		b2 := b
		b2.MaxBytes = b.MaxBytes + 1
		id2, err := ID(b2)
		if err != nil {
			rt.Fatalf("ID(b2): %v", err)
		}
		if id1 == id2 {
			rt.Fatalf("a size change did not change the content address")
		}
	})
}

// TestProp_Deterministic — ID is a pure function: the same node always hashes the same.
func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		id1, _ := ID(b)
		id2, _ := ID(b)
		if id1 != id2 {
			rt.Fatalf("ID is not deterministic: %q vs %q", id1, id2)
		}
	})
}

// TestProp_HandlerDeterministic — EmitHandler is a pure function: the SAME (project, entity,
// node) always renders BYTE-IDENTICAL handler output (the S72 "deterministic upload handler").
func TestProp_HandlerDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		project := rapid.StringMatching(`p[a-z0-9]{1,8}`).Draw(rt, "project")
		entity := rapid.StringMatching(`[A-Z][a-z]{1,7}`).Draw(rt, "entity")
		a1, br1 := EmitHandler(project, entity, b)
		a2, br2 := EmitHandler(project, entity, b)
		if br1 != nil || br2 != nil {
			rt.Fatalf("emit refused a well-shaped node: %v / %v", br1, br2)
		}
		if !bytes.Equal(a1.Bytes, a2.Bytes) {
			rt.Fatalf("handler is not byte-stable for an identical input")
		}
		if a1.SourceHash == "" {
			rt.Fatalf("handler carries no source hash")
		}
		// A node change must change the emitted handler bytes (it bakes in the closed set).
		b2 := b
		b2.MaxBytes = b.MaxBytes + 1
		a3, _ := EmitHandler(project, entity, b2)
		if bytes.Equal(a1.Bytes, a3.Bytes) {
			rt.Fatalf("a node change did not change the emitted handler")
		}
	})
}

// TestProp_ScalarSetUntouched — the existence of the blob node NEVER widens the closed scalar
// set. The honesty invariant of S72: a blob is its own plane, not a scalar type.
func TestProp_ScalarSetUntouched(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		got := entities.ScalarTypes()
		want := []entities.ScalarType{
			entities.TypeString, entities.TypeInt, entities.TypeDecimal,
			entities.TypeBool, entities.TypeTimestamptz,
		}
		if len(got) != len(want) {
			rt.Fatalf("scalar set widened: got %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				rt.Fatalf("scalar set drifted at %d: %q vs %q", i, got[i], want[i])
			}
		}
		// A blob MIME string is never a scalar type token.
		b := genBlob(rt)
		for _, m := range b.AllowedMIME {
			if entities.IsKnownType(entities.ScalarType(m)) {
				rt.Fatalf("a MIME leaked into the scalar set: %q", m)
			}
		}
	})
}

// TestProp_ProjectScoped — a storage key minted for project A is NEVER accessible from a
// different project B (the project-scoping done-criterion), and IS accessible from A.
func TestProp_ProjectScoped(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		pa := rapid.StringMatching(`a[a-z0-9]{1,8}`).Draw(rt, "pa")
		pb := rapid.StringMatching(`b[a-z0-9]{1,8}`).Draw(rt, "pb")
		entity := rapid.StringMatching(`[A-Z][a-z]{1,7}`).Draw(rt, "entity")
		hash := rapid.StringMatching(`[0-9a-f]{8,16}`).Draw(rt, "hash")
		key, err := StorageKey(pa, entity, b, hash)
		if err != nil {
			rt.Fatalf("StorageKey: %v", err)
		}
		if err := CrossProjectAccess(key, pa); err != nil {
			rt.Fatalf("A cannot access its own key: %v", err)
		}
		if pa != pb {
			if err := CrossProjectAccess(key, pb); err == nil {
				rt.Fatalf("B≠A accessed A's key: %q from %q", key, pb)
			}
		}
		if ProjectOf(key) != pa {
			rt.Fatalf("ProjectOf(%q) = %q, want %q", key, ProjectOf(key), pa)
		}
	})
}

// TestProp_BadUploadRefused — an upload outside the allow-list OR over the ceiling is ALWAYS
// refused (never coerced, never truncated), while a conforming upload is accepted.
func TestProp_BadUploadRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBlob(rt)
		// A conforming upload: a declared MIME, a size ≤ ceiling, > 0.
		goodMime := b.AllowedMIME[0]
		goodSize := rapid.Int64Range(1, b.MaxBytes).Draw(rt, "good")
		if err := ValidateUpload(b, Upload{MIME: goodMime, Size: goodSize}); err != nil {
			rt.Fatalf("a conforming upload was refused: %v", err)
		}
		// Over-size is refused.
		if err := ValidateUpload(b, Upload{MIME: goodMime, Size: b.MaxBytes + 1}); err == nil {
			rt.Fatalf("over-size upload was not refused")
		}
		// An out-of-list MIME is refused (a MIME guaranteed absent).
		badMime := "zzz/not-in-list-" + goodMime
		if !AllowsMIME(b, badMime) {
			if err := ValidateUpload(b, Upload{MIME: badMime, Size: goodSize}); err == nil {
				rt.Fatalf("out-of-MIME upload was not refused")
			}
		}
	})
}
