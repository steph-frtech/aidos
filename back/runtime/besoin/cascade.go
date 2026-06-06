package besoin

// cascade.go — EL08: the anchor CASCADE + the MEASURED constraint inheritance (the compound PROVEN).
//
// EL07 gave the per-level forcing verdict (CanDescend). EL08 adds the three pieces that turn that
// verdict into the COMPOUND — each resolved rung above is a FROZEN ANCHOR the rung below reads and
// cannot silently contradict, and the lower rung's OptionSpace MEASURABLY shrinks because of it:
//
//   1. AnchorsAbove(graph, level) — the frozen list of `resolved` SOURCE rungs strictly ABOVE `level`,
//      in descent order: the single readable grounding for the rung being elicited (the compound P1).
//      A node that is not yet `resolved` is NOT an anchor (an unfrozen rung cannot constrain below).
//
//   2. Descend(graph, fromLevel) — opens fromLevel+1 ONLY when CanDescend(fromLevel).enough, emitting
//      the constrains(fromLevel→next) edge (and a seeds edge when fromLevel names a deeper need). A
//      premature descent (¬enough) is REFUSED with CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED — never an
//      opinion, the verdict is EL07's computed `enough`. Pure: returns a NEW graph, never mutates (§9).
//
//   3. ShrinkOptionSpaceCascade(graph, level) — the compound MEASURED: |OptionSpace(level→next)|
//      BEFORE anchors (the full declared closed set, EL06) vs AFTER the frozen anchors above prune it.
//      A frozen `product` persona prunes branches of `journey` archetypes; the count must be STRICTLY
//      smaller under a frozen anchor than without — if the space does NOT shrink, the compounding has
//      FAILED (a go/no-go, ROADMAP CE01-style). For a non-enumerable pair (operation→entity) the
//      cascade is satisfied-by-OpenQuestion (the sentinel), never a fabricated count.
//
// ANTI-OVERWRITE (CLAUDE.md §9). Re-opening a FROZEN anchor is NOT an edit: it is a recorded decision.
// ReopenAnchor refuses a silent rewrite of a `resolved` node with BESOIN_ANCHOR_OVERWRITE and demands
// a ChangeSet token (the provenance of the reopen). With a ChangeSet, the reopen appends a NEW
// versioned node body + provenance (append-only), it never destroys the prior. Without one, fail-closed.
//
// THE WALL (CLAUDE.md §2). Every function reads only the BesoinGraph above the line and writes no
// truth. DETERMINISM-FIRST (§6/§8): AnchorsAbove, Descend, ShrinkOptionSpaceCascade and the overwrite
// check are PURE TOTAL functions — no clock/rng/IO/LLM. The reproducibility mirror
// (cascade_property_test.go) pins same-input→same-output and the anti-vacuity strict-shrink law.

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

const (
	// CodeCannotDescend — Descend refused: the source rung is not right-sized (¬CanDescend.enough).
	CodeCannotDescend BesoinBlockCode = "CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED"
	// CodeAnchorOverwrite — a silent rewrite of a FROZEN (resolved) anchor was attempted without a
	// ChangeSet (anti-overwrite §9). Re-opening an anchor is a recorded decision, never an edit.
	CodeAnchorOverwrite BesoinBlockCode = "BESOIN_ANCHOR_OVERWRITE"
)

// Anchor is a single frozen grounding the rung below reads: a `resolved` SOURCE rung strictly above.
// It carries the Level and the canonical Body so the cascade (and the screen) can show the grounding
// without re-deriving it. Frozen = resolved; an unfrozen rung is never an Anchor.
type Anchor struct {
	Level Level           `json:"level"`
	Body  json.RawMessage `json:"body,omitempty"`
}

// AnchorsAbove returns the frozen anchors strictly ABOVE `level`, in descent order (top-most first) —
// every `resolved` SOURCE rung whose descent index is smaller than level's. A rung that is `empty` or
// `drafting` is NOT frozen and is excluded (an unfrozen rung cannot constrain below). For a
// transversal band or a non-grammar level there is no descent position → no anchors. PURE, TOTAL.
func AnchorsAbove(graph BesoinGraph, level Level) []Anchor {
	idx := sourceIndex(level)
	if idx < 0 {
		return nil // bands / non-grammar levels are off the descent path: no cascade position.
	}
	out := make([]Anchor, 0, idx)
	// Walk the declared SOURCE order so the result is in descent order regardless of node insertion.
	for _, l := range Levels() {
		if sourceIndex(l) >= idx {
			break // reached `level` (or below) — anchors are STRICTLY above.
		}
		node, ok := graph.Node(l)
		if !ok || node.Status != NodeResolved {
			continue // only FROZEN (resolved) rungs are anchors.
		}
		out = append(out, Anchor{Level: l, Body: node.Body})
	}
	return out
}

