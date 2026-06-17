/**
 * entity-modeler-data — the DETERMINISTIC demo fixtures + gateway-arg projections for the
 * /entity-modeler panel (S75; the ADR 0092 batch-4B flip). It holds the canonical Customer↔Order
 * draft, the refusal draft, the gateway-arg shape for each dispatched READ tool, and the twin
 * computes of them — the demo values the panel falls back to when the gateway is unreachable
 * (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /entity-modeler computed
 * its displayed validate/hash/merge from the TS twin `lib/entity-modeler` directly — the twin WAS the
 * live source. The flip routes those reads through the Go entity-modeler MCP server via the passerelle
 * (`readVia(scope, "schema_validate" | "schema_hash" | "canvas_merge", …)`, the dispatched
 * below-the-line reads); the twin compute is KEPT only as the deterministic fallback. The presence of
 * this `-data.ts` sibling is ALSO what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/entity-modeler` as a twin — the panel stays GREEN because its actions.ts imports the `readVia`
 * frontier (the witness the twin sits behind `source:"demo"`).
 *
 * schema_propose is NOT flipped (no Go dispatch): it returns a DRAFT ChangeSet (the wall — propose →
 * ChangeSet → approval), the panel keeps that voie propre. The twin `propose` stays its demo compute.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo computes are the same PURE twin the Go modeler
 * reproduces — same draft → byte-identical hash (input-order-invariant), same conflicts (never
 * last-write-wins). THE WALL (CLAUDE.md §2): every fixture/compute writes nothing (WroteKernel false).
 */

import {
	type BlockReason,
	DEMO_DRAFT,
	type Draft,
	type MergeOutcome,
	mergeDrafts,
	schemaHash,
	validate,
} from "./entity-modeler";
import type { Source } from "./gateway-sdk";

// Re-export the canonical demo drafts so a panel renders them WITHOUT value-importing the twin
// `@/lib/entity-modeler` directly (which the T5 cliquet would flag; `entity-modeler-data` is not a twin
// name, so re-exporting through here is the demo-fallback-frontier-safe path).
export { DEMO_BAD_DRAFT, DEMO_DRAFT } from "./entity-modeler";

/** validateArgs — the `schema_validate` / `schema_hash` argument object (the draft). PURE projection. */
export function draftArg(draft: Draft): Record<string, unknown> {
	return { draft };
}

/** mergeArgs — the `canvas_merge` argument object (base + the two editors' drafts). PURE projection. */
export function mergeArgs(
	base: Draft,
	a: Draft,
	b: Draft,
): Record<string, unknown> {
	return { base, a, b };
}

/** The validate verdict shape the panel renders (the live decoded `schema_validate`, or the demo). */
export interface ValidateView {
	ok: boolean;
	block?: BlockReason;
}

/** demoValidate — the twin `validate()` of a draft, as the ValidateView the panel falls back to. */
export function demoValidate(draft: Draft): ValidateView {
	const cause = validate(draft);
	if (cause === null) return { ok: true };
	return {
		ok: false,
		block: {
			code: "MODELER_INVALID_DRAFT",
			severity: "blocking",
			explanation: cause,
			how_to_fix: [
				"Declare the relation's target entity in the draft, or fix the FK target's identifier.",
			],
		},
	};
}

/** demoHash — the twin `schemaHash()` of a draft (the input-order-invariant content address). */
export function demoHash(draft: Draft): string {
	return schemaHash(draft);
}

/** demoMerge — the twin `mergeDrafts()` of a three-way merge (the CRDT outcome, never last-write-wins). */
export function demoMerge(base: Draft, a: Draft, b: Draft): MergeOutcome {
	return mergeDrafts(base, a, b);
}

/** The canonical concurrent-merge demo (Alice adds Order, Bob adds Invoice off a Customer base). */
export const MERGE_BASE: Draft = {
	project: "shop",
	nodes: [DEMO_DRAFT.nodes[0]],
};
export const MERGE_ALICE: Draft = DEMO_DRAFT;
export const MERGE_BOB: Draft = {
	project: "shop",
	nodes: [
		DEMO_DRAFT.nodes[0],
		{
			entity: {
				name: "Invoice",
				attributes: [
					{ name: "id", type: "string", required: true, identifier: true },
					{ name: "amount", type: "decimal", required: true },
				],
			},
			relations: [
				{
					name: "customer",
					target: "Customer",
					cardinality: "1-N",
					semantic: "fk",
				},
			],
		},
	],
};

/** A typed source-tagged demo validate (the shape a readVia decoder yields on the demo path). */
export interface ValidateSnapshot {
	view: ValidateView;
	source: Source;
}
