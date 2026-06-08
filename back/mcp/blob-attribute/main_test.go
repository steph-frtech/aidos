package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities/blob"
)

// The blob-attribute MCP server is PURE computation (the wall): these tests prove each tool
// returns deterministically without any I/O — they mirror the S72 done-criteria at the MCP
// boundary: a blob round-trips + emits a deterministic handler, a blob of A is inaccessible
// from B, and an out-of-MIME / out-of-size upload is refused (never coerced).

func avatar() blob.BlobAttribute {
	return blob.BlobAttribute{Name: "avatar", AllowedMIME: []string{"image/png", "image/jpeg"}, MaxBytes: 1 << 20, Required: true}
}

func TestBlobAddress_RoundTripDeterministic(t *testing.T) {
	_, a, _ := address(context.Background(), nil, addressInput{Blob: avatar()})
	_, b, _ := address(context.Background(), nil, addressInput{Blob: avatar()})
	if !a.OK || !b.OK {
		t.Fatalf("address must succeed: %+v %+v", a, b)
	}
	if a.ID == "" || a.ID != b.ID {
		t.Fatalf("content address non-deterministic: %q vs %q", a.ID, b.ID)
	}
	back, err := blob.Parse([]byte(a.Body))
	if err != nil {
		t.Fatalf("Parse(body): %v", err)
	}
	if id, _ := blob.ID(back); id != a.ID {
		t.Fatalf("round-trip changed the content address")
	}
}

func TestBlobValidate_OutOfMimeRefused(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, validateInput{Blob: avatar(), Upload: blob.Upload{MIME: "application/pdf", Size: 1000}})
	if out.OK || out.Block == nil {
		t.Fatalf("out-of-MIME upload must be refused: %+v", out)
	}
	if !strings.Contains(out.Block.Explanation, "BLOB_MIME_REFUSED") || len(out.Block.HowToFix) == 0 {
		t.Fatalf("MIME refusal not actionable: %+v", out.Block)
	}
}

func TestBlobValidate_OverSizeRefused(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, validateInput{Blob: avatar(), Upload: blob.Upload{MIME: "image/png", Size: (1 << 20) + 1}})
	if out.OK || out.Block == nil {
		t.Fatalf("over-size upload must be refused: %+v", out)
	}
	if !strings.Contains(out.Block.Explanation, "BLOB_SIZE_REFUSED") {
		t.Fatalf("size refusal not coded BLOB_SIZE_REFUSED: %+v", out.Block)
	}
}

func TestBlobValidate_ConformingAccepted(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, validateInput{Blob: avatar(), Upload: blob.Upload{MIME: "image/png", Size: 1000}})
	if !out.OK || out.Block != nil {
		t.Fatalf("a conforming upload must be accepted: %+v", out)
	}
}

func TestBlobStorageKey_ProjectScoped(t *testing.T) {
	_, out, _ := storageKey(context.Background(), nil, keyInput{ProjectID: "projA", Entity: "User", Blob: avatar(), ContentHash: "deadbeef"})
	if !out.OK || out.Key != "projA/User/avatar/deadbeef" {
		t.Fatalf("storage key not project-scoped: %+v", out)
	}
}

func TestBlobCrossProject_BInaccessible(t *testing.T) {
	_, ok, _ := crossProject(context.Background(), nil, crossInput{Key: "projA/User/avatar/deadbeef", ProjectID: "projA"})
	if !ok.OK {
		t.Fatalf("A must reach its own blob: %+v", ok)
	}
	_, no, _ := crossProject(context.Background(), nil, crossInput{Key: "projA/User/avatar/deadbeef", ProjectID: "projB"})
	if no.OK || no.Block == nil || !strings.Contains(no.Block.Explanation, "BLOB_CROSS_PROJECT") {
		t.Fatalf("B must be refused BLOB_CROSS_PROJECT: %+v", no)
	}
}

func TestBlobEmitHandler_Deterministic(t *testing.T) {
	_, a, _ := emitHandler(context.Background(), nil, emitInput{ProjectID: "projA", Entity: "User", Blob: avatar()})
	_, b, _ := emitHandler(context.Background(), nil, emitInput{ProjectID: "projA", Entity: "User", Blob: avatar()})
	if !a.OK || !b.OK {
		t.Fatalf("emit must succeed: %+v %+v", a, b)
	}
	if a.Code != b.Code || a.Code == "" {
		t.Fatalf("emitted handler not byte-stable")
	}
	for _, must := range []string{"signUpload", "signDownload", "BLOB_CROSS_PROJECT", "image/png"} {
		if !strings.Contains(a.Code, must) {
			t.Fatalf("handler missing %q", must)
		}
	}
}
