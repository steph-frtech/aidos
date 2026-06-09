"use server";

import {
	affectedCells,
	type Cell,
	cellHash,
	DEMO_TRUTHS,
	FACET_NAME,
	type FacetLetter,
	isCanonicalFacet,
	isSourceRung,
	project,
	RUNG_NAME,
	type Rung,
	resolve,
} from "@/lib/grid";

/**
 * Server Actions for the /grid Workbench panel (FK03 — « la grille niveau × facette »).
 *
 * THE STEP (ROADMAP-fke FK03): every truth carries TWO coordinates — the verticale rung
 * (produit→entité, the LATERAL coupling axis) × the FK02 facette (the ORTHOGONAL separating
 * axis) — and resolves to a single CELL the ContextRouter exposes. The panel is action-capable
 * (CLAUDE.md §7 ui-completeness): a RESOLVE & MARK control bound to the pure twin lib/grid —
 *   1. resolve the truth to its deterministic cell (LAW 1),
 *   2. mark the source rungs ABOVE it stale, facet held constant (LAW 2 — the verticale couples),
 *   3. show the seven OTHER facets left untouched (LAW 3 — the facets do not interact).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it COMPUTES coordinates. The
 * resolve/markStale/affectedCells are PURE (lib/grid), never an LLM; a cell is never hand-posed.
 */

export interface StaleCellView {
	rung: string;
	rungName: string;
	facet: string;
	cell: string;
}

export interface ResolveView {
	ok: boolean;
	error?: string;
	/** the resolved cell + its content address (LAW 1). */
	rung?: string;
	rungName?: string;
	facet?: string;
	facetName?: string;
	cell?: string;
	hash?: string;
	/** the stale cells above, facet held constant (LAW 2 — lateral coupling). */
	staleCells: StaleCellView[];
	/** the seven OTHER facets, untouched (LAW 3 — orthogonality). */
	untouchedFacets: { letter: string; name: string }[];
	/** the chosen facet's COLUMN of demo truths (top-down), to show it stays whole. */
	column: { id: string; rung: string }[];
}

const empty: ResolveView = {
	ok: false,
	staleCells: [],
	untouchedFacets: [],
	column: [],
};

/**
 * resolveAction is the action-capable control behind the grille (CLAUDE.md §7
 * ui-completeness): the user picks a verticale rung + an FK02 facet, and the action resolves
 * the truth to its deterministic cell, computes the lateral blast radius (the source rungs
 * above, facet held constant) and lists the untouched other facets — all PURE, WRITES NOTHING.
 */
export async function resolveAction(
	_prev: ResolveView,
	formData: FormData,
): Promise<ResolveView> {
	const rung = String(formData.get("rung") ?? "");
	const facet = String(formData.get("facet") ?? "");

	if (!isSourceRung(rung) || !isCanonicalFacet(facet)) {
		return {
			...empty,
			ok: false,
			error: `coordonnée hors-grille (rung=${JSON.stringify(rung)}, facette=${JSON.stringify(facet)})`,
		};
	}

	let cell: Cell;
	try {
		cell = resolve(rung, facet);
	} catch (e) {
		return { ...empty, ok: false, error: (e as Error).message };
	}

	const aff = affectedCells({
		rung: rung as Rung,
		facet: facet as FacetLetter,
	});
	const col = project(DEMO_TRUTHS, facet as FacetLetter);

	return {
		ok: true,
		rung,
		rungName: RUNG_NAME[rung as Rung],
		facet,
		facetName: FACET_NAME[facet as FacetLetter],
		cell: cellHash(cell),
		hash: cellHash(cell),
		staleCells: aff.staleCells.map((c) => ({
			rung: c.rung,
			rungName: RUNG_NAME[c.rung],
			facet: c.facet,
			cell: cellHash(c),
		})),
		untouchedFacets: aff.untouchedFacets.map((f) => ({
			letter: f,
			name: FACET_NAME[f],
		})),
		column: col.cells.map((c, i) => ({ id: col.truths[i], rung: c.rung })),
	};
}
