/**
 * shape-editor-data — the DETERMINISTIC demo fixtures + gateway-arg projections for the /shape-editor
 * panel (S68; the ADR 0092 batch-4B flip). It holds the gateway-arg shapes for the dispatched READ tools
 * (shape_derive, shape_merge) and the twin computes of them — the demo values the panel falls back to
 * when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /shape-editor computed its
 * displayed derive/merge from the TS twin `lib/shape-editor` directly — the twin WAS the live source. The
 * flip routes those reads through the Go shape-editor MCP server via the passerelle (`readVia(scope,
 * "shape_derive" | "shape_merge", …)`, the dispatched below-the-line reads); the twin compute is KEPT only
 * as the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what makes the T5 cliquet
 * (twin-as-live-fitness) RECOGNISE `lib/shape-editor` as a twin — the panel stays GREEN because its
 * actions.ts imports the `readVia` frontier.
 *
 * shape_propose is NOT flipped (no Go dispatch): proposeMirror returns a DRAFT ChangeSet (the wall —
 * propose → ChangeSet → approval), the panel keeps that voie propre via the twin `proposeMirror`.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo computes are the same PURE twin the Go shapeeditor
 * reproduces — same nature → same derived form (closed table), same edits → same merge verdict (LOCK on a
 * same-field clash, never last-write-wins). THE WALL (CLAUDE.md §2): every compute writes nothing.
 */

import {
	type Derivation,
	type Draft,
	deriveShape,
	type Edit,
	type MergeResult,
	mergeEdits,
} from "./shape-editor";

// Re-export the closed truth-nature list so a page renders the nature picker WITHOUT value-importing the
// twin `@/lib/shape-editor` directly (which the T5 cliquet would flag as a twin-as-live-path; the
// `shape-editor-data` module is not a twin name, so re-exporting the constant from here is the
// demo-fallback-frontier-safe path — the same pattern self-cert-data uses for SENSOR_KINDS).
export { natures } from "./shape-editor";

/** deriveArgs — the `shape_derive` argument object (the truth-nature). PURE projection. */
export function deriveArgs(nature: string): Record<string, unknown> {
	return { nature };
}

/** mergeArgs — the `shape_merge` argument object (the draft + the two authors' edits). PURE projection. */
export function mergeArgs(
	draft: Draft,
	a: Edit,
	b: Edit,
): Record<string, unknown> {
	return {
		draft,
		a: {
			author: a.author,
			base_version: a.baseVersion,
			title: a.title,
			source: a.source,
		},
		b: {
			author: b.author,
			base_version: b.baseVersion,
			title: b.title,
			source: b.source,
		},
	};
}

/** demoDerive — the twin `deriveShape()` of a nature (the closed-table derivation), or null. */
export function demoDerive(nature: string): Derivation | null {
	return deriveShape(nature);
}

/** demoMerge — the twin `mergeEdits()` of two concurrent edits (the CRDT verdict, never last-write-wins). */
export function demoMerge(draft: Draft, a: Edit, b: Edit): MergeResult {
	return mergeEdits(draft, a, b);
}
