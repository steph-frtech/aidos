// Package blob is the AIDOS Kernel BLOB / FILE attribute node (S72). It extends the
// entity type system (S35, back/kernel/entities; S71, .../ref) with a DISTINCT AST node —
// a BlobAttribute — that models an upload (image / document / file) WITHOUT touching the
// closed SCALAR set. A blob is NEITHER a scalar NOR a relation: it is its own node kind,
// the third disjoint plane of the entity grammar.
//
// THE CLOSED-SET HONESTY (the S72 done-criterion). The entity scalar type set
// {string,int,decimal,bool,timestamptz} stays CLOSED and untouched — a blob is NOT a
// scalar, so its existence never widens entities.ScalarTypes(). The honesty of the closed
// set is preserved exactly as for a relation: a blob never silently becomes a scalar and a
// scalar never becomes a blob. The three planes are disjoint: an entity carries ordered
// scalar Attributes (S35), ordered Relations (S71) AND, additively, ordered BlobAttributes
// (S72).
//
// A BLOB ATTRIBUTE IS A SOURCE NODE, ABOVE THE LINE. Like an entity / a relation
// (records.AuthorityAbove), it lives as an AST in the `kernel` Postgres schema (JSONB,
// content-addressed, append-only). The agent READS it (SELECT-only — the wall, CLAUDE.md
// §2); it NEVER writes it. The bytes themselves NEVER enter the truth-store nor git: they
// live in a per-project object-storage provider (ADR 0046), addressed by a project-scoped
// StorageKey. S72 defines the node, validates an upload (MIME + size), emits the
// deterministic upload/download handler, and computes the project-scoped storage key.
//
// PROJECT SCOPING (the S72 fixture done-criterion). Every blob's StorageKey is namespaced
// by project_id (StorageKey = "<project_id>/<entity>/<attr>/<content-hash>"). A key minted
// for project A therefore CANNOT be resolved from project B — CrossProjectAccess(keyOfA,
// projectB) is refused (BLOB_CROSS_PROJECT). A blob of project A is inaccessible from
// project B, never served, never guessed.
//
// UPLOAD VALIDATION (the S72 fixture done-criterion). An upload carries a declared MIME
// type and a byte size. ValidateUpload refuses an out-of-MIME upload (BLOB_MIME_REFUSED:
// the MIME is not in the attribute's declared allow-list) and an over-size upload
// (BLOB_SIZE_REFUSED: the size exceeds the attribute's MaxBytes), with a non-empty
// how_to_fix (no prison, KRD §44.5). Nothing is ever truncated or coerced — a bad upload
// is simply refused.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is a PURE, TOTAL function of its
// input — no clock, no RNG, no I/O, no map-iteration-order leak. The content address
// ID = records.Hash(records.Canonicalize(body)) reuses S02 verbatim, so a blob attribute
// ROUND-TRIPS as a content-addressed AST, and the emitted upload handler is byte-stable
// (same node → byte-identical handler). The reproducibility mirror (blob_property_test.go)
// pins it.
//
// REUSE, NEVER FORK. The refusal reuses blockreason.BlockReason (S13) verbatim; the hash
// reuses records.Hash. The MIME allow-list is a per-attribute CLOSED set the source pins.
package blob

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// BlobAttribute is the blob/file SOURCE AST node (S72). It is a DISTINCT node from a scalar
// Attribute (S35) and from a Relation (S71): it carries a Name (the field name on the
// entity), an AllowedMIME allow-list (the CLOSED, per-attribute set of MIME types a valid
// upload may carry — never widened at upload time), a MaxBytes ceiling (the largest a valid
// upload may be), and Required (drives NOT NULL on the storage-key column at S74). The node
// carries NO scalar Type and NO relation Target — it is referential to OBJECT STORAGE, not
// to the truth-store; the closed scalar set is untouched.
type BlobAttribute struct {
	Name        string   `json:"name"`
	AllowedMIME []string `json:"allowed_mime"`
	MaxBytes    int64    `json:"max_bytes"`
	Required    bool     `json:"required,omitempty"`
}

// Upload is the value an upload control submits: the declared MIME type and the byte size
// of the candidate object. It is NOT a node — it is the runtime payload validated against a
// BlobAttribute. The bytes themselves are never modeled here (they go to object storage);
// only the validated facts (mime, size) are.
type Upload struct {
	MIME string `json:"mime"`
	Size int64  `json:"size"`
}

