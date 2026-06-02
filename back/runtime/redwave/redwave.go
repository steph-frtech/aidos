// Package redwave is the pure RED-WAVE (vague de rouge) impact engine of the AIDOS Runtime
// (KRD §42, §74, §98). After a kernel hash bump, it computes the set of stale links and
// failing mirrors the bump triggers — the worklist — and drains it into a RedWorkQueue (§49.4).
//
// THE LAW (KRD §42): the red wave IS EXACTLY the set of stale links after a bump — nothing
// more, nothing less. It is COMPUTED, never hunted. It STARTS at the mirror (the bumped
// source's `mirrors` reflection reddens first) and CASCADES to the projections that
// derive from / project to the changed source (api/db/types/operation/action/button), in
// that order (mirror-first, §42/§98). Changing an entity reddens api/db/types; changing a
// button reddens its view IFF the button is LOAD-BEARING (a cosmetic change does not redden
// the view — KRD §112).
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; ADR 0020): the staleness of each edge is decided by
// S17's links.Resolve — this package NEVER re-implements or forks it. An item appears in the
// wave iff Resolve reports stale|absent for its link; there is no item without a stale link
// and no stale link without an item (§42). "Load-bearing" is the DECLARED composes weight
// (S18/S19, §112), carried on the edge as a bool — not an S17 link field, not invented here.
//
// PURE (CLAUDE.md §6 determinism-first): Impact and Enqueue are total, deterministic functions
// of their input — no DB, no clock, no rng, no I/O. The bumped set, the link graph and the
// heads are READ from the arguments handed in, never fetched, so the same input yields a
// byte-identical ordered wave and the wave is replayable. The rapid property mirror pins
// determinism, wave==set-of-stale-links, mirror-first order, no-propagation-on-cosmetic, the
// |wave| enqueue count, and totality (no panic on a malformed/absent target).
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package writes nothing. Enqueue
// returns the rows VALUE; the actual INSERT into runtime.red_work_queue (below the waterline)
// is done by the harness-invoked PostKernelChange hook through the agent's INSERT+SELECT
// grant — never above the line.
package redwave

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/links"
)

// Reason is why a RedWorkItem is red — the CLOSED set of KRD §49.4. version_stale is the
// red-wave seed (a link pinned to a non-head / absent version); failed_test and incident are
// the other on-ramps (a mirror that went red on a run, a production incident). S22 computes
// version_stale; the other two are referenced (their producers are later steps).
type Reason string

const (
	// ReasonVersionStale — the item's link is pinned to a non-head/absent version (§42 seed).
	ReasonVersionStale Reason = "version_stale"
	// ReasonFailedTest — the item's mirror went red on a run (a later producer).
	ReasonFailedTest Reason = "failed_test"
	// ReasonIncident — the item was opened by a production incident (a later producer).
	ReasonIncident Reason = "incident"
)

// Status is a RedWorkItem's lifecycle state — the CLOSED set of KRD §49.4. S22 only ever
// produces `open`; the transitions (claimed/blocked/resolved) are the SCHEDULER's job (a
// later step, §49.4), not computed here.
type Status string

const (
	// StatusOpen — the item is in the queue, unclaimed (the only status S22 produces).
	StatusOpen Status = "open"
	// StatusClaimed — a scheduler leased the item to an agent (a later step).
	StatusClaimed Status = "claimed"
	// StatusBlocked — the item is blocked on a dependency (a later step).
	StatusBlocked Status = "blocked"
	// StatusResolved — the item's projection was turned green (a later step).
	StatusResolved Status = "resolved"
)

// Layer is the coarse render layer of a target — used by the Workbench to GROUP the wave
// (mirror → api/db/types → operation/action → button). It is a render hint, not part of the
// closure logic; the order of the wave is decided by the closure, not by the layer.
type Layer string

const (
	// LayerMirror — the bumped source's mirror reflection (reddens FIRST, §42/§98).
	LayerMirror Layer = "mirror"
	// LayerProjection — an api/db/types projection (derives_from/projects_to the source).
	LayerProjection Layer = "projection"
	// LayerOperationAction — an operation or action layer.
	LayerOperationAction Layer = "operation_action"
	// LayerButton — a control/button or its view.
	LayerButton Layer = "button"
)

// Edge is one propagating edge of the wave's input graph: an S17 link PLUS the DECLARED
// load-bearing flag (the composes weight, S18/S19 §112; ADR 0020) and a render Layer hint.
// The link's staleness is decided ONLY by links.Resolve (reused, never forked). LoadBearing
// gates propagation: a cosmetic edge (LoadBearing=false) never propagates red beyond itself.
// A nil/empty Layer is treated as LayerProjection by classification, never a crash.
type Edge struct {
	// Link is the S17 versioned link (kind + pinned from/to). Resolve(Link, heads) decides red.
	Link links.Link `json:"link"`
	// LoadBearing is the DECLARED composes weight (true = load-bearing/critical, false =
	// cosmetic), S18/S19 §112. A cosmetic edge does NOT propagate red to its consumer.
	LoadBearing bool `json:"load_bearing"`
	// Layer is the render-grouping hint for the consuming `from` side (mirror/projection/…).
	Layer Layer `json:"layer"`
}

// RedWorkItem is one element of the wave (KRD §49.4): a target (a mirror_id or a projection
// ref), why it is red, its declared dependencies, plus the render Layer and the bump
// (wave_id) that opened it. Target is the consuming `from` side — the layer that must be
// turned green. It is the queue row's value before it is enqueued.
type RedWorkItem struct {
	// Target is the consuming layer ref that is now red (a mirror_id or a projection id@version).
	Target string `json:"target"`
	// Reason is why the item is red (version_stale for the wave seed).
	Reason Reason `json:"reason"`
	// Dependencies are the targets this item depends on (the upstream red targets, ordered).
	Dependencies []string `json:"dependencies"`
	// Layer is the render-grouping hint.
	Layer Layer `json:"layer"`
	// WaveID is the bump's content hash — the id of the wave this item belongs to (set at Enqueue).
	WaveID string `json:"wave_id"`
}

