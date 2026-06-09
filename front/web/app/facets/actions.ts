"use server";

import {
	DEMO_KERNELS,
	type DemoKernel,
	FACETS,
	type FacetLetter,
	hash,
	type Issue,
	validate,
} from "@/lib/facets";

/**
 * Server Actions for the /facets Workbench panel (FK02 — « les 8 facettes déclarées »).
 *
 * THE STEP (ROADMAP-fke FK02): a kernel declares which LENSES it instantiates
 * (F/I/S/B/R/V/M/X), COLLAPSIBLE — F always present (incompressible = intent + proof pair).
 * The validator refuses a kernel with no functional facet, an empty facet, or a declared
 * facet missing its proof pair (a monster; advisory for the soft X). The panel is
 * action-capable: a FILTER BY FACET control (the done-criterion "panel filtre par
 * facette") + a per-kernel validity badge + a content-addressed facet signature.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it COMPUTES values. The
 * validator + hash are PURE (lib/facets), never an LLM; the facet-set is never hand-posed.
 */

export interface FilteredKernel {
	id: string;
	labelFr: string;
	labelEn: string;
	/** the facet letters this kernel instantiates, in canonical order. */
	facets: string[];
	/** the validator verdict (no hard monster). */
	valid: boolean;
	/** the validator issues (each carrying its facet, code, advisory). */
	issues: Issue[];
	/** the content-addressed facet signature (round-trip stable). */
	signature: string;
}

export interface FacetFilterView {
	ok: boolean;
	/** the facet filter chosen ("all" = every kernel). */
	filter: string;
	/** the kernels matching the filter, each with its verdict + signature. */
	kernels: FilteredKernel[];
	/** how many kernels exist in total (before filtering). */
	total: number;
}

function project(k: DemoKernel): FilteredKernel {
	const res = validate(k.facetSet);
	const letters = k.facetSet.instances
		.map((i) => i.facet)
		.filter((l, idx, arr) => arr.indexOf(l) === idx);
	const order = FACETS.map((f) => f.letter as string);
	letters.sort((a, b) => order.indexOf(a) - order.indexOf(b));
	return {
		id: k.id,
		labelFr: k.labelFr,
		labelEn: k.labelEn,
		facets: letters,
		valid: res.valid,
		issues: res.issues,
		signature: hash(k.facetSet),
	};
}

/**
 * filterAction is the action-capable control behind the facets surface (CLAUDE.md §7
 * ui-completeness): the user picks a facet (or "all") and the action validates each demo
 * kernel's collapsible facet-set and returns those instantiating the chosen facet, each
 * with its validity badge (🟢/🔴) and its content-addressed signature. It WRITES NOTHING
 * (the wall).
 */
export async function filterAction(
	_prev: FacetFilterView,
	formData: FormData,
): Promise<FacetFilterView> {
	const filter = String(formData.get("filter") ?? "all");
	const all = DEMO_KERNELS.map(project);
	const valid = new Set<string>([
		"all",
		...FACETS.map((f) => f.letter as string),
	]);
	const chosen = valid.has(filter) ? filter : "all";
	const kernels =
		chosen === "all"
			? all
			: all.filter((k) => k.facets.includes(chosen as FacetLetter));
	return { ok: true, filter: chosen, kernels, total: all.length };
}