// Validation sentinels — the internal causes folded into a BlockReason at the validate /
// resolve boundary. A malformed node or a bad upload is never a panic and never a silent
// default.
var (
	// ErrNoName — the blob attribute pins no field name; it is not addressable.
	ErrNoName = errors.New("blob: attribute pins no name")
	// ErrNoMIME — the blob attribute pins no allowed MIME; nothing could ever pass.
	ErrNoMIME = errors.New("blob: attribute pins no allowed MIME type")
	// ErrBadMaxBytes — the blob attribute pins a non-positive size ceiling.
	ErrBadMaxBytes = errors.New("blob: attribute pins a non-positive max_bytes")
	// ErrMimeRefused — the upload's MIME is not in the attribute's declared allow-list.
	// The canonical BLOB_MIME_REFUSED cause (the honesty rule: never widened at upload).
	ErrMimeRefused = errors.New("blob: upload MIME is not in the declared allow-list")
	// ErrSizeRefused — the upload's size exceeds the attribute's MaxBytes ceiling.
	ErrSizeRefused = errors.New("blob: upload size exceeds the declared max_bytes")
	// ErrEmptyUpload — the upload pins no MIME or a non-positive size; it is malformed.
	ErrEmptyUpload = errors.New("blob: upload pins no MIME or a non-positive size")
	// ErrCrossProject — a storage key minted for one project is accessed from another.
	// The canonical BLOB_CROSS_PROJECT cause (the project-scoping done-criterion).
	ErrCrossProject = errors.New("blob: storage key belongs to another project")
	// ErrNoProject — a project id is required to scope a storage key.
	ErrNoProject = errors.New("blob: a project id is required to scope the storage key")
)

// ValidateShape checks a blob attribute pins what it needs: a name, at least one allowed
// MIME type, and a positive size ceiling. It invents nothing: an unpinned name / empty
// allow-list / non-positive ceiling is a cause, not a default. Returns nil for a
// well-shaped node.
func ValidateShape(b BlobAttribute) error {
	if b.Name == "" {
		return ErrNoName
	}
	if len(b.AllowedMIME) == 0 {
		return ErrNoMIME
	}
	for _, m := range b.AllowedMIME {
		if strings.TrimSpace(m) == "" {
			return ErrNoMIME
		}
	}
	if b.MaxBytes <= 0 {
		return ErrBadMaxBytes
	}
	return nil
}

// AllowsMIME reports whether a MIME type is a member of the attribute's declared allow-list.
// Membership is exact — an upload's MIME is never widened, coerced or guessed.
func AllowsMIME(b BlobAttribute, mime string) bool {
	for _, m := range b.AllowedMIME {
		if m == mime {
			return true
		}
	}
	return false
}

// ValidateUpload validates an upload against a blob attribute: the node must be well-shaped,
// the upload must declare a MIME and a positive size, the MIME must be in the allow-list
// (else BLOB_MIME_REFUSED) and the size must not exceed MaxBytes (else BLOB_SIZE_REFUSED).
// It refuses, never truncates or coerces. Returns nil for an accepted upload.
func ValidateUpload(b BlobAttribute, u Upload) error {
	if err := ValidateShape(b); err != nil {
		return err
	}
	if u.MIME == "" || u.Size <= 0 {
		return ErrEmptyUpload
	}
	if !AllowsMIME(b, u.MIME) {
		return fmt.Errorf("%w: %q (attribute %q allows %v)", ErrMimeRefused, u.MIME, b.Name, b.AllowedMIME)
	}
	if u.Size > b.MaxBytes {
		return fmt.Errorf("%w: %d > %d (attribute %q)", ErrSizeRefused, u.Size, b.MaxBytes, b.Name)
	}
	return nil
}

// StorageKey computes the PROJECT-SCOPED object-storage key for a blob: it is namespaced by
// projectID so a key minted for one project is unreachable from another. The key is a pure
// function of (projectID, entity, attribute, contentHash) — no clock, no RNG. The
// contentHash is the SHA-256 of the object bytes (computed by the caller / the upload
// handler), NOT a hash of a node. The bytes never enter the truth-store; only this key does.
func StorageKey(projectID, entity string, b BlobAttribute, contentHash string) (string, error) {
	if projectID == "" {
		return "", ErrNoProject
	}
	if err := ValidateShape(b); err != nil {
		return "", err
	}
	return projectID + "/" + entity + "/" + b.Name + "/" + contentHash, nil
}

// ProjectOf extracts the owning project id of a storage key (the first path segment). A key
// with no segment is owned by no project (empty). It is the inverse of the StorageKey
// namespacing and the basis of the cross-project refusal.
func ProjectOf(key string) string {
	i := strings.IndexByte(key, '/')
	if i <= 0 {
		return ""
	}
	return key[:i]
}