// RedWave is the ORDERED set of RedWorkItems a bump triggers (KRD §42). The order is the
// contract: the bumped source's mirror(s) come FIRST, then the projections (mirror-first,
// §42/§98). An empty wave (no bump, or no stale link) is the zero case.
type RedWave struct {
	// Items are the wave's RedWorkItems in canonical (mirror-first) order.
	Items []RedWorkItem `json:"items"`
}

// IsEmpty reports whether the wave carries no items (no bump ⇒ empty wave, §42).
func (w RedWave) IsEmpty() bool { return len(w.Items) == 0 }

// layerRank gives the canonical mirror-first ordering rank of a layer: mirror(0) <
// projection(1) < operation_action(2) < button(3). An unknown layer ranks last (after the
// known layers) so a malformed layer never jumps ahead of the mirror.
func layerRank(l Layer) int {
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

// Impact computes the red wave a bump triggers (KRD §42, the PURE engine). It is a total,
// deterministic function of (bumped, edges, heads):
//
//   - bumped : the set of kernel source ids the bump changed (the new head moved). Empty ⇒
//     empty wave (no bump ⇒ nothing to do, §42).
//   - edges  : the versioned link graph (S17 links + the declared load-bearing flag + layer).
//   - heads  : the current head version per target id (the S17 Heads input; the bumped
//     sources' heads have already moved here, so their consumers' pinned versions are stale).
//
// The wave is the transitive closure of edges whose target resolves stale|absent, walked
// OUTWARD from the mirror. Each edge's staleness is decided by links.Resolve (REUSED, never
// forked). A LOAD-BEARING edge propagates red to its consumer; a COSMETIC edge does not (its
// downstream beyond itself stays green, §112). The result is ORDERED mirror-first.
//
// PURE: no DB, no clock, no rng. NEVER PANICS on a malformed/absent target (Resolve is total;
// a malformed layer ranks last). Same input ⇒ byte-identical ordered wave (the property pins it).
func Impact(bumped []string, edges []Edge, heads links.Heads) RedWave {
	if len(bumped) == 0 {
		return RedWave{}
	}

	// The set of currently-red TARGET ids (the upstream layers a bump made stale). We seed it
	// with the bumped sources themselves, then grow it by the closure: an edge becomes red iff
	// its `to` target is already red AND links.Resolve reports it stale|absent AND the edge is
	// load-bearing (cosmetic edges do not propagate). The consuming `from` side then becomes a
	// red target in turn, so a chain (entity → mirror → projection) cascades.
	red := make(map[string]bool, len(bumped))
	for _, id := range bumped {
		red[id] = true
	}

	// Collect the wave items. We iterate the closure to a fixpoint (the graph is finite and
	// edges only ADD red targets, so it terminates). itemFor keys an item by its target so a
	// target reddened by two paths yields ONE item with merged, ordered dependencies.
	type pending struct {
		target string
		reason Reason
		layer  Layer
		deps   map[string]bool
	}
	items := map[string]*pending{}

	for {
		grew := false
		for _, e := range edges {
			// Reuse S17 Resolve — the single source of staleness truth.
			status := links.Resolve(e.Link, heads)
			if status == links.StatusGreen {
				continue // the link is pinned to the live head — not red.
			}
			// The wave is EXACTLY the set of stale links, but a link only PROPAGATES from an
			// already-red target. The link's `to` (target) must be red for its `from` (consumer)
			// to redden — this is the outward-from-the-source walk.
			if !red[e.Link.To.ID] {
				continue
			}
			// Cosmetic edges do not propagate red to their consumer (§112; ADR 0020).
			if !e.LoadBearing {
				continue
			}
			from := e.Link.From.ID
			it, seen := items[from]
			if !seen {
				it = &pending{target: from, reason: ReasonVersionStale, layer: e.Layer, deps: map[string]bool{}}
				items[from] = it
			}
			it.deps[e.Link.To.ID] = true
			if !red[from] {
				red[from] = true
				grew = true
			}
		}
		if !grew {
			break
		}
	}

	// Materialize the items into the ordered wave. Order: mirror-first by layer rank, then by
	// target id for a stable, byte-identical result (determinism — no map-iteration leak).
	out := make([]RedWorkItem, 0, len(items))
	for _, it := range items {
		deps := make([]string, 0, len(it.deps))
		for d := range it.deps {
			deps = append(deps, d)
		}
		sort.Strings(deps)
		out = append(out, RedWorkItem{
			Target:       it.target,
			Reason:       it.reason,
			Dependencies: deps,
			Layer:        it.layer,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		ri, rj := layerRank(out[i].Layer), layerRank(out[j].Layer)
		if ri != rj {
			return ri < rj
		}
		return out[i].Target < out[j].Target
	})
	return RedWave{Items: out}
}

// Enqueue materializes a wave into RedWorkQueue rows (KRD §49.4). It is a PURE projection: it
// stamps every item with the waveID (the bump's content hash) and returns the rows VALUE —
// it writes NOTHING (the wall; the harness-invoked hook does the INSERT below the line). The
// returned items all carry the wave's id; the caller persists them with status=open,
// owner_agent=NULL, lease_until=NULL. It returns exactly |wave| rows.
func Enqueue(w RedWave, waveID string) []RedWorkItem {
	rows := make([]RedWorkItem, len(w.Items))
	for i, it := range w.Items {
		it.WaveID = waveID
		rows[i] = it
	}
	return rows
}
