/**
 * The grille twin — the Workbench /grid source (AIDOS FK03, the two axes of FKE-1.4).
 *
 * The DECLARED projection of the Go package back/kernel/grid: every truth carries TWO
 * coordinates and resolves to a single CELL.
 *
 *   - the VERTICALE (the architectural rung, produit→entité) — the LATERAL, COUPLING axis.
 *     The seven KRD §23 source rungs descend product → journey → view → control → action →
 *     operation → entity. They COUPLE: a change LOW marks the source rungs ABOVE it stale.
 *
 *   - the FACETTE (the nature of the truth, FK02) — the ORTHOGONAL, SEPARATING axis. The
 *     eight lenses F/I/S/B/R/V/M/X (lib/facets). They DO NOT interact: a change on one facet
 *     never disturbs another.
 *
 * The grid's three laws (the FK03 done-criteria):
 *   1. resolve(rung, facet) → one deterministic Cell + content address.
 *   2. markStale(rung) → the source rungs ABOVE it (lateral coupling, the verticale couples).
 *   3. affectedCells(change) holds the facet constant + leaves every OTHER facet untouched
 *      (orthogonality); project(truths, facet) re-reads one column independently.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE & TOTAL — no clock, no rng, no
 * I/O, no LLM. The Go grid is the AUTHORITATIVE truth; this twin reproduces it for the screen.
 * The reproducibility mirror lib/grid.test.ts (fast-check) pins same-input ⇒ same-output.
 *
 * READ-ONLY (the wall): /grid COMPUTES and DISPLAYS coordinates; it never writes truth. A cell
 * is a coordinate the ContextRouter exposes, never a truth written here.
 */

export type Rung =
	| "product"
	| "journey"
	| "view"
	| "control"
	| "action"
	| "operation"
	| "entity";

/** The seven source rungs of the verticale, top-down (product=0 … entity=6). Closed, declared. */
export const RUNGS: Rung[] = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
];

/** Canonical KRD name of each rung (français). */
export const RUNG_NAME: Record<Rung, string> = {
	product: "produit",
	journey: "parcours",
	view: "écran",
	control: "bouton",
	action: "action",
	operation: "opération",
	entity: "entité",
};

export type FacetLetter = "F" | "I" | "S" | "B" | "R" | "V" | "M" | "X";

/** The eight FK02 facets, canonical F→X order (the orthogonal axis). */
export const FACETS: FacetLetter[] = ["F", "I", "S", "B", "R", "V", "M", "X"];

export const FACET_NAME: Record<FacetLetter, string> = {
	F: "fonctionnel",
	I: "invariants",
	S: "sécurité",
	B: "budgets",
	R: "fiabilité",
	V: "évolutivité",
	M: "maintenabilité",
	X: "expérience",
};

/** X is the only SOFT facet (§13.6 — informs, never blocks). */
export const SOFT_FACETS = new Set<FacetLetter>(["X"]);

export interface Cell {
	rung: Rung;
	facet: FacetLetter;
}

export interface Truth {
	id: string;
	rung: Rung;
	facet: FacetLetter;
}

export interface Change {
	rung: Rung;
	facet: FacetLetter;
}

export interface Affected {
	changed: Cell;
	staleRungs: Rung[];
	staleCells: Cell[];
	untouchedFacets: FacetLetter[];
}

export interface Column {
	facet: FacetLetter;
	cells: Cell[];
	truths: string[];
}

export interface Grid {
	columns: Column[];
}

export function isSourceRung(r: string): r is Rung {
	return (RUNGS as string[]).includes(r);
}

export function isCanonicalFacet(f: string): f is FacetLetter {
	return (FACETS as string[]).includes(f);
}

/** depth on the descent path (0 = product/top, 6 = entity/bottom); -1 for an out-of-ladder rung. */
export function depth(r: string): number {
	return (RUNGS as string[]).indexOf(r);
}

export class GridError extends Error {}

/**
 * LAW 1 — resolve a truth's two coordinates to a single deterministic Cell. Refuses an
 * out-of-ladder rung or out-of-octuor facet (no default cell). PURE, TOTAL.
 */
export function resolve(rung: string, facet: string): Cell {
	if (!isSourceRung(rung)) {
		throw new GridError(
			`grid: rung ${JSON.stringify(rung)} is not one of the seven source rungs of the verticale`,
		);
	}
	if (!isCanonicalFacet(facet)) {
		throw new GridError(
			`grid: facet ${JSON.stringify(facet)} is not one of the eight canonical lenses (F/I/S/B/R/V/M/X)`,
		);
	}
	return { rung, facet };
}

/** The content address of a cell: a stable string of its coordinate. Deterministic. */
export function cellHash(c: Cell): string {
	return `${c.rung}×${c.facet}`;
}

/**
 * LAW 2 — given a CHANGED rung, the source rungs ABOVE it (its dependents) marked stale,
 * top-down. A change low marks the foundation's dependents; a change at the summit marks
 * nothing. Never the changed rung, never a rung below, never a transversal band. PURE, TOTAL.
 */