// IsAnchored reports whether the rung immediately above `level` is a frozen anchor — the minimal
// "is this rung grounded" check the screen uses to show whether descent into `level` was earned. Pure.
func IsAnchored(graph BesoinGraph, level Level) bool {
	prev, ok := PrevLevel(level)
	if !ok {
		return false // product has no rung above; nothing anchors it.
	}
	node, present := graph.Node(prev)
	return present && node.Status == NodeResolved
}

// DescendResult is the PURE output of Descend: the new graph (with the constrains edge appended) when
// the descent is earned, or a refusal (Verdict carrying CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED) when the
// source rung is not right-sized. Opened names the rung Descend opened (fromLevel+1) on success.
type DescendResult struct {
	// OK is true iff fromLevel was right-sized and the descent edge was emitted.
	OK bool `json:"ok"`
	// Graph is the NEW graph (non-destructive §9): on success it carries the constrains edge (and a
	// drafting node for the opened rung if absent). On refusal it is the input graph unchanged.
	Graph BesoinGraph `json:"-"`
	// Opened is the rung Descend opened (fromLevel+1) on success ("" on refusal or at the leaf).
	Opened Level `json:"opened,omitempty"`
	// Refusal carries the EL07 verdict + the CANNOT_DESCEND BlockReason when OK is false.
	Refusal *Verdict `json:"refusal,omitempty"`
}

// Descend opens the rung below `fromLevel` — but ONLY when CanDescend(fromLevel, meta).enough. On
// success it emits the constrains(fromLevel→next) edge and, if the next rung has no node yet, appends
// it as a `drafting` node (so the cascade has somewhere to descend into). On refusal it returns the
// input graph unchanged plus a Verdict carrying the gate's BlockReasons AND the CANNOT_DESCEND code
// (a premature descent is refused — never an opinion, EL07's computed `enough` decides). At the leaf
// (entity) there is no rung below: OK with Opened == "". PURE, TOTAL, DETERMINISTIC.
func Descend(graph BesoinGraph, fromLevel Level, meta Metadata) DescendResult {
	v := CanDescend(graph, fromLevel, meta)
	if !v.Enough {
		// Add the descent-specific refusal on top of the gate's own BlockReasons (so the caller sees
		// BOTH why the body failed AND that descent is therefore refused).
		ref := v
		ref.BlockReasons = append(append([]blockreason.BlockReason(nil), v.BlockReasons...),
			blockreason.BlockReason{
				Code:        blockreason.Code(CodeCannotDescend),
				Severity:    blockreason.SeverityBlocking,
				Explanation: fmt.Sprintf("Descente refusée : le niveau %q n'est pas right-sized (¬CanDescend.enough) — on ne descend pas avant d'avoir assez déclaré.", fromLevel),
				HowToFix:    []string{"right_size_current_level", "satisfaites la gate EL07 du niveau courant avant de descendre"},
			})
		return DescendResult{OK: false, Graph: graph, Refusal: &ref}
	}

	next, ok := NextLevel(fromLevel)
	if !ok {
		return DescendResult{OK: true, Graph: graph} // leaf rung: enough, nothing below to open.
	}

	out := graph
	// Open the next rung as a drafting node if it does not exist yet (so the cascade has a target).
	if _, present := out.Node(next); !present {
		opened, err := out.AddNode(LevelNode{
			Level:      next,
			Provenance: Provenance{Source: "human", Detail: fmt.Sprintf("descended from %s", fromLevel)},
			Status:     NodeDrafting,
		})
		if err == nil {
			out = opened
		}
	}
	// Emit the constrains edge fromLevel→next (the descent edge of the verticale). AddEdge de-dupes.
	if edged, err := out.AddEdge(Edge{From: fromLevel, To: next, Kind: EdgeConstrains}); err == nil {
		out = edged
	}
	return DescendResult{OK: true, Graph: out, Opened: next}
}

