// BA21 — deterministic ROLE-MATCHING (MatchRole) + the STARVATION detector.
//
// THE WALL (CLAUDE.md §2). MatchRole is a pure, total READ over DECLARED data — the
// item's render Layer and the candidate CoucheAgent specs (which the scheduler role
// SELECTs from kernel.agent_layer, gap E4). It writes nothing; it CHOOSES which agent
// the BA22 shell will lease the item to. The scheduler never proposes a truth and never
// transitions outside Claim — matching only decides the owner that Claim then stamps.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Role-matching is an ALGORITHM over declared
// roles, NEVER an LLM prompt. The Layer→role map is DECLARED (layerRole), never learned;
// the tie-break is a total order (mirror-first layer rank, then lexicographic agent ref).
// Same (item, agents) ⇒ same (chosenAgentRef, ok). No clock, no rng, no I/O. The
// reproducibility mirror (matchrole_property_test.go) pins it.
//
// ANTI-FAMINE (gap E3). A dispatcher can be perfectly governed AND silently stuck: the
// mirror-first head of the queue may have NO free agent of the matching role. MatchRole
// surfaces that as ok=false (no panic, no fallback to a wrong role — the wall holds);
// DetectStarvation turns sustained ok=false into a still_red-class StarvationSignal that
// feeds the BA28 on-ramp ("the team is mis-staffed for the work"). The detector is pure
// too: it is handed the wait count, never a clock.
package scheduler

import "sort"

// Layer is the render layer of a RedWorkItem (the same closed set as redwave.Layer,
// re-stated here so the scheduler core depends on no upstream package — matching reads a
// declared string, not an import). mirror-first ordering (§42/§98) is the contract.
type Layer string

const (
	// LayerMirror — the bumped source's mirror reflection (reddens FIRST, §42/§98).
	LayerMirror Layer = "mirror"
	// LayerProjection — an api/db/types projection.
	LayerProjection Layer = "projection"
	// LayerOperationAction — an operation or action layer.
	LayerOperationAction Layer = "operation_action"
	// LayerButton — a control/button or its view.
	LayerButton Layer = "button"
)

// LayerRank gives the canonical mirror-first ordering rank of a Layer: mirror(0) <
// projection(1) < operation_action(2) < button(3). An unknown layer ranks LAST (4) so a
// malformed layer never jumps ahead of the mirror. This is the same rule as redwave's
// (unexported) layerRank, re-stated as a DECLARED total order the matcher relies on.
func LayerRank(l Layer) int {
	switch l {
	case LayerMirror:
		return 0
	case LayerProjection:
		return 1
	case LayerOperationAction:
		return 2
	case LayerButton:
		return 3
	default:
		return 4
	}
}

// layerRole is the DECLARED Layer→required-role map (never learned, CLAUDE.md §8). An
// agent may only be matched to an item whose layer demands the agent's declared Spec.Role.
// mirror-first discipline: a mirror item demands a "bdd-writer", everything below it an
// "executor". An unknown layer demands no role ⇒ no match (fail-closed), never a panic.
var layerRole = map[Layer]string{
	LayerMirror:          "bdd-writer",
	LayerProjection:      "executor",
	LayerOperationAction: "executor",
	LayerButton:          "executor",
}

// RoleFor returns the role the given layer requires, and whether the layer is known. An
// unknown layer ⇒ ("", false): no agent matches it (fail-closed; the wall holds — the
// scheduler never invents a role).
func RoleFor(l Layer) (string, bool) {
	r, ok := layerRole[l]
	return r, ok
}

// Candidate is the scheduler's view of one CoucheAgent the matcher may pick — only the
// fields matching reads: the agent @version ref, its DECLARED Spec.Role, and whether it
// is FREE (no live lease). It is the projection of a kernel.agent_layer row (gap E4); the
// matcher reads it, never writes it.
type Candidate struct {
	Ref  string `json:"ref"`  // the CoucheAgent @version (the chosen owner Claim will stamp)
	Role string `json:"role"` // the DECLARED Spec.Role (the matchable capability)
	Free bool   `json:"free"` // true ⇒ no live lease; only a free agent may be matched
}

// MatchRole maps a RedWorkItem to the agent the scheduler should lease it to, BY DECLARED
// ROLE. It is PURE + TOTAL: it returns (chosenRef, true) when exactly one best free agent
// of the matching role exists, else ("", false) — never a panic, never a wrong-role
// fallback (the wall: an item is only ever worked by an agent of its declared role).
//
// The choice is DETERMINISTIC: among the free agents whose Role equals the layer's
// required role, the lexicographically smallest Ref wins (a total order, so the same
// input always yields the same owner). An unknown layer, or no free matching agent,
// yields ok=false — which DetectStarvation later escalates (anti-famine, gap E3).
func MatchRole(item WorkItem, layer Layer, agents []Candidate) (string, bool) {
	role, known := RoleFor(layer)
	if !known {
		return "", false
	}
	best := ""
	found := false
	for _, a := range agents {
		if !a.Free || a.Role != role {
			continue
		}
		if !found || a.Ref < best {
			best = a.Ref
			found = true
		}
	}
	if !found {
		return "", false
	}
	return best, true
}

