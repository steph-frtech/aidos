// Package workbenchgraph builds the AIDOS Workbench full graph (KRD step S44) — a
// thin, READ-ONLY projection of the kernel's own nodes & edges into the deterministic
// shape the cockpit at "/" renders:
//
//	button → view → action → operation → entity → mirrors → scopes → incidents
//
// It authors NOTHING. Every node is a PRIOR truth (controls/views/actions S11,
// operations S10, entities S35, mirror records S06, scopes S15, incidents/red-wave
// S22) and every edge is PRIOR link/propagation truth (links S17, weighted
// propagation S19) — supplied to BuildGraph as a Head VALUE (the caller's SELECT-only
// adapter reads kernel/mirrors/context; this package never opens a DB, never writes,
// never invents adjacency). A node's truth_type (S14) / liveness (S06) / red_wave_state
// (S22) is COMPUTED upstream and carried verbatim — never hand-set here.
//
// THE WALL (CLAUDE.md §2): pure functions over values; no I/O, no clock, no rng, never
// panics. Persistence/reads ride the caller's SELECT-only grant; this package writes no
// truth.
//
// DETERMINISM IS THE CONTRACT (CLAUDE.md §6/§8): same Head ⇒ byte-identical graph JSON.
// Nodes are ordered by (kind, id), edges by (from, relation, to); legend lists exactly
// the colors actually used, ordered. graph_hash = records.Hash(records.Canonicalize(
// nodes ⊕ edges ⊕ legend)) — S02's content-address REUSED, never forked — so snapshot
// drift is COMPUTED, not hunted. The reproducibility mirror
// workbenchgraph_property_test.go pins BuildGraph(h) == BuildGraph(h).
//
// HONESTY (CLAUDE.md §8): an edge endpoint that resolves to no node is a DANGLING ref —
// BuildGraph returns an S13 BlockReason (reusing blockreason.For), never a panic and
// never a synthesized node. A node/edge the Head does not pin is simply absent — never
// guessed. An unpinned adjacency the caller is unsure about is its OpenQuestion, not a
// fabricated edge here.
package workbenchgraph

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// NodeKind is the kernel layer a node projects. The eight kinds are the walk of the
// cockpit: button → view → action → operation → entity → mirror → scope → incident.
type NodeKind string

const (
	KindButton    NodeKind = "button"    // a control-spec (S11)
	KindView      NodeKind = "view"      // a view/screen source (S11)
	KindAction    NodeKind = "action"    // an action-spec (S11)
	KindOperation NodeKind = "operation" // an operation (S10)
	KindEntity    NodeKind = "entity"    // an entity source (S35)
	KindMirror    NodeKind = "mirror"    // a mirror record (S06)
	KindScope     NodeKind = "scope"     // a TruthScope (S15)
	KindIncident  NodeKind = "incident"  // a red-wave / incident (S22)
)

// kindOrder pins the deep-navigation order used for stable rendering & ordering ties.
var kindOrder = map[NodeKind]int{
	KindButton: 0, KindView: 1, KindAction: 2, KindOperation: 3,
	KindEntity: 4, KindMirror: 5, KindScope: 6, KindIncident: 7,
}

// validRoutes is the closed set of per-step Workbench routes a node may deep-link to.
// Every node.Route MUST be one of these (no invented route). The cockpit LINKS to
// these prior panels; it never re-renders them.
var validRoutes = map[string]bool{
	"/web-preview": true, // button / control
	"/control":     true, // control source
	"/operation":   true, // operation
	"/entity-map":  true, // entity
	"/mirrors":     true, // mirror record
	"/scopes":      true, // scope
	"/red-wave":    true, // incident / red wave
}

