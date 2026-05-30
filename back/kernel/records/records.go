// Package records defines the seven KRDCore record kinds — Idea, Truth, Mirror,
// Layer, Link, ChangeSet, Phase — as the content-addressed, append-only JSONB
// substrate of the Kernel.
//
// A record is content-addressed: its id and its version are BOTH the SHA-256 hex
// digest of its canonical JSONB body (the version is "the licence to change" —
// KRD §12). Append-only means a row is never mutated in place: the head moves by
// inserting a NEW row whose superseded_by closes the prior one. This package is
// PURE — no DB calls, no I/O. The DB is reached later via sqlc/pgx; the GRANTs in
// the migration enforce that the agent role may only SELECT these schemas (the
// wall, CLAUDE.md §2). Truth writes flow through the aidos CLI role, never here.
//
// Record shapes mirror the Tome: Layer (KRD §21), Mirror (§34), Idea (§118),
// the six link types (§41), ChangeSet (§98/§44), Phase stable (§43).
package records

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

// Kind enumerates the seven KRDCore record kinds. It is the single discriminator
// of a record body; every record carries exactly one kind.
type Kind string

const (
	KindIdea      Kind = "idea"
	KindTruth     Kind = "truth"
	KindMirror    Kind = "mirror"
	KindLayer     Kind = "layer"
	KindLink      Kind = "link"
	KindChangeSet Kind = "changeset"
	KindPhase     Kind = "phase"
)

// Authority places a record relative to the waterline (KRD §15). Above-the-line
// records are human-anchored truth out of AI reach; below-the-line records are
// AI self-certified projections.
type Authority string

const (
	// AuthorityAbove — above the waterline: human-anchored truth (test-as-goal).
	AuthorityAbove Authority = "above"
	// AuthorityBelow — below the waterline: AI self-certifies (test-as-means).
	AuthorityBelow Authority = "below"
)

// Kinds returns the seven KRDCore kinds in canonical order. Used by the
// validator and the Workbench projection so the set of cards is never invented.
func Kinds() []Kind {
	return []Kind{KindIdea, KindTruth, KindMirror, KindLayer, KindLink, KindChangeSet, KindPhase}
}

// defaultAuthority maps each kind to where it sits on the waterline by nature.
// Truth, Mirror and Layer are above the line (the bicephalous truth + its proof
// + the meta-type). Idea is a candidate below the freeze. Link, ChangeSet and
// Phase are structural records of the truth-store itself, above the line.
var defaultAuthority = map[Kind]Authority{
	KindIdea:      AuthorityBelow,
	KindTruth:     AuthorityAbove,
	KindMirror:    AuthorityAbove,
	KindLayer:     AuthorityAbove,
	KindLink:      AuthorityAbove,
	KindChangeSet: AuthorityAbove,
	KindPhase:     AuthorityAbove,
}

// DefaultAuthority returns the natural waterline placement of a kind. It is a
// declared (never learned) mapping; the Workbench renders it as a badge.
func DefaultAuthority(k Kind) Authority { return defaultAuthority[k] }

// Record is one content-addressed, append-only row of the Kernel truth-store.
// id == version == Hash(Canonicalize(Body)) is the content-address invariant.
// SupersededBy is empty for a head row; when the head moves a NEW row is written
// and the prior row's superseded_by is closed to the new id (the row body is
// never mutated — append-only).
type Record struct {
	ID           string          `json:"id"`
	Kind         Kind            `json:"kind"`
	Body         json.RawMessage `json:"body"`
	Version      string          `json:"version"`
	SupersededBy string          `json:"superseded_by,omitempty"`
}

// Validation errors.
var (
	ErrUnknownKind      = errors.New("records: unknown kind")
	ErrBodyKindMissing  = errors.New("records: body missing kind discriminator")
	ErrBodyKindMismatch = errors.New("records: body kind does not match record kind")
	ErrContentAddress   = errors.New("records: id/version is not the content hash of the canonical body")
	ErrInvalidJSON      = errors.New("records: body is not valid JSON")
)

