package frontemit

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Artifact wraps rendered bytes with their provenance, content-addressed by SOURCE (the spec
// hash) and by OUTPUT (the digest of the bytes — the byte-identical re-emit proof). Path is
// RELATIVE (no absolute path — determinism). It mirrors the S35/S87 Artifact so S78
// (project-scoped regeneration) treats frontemit artifacts uniformly.
type Artifact struct {
	Path       string `json:"path"`
	Target     string `json:"target"`
	Bytes      []byte `json:"bytes"`
	SourceHash string `json:"source_hash"`
	OutputHash string `json:"output_hash"`
	Protected  bool   `json:"protected"`
}

// header renders the protected file header for a comment syntax + the source hash.
func header(commentPrefix, sourceHash string) string {
	return fmt.Sprintf("%s %s. source: %s\n", commentPrefix, protectedMarker, sourceHash)
}

// artifact wraps rendered bytes into an Artifact, content-addressing the output.
func artifact(path, target string, out []byte, sourceHash string) Artifact {
	return Artifact{
		Path:       path,
		Target:     target,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Protected:  true,
	}
}

// jsStr renders a Go string as a TS/JS double-quoted literal, JSON-escaped — deterministic,
// no template injection. Reused by every emitted-TS renderer so quoting never drifts.
func jsStr(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return "\"\""
	}
	return string(b)
}

// mustJSON marshals a value to JSON for the canonical source-body hash. The shapes passed in
// are always JSON-marshalable (plain maps/slices/strings), so an error is a programming fault,
// not a runtime input — it surfaces as the empty object (the hash then differs, never silently
// equal).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}
