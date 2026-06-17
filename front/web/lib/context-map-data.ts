/**
 * context-map-data — the DETERMINISTIC demo fixtures + gateway-arg projections for the /context-map
 * panel (S101; the ADR 0092 batch-4B flip). It holds the canonical §46 checkout-federation Context-Map,
 * the gateway-arg shapes for the dispatched READ tools (verify_pair, verify_all, check_call), and the
 * twin computes of them — the demo values the panel falls back to when the gateway is unreachable
 * (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /context-map computed its
 * displayed pact verdicts from the TS twin `lib/context-map` directly — the twin WAS the live source. The
 * flip routes those reads through the Go context-map MCP server via the passerelle (`readVia(scope,
 * "verify_pair" | "verify_all" | "check_call", …)`, the dispatched below-the-line reads); the twin compute
 * is KEPT only as the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what makes
 * the T5 cliquet RECOGNISE `lib/context-map` as a twin — the panel stays GREEN because its actions.ts
 * imports the `readVia` frontier.
 *
 * propose is NOT flipped (no Go dispatch): it returns a DRAFT ChangeSet (the wall — propose → ChangeSet →
 * approval), the panel keeps that voie propre via the twin `propose`.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo computes are the same PURE twin the Go contextmap
 * reproduces — same map → same verdicts (a HONORED pair iff the provider publishes a superset; a cross-
 * cell call over an unhonored/absent pair refused CROSS_CELL_NO_CONTRACT). THE WALL (§2): writes nothing.
 */

import type { BlockReason, PairVerdict } from "./context-map";
import {
	type ContextMap,
	checkCrossCellCall,
	verifyAll,
	verifyPair,
} from "./context-map";

/**
 * demoMap — the canonical §46 checkout federation: checkout CONSUMES billing (HONORED — billing
 * publishes a superset) and catalog (UNHONORED — price unpublished). PURE.
 */
export function demoMap(projectId: string): ContextMap {
	return {
		project: projectId || "shop",
		cells: ["checkout", "billing", "catalog"],
		surfaces: [
			{
				cell: "billing",
				published: [
					{
						method: "POST",
						path: "/charges",
						fields: ["amount", "orderId", "status"],
						status: 201,
					},
				],
			},
			{
				cell: "catalog",
				published: [
					{ method: "GET", path: "/items", fields: ["sku"], status: 200 },
				],
			},
		],
		pairs: [
			{
				consumer: "checkout",
				provider: "billing",
				expected: [
					{
						method: "POST",
						path: "/charges",
						fields: ["amount", "orderId"],
						status: 201,
					},
				],
			},
			{
				consumer: "checkout",
				provider: "catalog",
				expected: [
					{
						method: "GET",
						path: "/items",
						fields: ["sku", "price"],
						status: 200,
					},
				],
			},
		],
	};
}

/** pairByProvider — the contract pair to verify for a provider (a stub pair if none designed). PURE. */
export function pairByProvider(map: ContextMap, provider: string) {
	return (
		map.pairs.find((p) => p.provider === provider) ?? {
			consumer: "checkout",
			provider,
			expected: [],
		}
	);
}

/** verifyPairArgs — the `verify_pair` argument object (the map + the pair). PURE projection. */
export function verifyPairArgs(
	map: ContextMap,
	provider: string,
): Record<string, unknown> {
	return { map, pair: pairByProvider(map, provider) };
}

/** verifyAllArgs — the `verify_all` argument object (the map). PURE projection. */
export function verifyAllArgs(map: ContextMap): Record<string, unknown> {
	return { map };
}

/** checkCallArgs — the `check_call` argument object (from, to, map). PURE projection. */
export function checkCallArgs(
	from: string,
	to: string,
	map: ContextMap,
): Record<string, unknown> {
	return { from, to, map };
}

/** demoVerifyPair — the twin `verifyPair()` of a designed pair (the pact verdict). */
export function demoVerifyPair(map: ContextMap, provider: string): PairVerdict {
	return verifyPair(map, pairByProvider(map, provider));
}

/** demoVerifyAll — the twin `verifyAll()` over every designed pair (sorted). */
export function demoVerifyAll(map: ContextMap): PairVerdict[] {
	return verifyAll(map);
}

/** The check_call demo verdict shape (the live decoded `check_call`, or the twin's). */
export interface CheckCallVerdict {
	allowed: boolean;
	block?: BlockReason;
}

/** demoCheckCall — the twin `checkCrossCellCall()` verdict (refused over an unhonored/absent pair). */
export function demoCheckCall(
	from: string,
	to: string,
	map: ContextMap,
): CheckCallVerdict {
	const block = checkCrossCellCall(from, to, map);
	return { allowed: block === null, block: block ?? undefined };
}