// HeadOf returns the mirror-first HEAD of a queue of open items: the item whose layer
// ranks earliest (mirror < projection < operation_action < button), ties broken by item
// id (a total order). It is the item the dispatcher must staff FIRST. An empty queue ⇒
// (zero, false). Pure + total; no clock.
//
// Each entry pairs an item with its layer (the queue row carries both; the scheduler's
// WorkItem view omits the layer, so it is supplied alongside).
type QueueEntry struct {
	Item  WorkItem `json:"item"`
	Layer Layer    `json:"layer"`
	// Dependencies are the item ids this item depends on (the JSONB `dependencies`
	// column, S22). An item leases only when EVERY dependency is `resolved` (BA22);
	// otherwise the lease/expire engine surfaces it `blocked`. Empty ⇒ no gate.
	Dependencies []string `json:"dependencies,omitempty"`
	// Target is the render target (e.g. the file path) this item produces. Two items that
	// name the SAME target conflict: BA25's ScheduleTeam serialises them (ResolveConflict
	// picks who passes first, the other WAITS — zero lost-update). Empty ⇒ no target
	// contention (the single-agent BA22 Schedule ignores it).
	Target string `json:"target,omitempty"`
}

// HeadOf picks the mirror-first head. It does not mutate the slice.
func HeadOf(queue []QueueEntry) (QueueEntry, bool) {
	if len(queue) == 0 {
		return QueueEntry{}, false
	}
	sorted := make([]QueueEntry, len(queue))
	copy(sorted, queue)
	sort.SliceStable(sorted, func(i, j int) bool {
		ri, rj := LayerRank(sorted[i].Layer), LayerRank(sorted[j].Layer)
		if ri != rj {
			return ri < rj
		}
		return sorted[i].Item.ItemID < sorted[j].Item.ItemID
	})
	return sorted[0], true
}

// StarvationSignal is the still_red-class signal the detector emits when the mirror-first
// HEAD of the queue cannot be staffed for N consecutive ticks (gap E3). It is a SIGNAL,
// not truth: it feeds the BA28 on-ramp ("the team is mis-staffed for the work"), it never
// writes the kernel. BELOW the line; no Version, no Mirror (it is a runtime event).
type StarvationSignal struct {
	// Class is the signal class — always "still_red" (the head stays red, unstaffed).
	Class string `json:"class"`
	// Item is the starving head item id.
	Item string `json:"item"`
	// Layer is the head item's layer (which role it could not be staffed for).
	Layer Layer `json:"layer"`
	// RequiredRole is the role the head demanded but no free agent supplied.
	RequiredRole string `json:"required_role"`
	// TicksWaited is how many consecutive ticks the head went unmatched.
	TicksWaited int `json:"ticks_waited"`
}

// SignalStillRed is the only StarvationSignal class — the head is still red, unstaffed.
const SignalStillRed = "still_red"

// DetectStarvation is the PURE, TOTAL anti-famine detector (gap E3). Given the mirror-first
// HEAD of the queue, the candidate agents, the number of consecutive ticks the head has
// already gone unmatched, and the declared threshold, it returns a StarvationSignal iff:
//
//   - the head CANNOT be matched right now (MatchRole(head)→ok=false), AND
//   - it has now waited >= threshold ticks.
//
// It is handed ticksWaited (the impure BA22 tick driver counts ticks — no clock here) and
// a DECLARED threshold (above the line, never learned). A non-positive threshold means
// "never starve" (returns false). If the head CAN be matched, there is no starvation
// (ok=false return), regardless of the wait count — staffing resolves it. No panic.
func DetectStarvation(head QueueEntry, agents []Candidate, ticksWaited, threshold int) (StarvationSignal, bool) {
	if threshold <= 0 {
		return StarvationSignal{}, false
	}
	if _, ok := MatchRole(head.Item, head.Layer, agents); ok {
		return StarvationSignal{}, false // a free matching agent exists ⇒ not starving
	}
	if ticksWaited < threshold {
		return StarvationSignal{}, false
	}
	role, _ := RoleFor(head.Layer) // "" for an unknown layer — still surfaced as mis-staffed
	return StarvationSignal{
		Class:        SignalStillRed,
		Item:         head.Item.ItemID,
		Layer:        head.Layer,
		RequiredRole: role,
		TicksWaited:  ticksWaited,
	}, true
}
