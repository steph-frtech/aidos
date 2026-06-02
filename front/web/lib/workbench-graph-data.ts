/**
 * The canonical Workbench full-graph example head for the "/" cockpit (AIDOS step S44).
 *
 * It is the deep-navigation walk button → view → action → operation → entity → mirror →
 * scope → incident, reusing the prior steps' example artifacts — saveOrder (S11 control),
 * checkout-view (S11 view), checkout-submit (S11 action), createOrder (S10 operation),
 * order-entity (S35 entity), createOrder-fixture (S06 mirror), checkout-scope (S15 scope),
 * oos-incident (S22 incident). The agent coins NO new target: these are the METHOD's
 * example refs, the SAME ids the Go fixture (workbenchgraph_fixture_test.go) pins.
 *
 * Every edge mirrors a PRIOR link/propagation row (S17/S19) — no invented adjacency. A
 * node's truth_type/liveness/red_wave_state is COMPUTED upstream (S14/S06/S22), carried
 * verbatim. The wall is untouched: this is read-only projection data.
 */

import type { Head } from "./workbench-graph";

/** The canonical head: the full deep-nav walk, all eight node kinds present. */
export const EXAMPLE_HEAD: Head = {
	nodes: [
		{
			id: "saveOrder",
			kind: "button",
			route: "/web-preview",
			truthType: "above",
			liveness: "",
			redWaveState: "green",
		},
		{
			id: "checkout-view",
			kind: "view",
			route: "/control",
			truthType: "above",
			liveness: "",
			redWaveState: "green",
		},
		{
			id: "checkout-submit",
			kind: "action",
			route: "/control",
			truthType: "above",
			liveness: "",
			redWaveState: "green",
		},
		{
			id: "createOrder",
			kind: "operation",
			route: "/operation",
			truthType: "above",
			liveness: "",
			redWaveState: "green",
		},
		{
			id: "order-entity",
			kind: "entity",
			route: "/entity-map",
			truthType: "above",
			liveness: "",
			redWaveState: "green",
		},
		{
			id: "createOrder-fixture",
			kind: "mirror",
			route: "/mirrors",
			truthType: "above",
			liveness: "live",
			redWaveState: "red",
		},
		{
			id: "checkout-scope",
			kind: "scope",
			route: "/scopes",
			truthType: "above",
			liveness: "",
			redWaveState: "",
		},
		{
			id: "oos-incident",
			kind: "incident",
			route: "/red-wave",
			truthType: "below",
			liveness: "",
			redWaveState: "red",
		},
	],
	edges: [
		{ from: "saveOrder", to: "checkout-view", relation: "in_view" },
		{ from: "saveOrder", to: "checkout-submit", relation: "triggers" },
		{ from: "checkout-submit", to: "createOrder", relation: "invoke" },
		{ from: "createOrder", to: "order-entity", relation: "reads_writes" },
		{ from: "order-entity", to: "createOrder-fixture", relation: "mirrors" },
		{ from: "createOrder-fixture", to: "checkout-scope", relation: "scopes" },
		{ from: "checkout-scope", to: "oos-incident", relation: "incidents" },
	],
};

/**
 * The canonical /brain cockpit projection (AIDOS step S30/S31 brain + S32/S33 context).
 * Read-only: MemoryItems (episodic/semantic/procedural), embedding neighborhoods
 * (pgvector, read-only), and the context-graph reuse decisions + firewall verdicts. The
 * cockpit renders these verdicts; it NEVER writes memory. These are the METHOD's examples.
 */
export interface MemoryItem {
	id: string;
	kind: "episodic" | "semantic" | "procedural";
	summary: string;
	taint: string;
}

export interface ReuseDecision {
	id: string;
	target: string;
	verdict: "allowed" | "denied";
	reason: string;
}

export const BRAIN_MEMORY: readonly MemoryItem[] = [
	{
		id: "mem-1043",
		kind: "episodic",
		summary: "Incident out-of-stock pendant checkout (createOrder, 30% fail)",
		taint: "incident_derived",
	},
	{
		id: "mem-orderdsl",
		kind: "semantic",
		summary: "Order entity = items[] + total ; invariant total ≥ 0",
		taint: "clean",
	},
	{
		id: "mem-grill",
		kind: "procedural",
		summary: "Gesture /grill-with-docs : griller l'intention avant tout code",
		taint: "clean",
	},
] as const;

export const BRAIN_DECISIONS: readonly ReuseDecision[] = [
	{
		id: "dec-1",
		target: "createOrder@v3",
		verdict: "allowed",
		reason: "dans le sous-graphe du goal, miroir vivant",
	},
	{
		id: "dec-2",
		target: "payments-cell@v4",
		verdict: "denied",
		reason: "hors périmètre du goal — le contexte est compilé, pas accumulé",
	},
] as const;
