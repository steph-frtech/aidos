/**
 * Canonical caused_by graphs for the /caused-by panel (FK12). These are the worked examples the
 * Workbench traces — the §17/FKE-35.1 cause chain and a cyclic variant (the negative). Pure data;
 * the trace itself is lib/caused-by.ts (mirroring back/kernel/causedby).
 */

import type { Edge } from "./caused-by";

const ref = (id: string) => ({ id, version: "v1" });

/** A named caused_by graph the panel can trace from a symptom. */
export interface CausedByCase {
	id: string;
	labelKey: string;
	symptom: string;
	edges: Edge[];
	/** whether this case is expected to refuse with a cycle (the negative case). */
	cyclic: boolean;
}

export const CAUSED_BY_CASES: CausedByCase[] = [
	{
		// the worked example: checkout-accept ← createOrder ← {Order, authzPolicy} ← add_total_col.
		id: "checkout-chain",
		labelKey: "caseChain",
		symptom: "checkout-accept",
		cyclic: false,
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("createOrder"), to: ref("authzPolicy") },
			{ from: ref("Order"), to: ref("add_total_col") },
		],
	},
	{
		// a root cause (a leaf): tracing the migration finds no further cause.
		id: "root-leaf",
		labelKey: "caseLeaf",
		symptom: "add_total_col",
		cyclic: false,
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("add_total_col") },
		],
	},
	{
		// the cyclic variant — Order caused_by createOrder caused_by Order: REFUSED.
		id: "cyclic",
		labelKey: "caseCyclic",
		symptom: "checkout-accept",
		cyclic: true,
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("createOrder") },
		],
	},
];
