// Package goal is the AIDOS Runtime GOAL ENGINE (KRD §56–§59, §63 ①, LIVRE XX): the only
// legitimate door from a candidate-truth (an idea) to truth — `idea → mirror → /goal`.
//
// A Goal is a DRAFT ChangeSet (S20) carrying the idea's spec_delta + mirror_delta atomically
// PLUS the RED SET — the ordered set of failing mirror refs that ARE the goal (§56: "le test
// rouge EST le goal ; le set rouge EST la todo-list"). Opening a goal:
//
//  1. requires the idea to carry a mirror_delta — an idea with no mirror is a *vœu* / monster
//     (rejected IDEA_WITHOUT_MIRROR, §57/LIVRE XX) ; no ChangeSet is opened ;
//  2. opens a DRAFT ChangeSet via S20's changeset.Open wrapping the idea's spec_delta +
//     mirror_delta (the two planes held together so they cannot drift) ;
//  3. DERIVES the red set by REUSING S22's redwave.Impact — the failing mirrors the spec_delta
//     reddens (the cascade is S22's, never re-implemented here) ;
//  4. rejects an EMPTY red set (NO_RED_SET, §56) — a test already green is not a goal.
//
// The stop is NON-GAMEABLE (§57 Algorithme ①, §8): a goal closes iff
//
//	red set → green ∧ prior green intact ∧ mutation ≥ threshold ∧ no monster
//
// IsClosed computes that verdict; it takes NO agent-confidence input — the engine NEVER reads
// the agent's claim of "done" (the whole point of S29: the agent never grades its own copy).
// Budgets (time/turns/tokens) are the SECONDARY anti-runaway guard, DECLARED never learned.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; the wall §2): S02's records.Canonicalize/Hash for the
// content address (never forked), S20's changeset.Open/Delta/Status for the envelope (the
// DRAFT→APPLIED commit-gate stays S20's — this engine NEVER stamps a goal CLOSED, never
// APPLIES), S22's redwave.Impact for the red set (never re-implemented), S13's
// blockreason.BlockReason for every refusal. This package writes NOTHING: OpenGoal/IsClosed
// return VALUES; persistence of an ideas.goal row rides the aidos CLI writer role (the agent
// is SELECT-only on ideas.goal — the wall).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): OpenGoal and IsClosed are PURE and TOTAL — no DB, no
// clock, no rng, no I/O, never panic. Same input ⇒ same goal / same verdict, so the goal
// decision is replayable. The reproducibility mirror goal_property_test.go pins that.
package goal

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// Edge re-exports S22's redwave.Edge so callers express the red-set input in goal terms while
// the cascade stays S22's (a type alias — NOT a fork; the same struct, the same closure).
type Edge = redwave.Edge

// Status is the CLOSED set of a goal's lifecycle states. CLOSED is COMPUTED (IsClosed), never
// declared by the agent — there is no third status, and "done" is not a flag the agent sets.
type Status string

const (
	// StatusOpen — the goal carries a non-empty red set still to turn green (the only status
	// OpenGoal produces). A fresh goal is OPEN.
	StatusOpen Status = "OPEN"
	// StatusClosed — the non-gameable stop holds (red set→green ∧ prior intact ∧ mut≥floor ∧
	// no monster). COMPUTED by IsClosed; the aidos CLI role stamps the row, never the agent.
	StatusClosed Status = "CLOSED"
)

// Budgets are the SECONDARY anti-runaway guard (KRD §57): time/turns/tokens, DECLARED never
// learned. They bound the loop; they are NOT a close condition (the close is the four-part
// non-gameable stop). Carried in the goal body for the burndown the Workbench renders.
type Budgets struct {
	TimeSeconds int `json:"time_seconds"`
	Turns       int `json:"turns"`
	Tokens      int `json:"tokens"`
}

// Idea is the goal engine's view of a candidate-truth (the S27 ideas record, KRD §118): an id
// plus the spec_delta it WOULD freeze and the mirror_delta that proves it. An idea with no
// MirrorDelta is a vœu — the type allows it so OpenGoal can REJECT it (IDEA_WITHOUT_MIRROR);
// the goal engine never silently promotes one.
type Idea struct {
	// ID is the source idea's content-addressed id (the ideas schema; the goal pins it).
	ID string `json:"id"`
	// SpecDelta is the kernel-plane change the idea proposes (what would freeze).
	SpecDelta changeset.Delta `json:"spec_delta"`
	// MirrorDelta is the mirror-plane change that proves it. nil ⇒ a vœu (rejected).
	MirrorDelta *changeset.Delta `json:"mirror_delta,omitempty"`
}

