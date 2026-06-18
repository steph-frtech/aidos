"use server";

import {
	type EntityModel,
	emitBundle,
	emitFront,
	type FrontSpec,
	isBlocked,
	sourceHash,
} from "@/lib/front-emitter";
import { ORDER_ENTITY } from "@/lib/front-emitter-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	bundleDecoder,
	filesDecoder,
	gatewaySpecArgs,
	hashDecoder,
} from "./live";
import type { FrontView } from "./view";

/**
 * Server Action for the /front-emitter Workbench panel (S93 — the emitted app's FRONT-END,
 * app-builder EPIC 9, ADR 0040, OQ-0040-front DECIDED = Hono JSX/SSR).
 *
 * THE STEP (ROADMAP-app-builder S93): emit the app's front — pages/navigation/forms over the
 * user's entities (scalars + relations + blobs) and the control+action verticale rendered to
 * REAL buttons, each carrying its control-spec fixture as a SENSOR — wired to the emitted API.
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `frontAction` now reads the
 * LIVE emit from the Go front-emitter MCP server through the passerelle: `emit_front` (the
 * FrontFile[]), `emit_bundle` (the byte-identity bundle) and `front_hash` (the content address)
 * are the dispatched below-the-line reads. The twin (lib/front-emitter) is preserved ONLY as the
 * deterministic demo fallback (`source:"live"|"demo"`). A malformed / undispatched / refused
 * answer yields the demo emit — NEVER a partial value (ADR 0074: an honest source:"demo").
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the front is a PURE function of the spec — same Kernel
 * cut → byte-identical bundle, both on the Go side and the twin fallback, never an LLM. THE WALL
 * (§2): it WRITES NOTHING — the front is a projection.
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

	// The deterministic demo fallback: the PURE twin emit of the SAME spec (the Go frontemit
	// reproduces these bytes). A malformed spec surfaces the twin's own BlockReason.
	const demoFiles = emitFront(spec);
	if (isBlocked(demoFiles))
		return { ok: false, blockExplanation: demoFiles.explanation };
	const demoBundle = emitBundle(spec);
	if (isBlocked(demoBundle))
		return { ok: false, blockExplanation: demoBundle.explanation };
	const demoHash = sourceHash(spec);

	const scope = await panelScope();
	const args = gatewaySpecArgs(spec);
	// LIVE reads through the passerelle (the dispatched front-emitter tools); each falls back to
	// the deterministic twin emit on any miss (source:"live"|"demo") — ADR 0092.
	const filesRead = await readVia(
		scope,
		"emit_front",
		args,
		filesDecoder,
		demoFiles,
	);
	const bundleRead = await readVia(
		scope,
		"emit_bundle",
		args,
		bundleDecoder,
		demoBundle,
	);
	const hashRead = await readVia(
		scope,
		"front_hash",
		args,
		hashDecoder,
		demoHash,
	);

	const files = filesRead.data;
	const orderForm = files.find((f) => f.target === "front-entity-form");
	// The snapshot is "live" only when the whole emit (files+bundle+hash) came from the gateway.
	const source =
		filesRead.source === "live" &&
		bundleRead.source === "live" &&
		hashRead.source === "live"
			? "live"
			: "demo";

	return {
		ok: true,
		files,
		bundle: bundleRead.data,
		bundleHash: hashRead.data,
		controls: spec.controls,
		orderFormBytes: orderForm?.bytes,
		source,
	};
}
