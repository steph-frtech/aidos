"use server";

import {
	type EntityModel,
	emitBundle,
	emitFront,
	type FrontSpec,
	isBlocked,
	sourceHash,
} from "@/lib/front-emitter";
import type { FrontView } from "./view";

/**
 * Server Action for the /front-emitter Workbench panel (S93 — the emitted app's FRONT-END,
 * app-builder EPIC 9, ADR 0040, OQ-0040-front DECIDED = Hono JSX/SSR).
 *
 * THE STEP (ROADMAP-app-builder S93): emit the app's front — pages/navigation/forms over the
 * user's entities (scalars + relations + blobs) and the control+action verticale rendered to
 * REAL buttons, each carrying its control-spec fixture as a SENSOR — wired to the emitted API.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the front is a PURE function of the spec
 * (lib/front-emitter) — same Kernel cut → byte-identical bundle, never an LLM. THE WALL (§2):
 * it WRITES NOTHING — the front is a projection.
 */

const ORDER_ENTITY: EntityModel = {
	name: "order",
	attributes: [
		{ name: "id", type: "int", identifier: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "paid", type: "bool" },
	],
	blobs: [
		{
			name: "receipt",
			allowedMime: ["image/png", "application/pdf"],
			maxBytes: 5_000_000,
			required: false,
		},
	],
	refs: [
		{
			name: "customer",
			target: "Customer",
			cardinality: "1-N",
			required: true,
		},
	],
};

/**
 * frontAction is the action-capable control (CLAUDE.md §7 ui-completeness): the user toggles
 * whether the order entity carries its blob upload + its relation, then EMITS the front
 * deterministically. The screen shows the bundle (byte-identity hash), the emitted order form
 * (rendered live so it can be SUBMITTED against the datastore), and the control buttons (each
 * carrying its control-spec sensor) — or the BlockReason if the spec is malformed.
 */
export async function frontAction(
	_prev: FrontView,
	formData: FormData,
): Promise<FrontView> {
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const withBlob = formData.get("withBlob") === "on";
	const withRelation = formData.get("withRelation") === "on";

	const entity: EntityModel = {
		name: ORDER_ENTITY.name,
		attributes: ORDER_ENTITY.attributes,
		blobs: withBlob ? ORDER_ENTITY.blobs : [],
		refs: withRelation ? ORDER_ENTITY.refs : [],
	};

	const spec: FrontSpec = {
		project,
		entities: [entity],
		controls: [
			{
				name: "create-order",
				view: "order",
				label: "order.create",
				operation: "CreateOrder",
				fixtures: [
					{ given: "cart-non-empty", visible: true, enabled: true },
					{ given: "cart-empty", visible: true, enabled: false },
				],
			},
		],
	};

	const files = emitFront(spec);
	if (isBlocked(files))
		return { ok: false, blockExplanation: files.explanation };
	const bundle = emitBundle(spec);
	if (isBlocked(bundle))
		return { ok: false, blockExplanation: bundle.explanation };

	const orderForm = files.find((f) => f.target === "front-entity-form");

	return {
		ok: true,
		files,
		bundle,
		bundleHash: sourceHash(spec),
		controls: spec.controls,
		orderFormBytes: orderForm?.bytes,
	};
}
