/**
 * behavior-expander-data — the DETERMINISTIC demo fixture for the /behavior-expander panel (S76; ADR
 * 0092 batch-2 kill-twins flip). It holds the twin `catalogue()` + the ONE `expand()` projected to the
 * flat live shapes (`string[]` catalogue, `ExpansionView`) the panel falls back to when the gateway is
 * unreachable (`source:"demo"`), plus the gateway-arg projections that ride the dispatched reads.
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /behavior-expander rendered
 * its kinds dropdown + its displayed expansion from the TS twin `lib/behavior-expander` directly
 * (`catalogue()` in the panel, `propose()`'s expansion in actions.ts) — the twin WAS the live source.
 * The flip routes the CHEAP reads (the catalogue + the dry-run Expand) through the Go
 * `aidos-behavior-expander` MCP server via the passerelle (`readVia(scope, "behavior_catalogue", …)` /
 * `readVia(scope, "behavior_expand", …)`, the dispatched below-the-line reads); this fixture is KEPT
 * only as the deterministic fallback. The presence of this `-data.ts` sibling is also what makes the T5
 * cliquet (twin-as-live-fitness) RECOGNISE `lib/behavior-expander` as a twin — the panel stays GREEN
 * because `actions.ts` imports the `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * THE PROPOSE PATH STAYS THE TWIN (its OWN voie, not a twin-as-live). `behavior_propose` is NOT
 * dispatched: it returns a DRAFT ChangeSet — a truth-PROPOSAL — so the panel's propose control keeps the
 * twin compute (`lib/behavior-expander.propose`) as its legitimate voie propre (propose → ChangeSet →
 * approval), the panel's own door, never a gateway read. The frontier import in actions.ts keeps the
 * cliquet green over THAT twin import too.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo catalogue + expansion are the same PURE twin compute the
 * Go `behavior.Catalogue` / `behavior.Expand` reproduce — same behavior+entity → byte-identical pieces.
 * The parity mirror app/behavior-expander/live.test.ts pins the decoders == the Go
 * catalogueOutput/expandOutput contract.
 *
 * THE WALL (§2): the catalogue + the expansion are below-the-line VALUES; both reads are read-only.
 */

import { catalogue, expand } from "./behavior-expander";

/** PieceView is the flat shape of one named expansion piece (the panel renders only the `name`). */
export interface PieceView {
	name: string;
}

/** ExpansionView is the flat live shape of a dry-run expansion the result panel renders. */
export interface ExpansionView {
	expansionId: string;
	pieceCount: number;
	attributes: PieceView[];
	relations: PieceView[];
	operations: PieceView[];
	policies: PieceView[];
	fixtures: PieceView[];
}

/** The canonical demo entity the fallback expansion is computed on (mirrors the panel default). */
export const DEMO_ENTITY = "Order";
/** The canonical demo behavior kind (the §24.6 owner-scoping boilerplate). */
export const DEMO_BEHAVIOR = "ownable";

/** demoCatalogue — the twin `catalogue()` projected to the live `string[]` shape. PURE. */
export function demoCatalogue(): string[] {
	return catalogue();
}

/**
 * demoExpansion — the twin ONE `expand(behavior, entity)` projected to the flat ExpansionView the
 * result panel renders (the demo fallback when the gateway is unreachable). PURE, deterministic.
 */
export function demoExpansion(
	behavior: string = DEMO_BEHAVIOR,
	entity: string = DEMO_ENTITY,
): ExpansionView {
	const e = expand({ behavior: behavior as never, entity });
	return {
		expansionId: e.expansionId,
		pieceCount: e.pieceCount,
		attributes: e.attributes.map((x) => ({ name: x.name })),
		relations: e.relations.map((x) => ({ name: x.name })),
		operations: e.operations.map((x) => ({ name: x.name })),
		policies: e.policies.map((x) => ({ name: x.name })),
		fixtures: e.fixtures.map((x) => ({ name: x.name })),
	};
}

/** gatewayCatalogueArgs — the dispatched `behavior_catalogue` args (no input — an empty object). PURE. */
export function gatewayCatalogueArgs(): Record<string, unknown> {
	return {};
}

/**
 * gatewayExpandArgs — the dispatched `behavior_expand` args ({ behavior, entity }) over a chosen
 * behavior+entity. The entity's `existing` shape is omitted (a fresh expansion). PURE.
 */
export function gatewayExpandArgs(
	behavior: string,
	entity: string,
): Record<string, unknown> {
	return { behavior, entity };
}