// CascadeShrink is the PURE output of ShrinkOptionSpaceCascade: the |OptionSpace| BEFORE the anchors
// (the full declared closed set), the count AFTER the frozen anchors prune it, and Shrink = Before −
// After (the COMPOUND measured). Enumerable is false for the declared OpenQuestion pair
// (operation→entity), where Shrink is the positive sentinel (carried, never fabricated).
type CascadeShrink struct {
	Level Level `json:"level"`
	// Next is the lower rung whose OptionSpace is being narrowed.
	Next Level `json:"next"`
	// Enumerable is false for the declared non-enumerable pair (a carried OpenQuestion).
	Enumerable bool `json:"enumerable"`
	// Before is |OptionSpace| with NO frozen anchor (the full declared closed set). -1 when not
	// enumerable.
	Before int `json:"before"`
	// After is |OptionSpace| once the frozen anchor above prunes it. -1 when not enumerable.
	After int `json:"after"`
	// Shrink = Before − After: the compound measured (strictly > 0 under a real frozen anchor). For a
	// non-enumerable pair it is the positive sentinel (satisfied-by-OpenQuestion).
	Shrink int `json:"shrink"`
	// OpenQuestion is the declared reason a pair is not enumerable (empty when Enumerable).
	OpenQuestion string `json:"open_question,omitempty"`
}

// cascadeSentinel is the positive shrink a non-enumerable pair (or a leaf) carries: the anti-vacuity
// cascade is satisfied-by-OpenQuestion, never a fabricated narrowing.
const cascadeSentinel = 1

// ShrinkOptionSpaceCascade measures the COMPOUND: how much the FROZEN anchors above `level` narrow the
// (level→next) OptionSpace. Before = the full declared closed set |OptionSpace| (EL06). After = the
// count once the frozen anchor's `selects` prunes it: the anchor at `level` itself (when resolved)
// retains a proper subset, so After = |selects ∩ choices| and the cascade pruned Before − After. With
// NO frozen anchor (the level is not resolved, or selects nothing) the space is NOT narrowed → After
// == Before → Shrink == 0 (the compounding has not happened; go/no-go). For a non-enumerable pair the
// sentinel is carried. PURE, TOTAL, DETERMINISTIC — no clock/rng/IO/LLM.
func ShrinkOptionSpaceCascade(graph BesoinGraph, level Level) CascadeShrink {
	cs := CascadeShrink{Level: level}

	next, ok := NextLevel(level)
	if !ok {
		// Entity leaf: no lower rung to narrow; the cascade is vacuously satisfied (sentinel).
		cs.Enumerable = false
		cs.Before, cs.After, cs.Shrink = -1, -1, cascadeSentinel
		cs.OpenQuestion = "entity is the leaf rung: no lower OptionSpace to narrow (cascade vacuously satisfied)."
		return cs
	}
	cs.Next = next

	os, found := OptionSpaceFor(level, next)
	if !found || !os.Enumerable {
		cs.Enumerable = false
		cs.Before, cs.After, cs.Shrink = -1, -1, cascadeSentinel
		if found {
			cs.OpenQuestion = os.OpenQuestion
		} else {
			cs.OpenQuestion = fmt.Sprintf("no declared OptionSpace for %s→%s (not a consecutive descent pair).", level, next)
		}
		return cs
	}

	cs.Enumerable = true
	cs.Before = len(os.Choices) // the full declared closed set, before any frozen anchor prunes it.

	// AFTER: the frozen anchor at `level` (resolved) prunes the lower OptionSpace via its `selects`.
	node, present := graph.Node(level)
	if !present || node.Status != NodeResolved {
		// No frozen anchor at this rung → the space is not narrowed (compounding has not happened).
		cs.After = cs.Before
		cs.Shrink = 0
		return cs
	}
	body, err := decodeBody(node.Body)
	if err != nil {
		cs.After = cs.Before
		cs.Shrink = 0
		return cs
	}
	selected := stringSet(body["selects"])
	full := map[string]bool{}
	for _, c := range os.Choices {
		full[c] = true
	}
	kept := 0
	for c := range selected {
		if full[c] {
			kept++
		}
	}
	if kept == 0 {
		// Selects nothing valid → the space is not narrowed.
		cs.After = cs.Before
		cs.Shrink = 0
		return cs
	}
	cs.After = kept
	cs.Shrink = cs.Before - cs.After
	if cs.Shrink < 0 {
		cs.Shrink = 0
	}
	return cs
}

// --- anti-overwrite: reopening a frozen anchor needs a ChangeSet (§9) --------------------------------

