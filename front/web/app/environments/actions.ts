"use server";

import {
	bindingsFor,
	hashBindings,
	isRefusal,
	validateDatastore,
} from "@/lib/environments";
import type { GateView } from "./view";

/**
 * Server Action for the /environments Workbench panel (DP06 — the
 * per-environment connection bindings over the WIDENED closed environment
 * set, ADR 0065).
 *
 * THE GESTURE (ui-completeness, CLAUDE.md §7): the panel's one control
 * « tester la liaison » runs the PURE A1 gate of the TS twin
 * (lib/environments, byte-parity-pinned to the authoritative Go
 * back/runtime/envbindings) over the (environment, datastore) pair picked on
 * screen — an unknown environment/datastore is refused (UNKNOWN_ENVIRONMENT /
 * UNKNOWN_DATASTORE), prod + doltgres is refused
 * (DOLTGRES_NOT_ALLOWED_IN_PROD, SPEC-stack-2026 verbatim) — and re-measures
 * the content address of the WHOLE projection against the Go-pinned one.
 *
 * THE WALL (CLAUDE.md §2): this action is a PURE MEASURE — it WRITES NOTHING.
 * Widening the closed environment set WAS the truth change (idea → mirror →
 * /goal, ADR 0065); declaring a NEW binding-truth would flow through propose →
 * ChangeSet → approval (DP09), never a direct write from the screen.
 */
export async function gateAction(
	_prev: GateView,
	formData: FormData,
): Promise<GateView> {
	const environment = String(formData.get("environment") ?? "");
	const datastore = String(formData.get("datastore") ?? "");
	const seededHash = String(formData.get("seededHash") ?? "");

	const refusal = validateDatastore(environment, datastore);
	if (refusal) {
		return { ok: false, environment, datastore, refusal };
	}
	const binding = bindingsFor(environment);
	if (isRefusal(binding)) {
		// unreachable after the gate passed — kept fail-closed, never guessed.
		return { ok: false, environment, datastore, refusal: binding };
	}
	const hash = await hashBindings();
	return {
		ok: true,
		environment,
		datastore,
		binding,
		hash,
		sameAsSeeded: hash === seededHash,
	};
}
