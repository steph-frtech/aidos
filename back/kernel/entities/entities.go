// Package entities is the AIDOS Kernel ENTITY SOURCE layer (KRD §23 line 530:
// `kind: entity` = the data model, a SOURCE layer, human / above the waterline) and
// the deterministic codegen that emits its three PROJECTIONS — a Go struct (the
// sqlc-shaped N3 type), a TypeScript type (the shared type/sdk projection), and the
// Postgres DDL (the expand-contract db projection) — from that ONE source, never
// double-typed (CLAUDE.md §3: "one source (entity) → emits Go + TS + DDL").
//
// AN ENTITY IS A SOURCE, ABOVE THE LINE (records.AuthorityAbove). It lives as an AST
// in the `kernel` Postgres schema (JSONB, content-addressed, append-only). The agent
// READS it (SELECT-only on kernel.entity — the wall, CLAUDE.md §2); it NEVER writes
// it. The three emitted outputs are BELOW the line: derived, disposable, replayable,
// materialized to back/gen/** (never hand-edited, CLAUDE.md §4/§9), guarded by this
// step's mirror.
//
// DISTINCT FROM S34 (back/runtime/generators): the S34 runtime emitter set treats an
// entity as a SET of fields (it sorts fields by name and emits NOT NULL on every
// column — a thin, order-free projection). THIS kernel entity is the richer SOURCE
// AST: attributes are ORDERED (the order is semantic — struct/field/column order
// follows source order) and each attribute carries `required`/`identifier`/
// `multivalued`, so identifier → PRIMARY KEY, required → NOT NULL / non-optional,
// ¬required → NULLABLE / TS optional. The two never share a gen/ path.
//
// DETERMINISM-FIRST (CLAUDE.md §6): EmitGo/EmitTS/EmitDDL are PURE, TOTAL functions
// of the entity — no clock, no RNG, no map-iteration-order leak, no absolute paths,
// normalized "\n" newlines — so each is byte-for-byte reproducible. The reproducibility
// mirror (entities_property_test.go) pins it. An attribute of an UNKNOWN scalar type
// is a BlockReason (the S13 shape, code UNKNOWN_ATTRIBUTE_TYPE) — never a guessed
// mapping to any/text (honesty).
//
// REUSE, NEVER FORK: the content address id = records.Hash(records.Canonicalize(body))
// reuses S02 verbatim; the refusal reuses blockreason.BlockReason (S13) verbatim.
package entities

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ScalarType is one token of the CLOSED entity scalar type set — the ubiquitous
// domain types pinned by the entity grammar, never invented ad-hoc (the honesty
// rule). The set is small and declared here; a field whose type is not a member is
// a BlockReason (UNKNOWN_ATTRIBUTE_TYPE), never a silent coercion.
type ScalarType string

const (
	// TypeString — a text value (DDL TEXT, Go string, TS string).
	TypeString ScalarType = "string"
	// TypeInt — a 64-bit integer (DDL BIGINT, Go int64, TS number).
	TypeInt ScalarType = "int"
	// TypeDecimal — an exact numeric (DDL NUMERIC, Go pgtype.Numeric, TS string —
	// JS has no exact decimal, so the projection keeps it a string, never lossy float).
	TypeDecimal ScalarType = "decimal"
	// TypeBool — a boolean (DDL BOOLEAN, Go bool, TS boolean).
	TypeBool ScalarType = "bool"
	// TypeTimestamptz — a timestamp with time zone (DDL TIMESTAMPTZ, Go
	// pgtype.Timestamptz, TS string — an ISO-8601 string on the wire).
	TypeTimestamptz ScalarType = "timestamptz"
)

// scalarOrder is the canonical enumeration order of the closed scalar set. Declared,
// never derived from map iteration, so ScalarTypes() is stable.
var scalarOrder = []ScalarType{TypeString, TypeInt, TypeDecimal, TypeBool, TypeTimestamptz}

// ScalarTypes returns every member of the closed scalar set, in canonical order.
func ScalarTypes() []ScalarType {
	out := make([]ScalarType, len(scalarOrder))
	copy(out, scalarOrder)
	return out
}

// IsKnownType reports whether t is a member of the closed scalar set.
func IsKnownType(t ScalarType) bool {
	_, ok := typeMap[t]
	return ok
}

