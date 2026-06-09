"use server";

import {
	acceptProposal,
	type GardenSuggestion,
	suggestGardenTrim,
	tend,
} from "@/lib/kernel-garden";
import {
	ACCEPT_INITIAL,
	type AcceptView,
	DEFAULT_PROJECT,
	GARDEN_INITIAL,
	type GardenView,
	PROJECTS,
} from "./view";

/**
 * Server Actions for the /kernel-garden cockpit (S112 — per-project KernelDebt gardening
 * + /trim, KRD §82.4).
 *
 * THE STEP: garden ONE project's slice of the truth-store (surfacing the five rots —
 * orphan mirror, stale fixture, surviving mutant, DEAD LIVENESS, LOW-VALUE CONSTRAINT),
 * PROPOSE a trim over each, and (on accept) OPEN an idea — never delete. The scan is
 * project-scoped: project A never surfaces project B's debt.
 *
 * Three controls (all run the PURE twin lib/kernel-garden — same input → identical
 * output, never an LLM; THE WALL §2: the cockpit WRITES NOTHING; accepting a trim
 * proposal OPENS an idea → mirror → /goal → human approval, never a direct removal):
 *   - tendAction: garden the selected project → the debt ledger + the trim plan.
 *   - acceptAction: accept a proposal → the OpenIdea (always opens an idea, never deletes).
 */

function projectFor(form: FormData): string {
	const p = String(form.get("project") ?? DEFAULT_PROJECT);
	return p in PROJECTS ? p : DEFAULT_PROJECT;
}

export async function tendAction(
	_prev: GardenView,
	formData: FormData,
): Promise<GardenView> {
	const snap = PROJECTS[projectFor(formData)];
	const garden = tend(snap);
	const plan = suggestGardenTrim(garden);
	return { ...GARDEN_INITIAL, ran: true, garden, plan };
}

export async function acceptAction(
	_prev: AcceptView,
	formData: FormData,
): Promise<AcceptView> {
	// Re-derive the suggestion deterministically from the project + the chosen debt item
	// (the panel posts the debt item ref + the project), so the OpenIdea is computed from
	// the SAME pure pipeline — never trusted from the client.
	const snap = PROJECTS[projectFor(formData)];
	const plan = suggestGardenTrim(tend(snap));
	const debtItemRef = String(formData.get("debtItemRef") ?? "");
	const sug: GardenSuggestion | undefined = plan.suggestions.find(
		(s) => s.debtItemRef === debtItemRef,
	);
	if (!sug) {
		return ACCEPT_INITIAL;
	}
	return { ran: true, openIdea: acceptProposal(sug) };
}
