// Package behavior is the AIDOS Kernel BEHAVIOR-MACRO layer (KRD §24.6): the
// declarative catalogue of reusable behaviours (ownable, soft-deletable,
// publishable, auditable, …) and the PURE, DRY-RUN EXPANSION that turns a behavior
// ATTACHED to an entity into the attributes / relations / operations / policies /
// fixtures it implies — "ne réécris pas le boilerplate owner-scoping pour la 50ᵉ
// fois".
//
// A BEHAVIOR-MACRO IS A SOURCE-SHAPED MOTIF, ABOVE THE LINE in nature. CE04 builds
// the EXPANSION (the function §24.6 names "s'expanse en attributs/relations/
// opérations/policies/fixtures"). The expansion is a DRY-RUN: it returns the
// Expansion VALUE only — it WRITES NOTHING. Freezing the expanded source into the
// kernel happens ONLY later, through the wall (idée → miroir → /goal → approbation
// humaine, CLAUDE.md §2). This package imports no kernel-write path; Expand has no
// sink that could touch kernel/mirrors/fitness.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Expand is a PURE, TOTAL function — no DB, no
// clock, no RNG, no I/O, never panics, no map-iteration-order leak. Same Attachment
// ⇒ byte-identical Expansion (the content-addressed ExpansionID pins it). It is
// also IDEMPOTENT: expanding an Attachment, then re-attaching the SAME behavior to
// the SAME already-expanded shape, yields the SAME expansion (no duplicate columns,
// no duplicate policies). The reproducibility + idempotence mirrors
// (behavior_property_test.go) pin both. WHAT a behavior expands into is the DECLARED
// catalogue (catalog.go), never an LLM judgment — an "LLM expanding a behavior"
// would be a determinism gap; the rule is code.
//
// REUSE, NEVER FORK. The content address ExpansionID = records.Hash(records.
// Canonicalize(body)) reuses S02 verbatim (one address space across stores); the
// scalar/required vocabulary mirrors back/kernel/entities. No new ADR: this freezes
// a new artifact (the behavior catalogue + its expansion); it shifts no prior
// contract.
package behavior

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Kind is one token of the CLOSED behavior-macro catalogue (KRD §24.6). The set is
// declared here, never invented ad-hoc; attaching a kind not in the catalogue is a
// typed error (ErrUnknownBehavior), never a guessed expansion (the honesty rule).
type Kind string

const (
	// Ownable — the entity is scoped to an owner. Expands an owner_id attribute, an
	// "owner" relation, and an OPERATION-scoped ownership policy ("seul le propriétaire
	// agit"). The §24.6 canonical example ("le boilerplate owner-scoping").
	Ownable Kind = "ownable"
	// SoftDeletable — the entity is archived, never hard-deleted. Expands a deleted_at
	// timestamp, an "archive" operation, and a policy hiding archived rows by default.
	SoftDeletable Kind = "soft-deletable"
	// Auditable — every change is traced. Expands created_at / updated_at timestamps
	// and an "audit" operation that records the mutation provenance.
	Auditable Kind = "auditable"
)

// catalogueOrder is the canonical, stable order the catalogue renders + expands in.
var catalogueOrder = []Kind{Ownable, SoftDeletable, Auditable}

// Catalogue returns the declared behavior-macro kinds in canonical order. PURE.
func Catalogue() []Kind { return append([]Kind(nil), catalogueOrder...) }

// Errors.
var (
	// ErrUnknownBehavior — the attached behavior is not in the declared catalogue.
	ErrUnknownBehavior = errors.New("behavior: kind is not in the declared catalogue (§24.6)")
	// ErrNoEntity — an attachment with an empty entity name; a behavior is always
	// attached TO an entity (KRD §24.6 "attachée à une entité").
	ErrNoEntity = errors.New("behavior: attachment has no entity name")
)

// Attachment is a behavior MACRO attached to a named entity (the §24.6 unit of
// expansion). It is the pure input to Expand: which behavior, on which entity. The
// existing shape (the attributes/relations/operations/policies already present on
// the entity) lets Expand be IDEMPOTENT — it never re-emits a piece already there.
type Attachment struct {
	// Behavior is the catalogue kind being attached.
	Behavior Kind `json:"behavior"`
	// Entity is the name of the entity the behavior is attached to.
	Entity string `json:"entity"`
	// Existing is the current shape of the entity (names already present), so a
	// re-attachment expands to the SAME result (idempotence). Empty = a fresh entity.
	Existing Shape `json:"existing"`
}

