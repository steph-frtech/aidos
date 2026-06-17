/**
 * The federation-cockpit twin — the Workbench /federation-cockpit source (AIDOS S105, §50).
 *
 * The DECLARED projection of the Go package back/runtime/cockpit: the PURE, DETERMINISTIC
 * composition that snapshots a project's federation into ONE cockpit view — the cell graph, the
 * inter-cell contracts, the status of BOTH ratchets, local vs global stability, and the
 * red-wave fan-out. It REUSES the existing twins verbatim and forks NO truth logic:
 *
 *   - cell-federation.ts (S100) — partition / ships: the per-cell BEHAVIOURAL ratchet (§43, the
 *     FIRST ratchet). A cell ships iff its own ratchet is green, independent of its neighbors.
 *   - arch-fitness.ts (S102) — measure / ratchet: the STRUCTURAL ratchet (the SECOND ratchet,
 *     §47) over the inter-cell dependency graph; it can only HOLD or IMPROVE.
 *   - the red-wave fan-out (§51) — a GLOBAL policy expressed ONCE reddens exactly the cells that
 *     VIOLATE it; a contracted neighbor that does NOT violate stays GREEN and SHIPS while its
 *     neighbor is still red (the §43 fractal: local stability ships even when the federation
 *     is in flux).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): assembleSnapshot is a PURE function of its input — no
 * clock, no rng, no I/O, no LLM — and canonicalises (sorts) every list, so the SAME project ⇒
 * a byte-identical snapshot. The Go output is the AUTHORITATIVE truth; this twin reproduces it
 * for the screen. The reproducibility mirror lib/federation-cockpit.test.ts (fast-check) pins
 * it + the §50 done-criterion: a reddened cell never ships, a green non-reddened cell always
 * ships, globally-stable iff every cell ships ∧ the structural ratchet held.
 *
 * THE WALL (CLAUDE.md §2): /federation-cockpit COMPOSES + RENDERS; it never writes truth. The
 * structural baseline moves only via a DRAFT ChangeSet (S102); the per-cell RedWorkQueue INSERT
 * is the S22 hook's job below the waterline. This twin returns a VALUE.
 */

import {
	type DepGraph,
	measure,
	type RatchetVerdict,
	ratchet,
	type StructuralMetric,
} from "./arch-fitness";
import {
	type Federation as CellFederation,
	type Project as CellProject,
	partition,
	type RatchetState,
	ships,
} from "./cell-federation";

export type { RatchetState };

/** The status of BOTH ratchets for one cell in the cockpit. */
export interface CellRatchets {
	cell: string;
	/** the cell's OWN behavioural ratchet (S100): green ⇒ ships, red ⇒ does not. */
	behavioural: RatchetState;
	/** whether the active red-wave fan-out reddened THIS cell (§51). */
	reddened: boolean;
	/** the cell's OWN red-wave worklist (one target ref per reddened cell, stamped with the wave id). */
	queue: string[];
	/** whether the cell ships RIGHT NOW: behavioural green AND not reddened. */
	ships: boolean;
}

/** One inter-cell contracts_with link on the cockpit graph (S101). */
export interface ContractEdge {
	a: string;
	b: string;
	honored: boolean;
}

/** A cell the global policy spans and whether it actually VIOLATES it (§51). */
export interface CellViolation {
	cell: string;
	violates: boolean;
}

/** The active red-wave fan-out the cockpit overlays. Empty cells ⇒ no active wave. */
export interface FanOutSpec {
	policyWaveId: string;
	cells: CellViolation[];
}

/** The assembled federation cockpit view (§50). PURE, content-addressed by its inputs. */
export interface CockpitSnapshot {
	project: string;
	/** the per-cell ratchet rows, sorted by cell ref — the graph nodes. */
	cells: CellRatchets[];
	/** the inter-cell contract edges, canonicalised (a≤b, sorted) — the graph edges. */
	contracts: ContractEdge[];
	/** the SECOND ratchet's verdict over this cut (S102). */
	structural: RatchetVerdict;
	/** the refs that ship right now (behavioural green ∧ not reddened), sorted — local stability. */
	shippableCells: string[];
	/** the refs the active wave reddened, sorted — the red-wave fan-out reach. */
	reddenedCells: string[];
	/** whether the WHOLE federation is stable: every cell ships AND the structural ratchet held. */
	globallyStable: boolean;
}

const sortStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * assembleSnapshot composes the federation cockpit (§50). PURE + TOTAL: partition the project
 * into per-cell sub-Kernels, measure+ratchet the structural cut against the baseline, overlay
 * the active red-wave fan-out (a reddened cell does NOT ship; a non-violating contracted
 * neighbor stays on its own behavioural ratchet and SHIPS). Twin of cockpit.AssembleSnapshot.
 */
export function assembleSnapshot(
	p: CellProject,
	depGraph: DepGraph,
	baseline: StructuralMetric,
	fed: CellFederation,
	wave: FanOutSpec,
): CockpitSnapshot {
	const cells = partition(p);

	const candidate = measure(depGraph);
	const structural = ratchet(baseline, candidate);

	const violates = new Map<string, boolean>();
	for (const cv of wave.cells) {
		violates.set(cv.cell, cv.violates);
	}

	const rows: CellRatchets[] = [];
	const shippable: string[] = [];
	const reddened: string[] = [];
	for (const c of cells) {
		const ref = c.ref;
		const red = violates.get(ref) ?? false;
		const row: CellRatchets = {
			cell: ref,
			behavioural: c.ratchet,
			reddened: red,
			queue: red ? [`${ref}::pii-aggregate@${wave.policyWaveId}`] : [],
			ships: ships(c) && !red,
		};
		if (red) {
			reddened.push(ref);
		}
		if (row.ships) {
			shippable.push(ref);
		}
		rows.push(row);
	}

	const contracts: ContractEdge[] = fed.contracts.map((c) => {
		let a = c.a;
		let b = c.b;
		if (a > b) {
			[a, b] = [b, a];
		}
		return { a, b, honored: c.honored };
	});

	rows.sort((x, y) => sortStr(x.cell, y.cell));
	contracts.sort((x, y) => sortStr(x.a, y.a) || sortStr(x.b, y.b));
	shippable.sort(sortStr);
	reddened.sort(sortStr);

	const globallyStable =
		shippable.length === rows.length && structural.state === "HELD";

	return {
		project: p.id,
		cells: rows,
		contracts,
		structural,
		shippableCells: shippable,
		reddenedCells: reddened,
		globallyStable,
	};
}

// ── demo fixtures (the §50 canonical cockpit the panel boots with) ──
//
// The DEMO_* fixtures moved to lib/federation-cockpit-data.ts (the S59 demo-fallback sibling, ADR
// 0092 — the witness that makes the T5 cliquet recognise this module as a twin). They are
// re-exported here so existing importers (the reproducibility mirror, the panel) keep their import
// path; the data file is the single declaration.
export {
	DEMO_DEP_GRAPH,
	DEMO_FEDERATION,
	DEMO_NO_WAVE,
	DEMO_PROJECT,
	DEMO_REGRESSED_GRAPH,
	DEMO_WAVE,
	demoWave,
	gatewayFanOutArgs,
} from "./federation-cockpit-data";
