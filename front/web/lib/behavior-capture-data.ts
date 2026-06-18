/**
 * behavior-capture-data — the DETERMINISTIC demo fixture for the /behavior-capture panel (S67; ADR
 * 0092 PHASE-4 kill-twins flip). It holds the surfaced behaviours catalogue + the twin
 * `attachBehaviorAtCapture` dry-run, projected as the demo `AttachReadView` the panel falls back to
 * when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /behavior-capture computed
 * its surfaced library AND its dry-run expansion from the TS twin `lib/behavior-capture` directly
 * (`library()` + `attachBehaviorAtCapture()` in actions.ts) — the twin WAS the live source. The flip
 * routes BOTH reads through the Go `aidos-behavior-capture` MCP server via the passerelle
 * (`readVia(scope, "behavior_library" | "behavior_attach_at_capture", …)`, the dispatched below-the-
 * line reads); this fixture is KEPT only as the deterministic fallback. The presence of this
 * `-data.ts` sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/behavior-capture` as a twin — the panel stays GREEN because `actions.ts` imports the `readVia`
 * frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo views are the same PURE twin compute the Go
 * `behaviorcapture.AttachBehaviorAtCapture` / `behaviorcapture.Library` reproduce — same (ideaRef,
 * behavior, entity) → byte-identical view (the expansionId is the Go content address). The parity
 * mirror app/behavior-capture/live.test.ts pins the decoders' shape == the Go libraryOutput /
 * attachOutput contract.
 *
 * THE WALL (§2): the surfaced catalogue is a read; the attach is a DRY-RUN — it returns a DRAFT
 * ChangeSet PROPOSAL as a VALUE and writes NOTHING (`wrote_kernel` always false). Freezing the
 * expanded source into the kernel rides the changeset door (S20) under human approval (idée → miroir
 * → /goal), never a direct write.
 */

import {
	attachBehaviorAtCapture,
	type Kind,
	library,
	proposalPieceCount,
	proposalPreview,
} from "./behavior-capture";

/** The default parent stable phase the demo DRAFT ChangeSet moves from (mirrors the Go input). */
export const SEED_PARENT_PHASE = "phase-0";

/**
 * AttachReadView is the flat per-attach view the panel renders — the SINGLE declaration of the
 * displayed shape, identical to what the live decoder produces from the Go `attachOutput`. The panel
 * does not re-declare it; the demo path and the live path both fill it.
 */
export interface AttachReadView {
	ok: boolean;
	/** the actionable refusal message (verbatim), when refused. */
	error?: string;
	ideaRef?: string;
	behavior?: string;
	entity?: string;
	expansionId?: string;
	changeSetRef?: string;
	changeSetStatus?: string;
	pieceCount?: number;
	preview?: string[];
	/** the dry-run expansion pieces (attributes/relations/operations/policies/fixtures), flat names. */
	attributes?: string[];
	relations?: string[];
	operations?: string[];
	policies?: string[];
	fixtures?: string[];
}

/** demoLibrary is the deterministic surfaced catalogue (the twin `library()`), the fallback. PURE. */
export function demoLibrary(): Kind[] {
	return library();
}

/**
 * gatewayLibraryArgs maps to the Go `behavior_library` input shape (an empty object — the catalogue
 * is parameterless). PURE.
 */
export function gatewayLibraryArgs(): Record<string, unknown> {
	return {};
}

/**
 * gatewayAttachArgs maps (ideaRef, behavior, entity) to the Go `behavior_attach_at_capture` input
 * shape ({ idea_ref, behavior, entity, parent_phase }). PURE — a deterministic projection, never an
 * LLM. The `existing` shape is omitted (a fresh attach; the dry-run is idempotent over an empty shape).
 */
export function gatewayAttachArgs(
	ideaRef: string,
	behavior: string,
	entity: string,
): Record<string, unknown> {
	return {
		idea_ref: ideaRef,
		behavior,
		entity,
		parent_phase: SEED_PARENT_PHASE,
	};
}

/**
 * demoAttach is the deterministic demo `AttachReadView` — the twin `attachBehaviorAtCapture` dry-run
 * of the seeded (ideaRef, behavior, entity), the fallback when the gateway is unreachable. A refusal
 * (empty idea / unknown behavior / entity-less) yields `{ ok:false, error }` verbatim. PURE.
 */
export function demoAttach(
	ideaRef: string,
	behavior: string,
	entity: string,
): AttachReadView {
	const { result, error } = attachBehaviorAtCapture(ideaRef, {
		behavior: behavior as Kind,
		entity,
	});
	if (error !== null || result === null) {
		return { ok: false, error: error ?? undefined };
	}
	const e = result.expansion;
	return {
		ok: true,
		ideaRef: result.ideaRef,
		behavior: e.behavior,
		entity: e.entity,
		expansionId: e.expansionId,
		changeSetRef: result.changeSet.ref,
		changeSetStatus: result.changeSet.status,
		pieceCount: proposalPieceCount(result),
		preview: proposalPreview(result),
		attributes: e.attributes.map((a) => a.name),
		relations: e.relations.map((r) => `${r.name}→${r.target}`),
		operations: e.operations.map((o) => o.name),
		policies: e.policies.map((p) => p.name),
		fixtures: e.fixtures.map((f) => f.name),
	};
}