// Node is one projected truth. Every field is PRIOR truth read SELECT-only; nothing here
// is authored. id/kind identify it; route is the per-step panel it deep-links to;
// TruthType (S14) / Liveness (S06) / RedWaveState (S22) are COMPUTED upstream and carried.
type Node struct {
	ID           string   `json:"id"`
	Kind         NodeKind `json:"kind"`
	Route        string   `json:"route"`
	TruthType    string   `json:"truth_type"`     // S14: "above" | "below"
	Liveness     string   `json:"liveness"`       // S06: "live" | "stale" | "" (non-mirror)
	RedWaveState string   `json:"red_wave_state"` // S22: "green" | "red" | ""
}

// Edge is one PRIOR adjacency (links S17 / weighted propagation S19). from/to are node
// ids; relation is the link kind verbatim (triggers / invoke / reads_writes / mirrors /
// scopes / incidents …). Never invented: every edge mirrors a prior link/propagation row.
type Edge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Relation string `json:"relation"`
}

// LegendEntry is one declared color the graph actually uses, with the truth dimension it
// reflects (truth_type / liveness / red_wave). The legend enumerates EXACTLY the colors
// used (no orphan, no missing entry) — proven by the property mirror.
type LegendEntry struct {
	Dimension string `json:"dimension"` // "truth_type" | "liveness" | "red_wave"
	Value     string `json:"value"`     // e.g. "above" | "live" | "red"
	Color     string `json:"color"`     // the declared token, e.g. "primary"
}

// WorkbenchGraph is the deterministic projection the cockpit renders. GraphHash is the
// content-address of (nodes ⊕ edges ⊕ legend) via S02 — snapshot drift is computed.
type WorkbenchGraph struct {
	Nodes     []Node        `json:"nodes"`
	Edges     []Edge        `json:"edges"`
	Legend    []LegendEntry `json:"legend"`
	GraphHash string        `json:"graph_hash"`
}

// Head is the SELECT-only read of prior truth the caller supplies (the adapter reads
// kernel/mirrors/context). It is a VALUE — this package opens no DB. The builder projects
// it; it never adds a node/edge the Head does not pin.
type Head struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// colorOf maps a (dimension, value) to its DECLARED color token (ADR 0010 design tokens).
// These are the legend's truth — the only colors the graph may use; an unknown value
// yields ("", false) so BuildGraph never invents a color.
func colorOf(dimension, value string) (string, bool) {
	switch dimension {
	case "truth_type":
		switch value {
		case "above":
			return "primary", true
		case "below":
			return "muted", true
		}
	case "liveness":
		switch value {
		case "live":
			return "chart-2", true
		case "stale":
			return "destructive", true
		}
	case "red_wave":
		switch value {
		case "green":
			return "chart-2", true
		case "red":
			return "destructive", true
		}
	}
	return "", false
}