// CrossProjectAccess refuses access to a storage key from a project that does not own it
// (the S72 project-scoping done-criterion: a blob of project A is inaccessible from project
// B). It returns nil iff the key's owning project equals projectID. This is the
// deterministic membership check the emitted download handler enforces — never an LLM, never
// a guess.
func CrossProjectAccess(key, projectID string) error {
	if projectID == "" {
		return ErrNoProject
	}
	if ProjectOf(key) != projectID {
		return fmt.Errorf("%w: key owned by %q, accessed from %q", ErrCrossProject, ProjectOf(key), projectID)
	}
	return nil
}

// Body re-serializes a BlobAttribute into the canonical JSON body the kernel stores, so the
// recorded id == the node's kernel head hash. It marshals through records.Canonicalize (so
// object-key order never leaks into the hash). The AllowedMIME slice order IS semantic (it
// is the order rendered in the handler), so canonicalization keeps it; to make the content
// address independent of an incidental author re-ordering of an otherwise-identical
// allow-list, the caller may sort it via Canonical first (Body does NOT sort — a reorder is
// a new version, exactly like an attribute reorder in S35).
func Body(b BlobAttribute) ([]byte, error) {
	raw, err := json.Marshal(b)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ID returns the content address of a blob attribute: records.Hash(records.Canonicalize(
// body)) — S02 reused verbatim, never forked. Any byte change (rename, MIME add/drop/
// reorder, size change, requiredness) yields a different ID, i.e. a new version (KRD §12,
// §40). This is the content-addressed round-trip the S72 done-criterion pins.
func ID(b BlobAttribute) (string, error) {
	body, err := Body(b)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// Parse decodes a canonical JSON body back into a BlobAttribute — the read half of the
// content-addressed round-trip (Body → Parse is the identity on a well-formed body, and
// ID(Parse(Body(b))) == ID(b)). It does NOT validate shape; that is ValidateShape. A
// malformed body is an error, never a partial guess.
func Parse(body []byte) (BlobAttribute, error) {
	var b BlobAttribute
	if err := json.Unmarshal(body, &b); err != nil {
		return BlobAttribute{}, err
	}
	return b, nil
}

// Canonical returns a copy of the attribute with its AllowedMIME allow-list sorted
// lexicographically — the canonical form a modeler tool may use so an otherwise-identical
// allow-list authored in a different order yields the SAME content address. It is OPTIONAL
// (Body/ID do not call it): use it when allow-list order should not be part of identity.
func Canonical(b BlobAttribute) BlobAttribute {
	mimes := make([]string, len(b.AllowedMIME))
	copy(mimes, b.AllowedMIME)
	sort.Strings(mimes)
	out := b
	out.AllowedMIME = mimes
	return out
}

// BlockUpload renders the canonical S13 BlockReason for a refused upload / blob node — or a
// cross-project access. It reuses the blockreason shape (never a new code beyond a human
// red) and always carries a non-empty how_to_fix (no prison, KRD §44.5). The code names the
// precise refusal so the panel and `aidos explain` are actionable.
func BlockUpload(cause error) blockreason.BlockReason {
	code := "BLOB_INVALID"
	switch {
	case errors.Is(cause, ErrMimeRefused):
		code = "BLOB_MIME_REFUSED"
	case errors.Is(cause, ErrSizeRefused):
		code = "BLOB_SIZE_REFUSED"
	case errors.Is(cause, ErrCrossProject):
		code = "BLOB_CROSS_PROJECT"
	}
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Upload refusé (" + code + ") : " + cause.Error() + ". Un attribut blob/fichier " +
			"déclare une liste FERMÉE de types MIME et un plafond de taille ; un upload hors-MIME ou " +
			"hors-taille est REFUSÉ, jamais tronqué ni coercé. Les octets ne touchent JAMAIS le " +
			"truth-store ni git : ils vivent dans le stockage objet par projet, adressés par une clé " +
			"scopée project_id — un blob du projet A est inaccessible depuis le projet B (jamais servi, " +
			"jamais deviné). L'ensemble scalaire reste clos : un blob est un nœud à part, jamais un scalaire.",
		HowToFix: []string{
			"use_an_allowed_mime : l'upload doit déclarer un type MIME de la liste fermée de l'attribut ; un MIME hors liste n'est jamais élargi.",
			"shrink_below_max_bytes : la taille de l'upload doit être ≤ max_bytes de l'attribut ; rien n'est tronqué.",
			"access_within_your_project : une clé de stockage scopée project_id n'est lisible que depuis SON projet ; un accès cross-projet est refusé, jamais deviné.",
		},
	}
}