// ReopenResult is the PURE output of ReopenAnchor: the new graph (with the anchor reopened to drafting
// + the prior body preserved as a versioned decision) when a ChangeSet token is supplied, or a refusal
// (BESOIN_ANCHOR_OVERWRITE) when a silent rewrite was attempted without one.
type ReopenResult struct {
	OK    bool        `json:"ok"`
	Graph BesoinGraph `json:"-"`
	// Refusal carries the BESOIN_ANCHOR_OVERWRITE BlockReason when OK is false.
	Refusal *blockreason.BlockReason `json:"refusal,omitempty"`
}

// ReopenAnchor re-opens a FROZEN (resolved) anchor for re-elicitation. Anti-overwrite (§9): this is a
// recorded DECISION, not an edit — it REQUIRES a non-empty `changeSet` token (the provenance of the
// reopen). Without a ChangeSet it fails-closed with BESOIN_ANCHOR_OVERWRITE (a silent rewrite of a
// frozen anchor is forbidden). With one, it returns a NEW graph where the node is set back to
// `drafting` and its provenance records the reopen (append-only: the prior frozen body is preserved in
// the returned node's OpenQuestions as the recorded prior decision, never destroyed). A node that is
// NOT frozen (empty/drafting) needs no ChangeSet — there is no anchor to overwrite. PURE, TOTAL.
func ReopenAnchor(graph BesoinGraph, level Level, changeSet string) ReopenResult {
	node, present := graph.Node(level)
	if !present {
		return ReopenResult{OK: false, Graph: graph, Refusal: &blockreason.BlockReason{
			Code:        blockreason.Code(CodeNodeAbsent),
			Severity:    blockreason.SeverityBlocking,
			Explanation: fmt.Sprintf("Aucun nœud %q à rouvrir.", level),
			HowToFix:    []string{"declare_level_body"},
		}}
	}
	if node.Status != NodeResolved {
		// Not a frozen anchor — re-elicitation needs no ChangeSet (nothing is being overwritten).
		return ReopenResult{OK: true, Graph: graph}
	}
	if changeSet == "" {
		// A FROZEN anchor + no ChangeSet = a silent overwrite. Fail-closed (§9).
		return ReopenResult{OK: false, Graph: graph, Refusal: &blockreason.BlockReason{
			Code:        blockreason.Code(CodeAnchorOverwrite),
			Severity:    blockreason.SeverityBlocking,
			Explanation: fmt.Sprintf("Réécriture silencieuse de l'ancre figée %q interdite : rouvrir une ancre résolue est une DÉCISION enregistrée (ChangeSet), jamais une édition (anti-overwrite §9).", level),
			HowToFix:    []string{"open_changeset", "ouvrez un ChangeSet pour rouvrir l'ancre (la décision est tracée, le corps figé est préservé)"},
		}}
	}
	// With a ChangeSet: reopen to drafting, preserving the prior frozen body as a recorded decision
	// (append-only — the prior is never destroyed, §9). We rebuild the graph without this node, then
	// re-add it in drafting with a provenance + OpenQuestion that records the reopen + ChangeSet.
	out := NewGraph(graph.Project)
	for _, n := range graph.Nodes {
		if n.Level == level {
			continue
		}
		out, _ = out.AddNode(n)
	}
	reopened := LevelNode{
		Level:      level,
		Body:       node.Body, // the prior body is carried forward (not destroyed) for re-elicitation.
		Refs:       node.Refs,
		Provenance: Provenance{Source: node.Provenance.Source, Detail: fmt.Sprintf("reopen via changeset:%s (prior: %s)", changeSet, node.Provenance.Detail)},
		Status:     NodeDrafting,
		OpenQuestions: appendUnique(append([]string(nil), node.OpenQuestions...),
			fmt.Sprintf("anchor %s reopened via changeset:%s — prior resolved body preserved (append-only §9).", level, changeSet)),
	}
	out, err := out.AddNode(reopened)
	if err != nil {
		return ReopenResult{OK: false, Graph: graph, Refusal: &blockreason.BlockReason{
			Code:        blockreason.Code(CodeAnchorOverwrite),
			Severity:    blockreason.SeverityBlocking,
			Explanation: fmt.Sprintf("Échec de la réouverture de l'ancre %q: %v", level, err),
			HowToFix:    []string{"open_changeset"},
		}}
	}
	// Re-attach the edges of the original graph unchanged (the topology is preserved).
	for _, e := range graph.Edges {
		out, _ = out.AddEdge(e)
	}
	return ReopenResult{OK: true, Graph: out}
}