// Shape is the set of source-piece NAMES already present on the entity — the basis
// of idempotence. Expand emits a piece only when its name is absent from Shape.
type Shape struct {
	Attributes []string `json:"attributes"`
	Relations  []string `json:"relations"`
	Operations []string `json:"operations"`
	Policies   []string `json:"policies"`
	Fixtures   []string `json:"fixtures"`
}

// Attribute is one expanded entity field (the §24.6 "attributs"). Mirrors the
// entities vocabulary (name + scalar type + required).
type Attribute struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
}

// Relation is one expanded relation (the §24.6 "relations") — a named edge to a
// target entity with a cardinality.
type Relation struct {
	Name        string `json:"name"`
	Target      string `json:"target"`
	Cardinality string `json:"cardinality"`
}

// Operation is one expanded operation NAME (the §24.6 "opérations") — the verb the
// behavior adds to the entity's surface (e.g. "archive" for soft-deletable). The
// full operation AST is materialised later via /goal; the dry-run names it.
type Operation struct {
	Name string `json:"name"`
}

// Policy is one expanded policy (the §24.6 "policies") — a named ALLOW/DENY rule
// scoped to an operation (e.g. ownership-scoping). The full rule tree is frozen
// later via /goal; the dry-run names the policy and its scoped operation.
type Policy struct {
	Name      string `json:"name"`
	Scope     string `json:"scope"`
	Operation string `json:"operation"`
	Effect    string `json:"effect"`
}

// Fixture is one expanded mirror fixture NAME (the §24.6 "fixtures") — the
// behaviour proof the macro implies (e.g. "owner-only mutation denied"). The full
// fixture body is authored later; the dry-run names the proof obligation.
type Fixture struct {
	Name string `json:"name"`
}

// Expansion is the DRY-RUN result of attaching a behavior to an entity — the five
// source kinds the macro implies (KRD §24.6). It is VALUES only: WroteKernel is
// ALWAYS false (the wall), and ExpansionID is the content-address of the canonical
// body (determinism made explicit + testable).
type Expansion struct {
	// Behavior + Entity echo the attachment for provenance ("who expanded what").
	Behavior Kind   `json:"behavior"`
	Entity   string `json:"entity"`
	// The five §24.6 source kinds, each in canonical order (deterministic).
	Attributes []Attribute `json:"attributes"`
	Relations  []Relation  `json:"relations"`
	Operations []Operation `json:"operations"`
	Policies   []Policy    `json:"policies"`
	Fixtures   []Fixture   `json:"fixtures"`
	// ExpansionID is records.Hash(records.Canonicalize(body)) over the four declared
	// fields above + Behavior/Entity — same attachment ⇒ same id (the reproducibility
	// invariant, content-addressed).
	ExpansionID string `json:"expansion_id"`
	// WroteKernel is ALWAYS false. The expansion is a dry-run; freezing goes via /goal.
	// The field makes the wall guarantee explicit and testable (CLAUDE.md §2).
	WroteKernel bool `json:"wrote_kernel"`
}

// catalogueExpansion is the DECLARED §24.6 catalogue — for each behavior kind, the
// FULL set of pieces it would expand to on a fresh entity. Expand filters this
// against the Attachment's Existing shape (idempotence). It is the authoritative
// source of truth for the expansion: code, not an LLM (determinism-first).
var catalogueExpansion = map[Kind]Expansion{
	Ownable: {
		Attributes: []Attribute{{Name: "owner_id", Type: "string", Required: true}},
		Relations:  []Relation{{Name: "owner", Target: "User", Cardinality: "many-to-one"}},
		Operations: []Operation{{Name: "transferOwnership"}},
		Policies: []Policy{{
			Name: "owner-scoping", Scope: "OPERATION", Operation: "mutate", Effect: "DENY",
		}},
		Fixtures: []Fixture{{Name: "owner-only-mutation-allowed"}, {Name: "non-owner-mutation-denied"}},
	},
	SoftDeletable: {
		Attributes: []Attribute{{Name: "deleted_at", Type: "timestamptz", Required: false}},
		Relations:  nil,
		Operations: []Operation{{Name: "archive"}, {Name: "restore"}},
		Policies: []Policy{{
			Name: "hide-archived", Scope: "OPERATION", Operation: "read", Effect: "DENY",
		}},
		Fixtures: []Fixture{{Name: "archived-row-hidden-by-default"}, {Name: "restore-unhides-row"}},
	},
	Auditable: {
		Attributes: []Attribute{
			{Name: "created_at", Type: "timestamptz", Required: true},
			{Name: "updated_at", Type: "timestamptz", Required: true},
		},
		Relations:  nil,
		Operations: []Operation{{Name: "audit"}},
		Policies:   nil,
		Fixtures:   []Fixture{{Name: "mutation-records-provenance"}},
	},
}

