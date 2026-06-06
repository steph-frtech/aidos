package besoin

// emit_ideas.go — EL16: the deterministic emitter EmitIdeas(graph) → []Idea, GOVERNED by the closed
// table LevelToProposes (EL05). It is the batch projection of a (completed) BesoinGraph into the
// backlog of candidate-truths the app-builder (S64) consumes — the honest hand-off from the NEED graph
// (above the wall) to the idea-intake door (idea_capture, provenance human). EL15 captures Ideas
// per-rung AS the interview descends; EL16 projects the WHOLE graph at once. Both land on the SAME
// content-addressed id for the same rung (the intent is the verbatim utterance) — true idempotence
// across both doors.
//
// THE RULE (ROADMAP EL16, never a silent cast):
//   For each LevelNode whose Status == resolved AND whose rung MAPS (LevelToProposes(level).Kind ==
//   MappingEmit), emit exactly ONE Idea:
//     - Proposes   = LevelToProposes(level).Proposes  (the closed pure table — never an LLM choice)
//     - Intent     = the node's verbatim utterance (Provenance.Detail)  (the declared canonical body)
//     - Provenance = {Source: human, Detail: utterance verbatim}        (never paraphrased)
//     - Status     = draft  (the only legal first state; ideas.Capture sets it)
//   NoEmit rungs (journey/view/invariant) emit NOTHING — their constraint lives in anchors_above[]
//   (the SOURCE rungs they constrain), never a cast journey→product or view→view*.
//   A non-resolved rung (empty/drafting) emits NOTHING — only a right-sized rung (EL07) projects.
//
// CONTENT-ADDRESSING + IDEMPOTENCE (the wall + §9). Each Idea's id is the content hash of its sketch
// (ideas.Hashed, reusing the S01/S02 records.Hash scheme). So EmitIdeas over the SAME graph yields the
// SAME ids in the SAME order — byte-identical re-emission. The persistence door (the EL15 ideaStore)
// is ON CONFLICT DO NOTHING, so a re-emission is a NO-OP, never a duplicate. EmitIdeas itself is a PURE
// function: no DB handle, no kernel grant, no clock, no rng — it returns []Idea, it writes nothing.
//
// THE WALL (CLAUDE.md §2/§8). An emitted ideas.Idea carries NEITHER a version NOR a mirror BY
// CONSTRUCTION (the type has no such field). EmitIdeas writes no kernel and no mirror: promotion is the
// app-builder writing the mirror via /goal (the hand-off to S64). HasMirror is always false here.
//
// DETERMINISM-FIRST. The mapping is the CLOSED pure table LevelToProposes (EL05); the ordering is the
// canonical graph node order (sourceOrder then bands); the id is a pure content hash. Same graph →
// same []Idea. The reproducibility mirror emit_ideas_property_test.go pins same-input → same-output.

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// EmittedIdea is a single projection of a resolved MAPPING rung — the Idea plus the node_id (the
// BesoinGraph node's content address) it was projected from, for the topological hand-off to S64. The
// Idea carries its own content-addressed id; node_id is the rung's address in the need graph.
type EmittedIdea struct {
	// Idea is the candidate-truth (draft, provenance human) the rung projects. No version, no mirror.
	Idea ideas.Idea `json:"idea"`
	// FromLevel is the rung this Idea was projected from (for the topological backlog order, S64).
	FromLevel Level `json:"from_level"`
}

// EmitIdeas projects a BesoinGraph into the ordered backlog of candidate-truth Ideas, GOVERNED by the
// closed table LevelToProposes (EL05). It returns one draft Idea per RESOLVED MAPPING rung, in the
// graph's canonical node order (the topological descent order, so the backlog is opened top-down at
// S64). NoEmit rungs and non-resolved rungs contribute nothing. It is PURE and TOTAL: it writes
// nothing, never panics, and the same graph always yields the same []Idea (same ids, same order).
//
// An error is returned only if a mapping target is somehow outside the closed ideas.ProposesKinds()
// set (impossible for a valid grammar level — the table is closed — but checked, never invented) or if
// hashing an Idea fails. The graph is never mutated.
func EmitIdeas(g BesoinGraph) ([]ideas.Idea, error) {
	emitted, err := EmitIdeasWithProvenance(g)
	if err != nil {
		return nil, err
	}
	out := make([]ideas.Idea, 0, len(emitted))
	for _, e := range emitted {
		out = append(out, e.Idea)
	}
	return out, nil
}

// EmitIdeasWithProvenance is EmitIdeas with the per-Idea source rung kept (the topological hand-off
// detail S64 needs to open the goals in descent order). Same purity guarantees; same ordering.
func EmitIdeasWithProvenance(g BesoinGraph) ([]EmittedIdea, error) {
	// Iterate the graph's nodes in their canonical (sorted) order — the descent order (sourceOrder
	// then bands). g.Nodes is already canonically sorted by AddNode/Unmarshal, so the order is stable.
	out := make([]EmittedIdea, 0, len(g.Nodes))
	for i := range g.Nodes {
		node := g.Nodes[i]
		// Only a right-sized (resolved) rung projects — empty/drafting rungs are not yet a need to
		// hand off (EL07 owns the verdict; an unresolved rung is still being elicited).
		if node.Status != NodeResolved {
			continue
		}
		// The CLOSED pure table decides the mapping — never an LLM cast. A NoEmit rung emits nothing.
		m, err := LevelToProposesChecked(node.Level)
		if err != nil {
			return nil, fmt.Errorf("besoin: emit-ideas: %w", err)
		}
		if m.Kind != MappingEmit {
			continue // journey/view/invariant — the constraint lives in anchors_above, not an Idea.
		}
		idea, err := projectNode(node, m.Proposes)
		if err != nil {
			return nil, err
		}
		out = append(out, EmittedIdea{Idea: idea, FromLevel: node.Level})
	}
	return out, nil
}