// OpenInput is the pure input to OpenGoal. Bumped/Edges/Heads are the S22 red-wave inputs the
// engine HANDS to redwave.Impact to derive the red set (read from the arguments, never
// fetched — the wall + determinism). ParentPhase is the stable phase the ChangeSet moves from.
type OpenInput struct {
	Idea        Idea
	ParentPhase string
	// Bumped/Edges/Heads are S22's Impact inputs (the bumped kernel sources, the versioned
	// link graph with declared load-bearing flags, the current heads). The derived red set is
	// EXACTLY the failing mirrors of the wave — never hunted here.
	Bumped  []string
	Edges   []Edge
	Heads   map[string]string
	Budgets Budgets
}

// SpecDeltaTarget is a small accessor used by the property mirror to read the spec_delta
// target without reaching into the struct shape.
func (in OpenInput) SpecDeltaTarget() string { return in.Idea.SpecDelta.Target }

// Goal is the promotion record above `product` (LIVRE XX): the idea_ref, the DRAFT ChangeSet
// it opened (S20), the derived red set, the computed status and the declared budgets. The id
// is the content hash of the canonical body (S02 reused). The red set lives INSIDE the body
// (version-pinned mirror refs, not foreign keys — a recorded goal stays inspectable after
// heads move).
type Goal struct {
	// ID is the SHA-256 hex content hash of the canonical goal body (content-addressed, S02).
	ID string `json:"id"`
	// IdeaRef is the source idea's id (FK-by-ref into the ideas schema, version-pinned).
	IdeaRef string `json:"idea_ref"`
	// ChangeSetRef is the DRAFT ChangeSet's id (S20). Equals ChangeSet.ID.
	ChangeSetRef string `json:"changeset_ref"`
	// ChangeSet is the DRAFT envelope (S20) carrying spec_delta + mirror_delta atomically.
	ChangeSet changeset.ChangeSet `json:"changeset"`
	// RedSet is the ordered set of failing mirror refs that ARE the goal (§56). Non-empty.
	RedSet []string `json:"red_set"`
	// Status is OPEN | CLOSED — COMPUTED (IsClosed), never declared.
	Status Status `json:"status"`
	// Budgets is the declared secondary guard (time/turns/tokens).
	Budgets Budgets `json:"budgets"`
}

