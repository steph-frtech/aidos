// Package modeler is the AIDOS Workbench ENTITY/RELATION MODELER (S75). It is the
// CANVAS-side, draft-level engine that lets a human shape a project's entity/relation
// schema (entities with scalar/blob attributes + typed identifiers, and the relations
// between them) and then PROPOSE that draft as a project-scoped Kernel source — via
// propose → ChangeSet → approval, NEVER a direct truth-write from the screen (the wall,
// CLAUDE.md §2).
//
// THE WALL. The modeler reuses the S35 entities.Entity node and the S71 ref.Relation node
// verbatim (it never widens the closed scalar set, never widens the closed cardinality/
// semantic sets). It writes NO truth: Propose returns a DRAFT changeset.ChangeSet whose
// spec_delta + mirror_delta carry the canonical draft body, content-addressed; the
// `aidos` CLI applies it only after human approval. A reject leaves the kernel intact
// (Propose never touched it). This is the S75 done-criterion: "le modeleur produit un
// ChangeSet proposed".
//
// DRAFT-LEVEL CONCURRENCY (distinct from S110's truth-write concurrency). The canvas is a
// PRE-PROPOSAL artifact, so two editors on the same canvas do not conflict over truth —
// they conflict over a draft. The modeler resolves that at the draft level with a
// deterministic CRDT-style merge (MergeDrafts): two editors' edits are combined so that
// NEITHER silently overwrites the other (the S75 done-criterion "deux éditeurs simultanés
// ne s'écrasent pas"). Presence (who is on the canvas) and an optional per-node soft lock
// (Presence/Lock) advise the UI; the merge is the authority, never last-write-wins.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is a PURE, TOTAL function of its
// input — no clock, no RNG, no I/O, no LLM, no map-iteration-order leak. Validate resolves
// every relation against the declared entity set (the S71 gate); SchemaHash is canonical
// and INPUT-ORDER-INVARIANT (entities/relations sorted by name before hashing), so the
// same logical draft — whatever order the editor added the nodes — yields a byte-identical
// hash. MergeDrafts is commutative/idempotent on disjoint edits and order-independent on
// the node set. The reproducibility mirror (modeler_property_test.go) pins all of this.
package modeler

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// EntityNode pairs an entity AST (S35) with the relations DECLARED ON it (S71), exactly
// the shape S74's emitter consumes. It is the canvas node the editor manipulates.
type EntityNode struct {
	Entity    entities.Entity `json:"entity"`
	Relations []ref.Relation  `json:"relations"`
}

// Draft is the canvas state being modeled: a project-scoped set of entity nodes. It is a
// PRE-PROPOSAL artifact — no truth, no changeset yet. Its order is NOT semantic at the
// schema level (SchemaHash sorts), but a Draft preserves the editor's insertion order for
// display; the hash and the proposal are order-invariant.
type Draft struct {
	// Project is the project slug the draft is scoped to (S55 RLS). Every proposed source
	// is project-scoped; a draft with no project is not proposable.
	Project string       `json:"project"`
	Nodes   []EntityNode `json:"nodes"`
}

// Validation sentinels — internal causes folded into a BlockReason at the boundary.
var (
	// ErrNoProject — the draft pins no project; a project-scoped source needs a scope.
	ErrNoProject = errors.New("modeler: draft pins no project scope")
	// ErrNoNodes — the draft has no entity nodes; nothing to propose.
	ErrNoNodes = errors.New("modeler: draft has no entity nodes")
	// ErrDuplicateEntity — two nodes declare the same entity name; the set must be unique.
	ErrDuplicateEntity = errors.New("modeler: two nodes declare the same entity name")
)

// blockCodeDraft is the canonical refusal code for a malformed draft (an invalid entity,
// an unresolved relation, a duplicate). It carries an actionable how_to_fix (no prison).
const blockCodeDraft blockreason.Code = "MODELER_INVALID_DRAFT"

// declaredNames returns the set of entity names the draft declares — the membership set a
// relation's target resolves against (the S71 resolve gate).
func (d Draft) declaredNames() map[string]bool {
	known := make(map[string]bool, len(d.Nodes))
	for _, n := range d.Nodes {
		known[n.Entity.Name] = true
	}
	return known
}

// Validate checks the whole draft is a well-formed, RESOLVABLE schema before it can be
// proposed. It invents nothing:
//   - the draft pins a project scope and at least one node,
//   - every entity name is unique (no duplicate node),
//   - every entity is a valid S35 entity (Validate),
//   - every relation RESOLVES against the declared set (the S71 gate — an unknown target
//     is refused, never guessed),
//   - a relation whose cardinality needs an FK column on the TARGET (1-1 / 1-N) requires
//     the target entity to carry an identifier (the FK-target-without-identifier gate,
//     mirroring S74's EmitDDL refusal — an FK with no column to reference is refused).
//
// Returns nil for a proposable draft.
func Validate(d Draft) error {
	if d.Project == "" {
		return ErrNoProject
	}
	if len(d.Nodes) == 0 {
		return ErrNoNodes
	}
	seen := make(map[string]bool, len(d.Nodes))
	for _, n := range d.Nodes {
		if seen[n.Entity.Name] {
			return fmt.Errorf("%w: %q", ErrDuplicateEntity, n.Entity.Name)
		}
		seen[n.Entity.Name] = true
	}
	known := d.declaredNames()
	// nodes by name, so a relation's FK-target identifier can be checked.
	byName := make(map[string]entities.Entity, len(d.Nodes))
	for _, n := range d.Nodes {
		byName[n.Entity.Name] = n.Entity
	}
	for _, n := range d.Nodes {
		if err := entities.Validate(n.Entity); err != nil {
			return fmt.Errorf("entity %q: %w", n.Entity.Name, err)
		}
		for _, r := range n.Relations {
			if err := ref.Resolve(r, known); err != nil {
				return fmt.Errorf("entity %q: %w", n.Entity.Name, err)
			}
			// An FK / 1-1 / 1-N relation needs a column on the target to REFERENCES.
			// N-N is a join table (composite of both identifiers); both endpoints need
			// an identifier. The strict S74 gate: refuse an FK-target with no identifier.
			if r.Cardinality == ref.OneToOne || r.Cardinality == ref.OneToMany || r.Cardinality == ref.ManyToMany {
				tgt := byName[r.Target]
				if _, ok := entities.Identifier(tgt); !ok {
					return fmt.Errorf("entity %q: relation %q targets %q which has no identifier (FK has no column to reference)", n.Entity.Name, r.Name, r.Target)
				}
			}
		}
	}
	return nil
}

