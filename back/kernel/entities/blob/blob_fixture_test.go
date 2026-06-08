// blob_fixture_test.go — the S72 schema-validation FIXTURE mirror (the blob node's required
// fixture kind, KRD §27). reflects=kernel.entities.blob, test_kind=fixture, cert_language=go,
// liveness=live, authority=below. It pins the THREE concrete S72 done-criteria as scenarios:
//
//   - a blob attribute round-trips as a content-addressed AST AND emits a deterministic
//     upload/download handler (signed URLs, MIME+size validation baked in);
//   - a blob of project A is INACCESSIBLE from project B (BLOB_CROSS_PROJECT);
//   - an upload out-of-MIME (BLOB_MIME_REFUSED) or out-of-size (BLOB_SIZE_REFUSED) is REFUSED,
//     with a non-empty how_to_fix (no prison).
package blob

import (
	"errors"
	"strings"
	"testing"
)

// avatar is the canonical demo blob attribute: an avatar image, ≤ 1 MiB, png|jpeg only.
func avatar() BlobAttribute {
	return BlobAttribute{
		Name:        "avatar",
		AllowedMIME: []string{"image/png", "image/jpeg"},
		MaxBytes:    1 << 20, // 1 MiB
		Required:    true,
	}
}

// TestFixture_BlobRoundTripsAndEmitsDeterministicHandler — the first done-criterion: the node
// round-trips as a content-addressed AST, and EmitHandler renders a byte-stable handler that
// bakes in the closed MIME set, the size ceiling, the project-scoped key, and signed URLs.
func TestFixture_BlobRoundTripsAndEmitsDeterministicHandler(t *testing.T) {
	b := avatar()

	body, err := Body(b)
	if err != nil {
		t.Fatalf("Body: %v", err)
	}
	got, err := Parse(body)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	id1, _ := ID(b)
	id2, _ := ID(got)
	if id1 != id2 || id1 == "" {
		t.Fatalf("round-trip broke the content address: %q vs %q", id1, id2)
	}

	a1, br := EmitHandler("projA", "User", b)
	if br != nil {
		t.Fatalf("EmitHandler refused a well-shaped node: %+v", br)
	}
	a2, _ := EmitHandler("projA", "User", b)
	if string(a1.Bytes) != string(a2.Bytes) {
		t.Fatalf("handler is not deterministic (byte-stable)")
	}
	src := string(a1.Bytes)
	for _, must := range []string{
		"BLOB_MIME_REFUSED", "BLOB_SIZE_REFUSED", "BLOB_CROSS_PROJECT",
		"signUpload", "signDownload", "image/png", "image/jpeg",
		"projA/User/avatar/", "MAX_BYTES = 1048576",
	} {
		if !strings.Contains(src, must) {
			t.Fatalf("emitted handler missing %q\n---\n%s", must, src)
		}
	}
	if a1.SourceHash != id1 {
		t.Fatalf("handler source hash %q != node id %q", a1.SourceHash, id1)
	}
}

// TestFixture_BlobOfAIsInaccessibleFromB — the second done-criterion: a blob's storage key is
// project-scoped; a key minted for project A cannot be resolved from project B.
func TestFixture_BlobOfAIsInaccessibleFromB(t *testing.T) {
	b := avatar()
	keyA, err := StorageKey("projA", "User", b, "deadbeef")
	if err != nil {
		t.Fatalf("StorageKey(A): %v", err)
	}
	if got := ProjectOf(keyA); got != "projA" {
		t.Fatalf("ProjectOf(%q) = %q, want projA", keyA, got)
	}
	// A reaches its own blob.
	if err := CrossProjectAccess(keyA, "projA"); err != nil {
		t.Fatalf("A cannot access its own blob: %v", err)
	}
	// B is REFUSED — never served, never guessed.
	err = CrossProjectAccess(keyA, "projB")
	if !errors.Is(err, ErrCrossProject) {
		t.Fatalf("expected ErrCrossProject for B accessing A's key, got %v", err)
	}
	br := BlockUpload(err)
	if br.Code == "" || len(br.HowToFix) == 0 {
		t.Fatalf("cross-project block has no actionable how_to_fix (prison): %+v", br)
	}
	if !strings.Contains(br.Explanation, "BLOB_CROSS_PROJECT") {
		t.Fatalf("block does not name BLOB_CROSS_PROJECT: %q", br.Explanation)
	}
}

// TestFixture_OutOfMimeUploadIsRefused — the third done-criterion (MIME half): an upload whose
// MIME is not in the declared allow-list is refused (BLOB_MIME_REFUSED), never widened.
func TestFixture_OutOfMimeUploadIsRefused(t *testing.T) {
	b := avatar()
	err := ValidateUpload(b, Upload{MIME: "application/pdf", Size: 1000})
	if !errors.Is(err, ErrMimeRefused) {
		t.Fatalf("expected ErrMimeRefused for application/pdf, got %v", err)
	}
	br := BlockUpload(err)
	if br.Code == "" || len(br.HowToFix) == 0 || !strings.Contains(br.Explanation, "BLOB_MIME_REFUSED") {
		t.Fatalf("MIME refusal not actionable / mis-coded: %+v", br)
	}
	// A declared MIME is accepted.
	if err := ValidateUpload(b, Upload{MIME: "image/png", Size: 1000}); err != nil {
		t.Fatalf("a declared MIME was refused: %v", err)
	}
}

// TestFixture_OverSizeUploadIsRefused — the third done-criterion (size half): an upload over
// the ceiling is refused (BLOB_SIZE_REFUSED), never truncated.
func TestFixture_OverSizeUploadIsRefused(t *testing.T) {
	b := avatar()
	err := ValidateUpload(b, Upload{MIME: "image/png", Size: (1 << 20) + 1})
	if !errors.Is(err, ErrSizeRefused) {
		t.Fatalf("expected ErrSizeRefused for an over-size upload, got %v", err)
	}
	br := BlockUpload(err)
	if br.Code == "" || len(br.HowToFix) == 0 || !strings.Contains(br.Explanation, "BLOB_SIZE_REFUSED") {
		t.Fatalf("size refusal not actionable / mis-coded: %+v", br)
	}
	// At-the-ceiling is accepted (≤, not <).
	if err := ValidateUpload(b, Upload{MIME: "image/png", Size: 1 << 20}); err != nil {
		t.Fatalf("an at-the-ceiling upload was refused: %v", err)
	}
}

// TestFixture_MalformedNodeIsRefusedNeverGuessed — a node with no name / empty allow-list /
// non-positive ceiling is refused with an actionable block, never a silent default.
func TestFixture_MalformedNodeIsRefusedNeverGuessed(t *testing.T) {
	cases := []struct {
		name string
		b    BlobAttribute
	}{
		{"no name", BlobAttribute{AllowedMIME: []string{"image/png"}, MaxBytes: 10}},
		{"no mime", BlobAttribute{Name: "x", MaxBytes: 10}},
		{"bad max", BlobAttribute{Name: "x", AllowedMIME: []string{"image/png"}, MaxBytes: 0}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := ValidateShape(c.b); err == nil {
				t.Fatalf("malformed node accepted: %+v", c.b)
			}
			if _, br := EmitHandler("projA", "User", c.b); br == nil || len(br.HowToFix) == 0 {
				t.Fatalf("emit accepted/imprisoned a malformed node: %+v", br)
			}
		})
	}
}
