// emit.go — the BLOB upload/download HANDLER EMITTER (S72). It renders a DETERMINISTIC,
// byte-stable TypeScript handler for a BlobAttribute: a signed-URL mint for upload, a
// signed-URL mint for download, MIME + size validation against the node's CLOSED allow-list
// and MaxBytes ceiling, and the PROJECT-SCOPED storage key (so a blob of project A is
// unreachable from project B). It is the S72 "émet un handler d'upload déterministe"
// done-criterion.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). EmitHandler is a PURE, TOTAL function of its input —
// no clock, no RNG, no I/O, no LLM. The rendered handler is byte-identical for an identical
// (projectID, entity, node) triple, and any byte change to the node (a MIME add/drop, a size
// change, a rename) yields different output, exactly like the entity emitters (S35). The
// signing itself is delegated to the emitted-app's storage provider at runtime (an HMAC over
// the key + an expiry) — the EMITTER never signs; it renders the deterministic CALL to the
// provider's sign(). The reproducibility mirror (blob_property_test.go) pins byte-stability.
//
// THE WALL. The handler is a PROJECTION (emitted code, regenerable); emitting it writes no
// truth. It targets the emitted app's runtime (ADR 0040: Hono / functional TS); AIDOS never
// emits Go for the user app. The bytes never enter the truth-store nor git — the handler
// addresses them through the per-project object-storage provider (ADR 0046).
package blob

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// blockUploadPtr renders the canonical refusal as a pointer (the emitter returns *BlockReason,
// nil on success — mirroring the entities emitters). It reuses BlockUpload verbatim.
func blockUploadPtr(cause error) *blockreason.BlockReason {
	br := BlockUpload(cause)
	return &br
}

// protectedMarker mirrors the entities emitter marker: a generated file is never
// hand-edited (the regeneration guard of S78). The same marker on every emitted target.
const protectedMarker = "AIDOS-GENERATED — do not hand-edit (regenerate from the kernel source)"

// HandlerArtifact wraps the rendered handler bytes with its provenance: the source content
// address (the node ID), the emit target, and the relative path. It mirrors entities.Artifact
// so S74/S78 (relation-aware + project-scoped regeneration) treat blob handlers uniformly.
type HandlerArtifact struct {
	Path       string
	Target     string
	Bytes      []byte
	SourceHash string
}

// TargetHandlerTS is the emit target for the blob upload/download handler — the emitted app's
// TypeScript runtime (ADR 0040). AIDOS never emits Go for the user app.
const TargetHandlerTS = "ts-blob-handler"

// jsString renders a Go string as a JSON/TS double-quoted literal (deterministic, no clock).
func jsString(s string) string {
	return strconv.Quote(s)
}