// Attribute is one ORDERED attribute of an entity (KRD §23/§26). Its position in
// the entity's attributes slice is SEMANTIC — it is the struct/field/column order in
// every projection. `required` drives NOT NULL / TS non-optional; `identifier` marks
// the single PRIMARY KEY column; `multivalued` is carried for forward-compatibility
// (rendered as a list type) but the Order example uses only scalar singletons.
type Attribute struct {
	Name        string     `json:"name"`
	Type        ScalarType `json:"type"`
	Required    bool       `json:"required"`
	Identifier  bool       `json:"identifier,omitempty"`
	Multivalued bool       `json:"multivalued,omitempty"`
}

// Entity is the entity SOURCE AST (KRD §23). It is `name` + an ORDERED slice of
// attributes. Its identity (the content address) is the hash of its canonical body,
// computed via S02 — so any byte change (a new attribute, a reorder, a type change)
// yields a NEW version (the licence to change, KRD §12). The agent reads an Entity
// from kernel.entity (SELECT-only); it never authors one into truth.
type Entity struct {
	Name       string      `json:"name"`
	Attributes []Attribute `json:"attributes"`
}

// Validation sentinels — the internal causes folded into a BlockReason at the Emit
// boundary. A malformed source is never a panic and never a silent default.
var (
	// ErrNoName — the entity pins no name; it is not projectable.
	ErrNoName = errors.New("entities: entity pins no name")
	// ErrNoAttributes — the entity pins no attributes; it is not projectable.
	ErrNoAttributes = errors.New("entities: entity pins no attributes")
	// ErrNoAttributeName — an attribute pins no name.
	ErrNoAttributeName = errors.New("entities: an attribute pins no name")
	// ErrUnknownType — an attribute pins a type outside the closed scalar set. The
	// canonical UNKNOWN_ATTRIBUTE_TYPE cause (the honesty rule: never guessed).
	ErrUnknownType = errors.New("entities: attribute pins a type outside the closed scalar set")
	// ErrManyIdentifiers — more than one attribute is marked identifier; the DDL has
	// exactly one PRIMARY KEY, so an ambiguous identifier is refused, never guessed.
	ErrManyIdentifiers = errors.New("entities: more than one attribute is marked identifier")
)

// Validate checks the entity pins what every projection needs and that its types are
// all members of the closed scalar set. It invents nothing: an unpinned name/attr/
// type or an ambiguous identifier is a cause, not a default. Returns nil for a
// projectable entity.
func Validate(e Entity) error {
	if e.Name == "" {
		return ErrNoName
	}
	if len(e.Attributes) == 0 {
		return ErrNoAttributes
	}
	ids := 0
	for _, a := range e.Attributes {
		if a.Name == "" {
			return ErrNoAttributeName
		}
		if !IsKnownType(a.Type) {
			return fmt.Errorf("%w: %q (field %q)", ErrUnknownType, a.Type, a.Name)
		}
		if a.Identifier {
			ids++
		}
	}
	if ids > 1 {
		return ErrManyIdentifiers
	}
	return nil
}

// Identifier returns the single identifier attribute and whether one exists. An
// entity with no identifier has no PRIMARY KEY column (the DDL omits it) — that is a
// valid, if unusual, source; it is not invented.
func Identifier(e Entity) (Attribute, bool) {
	for _, a := range e.Attributes {
		if a.Identifier {
			return a, true
		}
	}
	return Attribute{}, false
}

// Body re-serializes an Entity into the canonical JSON body the kernel stores, so the
// recorded id == the entity's kernel head hash. It marshals through
// records.Canonicalize (so object-key order never leaks into the hash) but PRESERVES
// attribute order (unlike S34, attribute order is semantic — a reorder is a new
// version). Canonicalize sorts object keys, never array elements, so the attribute
// slice order is kept.
func Body(e Entity) ([]byte, error) {
	raw, err := json.Marshal(e)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ID returns the content address of an entity: records.Hash(records.Canonicalize(body))
// — S02 reused verbatim, never forked. Any byte change (attribute add/drop/reorder/
// retype) yields a different ID, i.e. a new version (KRD §12, §40).
func ID(e Entity) (string, error) {
	body, err := Body(e)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}
