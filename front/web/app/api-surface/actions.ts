"use server";

import {
	type ApiSpec,
	type Attribute,
	emitOpenAPI,
	emitPactSuite,
	emitRouter,
	verifySuite,
} from "@/lib/api-surface";
import type { SurfaceView } from "./view";

/**
 * Server Action for the /api-surface Workbench panel (S90 — the emitted app's COMPLETE
 * API surface, app-builder EPIC 9, ADR 0040).
 *
 * THE STEP (ROADMAP-app-builder S90): emit the CRUD + operation routing (sync), the
 * per-app OpenAPI, and ONE Pact contract per operation (generalising createOrder.pact),
 * with provider-verification; the Hono handlers delegate to the Go SIDECAR interpreter
 * callback (ADR 0040 Déc.7), policies enforced (a DENY → HTTP 403).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the surface is a PURE function of the spec
 * (lib/api-surface) — same spec → byte-identical OpenAPI/router/Pact, never an LLM. THE
 * WALL (§2): it WRITES NOTHING — the surface is a projection.
 */

const ORDER = {
	name: "Order",
	attributes: [
		{ name: "id", type: "int", required: true },
		{ name: "customer", type: "string", required: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "placed_at", type: "timestamptz", required: true },
	] as Attribute[],
};

/**
 * surfaceAction is the action-capable control (CLAUDE.md §7 ui-completeness): the user
 * toggles whether the createOrder operation AUTHORIZES (a policy) and whether a read-only
 * listOrders endpoint is part of the surface, then EMITS the surface deterministically and
 * VERIFIES every emitted endpoint. The screen shows the OpenAPI, the router, the Pact suite,
 * and the verification verdict — or the BlockReason if the spec is malformed.
 */
export async function surfaceAction(
	_prev: SurfaceView,
	formData: FormData,
): Promise<SurfaceView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const authorize = formData.get("authorize") === "on";
	const withList = formData.get("withList") === "on";

	const ops: ApiSpec["ops"] = [
		{
			name: "createOrder",
			entity: ORDER,
			verb: "POST",
			authorize,
			input: [{ name: "cartId", type: "string", required: true }],
		},
	];
	if (withList) {
		ops.push({ name: "listOrders", entity: ORDER, verb: "GET" });
	}
	const spec: ApiSpec = { project, ops };

	const oa = emitOpenAPI(spec);
	if (!oa.ok) return { ok: false, blockExplanation: oa.block?.explanation };
	const rt = emitRouter(spec);
	if (!rt.ok) return { ok: false, blockExplanation: rt.block?.explanation };
	const pact = emitPactSuite(spec);
	if (!pact.ok) return { ok: false, blockExplanation: pact.block?.explanation };
	const verify = verifySuite(spec);

	return {
		ok: true,
		openapi: oa.bytes,
		openapiHash: oa.outputHash,
		router: rt.bytes,
		contracts: pact.contracts,
		verifyPass: verify.pass,
		verifyReason: verify.reason,
		verifyInteractions: verify.interactions,
	};
}
