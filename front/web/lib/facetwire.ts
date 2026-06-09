/**
 * facetwire — FK08 (ROADMAP-fke, FKE-1.3 — les 6 tables de facettes): the TS twin of the Go
 * pure judge `WireColumn`/`WireSkeleton` (back/kernel/mirror/facetwire). It WIRES the five
 * non-functional facet columns (S/R/V/M/X) as parallel six-pair skeletons, each reusing an
 * existing sensor, and runs the same docmirror-style STRUCTURAL set-comparison so that breaking
 * a pair reddens THAT facet's column (and only that one — the facets are orthogonal, FKE-1.4).
 *
 * THE JUDGE IS A CALCULATION (§8). For a facet column, the DECLARED rungs (what the skeleton
 * requires proven) are compared against the PROVEN rungs (what a living sensor asserts) by a
 * symmetric set-difference. A rung declared-not-proven is the broken pair → the column is RED.
 * A rung proven-not-declared is the symmetric structural divergence. PROSE never enters.
 *
 * X IS SOFT (§13.6, the load-bearing asymmetry of FK08). The X column runs the IDENTICAL
 * comparison but SURFACES its divergences as ADVISORIES — they NEVER flip a verdict to red.
 * Breaking an X pair INFORMS; it does not click the ratchet hard.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). wireColumn/wireSkeleton are PURE + TOTAL: same input ⇒
 * same verdict and same divergence set, invariant under rung-ordering. The Go side is
 * authoritative; this twin mirrors it for the Workbench and carries its own reproducibility
 * property (facetwire.test.ts). THE WALL (§2): it reads declared/proven rungs and writes
 * nothing — the report is a projection, never a truth.
 */

export type Facet = "F" | "I" | "S" | "B" | "R" | "V" | "M" | "X";

export type Rung =
	| "1-spec"
	| "2-behaviour"
	| "3-scenarios"
	| "4-model"
	| "5-contract"
	| "6-evidence";

export const RUNGS: Rung[] = [
	"1-spec",
	"2-behaviour",
	"3-scenarios",
	"4-model",
	"5-contract",
	"6-evidence",
];

/** The existing sensor each non-functional facet REUSES (ADR 0007). DECLARED, never learned. */
export const FACET_SENSOR: Partial<Record<Facet, string>> = {
	S: "gv-gosec-gitleaks-policy",
	R: "chaos-failover-restore-breaker-outbox",
	V: "migrate-expand-contract-backfill-restore",
	M: "arch-fitness-go-arch-lint-depguard",
	X: "experience-claim",
};

/** The five non-functional facets FK08 wires, in canonical octuor order (S, R, V, M, X). */
export const NON_FUNCTIONAL_COLUMNS: Facet[] = ["S", "R", "V", "M", "X"];

/** The soft facet (§13.6): its divergences inform but never block. Only X is soft. */
export function isSoft(f: Facet): boolean {
	return f === "X";
}

export function sensorFor(f: Facet): string | undefined {
	return FACET_SENSOR[f];
}

export type DivergenceKind = "pair_broken" | "pair_undeclared";

export interface RungState {
	rung: Rung;
	declared: boolean;
	proven: boolean;
}

export interface Column {
	kernel_id?: string;
	facet: Facet;
	rungs: RungState[];
}

export interface Divergence {
	facet: Facet;
	rung: Rung;
	kind: DivergenceKind;
	advisory: boolean;
}

export interface ColumnReport {
	facet: Facet;
	sensor: string;
	soft: boolean;
	divergences: Divergence[];
	advisories: Divergence[];
	verdict: "green" | "red";
}

export interface Skeleton {
	kernel_id?: string;
	columns: Column[];
}

export interface SkeletonReport {
	kernel_id?: string;
	columns: ColumnReport[];
	verdict: "green" | "red";
}

const RUNG_RANK: Record<Rung, number> = {
	"1-spec": 0,
	"2-behaviour": 1,
	"3-scenarios": 2,
	"4-model": 3,
	"5-contract": 4,
	"6-evidence": 5,
};

function sortDivergences(ds: Divergence[]): Divergence[] {
	return [...ds].sort((a, b) => {
		if (a.rung !== b.rung) return RUNG_RANK[a.rung] - RUNG_RANK[b.rung];
		return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
	});
}

/**
 * wireColumn runs ONE facet column's structural set-comparison (the FK08 judge). PURE + TOTAL.
 * For a HARD facet a structural divergence reddens the column; for the SOFT facet X the
 * divergences are surfaced as advisories and the column stays GREEN (§13.6). A facet that is
 * not one of the five FK08 columns (F/I/B) is green with no sensor.
 */
export function wireColumn(col: Column): ColumnReport {
	const sensor = sensorFor(col.facet);
	const soft = isSoft(col.facet);
	if (sensor === undefined) {
		return {
			facet: col.facet,
			sensor: "",
			soft,
			divergences: [],
			advisories: [],
			verdict: "green",
		};
	}
	const state = new Map<Rung, RungState>();
	for (const rs of col.rungs) state.set(rs.rung, rs);

	const divs: Divergence[] = [];
	for (const r of RUNGS) {
		const rs = state.get(r) ?? { rung: r, declared: false, proven: false };
		if (rs.declared && !rs.proven) {
			divs.push({
				facet: col.facet,
				rung: r,
				kind: "pair_broken",
				advisory: soft,
			});
		} else if (!rs.declared && rs.proven) {
			divs.push({
				facet: col.facet,
				rung: r,
				kind: "pair_undeclared",
				advisory: soft,
			});
		}
	}
	const sorted = sortDivergences(divs);

	if (soft) {
		return {
			facet: col.facet,
			sensor,
			soft,
			divergences: [],
			advisories: sorted,
			verdict: "green",
		};
	}
	return {
		facet: col.facet,
		sensor,
		soft,
		divergences: sorted,
		advisories: [],
		verdict: sorted.length > 0 ? "red" : "green",
	};
}

/**
 * wireSkeleton judges a kernel's five non-functional columns in parallel (the squelette
 * 6-paires read across the facets). Verdict is red iff any HARD column (S/R/V/M) is red; the
 * soft X column never flips the overall verdict. PURE + TOTAL.
 */
export function wireSkeleton(sk: Skeleton): SkeletonReport {
	const byFacet = new Map<Facet, ColumnReport>();
	for (const col of sk.columns) byFacet.set(col.facet, wireColumn(col));
	const columns: ColumnReport[] = [];
	let hardRed = false;
	for (const f of NON_FUNCTIONAL_COLUMNS) {
		const cr = byFacet.get(f);
		if (cr === undefined) continue;
		columns.push(cr);
		if (!cr.soft && cr.verdict === "red") hardRed = true;
	}
	return {
		kernel_id: sk.kernel_id,
		columns,
		verdict: hardRed ? "red" : "green",
	};
}
