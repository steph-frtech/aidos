// Package ref is the AIDOS Kernel ENTITY-RELATION node (S71). It extends the entity
// type system (S35, back/kernel/entities) with a DISTINCT AST node — a Relation — that
// models a typed reference from one entity to another (1-1 / 1-N / N-N, with FK /
// association / composition semantics) WITHOUT touching the closed scalar set.
//
// THE CLOSED-SET HONESTY (the S71 done-criterion). The entity scalar type set
// {string,int,decimal,bool,timestamptz} stays CLOSED and untouched — a relation is NOT
// a scalar, it is its OWN node kind. A relation never widens the scalar enum, and a
// scalar attribute never silently becomes a relation. The two planes are disjoint: an
// entity carries ordered scalar Attributes (S35) AND, additively, ordered Relations
// (S71). The honesty rule of the closed set is preserved because the relation's TARGET
// is RESOLVED against the declared entity set, never guessed: a relation to an entity
// that the set does not declare is REFUSED (UNKNOWN_RELATION_TARGET), exactly as an
// unknown scalar type is refused (UNKNOWN_ATTRIBUTE_TYPE) — no mapping is ever invented.
//
// A RELATION IS A SOURCE NODE, ABOVE THE LINE. Like an entity (records.AuthorityAbove),
// it lives as an AST in the `kernel` Postgres schema (JSONB, content-addressed,
// append-only). The agent READS it (SELECT-only — the wall, CLAUDE.md §2); it NEVER
// writes it. S74 (relation-aware emitters) CONSUMES this node to emit FK / join-table /
// typed-association / navigation; S71 only defines and validates the node — it emits
// nothing (that belongs to S74).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is a PURE, TOTAL function of
// its input — no clock, no RNG, no I/O, no map-iteration-order leak. The content
// address ID = records.Hash(records.Canonicalize(body)) reuses S02 verbatim, so a
// relation ROUND-TRIPS as a content-addressed AST: marshal → canonical body → hash,
// and any byte change (a new kind, a retarget, a reorder) yields a NEW version. The
// reproducibility mirror (ref_property_test.go) pins it.
//
// REUSE, NEVER FORK. Cardinality and semantic are CLOSED enums declared here (mirroring
// the entities.ScalarType pattern). The refusal reuses blockreason.BlockReason (S13)
// verbatim — never a new code beyond a human red, always with a non-empty how_to_fix
// (no prison, KRD §44.5).
package ref

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Cardinality is one token of the CLOSED relation-cardinality set. A relation pins
// exactly how many of the target it relates to, and how many of the source the target
// relates back to. The set is small and declared; a cardinality outside it is a
// BlockReason (UNKNOWN_RELATION_KIND), never a silent default.
type Cardinality string

const (
	// OneToOne — each source relates to at most one target, and vice versa (1-1).
	OneToOne Cardinality = "1-1"
	// OneToMany — each source relates to many targets; each target to one source (1-N).
	OneToMany Cardinality = "1-N"
	// ManyToMany — each source relates to many targets and vice versa (N-N); emitted
	// (at S74) as a join table.
	ManyToMany Cardinality = "N-N"
)

// cardinalityOrder is the canonical enumeration order of the closed cardinality set.
// Declared, never derived from map iteration, so Cardinalities() is stable.
var cardinalityOrder = []Cardinality{OneToOne, OneToMany, ManyToMany}

// Cardinalities returns every member of the closed cardinality set, in canonical order.
func Cardinalities() []Cardinality {
	out := make([]Cardinality, len(cardinalityOrder))
	copy(out, cardinalityOrder)
	return out
}

// IsKnownCardinality reports whether c is a member of the closed cardinality set.
func IsKnownCardinality(c Cardinality) bool {
	for _, k := range cardinalityOrder {
		if k == c {
			return true
		}
	}
	return false
}

// Semantic is one token of the CLOSED relation-semantic set — the meaning of the
// reference, which (at S74) drives the integrity rule the FK enforces. The set is
// declared; a semantic outside it is a BlockReason (UNKNOWN_RELATION_KIND).
type Semantic string

const (
	// FK — a plain foreign key: the source points at an existing target; the target's
	// lifetime is independent of the source.
	FK Semantic = "fk"
	// Association — a navigable link between two independent entities (at N-N, a join
	// table); neither owns the other's lifetime.
	Association Semantic = "association"
	// Composition — the target is OWNED by the source: deleting the source cascades to
	// the target (the strong "part-of" relationship).
	Composition Semantic = "composition"
)

// semanticOrder is the canonical enumeration order of the closed semantic set.
var semanticOrder = []Semantic{FK, Association, Composition}

// Semantics returns every member of the closed semantic set, in canonical order.
func Semantics() []Semantic {
	out := make([]Semantic, len(semanticOrder))
	copy(out, semanticOrder)
	return out
}

// IsKnownSemantic reports whether s is a member of the closed semantic set.
func IsKnownSemantic(s Semantic) bool {
	for _, k := range semanticOrder {
		if k == s {
			return true
		}
	}
	return false
}

// Relation is the entity-relation SOURCE AST node (S71). It is a DISTINCT node from a
// scalar Attribute: it carries a Name (the field name on the source), the Target (the
// NAME of the entity it references — resolved against the declared set, never guessed),
// a Cardinality (1-1 / 1-N / N-N), and a Semantic (fk / association / composition).
// `required` drives NOT NULL on the FK column (at S74). The node never carries a scalar
// Type — it is referential, not scalar; the closed scalar set is untouched.
type Relation struct {
	Name        string      `json:"name"`
	Target      string      `json:"target"`
	Cardinality Cardinality `json:"cardinality"`
	Semantic    Semantic    `json:"semantic"`
	Required    bool        `json:"required,omitempty"`
}