// EmitHandler renders the DETERMINISTIC upload/download handler for a blob attribute, scoped
// to (projectID, entity). The handler:
//
//   - validates an upload's MIME against the node's CLOSED allow-list (BLOB_MIME_REFUSED),
//   - validates an upload's size against the node's MaxBytes ceiling (BLOB_SIZE_REFUSED),
//   - mints a PROJECT-SCOPED storage key ("<projectID>/<entity>/<attr>/<contentHash>"),
//   - mints a SIGNED upload URL and a SIGNED download URL via the provider's sign(),
//   - refuses a cross-project download (BLOB_CROSS_PROJECT) — a blob of project A is
//     inaccessible from project B.
//
// It is a PURE function of (projectID, entity, node): same input → byte-identical output. A
// malformed node (empty name / empty allow-list / non-positive MaxBytes) or an empty
// projectID is a BlockReason, never a partial render. The allow-list and the ceiling are
// BAKED INTO the handler as constants, so the emitted runtime enforces the SAME closed set
// the source pinned — never an LLM, never a widened guess.
func EmitHandler(projectID, entity string, b BlobAttribute) (HandlerArtifact, *blockreason.BlockReason) {
	if projectID == "" {
		br := blockUploadPtr(ErrNoProject)
		return HandlerArtifact{}, br
	}
	if entity == "" {
		br := blockUploadPtr(ErrNoName)
		return HandlerArtifact{}, br
	}
	if err := ValidateShape(b); err != nil {
		br := blockUploadPtr(err)
		return HandlerArtifact{}, br
	}
	sourceHash, err := ID(b)
	if err != nil {
		br := blockUploadPtr(err)
		return HandlerArtifact{}, br
	}

	// The allow-list is rendered IN SOURCE ORDER (order is semantic, like an attribute
	// order in S35) as a TS readonly tuple — baked closed set, enforced at runtime.
	mimes := make([]string, len(b.AllowedMIME))
	for i, m := range b.AllowedMIME {
		mimes[i] = jsString(m)
	}
	prefix := projectID + "/" + entity + "/" + b.Name + "/"

	var sb strings.Builder
	fmt.Fprintf(&sb, "// %s. source: %s\n", protectedMarker, sourceHash)
	sb.WriteString("// S72 blob upload/download handler — deterministic, signed URLs, MIME+size validation, project-scoped.\n")
	sb.WriteString("import type { StorageProvider } from \"../provider\";\n\n")

	fmt.Fprintf(&sb, "export const PROJECT_ID = %s;\n", jsString(projectID))
	fmt.Fprintf(&sb, "export const ENTITY = %s;\n", jsString(entity))
	fmt.Fprintf(&sb, "export const ATTRIBUTE = %s;\n", jsString(b.Name))
	fmt.Fprintf(&sb, "export const ALLOWED_MIME = [%s] as const;\n", strings.Join(mimes, ", "))
	fmt.Fprintf(&sb, "export const MAX_BYTES = %d;\n", b.MaxBytes)
	fmt.Fprintf(&sb, "export const KEY_PREFIX = %s;\n\n", jsString(prefix))

	// validateUpload — the SAME closed-set check as Go's ValidateUpload, baked in.
	sb.WriteString("export function validateUpload(mime: string, size: number): { ok: true } | { ok: false; code: string } {\n")
	sb.WriteString("\tif (!mime || size <= 0) return { ok: false, code: \"BLOB_INVALID\" };\n")
	sb.WriteString("\tif (!(ALLOWED_MIME as readonly string[]).includes(mime)) return { ok: false, code: \"BLOB_MIME_REFUSED\" };\n")
	sb.WriteString("\tif (size > MAX_BYTES) return { ok: false, code: \"BLOB_SIZE_REFUSED\" };\n")
	sb.WriteString("\treturn { ok: true };\n")
	sb.WriteString("}\n\n")

	// storageKey — the PROJECT-SCOPED key (namespaced by PROJECT_ID).
	sb.WriteString("export function storageKey(contentHash: string): string {\n")
	sb.WriteString("\treturn KEY_PREFIX + contentHash;\n")
	sb.WriteString("}\n\n")

	// projectOf — the inverse, for the cross-project refusal.
	sb.WriteString("export function projectOf(key: string): string {\n")
	sb.WriteString("\tconst i = key.indexOf(\"/\");\n")
	sb.WriteString("\treturn i <= 0 ? \"\" : key.slice(0, i);\n")
	sb.WriteString("}\n\n")

	// signUpload — validate then mint a signed upload URL via the provider.
	sb.WriteString("export async function signUpload(provider: StorageProvider, contentHash: string, mime: string, size: number): Promise<{ ok: true; url: string; key: string } | { ok: false; code: string }> {\n")
	sb.WriteString("\tconst v = validateUpload(mime, size);\n")
	sb.WriteString("\tif (!v.ok) return v;\n")
	sb.WriteString("\tconst key = storageKey(contentHash);\n")
	sb.WriteString("\tconst url = await provider.signPut(key, mime, size);\n")
	sb.WriteString("\treturn { ok: true, url, key };\n")
	sb.WriteString("}\n\n")

	// signDownload — refuse a cross-project key, else mint a signed download URL.
	sb.WriteString("export async function signDownload(provider: StorageProvider, key: string): Promise<{ ok: true; url: string } | { ok: false; code: string }> {\n")
	sb.WriteString("\tif (projectOf(key) !== PROJECT_ID) return { ok: false, code: \"BLOB_CROSS_PROJECT\" };\n")
	sb.WriteString("\tconst url = await provider.signGet(key);\n")
	sb.WriteString("\treturn { ok: true, url };\n")
	sb.WriteString("}\n")

	out := []byte(sb.String())
	return HandlerArtifact{
		Path:       "gen/blob/" + projectID + "/" + strings.ToLower(entity) + "/" + b.Name + ".handler.ts",
		Target:     TargetHandlerTS,
		Bytes:      out,
		SourceHash: sourceHash,
	}, nil
}
