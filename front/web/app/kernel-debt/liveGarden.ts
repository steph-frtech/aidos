import {
	arr,
	type Decoder,
	isObject,
	num,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /kernel-debt live GARDEN read MODEL (the PURE part of the ADR 0092 batch-2 kernel-garden
 * flip — testable in isolation).
 *
 * This module holds the never-double-typed Decoders for the kernel-garden server's two read
 * tools — `garden_tend_project` (gardenOut) and `garden_suggest_trim` (planOut) — plus the
 * deterministic demo fixtures (re-exported from lib/kernel-garden-data). It imports NOTHING
 * server-only, so the parity mirror (liveGarden.test.ts) can decode a Go-sample output without
 * a server runtime. The Server Action (liveGardenActions.ts) wires panelScope + readVia around
 * these.
 *
 * ── WHY THIS READ ON THIS PANEL ──────────────────────────────────────────────────────
 * The panel renders the KernelDebt LEDGER. The action-capable KernelDebtPanel re-runs the pure
 * twin (scan + suggestTrim) on a chosen scenario and groups three rots — that worked example
 * STAYS (the suggest-only ledger, above the line). This adds the S112/§82.4 per-project GARDEN
 * the engine actually computes (the FIVE rots — the three plus DEAD LIVENESS and LOW-VALUE
 * CONSTRAINT — read live through the gateway): the ranked debt items and the open_idea_* trim
 * plan from the Go kernel-garden server. Surfacing it makes the garden's debt LIVE (strictly
 * additive, the proven dispatched-read pattern).
 *
 * ── THE WALL (CLAUDE.md §2/§8) ───────────────────────────────────────────────────────
 * garden_tend_project / garden_suggest_trim are PURE below-the-line reads over a read-only
 * projection (a project's kernel ⋈ mirrors ⋈ mutation ⋈ declared budgets). They WRITE NOTHING.
 * /trim PROPOSES — `deletes_anything` is ALWAYS false; the only door is
 * idea → mirror → /goal → human approval. This module decodes those reads; it writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoders are pure total functions; a malformed payload is rejected (→ demo fallback),
 * never coerced. The garden's classification/ranking is Go (garden.Tend, authoritative); this
 * module decodes its contract, it is NOT a second garden.
 *
 * ── THE Go CONTRACTS (kernelgardensrv) ───────────────────────────────────────────────
 * gardenOut: `{ project_ref, kernel_head, items: [{ id, project_ref, kind, target_ref, reason,
 *   severity }], count }`.
 * planOut:   `{ project_ref, suggestions: [{ debt_item_ref, project_ref, proposed_action,
 *   rationale, requires }], deletes_anything }` (deletes_anything ALWAYS false).
 */

/** A single garden debt item — the kernelgardensrv.itemOut shape, decoded ONCE. */
export interface GardenItemView {
	id: string;
	projectRef: string;
	kind: string;
	targetRef: string;
	reason: string;
	severity: string;
}

/** The decoder's structural output for garden_tend_project — the SINGLE declaration. */
export interface GardenData {
	projectRef: string;
	kernelHead: string;
	items: GardenItemView[];
	count: number;
}

/** A single trim suggestion — the kernelgardensrv.suggestionOut shape, decoded ONCE. */
export interface GardenSuggestionView {
	debtItemRef: string;
	projectRef: string;
	proposedAction: string;
	rationale: string;
	requires: string;
}

/** The decoder's structural output for garden_suggest_trim — the SINGLE declaration. */
export interface GardenPlanData {
	projectRef: string;
	suggestions: GardenSuggestionView[];
	deletesAnything: boolean;
}

export interface LiveGardenView {
	garden: GardenData;
	plan: GardenPlanData;
	gardenSource: Source;
	planSource: Source;
}

const itemDecoder: Decoder<GardenItemView> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const projectRef = str(raw.project_ref);
	const kind = str(raw.kind);
	const targetRef = str(raw.target_ref);
	const reason = str(raw.reason);
	const severity = str(raw.severity);
	if (
		id === null ||
		projectRef === null ||
		kind === null ||
		targetRef === null ||
		reason === null ||
		severity === null
	) {
		return null;
	}
	return { id, projectRef, kind, targetRef, reason, severity };
};

/**
 * gardenDecoder decodes the kernel-garden `garden_tend_project` output
 * `{ project_ref, kernel_head, items, count }` (kernelgardensrv.gardenOut) ONCE — never
 * double-typed. A malformed payload → null (the caller falls back to the demo garden). An
 * absent / empty items list decodes to [].
 */
export const gardenDecoder: Decoder<GardenData> = (raw) => {
	if (!isObject(raw)) return null;
	const projectRef = str(raw.project_ref);
	const kernelHead = str(raw.kernel_head);
	const count = num(raw.count);
	if (projectRef === null || kernelHead === null || count === null) return null;
	const items = arr(itemDecoder)(raw.items ?? []);
	if (items === null) return null;
	return { projectRef, kernelHead, items, count };
};

const suggestionDecoder: Decoder<GardenSuggestionView> = (raw) => {
	if (!isObject(raw)) return null;
	const debtItemRef = str(raw.debt_item_ref);
	const projectRef = str(raw.project_ref);
	const proposedAction = str(raw.proposed_action);
	const rationale = str(raw.rationale);
	const requires = str(raw.requires);
	if (
		debtItemRef === null ||
		projectRef === null ||
		proposedAction === null ||
		rationale === null ||
		requires === null
	) {
		return null;
	}
	return { debtItemRef, projectRef, proposedAction, rationale, requires };
};

/**
 * planDecoder decodes the kernel-garden `garden_suggest_trim` output
 * `{ project_ref, suggestions, deletes_anything }` (kernelgardensrv.planOut) ONCE — never
 * double-typed. A malformed payload → null (→ demo plan). `deletes_anything` is ALWAYS false
 * from the Go server, but decoded as a plain bool (the panel pins it false separately).
 */
export const planDecoder: Decoder<GardenPlanData> = (raw) => {
	if (!isObject(raw)) return null;
	const projectRef = str(raw.project_ref);
	if (projectRef === null) return null;
	if (typeof raw.deletes_anything !== "boolean") return null;
	const suggestions = arr(suggestionDecoder)(raw.suggestions ?? []);
	if (suggestions === null) return null;
	return { projectRef, suggestions, deletesAnything: raw.deletes_anything };
};

export {
	DEMO_GARDEN,
	DEMO_GARDEN_PLAN,
	GARDEN_SCENARIO_SNAPSHOT,
} from "../../lib/kernel-debt-garden-data";