// canonicalBody is the content-addressed portion of a Goal: everything that defines its
// identity. The lifecycle Status is EXCLUDED (it advances OPEN→CLOSED without changing the
// goal's identity, mirroring the ChangeSet's stamp/id split). The ChangeSet is pinned by its
// id (its own content address), not embedded, so the goal body stays stable.
type canonicalBody struct {
	Kind         string   `json:"kind"` // always "goal" — namespaces the hash
	IdeaRef      string   `json:"idea_ref"`
	ChangeSetRef string   `json:"changeset_ref"`
	RedSet       []string `json:"red_set"`
	Budgets      Budgets  `json:"budgets"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the goal id. It REUSES S02's
// records.Canonicalize (key-sorted, deterministic) — never a forked hashing path.
func (g Goal) CanonicalBody() ([]byte, error) {
	raw, err := json.Marshal(canonicalBody{
		Kind:         "goal",
		IdeaRef:      g.IdeaRef,
		ChangeSetRef: g.ChangeSetRef,
		RedSet:       g.RedSet,
		Budgets:      g.Budgets,
	})
	if err != nil {
		return nil, fmt.Errorf("goal: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// ComputeID returns the content hash of a goal's canonical body, REUSING S02's records.Hash
// (the same address space as every record kind). Pure.
func ComputeID(g Goal) (string, error) {
	b, err := g.CanonicalBody()
	if err != nil {
		return "", err
	}
	return records.Hash(b), nil
}

// OpenGoal is the pure goal-opening function (KRD §56–§57). It rejects a mirror-less idea
// (IDEA_WITHOUT_MIRROR — no ChangeSet opened), opens a DRAFT ChangeSet via S20's Open wrapping
// the idea's spec_delta + mirror_delta atomically, DERIVES the red set via S22's Impact, and
// rejects an empty red set (NO_RED_SET — a green test is not a goal). On success it returns an
// OPEN, content-addressed Goal. PURE: no DB, no clock, no rng; reads only its input. Never
// APPLIES the ChangeSet (DRAFT→APPLIED stays S20's commit-gate) and never stamps CLOSED.
func OpenGoal(in OpenInput) (Goal, *blockreason.BlockReason) {
	// (1) An idea with no mirror is a vœu / monster — rejected before anything is opened.
	if in.Idea.MirrorDelta == nil {
		br := blockreason.For(blockreason.CodeIdeaWithoutMirror)
		return Goal{}, &br
	}

	// (2) Open a DRAFT ChangeSet wrapping the spec_delta + mirror_delta atomically (S20).
	spec := in.Idea.SpecDelta
	cs, err := changeset.Open(
		"goal: "+in.Idea.ID,
		in.ParentPhase,
		&spec,
		in.Idea.MirrorDelta,
	)
	if err != nil {
		// A malformed delta cannot be content-addressed: surface it as an actionable refusal
		// rather than panic (totality). Reuse the no-red-set door's spirit: the goal cannot form.
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Goal{}, &br
	}

	// (3) Derive the red set by REUSING S22's Impact — the failing mirrors the bump reddens.
	wave := redwave.Impact(in.Bumped, in.Edges, in.Heads)
	redSet := redSetFromWave(wave)

	// (4) An empty red set is not a goal (NO_RED_SET, §56) — nothing to close.
	if len(redSet) == 0 {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Goal{}, &br
	}

	g := Goal{
		IdeaRef:      in.Idea.ID,
		ChangeSetRef: cs.ID,
		ChangeSet:    cs,
		RedSet:       redSet,
		Status:       StatusOpen,
		Budgets:      in.Budgets,
	}
	id, err := ComputeID(g)
	if err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Goal{}, &br
	}
	g.ID = id
	return g, nil
}

// redSetFromWave extracts the ordered mirror refs from the red wave. The wave is already in
// canonical mirror-first order (S22); the red set is its targets, deduplicated and kept in
// that order so the goal's todo-list is stable and replayable.
func redSetFromWave(w redwave.RedWave) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(w.Items))
	for _, it := range w.Items {
		if seen[it.Target] {
			continue
		}
		seen[it.Target] = true
		out = append(out, it.Target)
	}
	return out
}

// SensorState is a mirror's current verdict as the stop predicate reads it — the CLOSED two
// values of a deterministic sensor (computational regime). There is no "unknown": an
// unreadable sensor is treated as NOT green (red), so the goal cannot close on missing
// evidence (anti-passthrough, KRD §82).
type SensorState string

const (
	// SensorRed — the mirror is failing (or its verdict is missing/unreadable). NOT closeable.
	SensorRed SensorState = "red"
	// SensorGreen — the mirror passes.
	SensorGreen SensorState = "green"
)

// PriorGreenState is whether the prior green corpus is intact — the second non-gameable
// condition (§8: no close breaks a single existing green). CLOSED two-value set.
type PriorGreenState string

const (
	// PriorIntact — every previously-green mirror is still green.
	PriorIntact PriorGreenState = "intact"
	// PriorBroken — a regression on a prior truth: a previously-green mirror went red. BLOCKS.
	PriorBroken PriorGreenState = "broken"
)

// StopInput is the pure input to IsClosed: the live sensor verdicts for the red set, whether
// prior green is intact, the current mutation score and its DECLARED floor, and the monster
// findings. There is DELIBERATELY no agent-confidence field — the engine never reads the
// agent's claim of "done" (§57: the agent never grades its own copy).
type StopInput struct {
	// Sensors maps a red-set mirror ref to its live verdict. A missing entry is treated as red.
	Sensors map[string]SensorState
	// PriorGreen is whether the prior green corpus is intact (§8).
	PriorGreen PriorGreenState
	// Mutation is the current mutation score (0..1).
	Mutation float64
	// MutationFloor is the DECLARED threshold (never learned). Mutation must be ≥ floor.
	MutationFloor float64
	// Monsters are the current monster findings (orphan mirror / mirror-less truth). Any ⇒ block.
	Monsters []string
}

// IsClosed is the NON-GAMEABLE stop predicate (KRD §57 Algorithme ①, §8): a goal closes iff
//
//	red set → green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster
//
// All four conditions must hold. It is PURE, TOTAL and DETERMINISTIC over its input, takes NO
// agent-confidence input (there is no such field), and never panics. A missing sensor verdict
// counts as red (anti-passthrough): the goal cannot close on absent evidence.
func IsClosed(g Goal, in StopInput) bool {
	// (1) Every mirror of the red set is green.
	for _, m := range g.RedSet {
		if in.Sensors[m] != SensorGreen {
			return false
		}
	}
	// (2) Prior green intact — no regression on a prior truth.
	if in.PriorGreen != PriorIntact {
		return false
	}
	// (3) Mutation score at or above the declared floor.
	if in.Mutation < in.MutationFloor {
		return false
	}
	// (4) No monster (no orphan mirror, no mirror-less truth).
	if len(in.Monsters) > 0 {
		return false
	}
	return true
}

// CloseBlockReason returns the actionable GOAL_STILL_RED refusal when IsClosed is false — the
// BlockReason the Stop:goal-check hook surfaces. It is nil when the goal IS closeable. Pure.
func CloseBlockReason(g Goal, in StopInput) *blockreason.BlockReason {
	if IsClosed(g, in) {
		return nil
	}
	br := blockreason.For(blockreason.CodeGoalStillRed)
	return &br
}

// RedSetSorted returns the red set in a stable sorted order — a convenience for projections
// that want a canonical display order independent of the wave order. Pure.
func RedSetSorted(g Goal) []string {
	out := make([]string, len(g.RedSet))
	copy(out, g.RedSet)
	sort.Strings(out)
	return out
}