// projectNode builds the draft Idea a single resolved MAPPING rung projects. It REUSES ideas.Capture
// (the legal idea_capture shape — provenance human, status draft, content-addressed id) so an emitted
// Idea is INDISTINGUISHABLE from one captured per-rung at EL15 (same id for the same rung). The intent
// is the verbatim human utterance (Provenance.Detail) — the declared canonical body sketch, never
// paraphrased. Pure, total.
func projectNode(node LevelNode, proposes ideas.Proposes) (ideas.Idea, error) {
	utterance := node.Provenance.Detail
	idea, err := ideas.Capture(
		proposes,
		utterance, // intent = the verbatim utterance (matches EL15 emitIdea → same content address).
		ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: utterance},
	)
	if err != nil {
		return ideas.Idea{}, fmt.Errorf("besoin: emit-ideas: capture %s idea: %w", node.Level, err)
	}
	return idea, nil
}

// MetaAccessor supplies the per-level Metadata the EL07 verdict needs (the four metadata declared at
// each rung). It is the SAME accessor shape the EL15 MCP uses; nil-safe callers pass an empty-default.
type MetaAccessor func(Level) Metadata

// EmitIdeasResolved is the EL07-GOVERNED batch emitter: a rung is "resolved" iff the PURE EL07 verdict
// CanDescend(graph, level, meta).Enough is true (the authority — never a stored flag), AND the rung
// MAPS (LevelToProposes, EL05). This is the door the EL15 MCP uses against the PERSISTED graph, whose
// nodes are stored as `drafting` (EL15 stores the body; right-sizing is the recomputed EL07 verdict, a
// COMPUTED truth, never a declared status). It REUSES projectNode so an emitted Idea is byte-identical
// to the per-rung EL15 capture and to EmitIdeas (same content address). Pure, total: same (graph, meta)
// → same []Idea, no clock/rng/IO/LLM. The reproducibility property pins it.
func EmitIdeasResolved(g BesoinGraph, metaOf MetaAccessor) ([]ideas.Idea, error) {
	if metaOf == nil {
		metaOf = func(Level) Metadata { return Metadata{} }
	}
	out := make([]ideas.Idea, 0, len(g.Nodes))
	for i := range g.Nodes {
		node := g.Nodes[i]
		if !CanDescend(g, node.Level, metaOf(node.Level)).Enough {
			continue // not right-sized (EL07) — not yet a need to hand off.
		}
		m, err := LevelToProposesChecked(node.Level)
		if err != nil {
			return nil, fmt.Errorf("besoin: emit-ideas: %w", err)
		}
		if m.Kind != MappingEmit {
			continue // journey/view/invariant — NoEmit.
		}
		idea, err := projectNode(node, m.Proposes)
		if err != nil {
			return nil, err
		}
		out = append(out, idea)
	}
	return out, nil
}

// EmitIdeasUnion is the door-facing emitter: a rung is "resolved" iff its stored Status is resolved OR
// the PURE EL07 verdict CanDescend(graph, level, meta).Enough is true — the UNION of the two honest
// right-sizing signals. This is what the EL15 MCP uses against the PERSISTED graph (whose nodes EL15
// stores as `drafting`, the body recorded, right-sizing recomputed) AND against a graph carrying
// explicit resolved nodes. It REUSES projectNode so an emitted Idea is byte-identical across all three
// emitters (same content address). Pure, total: same (graph, meta) → same []Idea.
func EmitIdeasUnion(g BesoinGraph, metaOf MetaAccessor) ([]ideas.Idea, error) {
	if metaOf == nil {
		metaOf = func(Level) Metadata { return Metadata{} }
	}
	out := make([]ideas.Idea, 0, len(g.Nodes))
	for i := range g.Nodes {
		node := g.Nodes[i]
		resolved := node.Status == NodeResolved || CanDescend(g, node.Level, metaOf(node.Level)).Enough
		if !resolved {
			continue
		}
		m, err := LevelToProposesChecked(node.Level)
		if err != nil {
			return nil, fmt.Errorf("besoin: emit-ideas: %w", err)
		}
		if m.Kind != MappingEmit {
			continue // journey/view/invariant — NoEmit.
		}
		idea, err := projectNode(node, m.Proposes)
		if err != nil {
			return nil, err
		}
		out = append(out, idea)
	}
	return out, nil
}

// EmitCount returns how many Ideas a graph WOULD emit (the backlog depth), without building them — the
// count EXCLUDES NoEmit rungs and non-resolved rungs. Used by the Workbench so the count is computed by
// the same authority, never re-derived in the front. Pure, total.
func EmitCount(g BesoinGraph) int {
	n := 0
	for i := range g.Nodes {
		if g.Nodes[i].Status != NodeResolved {
			continue
		}
		if LevelToProposes(g.Nodes[i].Level).Kind == MappingEmit {
			n++
		}
	}
	return n
}
