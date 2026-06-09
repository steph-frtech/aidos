/**
 * Canonical WhyTree scenarios for the /why-tree panel (FK13). These are the worked examples the
 * Workbench builds — the FKE-35.1 incident → tree → terminal mirror journey, plus the three
 * refusals (no terminal mirror, a non-reproduced cause, a caused_by cycle). Pure data; the build
 * itself is lib/why-tree.ts (mirroring back/kernel/whytree).
 */

import type { BuildInput, Edge, Reproduction } from "./why-tree";

const ref = (id: string) => ({ id, version: "v1" });

const exampleEdges = (): Edge[] => [
	{ from: ref("checkout-accept"), to: ref("createOrder") },
	{ from: ref("createOrder"), to: ref("Order") },
	{ from: ref("createOrder"), to: ref("authzPolicy") },
	{ from: ref("Order"), to: ref("add_total_col") },
];

const allReproduced = (): Reproduction[] => [
	{
		causeId: "createOrder",
		reproduced: true,
		detail: "createOrder fixture red on re-run",
	},
	{ causeId: "Order", reproduced: true, detail: "Order contract red" },
	{ causeId: "authzPolicy", reproduced: true, detail: "authzPolicy denies" },
	{
		causeId: "add_total_col",
		reproduced: true,
		detail: "migration broke the total column",
	},
];

/** A named WhyTree scenario the panel can build from a symptom. */
export interface WhyTreeCase {
	id: string;
	labelKey: string;
	input: BuildInput;
}

export const WHY_TREE_CASES: WhyTreeCase[] = [
	{
		// the worked example: incident → tree → root add_total_col → terminal anti-recurrence mirror.
		id: "incident-rooted",
		labelKey: "caseIncident",
		input: {
			symptom: "checkout-accept",
			provenance: "incident",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: {
				mirrorId: "mir-antirecur-add_total_col",
				reflectsRootCause: "add_total_col",
			},
		},
	},
	{
		// the same incident WITHOUT a terminal mirror: refused (WHYTREE_NO_MIRROR).
		id: "no-mirror",
		labelKey: "caseNoMirror",
		input: {
			symptom: "checkout-accept",
			provenance: "incident",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "", reflectsRootCause: "add_total_col" },
		},
	},
	{
		// a candidate cause that could NOT be reproduced: refused (anti-confabulation).
		id: "not-reproduced",
		labelKey: "caseNotReproduced",
		input: {
			symptom: "checkout-accept",
			provenance: "incident",
			edges: exampleEdges(),
			reproductions: [
				{ causeId: "createOrder", reproduced: true },
				{
					causeId: "Order",
					reproduced: false,
					detail: "could not reproduce — confabulation risk",
				},
				{ causeId: "authzPolicy", reproduced: true },
				{ causeId: "add_total_col", reproduced: true },
			],
			terminal: {
				mirrorId: "mir-antirecur-add_total_col",
				reflectsRootCause: "add_total_col",
			},
		},
	},
	{
		// a caused_by cycle: refused (CAUSED_BY_CYCLE) — no partial tree.
		id: "cyclic",
		labelKey: "caseCyclic",
		input: {
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: [
				{ from: ref("checkout-accept"), to: ref("createOrder") },
				{ from: ref("createOrder"), to: ref("Order") },
				{ from: ref("Order"), to: ref("createOrder") },
			],
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-x", reflectsRootCause: "x" },
		},
	},
];