// Validation sentinels — the internal causes folded into a BlockReason at the resolve
// boundary. A malformed relation is never a panic and never a silent default.
var (
	// ErrNoName — the relation pins no field name; it is not addressable.
	ErrNoName = errors.New("ref: relation pins no name")
	// ErrNoTarget — the relation pins no target entity name; nothing to reference.
	ErrNoTarget = errors.New("ref: relation pins no target entity")
	// ErrUnknownCardinality — the relation pins a cardinality outside the closed set.
	ErrUnknownCardinality = errors.New("ref: relation pins a cardinality outside the closed set")
	// ErrUnknownSemantic — the relation pins a semantic outside the closed set.
	ErrUnknownSemantic = errors.New("ref: relation pins a semantic outside the closed set")
	// ErrUnknownTarget — the relation targets an entity the declared set does not hold.
	// The canonical UNKNOWN_RELATION_TARGET cause (the honesty rule: never guessed).
	ErrUnknownTarget = errors.New("ref: relation targets an entity outside the declared set")
)

// ValidateShape checks a relation pins what it needs and that its cardinality and
// semantic are members of their closed sets. It invents nothing: an unpinned name/
// target or an out-of-set kind is a cause, not a default. It does NOT resolve the
// target against an entity set — that is Resolve's job. Returns nil for a well-shaped
// relation.
func ValidateShape(r Relation) error {
	if r.Name == "" {
		return ErrNoName
	}
	if r.Target == "" {
		return ErrNoTarget
	}
	if !IsKnownCardinality(r.Cardinality) {
		return fmt.Errorf("%w: %q (relation %q)", ErrUnknownCardinality, r.Cardinality, r.Name)
	}
	if !IsKnownSemantic(r.Semantic) {
		return fmt.Errorf("%w: %q (relation %q)", ErrUnknownSemantic, r.Semantic, r.Name)
	}
	return nil
}

// Resolve validates a relation's shape AND resolves its Target against the set of
// declared entity names. A target the set does not hold is the canonical
// UNKNOWN_RELATION_TARGET refusal — the honesty of the closed set: a relation never
// references an entity nobody declared, and a mapping to a guessed target is NEVER
// invented. `known` is the membership set of declared entity names (the project's
// entity cut, S70). Returns nil when the relation is well-shaped AND its target is
// declared.
func Resolve(r Relation, known map[string]bool) error {
	if err := ValidateShape(r); err != nil {
		return err
	}
	if !known[r.Target] {
		return fmt.Errorf("%w: %q (relation %q)", ErrUnknownTarget, r.Target, r.Name)
	}
	return nil
}

// Body re-serializes a Relation into the canonical JSON body the kernel stores, so the
// recorded id == the relation's kernel head hash. It marshals through
// records.Canonicalize (so object-key order never leaks into the hash). A relation has
// no array fields, so canonicalization is the full normalization.
func Body(r Relation) ([]byte, error) {
	raw, err := json.Marshal(r)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ID returns the content address of a relation: records.Hash(records.Canonicalize(body))
// — S02 reused verbatim, never forked. Any byte change (rename, retarget, recardinality,
// resemantic, requiredness) yields a different ID, i.e. a new version (KRD §12, §40).
// This is the content-addressed round-trip the S71 done-criterion pins.
func ID(r Relation) (string, error) {
	body, err := Body(r)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// Parse decodes a canonical JSON body back into a Relation — the read half of the
// content-addressed round-trip (Body → Parse is the identity on a well-formed body,
// and ID(Parse(Body(r))) == ID(r)). It does NOT validate shape or resolve the target;
// that is ValidateShape / Resolve. A malformed body is an error, never a partial guess.
func Parse(body []byte) (Relation, error) {
	var r Relation
	if err := json.Unmarshal(body, &r); err != nil {
		return Relation{}, err
	}
	return r, nil
}

// BlockUnknownTarget renders the canonical S13 BlockReason for a relation whose target
// the declared set does not hold (UNKNOWN_RELATION_TARGET) — or any other shape cause.
// It reuses the blockreason shape (never a new code beyond a human red) and always
// carries a non-empty how_to_fix (no prison, KRD §44.5). The cause names the missing
// target / out-of-set kind so the panel and `aidos explain` are actionable.
func BlockUnknownTarget(cause error) blockreason.BlockReason {
	code := "UNKNOWN_RELATION_TARGET"
	if errors.Is(cause, ErrUnknownCardinality) || errors.Is(cause, ErrUnknownSemantic) {
		code = "UNKNOWN_RELATION_KIND"
	}
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Relation refusée (" + code + ") : " + cause.Error() + ". Un nœud de relation " +
			"référence une entité DÉCLARÉE de l'ensemble, avec une cardinalité du jeu fermé " +
			"(1-1 | 1-N | N-N) et une sémantique du jeu fermé (fk | association | composition). " +
			"L'ensemble scalaire reste clos : une relation est un nœud à part, jamais un scalaire, " +
			"et sa cible n'est JAMAIS devinée (honnêteté de l'ensemble clos).",
		HowToFix: []string{
			"declare_the_target : déclarez l'entité cible dans l'ensemble avant de la référencer ; une cible inconnue n'est jamais devinée.",
			"use_a_known_kind : la cardinalité ∈ {1-1, 1-N, N-N} et la sémantique ∈ {fk, association, composition} ; aucun token hors jeu.",
			"pin_the_relation : complétez le nœud de relation (name + target + cardinality + semantic) — le kernel ne lit que ce que la source épingle.",
		},
	}
}