// BuildGraph projects the Head into a deterministic WorkbenchGraph. It validates every
// node.Route, resolves every edge endpoint to a node (a dangling endpoint ⇒ an S13
// BlockReason, never a panic), derives the legend from the colors ACTUALLY used, orders
// everything by content id, and computes graph_hash via S02. Pure & total: same Head ⇒
// byte-identical graph. It authors nothing.
func BuildGraph(h Head) (WorkbenchGraph, *blockreason.BlockReason) {
	// Copy & order nodes deterministically: (kind order, id).
	nodes := make([]Node, len(h.Nodes))
	copy(nodes, h.Nodes)
	sort.SliceStable(nodes, func(i, j int) bool {
		if kindOrder[nodes[i].Kind] != kindOrder[nodes[j].Kind] {
			return kindOrder[nodes[i].Kind] < kindOrder[nodes[j].Kind]
		}
		return nodes[i].ID < nodes[j].ID
	})

	// Every node.Route must be a known Workbench route (no invented deep-link).
	index := make(map[string]bool, len(nodes))
	for _, n := range nodes {
		if !validRoutes[n.Route] {
			br := danglingBlock(fmt.Sprintf("node %q (kind %s) deep-links to unknown route %q", n.ID, n.Kind, n.Route))
			return WorkbenchGraph{}, &br
		}
		index[n.ID] = true
	}

	// Order edges deterministically: (from, relation, to).
	edges := make([]Edge, len(h.Edges))
	copy(edges, h.Edges)
	sort.SliceStable(edges, func(i, j int) bool {
		if edges[i].From != edges[j].From {
			return edges[i].From < edges[j].From
		}
		if edges[i].Relation != edges[j].Relation {
			return edges[i].Relation < edges[j].Relation
		}
		return edges[i].To < edges[j].To
	})

	// Every edge endpoint resolves to a node — no dangling adjacency, no invented node.
	for _, e := range edges {
		if !index[e.From] {
			br := danglingBlock(fmt.Sprintf("edge %s --%s--> %s: endpoint %q resolves to no node", e.From, e.Relation, e.To, e.From))
			return WorkbenchGraph{}, &br
		}
		if !index[e.To] {
			br := danglingBlock(fmt.Sprintf("edge %s --%s--> %s: endpoint %q resolves to no node", e.From, e.Relation, e.To, e.To))
			return WorkbenchGraph{}, &br
		}
	}

	// Legend = exactly the colors actually used (no orphan, no missing entry).
	legend, br := buildLegend(nodes)
	if br != nil {
		return WorkbenchGraph{}, br
	}

	g := WorkbenchGraph{Nodes: nodes, Edges: edges, Legend: legend}
	hash, hErr := hashGraph(g)
	if hErr != nil {
		br := danglingBlock(fmt.Sprintf("graph not canonicalizable: %v", hErr))
		return WorkbenchGraph{}, &br
	}
	g.GraphHash = hash
	return g, nil
}

// buildLegend derives the declared color legend from the dimensions a node carries. It
// adds one entry per (dimension, value) actually used, ordered, with the declared color.
// An unknown value ⇒ a BlockReason (no invented color).
func buildLegend(nodes []Node) ([]LegendEntry, *blockreason.BlockReason) {
	seen := make(map[string]LegendEntry)
	add := func(dimension, value string) *blockreason.BlockReason {
		if value == "" {
			return nil // dimension not applicable to this node (e.g. a non-mirror has no liveness)
		}
		color, ok := colorOf(dimension, value)
		if !ok {
			br := danglingBlock(fmt.Sprintf("dimension %q value %q has no declared legend color", dimension, value))
			return &br
		}
		seen[dimension+"\x00"+value] = LegendEntry{Dimension: dimension, Value: value, Color: color}
		return nil
	}
	for _, n := range nodes {
		if br := add("truth_type", n.TruthType); br != nil {
			return nil, br
		}
		if br := add("liveness", n.Liveness); br != nil {
			return nil, br
		}
		if br := add("red_wave", n.RedWaveState); br != nil {
			return nil, br
		}
	}
	out := make([]LegendEntry, 0, len(seen))
	for _, e := range seen {
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Dimension != out[j].Dimension {
			return out[i].Dimension < out[j].Dimension
		}
		return out[i].Value < out[j].Value
	})
	return out, nil
}

// hashGraph computes the content-address of (nodes ⊕ edges ⊕ legend) by canonicalizing the
// JSON (excluding the hash field itself) via S02 — never a forked hashing path.
func hashGraph(g WorkbenchGraph) (string, error) {
	payload := struct {
		Nodes  []Node        `json:"nodes"`
		Edges  []Edge        `json:"edges"`
		Legend []LegendEntry `json:"legend"`
	}{g.Nodes, g.Edges, g.Legend}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// danglingBlock builds the S13 BlockReason for a dangling/unresolved/malformed graph ref.
// It REUSES the S13 type (never a new code in the closed registry) — a dangling endpoint
// is a missing target truth, so it borrows CodeMissingMirror's actionable how-to-fix and
// carries the specific ref in its explanation. Never a panic.
func danglingBlock(detail string) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeMissingMirror)
	br.Explanation = "WorkbenchGraph: référence non résolue — " + detail +
		". Le graphe ne projette QUE la vérité épinglée (S17/S19) ; une arête pendante n'est jamais un nœud inventé."
	return br
}
