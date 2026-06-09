"use server";

import { deriveDoc } from "@/lib/derivedoc";
import { type DeriveView, emptyView, FIXTURES } from "./fixtures";

/**
 * Server Action for the /derive-doc Workbench panel (FK06 — la dérivation déterministe de s9).
 *
 * THE STEP (ROADMAP-fke FK06, FKE-1.3 décision (a)): the pure emitter DeriveDoc(kernel) → s9 —
 * the doc DERIVED from the code (operations, controls, routes/bindings, test names, errors),
 * the LOWER HALF of the doc-mirror, structured (concepts du lexique, behaviors, erreurs) for the
 * structural comparison FK07 will run against s2.
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): the DÉRIVER S9 control is bound to this action,
 * which runs the pure twin lib/derivedoc — pick a kernel fixture, run the emitter, watch the
 * structured s9 + its canonical bytes appear, and the byte-identity proof (run twice → identical).
 * THE WALL (§2): the action WRITES NOTHING — s9 is a projection, regenerable, never a truth.
 *
 * NOTE: this "use server" module exports ONLY the async action. The fixtures + types live in
 * ./fixtures (a plain module), because a "use server" file may export only Server Actions.
 */
export async function deriveAction(
	_prev: DeriveView,
	formData: FormData,
): Promise<DeriveView> {
	const fixtureId = String(formData.get("fixtureId") ?? "");
	const fixture = FIXTURES.find((f) => f.id === fixtureId);
	if (!fixture) {
		return {
			...emptyView,
			error: `fixture inconnue : ${fixtureId || "(vide)"}`,
		};
	}
	const a = deriveDoc(fixture.kernel);
	const b = deriveDoc(fixture.kernel);
	return {
		ok: true,
		kernelId: a.s9.kernel_id,
		concepts: a.s9.concepts,
		behaviors: a.s9.behaviors,
		errors: a.s9.errors,
		bytes: a.bytes,
		bytesAgain: b.bytes,
		identical: a.bytes === b.bytes,
	};
}