export function markStale(changed: string): Rung[] {
	const d = depth(changed);
	if (d < 0) return [];
	return RUNGS.slice(0, d);
}

/**
 * LAWS 2+3 — the blast radius of a Change: the stale cells with the FACET HELD CONSTANT
 * (lateral coupling) + the seven OTHER facets left untouched (orthogonality). An out-of-set
 * coordinate yields an empty (valid) Affected. PURE, TOTAL.
 */
export function affectedCells(ch: Change): Affected {
	const aff: Affected = {
		changed: { rung: ch.rung, facet: ch.facet },
		staleRungs: [],
		staleCells: [],
		untouchedFacets: [],
	};
	if (!isSourceRung(ch.rung) || !isCanonicalFacet(ch.facet)) {
		return {
			changed: { rung: ch.rung as Rung, facet: ch.facet },
			staleRungs: [],
			staleCells: [],
			untouchedFacets: [],
		};
	}
	for (const r of markStale(ch.rung)) {
		aff.staleRungs.push(r);
		aff.staleCells.push({ rung: r, facet: ch.facet });
	}
	for (const f of FACETS) {
		if (f !== ch.facet) aff.untouchedFacets.push(f);
	}
	return aff;
}

/**
 * LAW 3 made readable — project a set of placed truths onto a SINGLE facet column: only the
 * truths whose facet equals `facet`, sorted top-down by rung then by id. A change confined to
 * ANOTHER facet leaves this column byte-identical (the facets do not interact). PURE, TOTAL.
 */
export function project(truths: Truth[], facet: FacetLetter): Column {
	const sel = truths
		.filter((t) => t.facet === facet && isSourceRung(t.rung))
		.map((t) => ({ id: t.id, rung: t.rung, d: depth(t.rung) }));
	sel.sort((a, b) =>
		a.d !== b.d ? a.d - b.d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	return {
		facet,
		cells: sel.map((s) => ({ rung: s.rung, facet })),
		truths: sel.map((s) => s.id),
	};
}

/** Assemble the full grid: one column per canonical facet (F→X), each projected independently. */
export function buildGrid(truths: Truth[]): Grid {
	return { columns: FACETS.map((f) => project(truths, f)) };
}

/** Deterministic content address of the whole grid (same truths ⇒ same hash). */
export function gridHash(g: Grid): string {
	return g.columns.map((c) => `${c.facet}[${c.truths.join(",")}]`).join("|");
}

/**
 * A small library of demo truths placed on the grid, so the /grid panel has something to
 * filter/resolve. Each truth carries its (rung, facet) coordinate. Read-only fixtures.
 */
export interface DemoTruth extends Truth {
	labelFr: string;
	labelEn: string;
}

export const DEMO_TRUTHS: DemoTruth[] = [
	{
		id: "checkout-product",
		rung: "product",
		facet: "F",
		labelFr: "intention « commander »",
		labelEn: "“checkout” intention",
	},
	{
		id: "checkout-journey",
		rung: "journey",
		facet: "X",
		labelFr: "parcours d'achat fluide",
		labelEn: "smooth purchase journey",
	},
	{
		id: "cart-view",
		rung: "view",
		facet: "X",
		labelFr: "écran panier lisible",
		labelEn: "readable cart screen",
	},
	{
		id: "pay-button",
		rung: "control",
		facet: "F",
		labelFr: "bouton « payer » visible",
		labelEn: "“pay” button visible",
	},
	{
		id: "pay-action",
		rung: "action",
		facet: "S",
		labelFr: "action paiement autorisée",
		labelEn: "payment action authorized",
	},
	{
		id: "charge-op",
		rung: "operation",
		facet: "F",
		labelFr: "opération débit correcte",
		labelEn: "charge operation correct",
	},
	{
		id: "charge-op-inv",
		rung: "operation",
		facet: "I",
		labelFr: "∀ débit ⇒ total = somme",
		labelEn: "∀ charge ⇒ total = sum",
	},
	{
		id: "charge-op-budget",
		rung: "operation",
		facet: "B",
		labelFr: "débit < 200ms p99",
		labelEn: "charge < 200ms p99",
	},
	{
		id: "charge-op-sec",
		rung: "operation",
		facet: "S",
		labelFr: "débit sans injection",
		labelEn: "charge no injection",
	},
	{
		id: "order-entity",
		rung: "entity",
		facet: "F",
		labelFr: "entité commande",
		labelEn: "order entity",
	},
	{
		id: "order-entity-evo",
		rung: "entity",
		facet: "V",
		labelFr: "migration commande expand-contract",
		labelEn: "order expand-contract migration",
	},
	{
		id: "order-entity-arch",
		rung: "entity",
		facet: "M",
		labelFr: "commande dans son bounded context",
		labelEn: "order in its bounded context",
	},
];
