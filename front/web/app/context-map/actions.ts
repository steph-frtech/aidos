"use server";

import {
	type ContextMap,
	checkCrossCellCall,
	propose,
	verifyAll,
	verifyPair,
} from "@/lib/context-map";
import type {
	CheckCallView,
	ProposeView,
	VerifyAllView,
	VerifyPairView,
} from "./view";

/**
 * Server Actions for the /context-map Workbench panel (S101 — Context-Map + inter-cell contract
 * pairs, app-builder EPIC 11).
 *
 * THE STEP: the human DESIGNS the Context-Map (§46 "le seul vrai travail humain") — which cells
 * exist, what each provider publishes, and the consumer→provider contract pairs. A pair is
 * HONORED iff the provider publishes a superset of the consumer's expectation (Pact). A cross-
 * cell call that VIOLATES the contract is REFUSED. The Context-Map persists as Kernel truth ONLY
 * via a DRAFT ChangeSet (propose → ChangeSet → approval), never a direct write.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): verifyPair + verifyAll + checkCrossCellCall + propose are
 * PURE functions (lib/context-map) — same input → byte-identical result, never an LLM. THE WALL
 * (§2/§9): /context-map designs + verifies + PROPOSES; propose returns a DRAFT envelope, it does
 * not persist truth from the screen.
 */

// The canonical demo Context-Map (the §46 checkout federation): checkout CONSUMES billing
// (HONORED — billing publishes a superset) and catalog (UNHONORED — price unpublished).
function demoMap(projectId: string): ContextMap {
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

function pairByProvider(map: ContextMap, provider: string) {
	return (
		map.pairs.find((p) => p.provider === provider) ?? {
			consumer: "checkout",
			provider,
			expected: [],
		}
	);
}

export async function verifyPairAction(
	_prev: VerifyPairView,
	formData: FormData,
): Promise<VerifyPairView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const provider = String(formData.get("provider") ?? "billing");
	const map = demoMap(projectId);
	return { ok: true, verdict: verifyPair(map, pairByProvider(map, provider)) };
}

export async function verifyAllAction(
	_prev: VerifyAllView,
	formData: FormData,
): Promise<VerifyAllView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	return { ok: true, verdicts: verifyAll(demoMap(projectId)) };
}

export async function checkCallAction(
	_prev: CheckCallView,
	formData: FormData,
): Promise<CheckCallView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const from = String(formData.get("from") ?? "checkout");
	const to = String(formData.get("to") ?? "catalog");
	const block = checkCrossCellCall(from, to, demoMap(projectId));
	return { ok: true, allowed: block === null, block: block ?? undefined };
}

export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const cs = propose(
		demoMap(projectId),
		`design ${projectId || "shop"} federation`,
		"phase-0",
	);
	return { ok: true, changeset: cs };
}