// BlockInvalid renders the canonical BlockReason for a malformed draft. It always carries
// a non-empty how_to_fix so the panel and `aidos explain` are actionable (no prison).
func BlockInvalid(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockCodeDraft,
		Severity:    blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf("le brouillon n'est pas un schéma proposable : %v", cause),
		HowToFix: []string{
			"corrigez l'entité ou la relation signalée (nom, type scalaire, identifiant, cible de relation)",
			"toute relation doit cibler une entité déclarée dans le brouillon (jamais devinée)",
			"une relation 1-1 / 1-N / N-N exige que l'entité cible porte un identifiant (la clé étrangère a besoin d'une colonne à référencer)",
		},
	}
}

// canonicalDraft is the order-invariant body the schema hash is taken over. Entities are
// sorted by name, and each entity's relations by name, so the SAME logical schema —
// whatever order the editor built it — produces byte-identical bytes. Attribute order is
// PRESERVED (it is semantic in S35), only the node/relation SET order is normalized.
type canonicalNode struct {
	Entity    entities.Entity `json:"entity"`
	Relations []ref.Relation  `json:"relations"`
}

type canonicalDraft struct {
	Project string          `json:"project"`
	Nodes   []canonicalNode `json:"nodes"`
}

// canonicalize returns the input-order-invariant representation of the draft.
func (d Draft) canonicalize() canonicalDraft {
	nodes := make([]canonicalNode, len(d.Nodes))
	for i, n := range d.Nodes {
		rels := make([]ref.Relation, len(n.Relations))
		copy(rels, n.Relations)
		sort.SliceStable(rels, func(a, b int) bool { return rels[a].Name < rels[b].Name })
		nodes[i] = canonicalNode{Entity: n.Entity, Relations: rels}
	}
	sort.SliceStable(nodes, func(a, b int) bool { return nodes[a].Entity.Name < nodes[b].Entity.Name })
	return canonicalDraft{Project: d.Project, Nodes: nodes}
}

// Body returns the canonical JSON body of the draft (records.Canonicalize over the
// input-order-invariant representation), so the recorded id == the draft's content head.
func Body(d Draft) ([]byte, error) {
	raw, err := json.Marshal(d.canonicalize())
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// SchemaHash returns the content address of the draft schema: records.Hash(Body(d)),
// reusing S02 verbatim. It is INPUT-ORDER-INVARIANT (two editors who built the same nodes
// in a different order get the same hash) and stable under attribute key reordering. Any
// real change (a new entity, a retarget, a type change) yields a new hash — a new version.
func SchemaHash(d Draft) (string, error) {
	body, err := Body(d)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// Proposal is the result of proposing a draft: a DRAFT ChangeSet (never APPLIED) plus the
// schema hash it carries. The changeset's spec_delta carries the canonical draft body as
// its opaque payload, targeted at the project scope; its mirror_delta declares the mirror
// that proves the schema (the completeness law: a spec change needs a mirror). Approval
// (apply) is the `aidos` CLI's job, gated by the AuthorityGraph (S110) — the modeler only
// proposes.
type Proposal struct {
	ChangeSet  changeset.ChangeSet `json:"changeset"`
	SchemaHash string              `json:"schema_hash"`
}

// Propose validates the draft and, on success, OPENS a DRAFT ChangeSet that carries it —
// the single legal way the canvas reaches truth. It writes NOTHING: changeset.Open is PURE
// (it computes the content-addressed id of a DRAFT envelope). The returned changeset is
// `proposed` (DRAFT); a human approves (applies) or rejects (discards) it downstream — a
// reject leaves the kernel intact because Propose never touched it.
//
// parentPhase is the stable phase the proposal moves from (the project's current head). The
// spec_delta target is "entity-schema@<project>"; its body is the canonical draft. The
// mirror_delta declares the schema mirror (so the completeness gate at apply has a mirror).
func Propose(d Draft, parentPhase string) (Proposal, error) {
	if err := Validate(d); err != nil {
		return Proposal{}, err
	}
	hash, err := SchemaHash(d)
	if err != nil {
		return Proposal{}, err
	}
	body, err := Body(d)
	if err != nil {
		return Proposal{}, err
	}
	target := fmt.Sprintf("entity-schema@%s", d.Project)
	label := fmt.Sprintf("modeler: propose schema %s for %s", short(hash), d.Project)
	spec := &changeset.Delta{Kind: "add", Target: target, Body: json.RawMessage(body)}
	mirror := &changeset.Delta{Kind: "add", Target: target + "#mirror"}
	cs, err := changeset.Open(label, parentPhase, spec, mirror)
	if err != nil {
		return Proposal{}, err
	}
	return Proposal{ChangeSet: cs, SchemaHash: hash}, nil
}

// short returns the first 8 chars of a content hash (for human labels). Never used for
// identity — identity is always the full hash.
func short(h string) string {
	if len(h) <= 8 {
		return h
	}
	return h[:8]
}
