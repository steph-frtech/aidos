package modeler

import (
	"sort"
)

// This file holds the DRAFT-LEVEL CONCURRENCY of the modeler (S75) — the part that makes
// "deux éditeurs simultanés ne s'écrasent pas" true. It is DISTINCT from S110's truth-write
// concurrency (optimistic lock on the kernel head): the canvas is a PRE-PROPOSAL artifact,
// so two editors conflict over a DRAFT, not over truth. We resolve that conflict at the
// draft level with three deterministic, pure primitives:
//
//   - Presence  — who is on the canvas (advisory; the merge is the authority).
//   - Lock      — an optional per-node SOFT lock (advisory; it never blocks the merge, it
//                 only tells the UI which node another editor is actively editing).
//   - MergeDrafts — the CRDT-style merge of two editors' drafts off a common base, so that
//                 NEITHER editor's add/edit is silently lost (no last-write-wins).
//
// DETERMINISM-FIRST: every function is PURE and ORDER-INDEPENDENT on the node set. The merge
// is commutative on disjoint edits and idempotent (MergeDrafts(d, d, base) == d on the node
// set). The reproducibility mirror pins it.

// Presence is one editor's presence on the canvas: who they are and (optionally) which
// node they currently have soft-locked. It is advisory metadata the UI renders; it carries
// no authority over the merge.
type Presence struct {
	// Editor is the acting user (provenance, never a placeholder — S113).
	Editor string `json:"editor"`
	// LockedNode is the entity name this editor currently holds a soft lock on (empty if none).
	LockedNode string `json:"locked_node,omitempty"`
}

// PresenceSet is the canvas presence: a deterministic, name-ordered list of who is on the
// canvas. Two editors present see each other (the S75 done-criterion).
type PresenceSet struct {
	Editors []Presence `json:"editors"`
}

// Join returns a new PresenceSet with editor added (idempotent on editor id; the latest
// LockedNode for that editor wins, since lock is per-editor advisory state). The result is
// sorted by editor id, so presence is order-independent.
func (p PresenceSet) Join(pr Presence) PresenceSet {
	out := make([]Presence, 0, len(p.Editors)+1)
	replaced := false
	for _, e := range p.Editors {
		if e.Editor == pr.Editor {
			out = append(out, pr)
			replaced = true
		} else {
			out = append(out, e)
		}
	}
	if !replaced {
		out = append(out, pr)
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].Editor < out[b].Editor })
	return PresenceSet{Editors: out}
}

// Leave returns a new PresenceSet with editor removed (idempotent).
func (p PresenceSet) Leave(editor string) PresenceSet {
	out := make([]Presence, 0, len(p.Editors))
	for _, e := range p.Editors {
		if e.Editor != editor {
			out = append(out, e)
		}
	}
	return PresenceSet{Editors: out}
}

// LockHolder returns the editor (if any) who currently soft-locks the named node. A soft
// lock is ADVISORY: it tells the UI another editor is editing that node so it can warn,
// but it never blocks the merge — the merge still combines both edits without overwrite.
func (p PresenceSet) LockHolder(node string) (string, bool) {
	for _, e := range p.Editors {
		if e.LockedNode == node {
			return e.Editor, true
		}
	}
	return "", false
}

// MergeOutcome reports what MergeDrafts did, so the UI can surface "your add and theirs
// both landed" rather than silently picking one.
type MergeOutcome struct {
	Merged   Draft    `json:"merged"`
	AddedByA []string `json:"added_by_a,omitempty"` // entity names a added that base lacked
	AddedByB []string `json:"added_by_b,omitempty"` // entity names b added that base lacked
	// Conflicts are entity names BOTH editors changed differently off the base. They are
	// NOT silently overwritten: the merge keeps a's version on the canvas AND records the
	// conflict so the UI prompts the humans to reconcile (never last-write-wins).
	Conflicts []string `json:"conflicts,omitempty"`
}

