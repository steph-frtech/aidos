"use server";

import {
	hashManifest,
	type StackManifest,
	validate,
} from "@/lib/stack-manifest";
import type { MeasureView } from "./view";

/**
 * Server Action for the /stack-manifest Workbench panel (DP02 — the
 * StackManifest engraved as a first-class Kernel SOURCE).
 *
 * THE GESTURE (ui-completeness, CLAUDE.md §7): the panel's one control
 * « valider & hasher » runs the PURE validator + content-addressing of the TS
 * twin (lib/stack-manifest, byte-parity-pinned to the authoritative Go
 * back/kernel/stackmanifest) over the manifest JSON on screen — name required,
 * ≥1 role=server (STACK_HAS_NO_SERVER), unique internal ports
 * (DUPLICATE_INTERNAL_PORT), closed role set (UNKNOWN_SERVICE_ROLE), closed
 * profile set — and returns the verdict + the content address.
 *
 * THE WALL (CLAUDE.md §2): this action is a PURE MEASURE — it WRITES NOTHING.
 * stack_manifest is above-the-line truth: engraving a manifest flows through
 * idea → mirror → /goal → human approval (the aidos CLI writer role); the
 * agent and the screen have no GRANT on kernel.stack_manifest.
 */
export async function measureAction(
	_prev: MeasureView,
	formData: FormData,
): Promise<MeasureView> {
	const raw = String(formData.get("manifestJson") ?? "");
	const seededHash = String(formData.get("seededHash") ?? "");

	let manifest: StackManifest;
	try {
		manifest = JSON.parse(raw) as StackManifest;
	} catch (e) {
		return {
			ok: false,
			parseError: e instanceof Error ? e.message : String(e),
		};
	}

	const refusal = validate(manifest);
	if (refusal) {
		return { ok: false, refusal };
	}
	const hash = await hashManifest(manifest);
	return { ok: true, hash, sameAsSeeded: hash === seededHash };
}
