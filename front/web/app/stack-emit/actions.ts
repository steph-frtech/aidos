"use server";

import { emitCompose } from "@/lib/stack-emit";
import type { StackManifest } from "@/lib/stack-manifest";
import type { EmitView } from "./view";

/**
 * Server Action for the /stack-emit Workbench panel (DP03 — the additive
 * Target docker-compose of the closed kind × target matrix).
 *
 * THE GESTURE (ui-completeness, CLAUDE.md §7): the panel's one control
 * « émettre le compose » runs the PURE emitter of the TS twin
 * (lib/stack-emit, byte-parity-pinned to the authoritative Go
 * back/runtime/composeemit) over the manifest JSON on screen — validate (the
 * DP02 closed codes: UNKNOWN_SERVICE_ROLE, DUPLICATE_INTERNAL_PORT,
 * STACK_HAS_NO_SERVER, …), content-address the source, render the
 * /data/dockers-convention compose, content-address the output.
 *
 * THE WALL (CLAUDE.md §2): this action is a PURE MEASURE — it WRITES NOTHING
 * (no gen/ file, no truth). Emitting to back/gen/<app>/ is the build-time
 * projection step; the StackManifest source stays above the line (engraving
 * flows through idea → mirror → /goal → human approval).
 */
export async function emitAction(
	_prev: EmitView,
	formData: FormData,
): Promise<EmitView> {
	const raw = String(formData.get("manifestJson") ?? "");
	const seededOutputHash = String(formData.get("seededOutputHash") ?? "");

	let manifest: StackManifest;
	try {
		manifest = JSON.parse(raw) as StackManifest;
	} catch (e) {
		return {
			ok: false,
			parseError: e instanceof Error ? e.message : String(e),
		};
	}

	const result = await emitCompose(manifest);
	if ("refusal" in result) {
		return { ok: false, refusal: result.refusal };
	}
	return {
		ok: true,
		yaml: result.yaml,
		outputHash: result.outputHash,
		sourceHash: result.sourceHash,
		path: result.path,
		sameAsSeeded: result.outputHash === seededOutputHash,
	};
}