// MergeDrafts performs a CRDT-style three-way merge of two editors' drafts (a, b) off a
// common base, at the GRAIN of an entity node (keyed by entity name). The rule, per node:
//
//   - present in neither a nor b (only base) → dropped only if BOTH removed it; if one
//     kept it, it stays (a remove never silently wins over a keep).
//   - added by exactly one editor (not in base) → kept (no add is ever lost).
//   - changed by exactly one editor off base → that editor's version wins (the other did
//     not touch it, so there is no conflict).
//   - changed by BOTH editors to DIFFERENT versions → a CONFLICT: a's version is kept on
//     the canvas and the node name is recorded in Conflicts so the humans reconcile. This
//     is the anti-overwrite guarantee — b's edit is never silently discarded; it is
//     SURFACED.
//   - changed by both to the SAME version → no conflict (idempotent).
//
// The merge is DETERMINISTIC and ORDER-INDEPENDENT: the result node set is sorted by name.
// MergeDrafts(d, d, base) is d on the node set (idempotent). The project scope of a and b
// must match (they are the same canvas); a's project is kept.
func MergeDrafts(base, a, b Draft) MergeOutcome {
	baseM := nodeMap(base)
	aM := nodeMap(a)
	bM := nodeMap(b)

	// The union of every name seen, so no node is dropped by iteration order.
	names := map[string]bool{}
	for n := range baseM {
		names[n] = true
	}
	for n := range aM {
		names[n] = true
	}
	for n := range bM {
		names[n] = true
	}
	ordered := make([]string, 0, len(names))
	for n := range names {
		ordered = append(ordered, n)
	}
	sort.Strings(ordered)

	out := MergeOutcome{Merged: Draft{Project: a.Project}}
	for _, name := range ordered {
		baseN, inBase := baseM[name]
		aN, inA := aM[name]
		bN, inB := bM[name]

		switch {
		case !inBase && inA && !inB:
			// a added it; keep.
			out.Merged.Nodes = append(out.Merged.Nodes, aN)
			out.AddedByA = append(out.AddedByA, name)
		case !inBase && !inA && inB:
			// b added it; keep (b's add is never lost).
			out.Merged.Nodes = append(out.Merged.Nodes, bN)
			out.AddedByB = append(out.AddedByB, name)
		case !inBase && inA && inB:
			// both added the same name. If identical, no conflict; else a kept + conflict.
			if nodeHash(aN) == nodeHash(bN) {
				out.Merged.Nodes = append(out.Merged.Nodes, aN)
			} else {
				out.Merged.Nodes = append(out.Merged.Nodes, aN)
				out.Conflicts = append(out.Conflicts, name)
			}
		case inBase && inA && inB:
			aChanged := nodeHash(aN) != nodeHash(baseN)
			bChanged := nodeHash(bN) != nodeHash(baseN)
			switch {
			case !aChanged && !bChanged:
				out.Merged.Nodes = append(out.Merged.Nodes, baseN)
			case aChanged && !bChanged:
				out.Merged.Nodes = append(out.Merged.Nodes, aN)
			case !aChanged && bChanged:
				out.Merged.Nodes = append(out.Merged.Nodes, bN)
			default: // both changed
				if nodeHash(aN) == nodeHash(bN) {
					out.Merged.Nodes = append(out.Merged.Nodes, aN)
				} else {
					out.Merged.Nodes = append(out.Merged.Nodes, aN)
					out.Conflicts = append(out.Conflicts, name)
				}
			}
		case inBase && inA && !inB:
			// b removed it, a kept it → keep (a remove/keep tie favours keep; no silent loss).
			out.Merged.Nodes = append(out.Merged.Nodes, aN)
		case inBase && !inA && inB:
			// a removed it, b kept it → keep.
			out.Merged.Nodes = append(out.Merged.Nodes, bN)
		case inBase && !inA && !inB:
			// both removed it → drop (a genuine agreed deletion).
		}
	}
	// keep the merged node set in canonical (name) order already (ordered iteration).
	return out
}

// nodeMap indexes a draft's nodes by entity name (the merge key).
func nodeMap(d Draft) map[string]EntityNode {
	m := make(map[string]EntityNode, len(d.Nodes))
	for _, n := range d.Nodes {
		m[n.Entity.Name] = n
	}
	return m
}

// nodeHash is the content address of a single entity node (entity + its relations), used
// to detect whether two editors changed a node to the same or different content. It is the
// canonical hash of a one-node draft, so it is order-invariant over the node's relations.
func nodeHash(n EntityNode) string {
	d := Draft{Project: "_node_", Nodes: []EntityNode{n}}
	h, err := SchemaHash(d)
	if err != nil {
		return ""
	}
	return h
}