// Hash returns the canonical SHA-256 hex digest of b. It matches the Archive
// contentstore.Hash so a record lands under the same address in either store.
func Hash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Canonicalize returns the deterministic JSONB encoding of body: the same logical
// object always produces the same bytes regardless of input key order or
// insignificant whitespace. It re-parses the JSON into Go values and re-marshals
// with object keys sorted lexicographically (recursively). This is the canonical
// form a record is hashed over, so Hash(Canonicalize(body)) is stable under key
// reordering. Returns an error if body is not valid JSON.
func Canonicalize(body []byte) ([]byte, error) {
	var v any
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	var out bytes.Buffer
	if err := encodeCanonical(&out, v); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// encodeCanonical writes v to buf with object keys sorted, arrays in order, and
// no insignificant whitespace. It handles the JSON value space produced by
// json.Decoder with UseNumber: map[string]any, []any, string, json.Number,
// bool, nil.
func encodeCanonical(buf *bytes.Buffer, v any) error {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			kb, err := json.Marshal(k)
			if err != nil {
				return err
			}
			buf.Write(kb)
			buf.WriteByte(':')
			if err := encodeCanonical(buf, t[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
		return nil
	case []any:
		buf.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := encodeCanonical(buf, e); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
		return nil
	default:
		// Scalars (string, json.Number, bool, nil) marshal deterministically.
		b, err := json.Marshal(v)
		if err != nil {
			return err
		}
		buf.Write(b)
		return nil
	}
}

// bodyKind extracts the "kind" discriminator from a JSON body.
func bodyKind(body []byte) (Kind, error) {
	var probe struct {
		Kind Kind `json:"kind"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	if probe.Kind == "" {
		return "", ErrBodyKindMissing
	}
	return probe.Kind, nil
}

// isKnownKind reports whether k is one of the seven KRDCore kinds.
func isKnownKind(k Kind) bool {
	for _, kk := range Kinds() {
		if kk == k {
			return true
		}
	}
	return false
}

// Validate checks a record's shape and the content-address invariant:
//   - kind is one of the seven KRDCore kinds;
//   - body is valid JSON carrying a "kind" matching the record's kind;
//   - id == version == Hash(Canonicalize(body)).
//
// Validate never touches the DB and never writes truth; it is the pure check the
// `aidos check` validator and the property mirror exercise.
func Validate(r Record) error {
	if !isKnownKind(r.Kind) {
		return fmt.Errorf("%w: %q", ErrUnknownKind, r.Kind)
	}
	bk, err := bodyKind(r.Body)
	if err != nil {
		return err
	}
	if bk != r.Kind {
		return fmt.Errorf("%w: record %q body %q", ErrBodyKindMismatch, r.Kind, bk)
	}
	canon, err := Canonicalize(r.Body)
	if err != nil {
		return err
	}
	want := Hash(canon)
	if r.ID != want || r.Version != want {
		return fmt.Errorf("%w: id=%q version=%q want=%q", ErrContentAddress, r.ID, r.Version, want)
	}
	return nil
}

// NewRecord builds a content-addressed Record from a kind and a JSON body. It
// canonicalizes the body, computes the content hash, and sets id == version to
// that hash. The returned record always passes Validate. NewRecord is a
// constructor for callers that hold a body and want the canonical row; it does
// NOT write to the DB (the wall: only the aidos CLI role writes truth).
func NewRecord(kind Kind, body []byte) (Record, error) {
	if !isKnownKind(kind) {
		return Record{}, fmt.Errorf("%w: %q", ErrUnknownKind, kind)
	}
	bk, err := bodyKind(body)
	if err != nil {
		return Record{}, err
	}
	if bk != kind {
		return Record{}, fmt.Errorf("%w: record %q body %q", ErrBodyKindMismatch, kind, bk)
	}
	canon, err := Canonicalize(body)
	if err != nil {
		return Record{}, err
	}
	h := Hash(canon)
	return Record{
		ID:      h,
		Kind:    kind,
		Body:    canon,
		Version: h,
	}, nil
}