// Expand is the §24.6 behavior-macro expansion — PURE, TOTAL, DRY-RUN, IDEMPOTENT.
//
//   - It returns the attributes / relations / operations / policies / fixtures the
//     attached behavior implies, in canonical order;
//   - it emits a piece ONLY when its name is ABSENT from the attachment's Existing
//     shape (idempotence: re-attaching to an already-expanded entity yields the same
//     result — no duplicate columns, no duplicate policies);
//   - it WRITES NOTHING (WroteKernel=false): freezing the expanded source into the
//     kernel goes via the wall (idée → miroir → /goal), never from here;
//   - same Attachment ⇒ byte-identical Expansion (ExpansionID pins it).
//
// An unknown behavior or an entity-less attachment is a typed error, never a guessed
// expansion (the honesty rule).
func Expand(a Attachment) (Expansion, error) {
	if a.Entity == "" {
		return Expansion{}, ErrNoEntity
	}
	base, ok := catalogueExpansion[a.Behavior]
	if !ok {
		return Expansion{}, fmt.Errorf("%w: %q", ErrUnknownBehavior, a.Behavior)
	}

	out := Expansion{Behavior: a.Behavior, Entity: a.Entity, WroteKernel: false}

	// Idempotence: emit a piece only when its name is not already present. The
	// catalogue rows are already in canonical order; filtering preserves it.
	existAttr := nameSet(a.Existing.Attributes)
	for _, x := range base.Attributes {
		if !existAttr[x.Name] {
			out.Attributes = append(out.Attributes, x)
		}
	}
	existRel := nameSet(a.Existing.Relations)
	for _, x := range base.Relations {
		if !existRel[x.Name] {
			out.Relations = append(out.Relations, x)
		}
	}
	existOp := nameSet(a.Existing.Operations)
	for _, x := range base.Operations {
		if !existOp[x.Name] {
			out.Operations = append(out.Operations, x)
		}
	}
	existPol := nameSet(a.Existing.Policies)
	for _, x := range base.Policies {
		if !existPol[x.Name] {
			out.Policies = append(out.Policies, x)
		}
	}
	existFix := nameSet(a.Existing.Fixtures)
	for _, x := range base.Fixtures {
		if !existFix[x.Name] {
			out.Fixtures = append(out.Fixtures, x)
		}
	}

	id, err := expansionID(out)
	if err != nil {
		return Expansion{}, fmt.Errorf("behavior: address expansion: %w", err)
	}
	out.ExpansionID = id
	return out, nil
}

// nameSet builds a presence set from a name list (deterministic — set membership,
// no order dependence).
func nameSet(names []string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

// expansionID content-addresses an expansion over its semantic body (the five kinds
// + behavior + entity), EXCLUDING the ExpansionID/WroteKernel fields themselves.
// Reuses records.Canonicalize/Hash (S02) — same body ⇒ same id, key-order-stable.
func expansionID(e Expansion) (string, error) {
	body := struct {
		Behavior   Kind        `json:"behavior"`
		Entity     string      `json:"entity"`
		Attributes []Attribute `json:"attributes"`
		Relations  []Relation  `json:"relations"`
		Operations []Operation `json:"operations"`
		Policies   []Policy    `json:"policies"`
		Fixtures   []Fixture   `json:"fixtures"`
	}{
		Behavior:   e.Behavior,
		Entity:     e.Entity,
		Attributes: e.Attributes,
		Relations:  e.Relations,
		Operations: e.Operations,
		Policies:   e.Policies,
		Fixtures:   e.Fixtures,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// PieceCount totals the source pieces an expansion emits — the deterministic count
// the Workbench renders ("cette behavior expanse en N pièces"). PURE.
func PieceCount(e Expansion) int {
	return len(e.Attributes) + len(e.Relations) + len(e.Operations) + len(e.Policies) + len(e.Fixtures)
}

// SortedNames returns every emitted piece name in one stable, sorted list — a
// convenience for the mirror's idempotence assertion (the merged shape is invariant
// under re-expansion). PURE.
func SortedNames(e Expansion) []string {
	var out []string
	for _, x := range e.Attributes {
		out = append(out, "attr:"+x.Name)
	}
	for _, x := range e.Relations {
		out = append(out, "rel:"+x.Name)
	}
	for _, x := range e.Operations {
		out = append(out, "op:"+x.Name)
	}
	for _, x := range e.Policies {
		out = append(out, "pol:"+x.Name)
	}
	for _, x := range e.Fixtures {
		out = append(out, "fix:"+x.Name)
	}
	sort.Strings(out)
	return out
}
