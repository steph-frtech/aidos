"use server";

import type { PairVerdict } from "@/lib/context-map";
import { propose } from "@/lib/context-map";
import {
	type CheckCallVerdict,
	checkCallArgs,
	demoCheckCall,
	demoMap,
	demoVerifyAll,
	demoVerifyPair,
	verifyAllArgs,
	verifyPairArgs,
} from "@/lib/context-map-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { checkCallDecoder, verifyAllDecoder, verifyPairDecoder } from "./live";
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
 * THE FLIP (ADR 0092 batch-4B — the Go engine is the SINGLE live source). The READ controls —
 * verify_pair, verify_all, check_call — now read LIVE from the Go context-map MCP server through the
 * passerelle (`readVia(scope, …)`, the dispatched below-the-line reads), with the twin compute preserved
 * ONLY as the deterministic demo fallback (lib/context-map-data, tagged `source:"live"|"demo"`). The
 * `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback; the
 * `-data.ts` sibling now makes the cliquet recognise `lib/context-map` as a twin).
 *
 * THE WALL (§2/§9): /context-map designs + verifies + PROPOSES; proposeAction returns a DRAFT envelope,
 * it does not persist truth from the screen. propose is NOT dispatched (it carries a RawMessage ChangeSet
 * body + is a truth-proposal), so it keeps its propose→ChangeSet voie propre via the twin `propose`.
 */

export async function verifyPairAction(
	_prev: VerifyPairView,
	formData: FormData,
): Promise<VerifyPairView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const provider = String(formData.get("provider") ?? "billing");
	const map = demoMap(projectId);
	const scope = await panelScope();
	const { data: verdict } = await readVia<PairVerdict>(
		scope,
		"verify_pair",
		verifyPairArgs(map, provider),
		verifyPairDecoder,
		demoVerifyPair(map, provider),
	);
	return { ok: true, verdict };
}

export async function verifyAllAction(
	_prev: VerifyAllView,
	formData: FormData,
): Promise<VerifyAllView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const map = demoMap(projectId);
	const scope = await panelScope();
	const { data: verdicts } = await readVia<PairVerdict[]>(
		scope,
		"verify_all",
		verifyAllArgs(map),
		verifyAllDecoder,
		demoVerifyAll(map),
	);
	return { ok: true, verdicts };
}

export async function checkCallAction(
	_prev: CheckCallView,
	formData: FormData,
): Promise<CheckCallView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const from = String(formData.get("from") ?? "checkout");
	const to = String(formData.get("to") ?? "catalog");
	const map = demoMap(projectId);
	const scope = await panelScope();
	const { data: verdict } = await readVia<CheckCallVerdict>(
		scope,
		"check_call",
		checkCallArgs(from, to, map),
		checkCallDecoder,
		demoCheckCall(from, to, map),
	);
	return { ok: true, allowed: verdict.allowed, block: verdict.block };
}

export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	// propose is NOT dispatched (the wall — propose → ChangeSet → approval): the twin builds the DRAFT
	// envelope the panel shows; the aidos CLI applies it under approval.
	const projectId = String(formData.get("projectId") ?? "shop");
	const cs = propose(
		demoMap(projectId),
		`design ${projectId || "shop"} federation`,
		"phase-0",
	);
	return { ok: true, changeset: cs };
}
