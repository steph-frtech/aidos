/**
 * The CELL (bounded context federation) twin — the Workbench /cell-federation source (AIDOS S100).
 *
 * The DECLARED projection of the Go package back/kernel/cell: a project's Kernel is NEVER one
 * indivisible mass but a deliberate FEDERATION of small per-cell sub-Kernels (KRD §43–§51),
 * each with its OWN ratchet, linked ONLY by versioned contracts_with (S17). The agent working
 * cell X loads its OWN Kernel + ONLY contracted neighbors' PUBLIC contracts — never a
 * neighbor's internals (§145). A cross-cell access without a honored contract is refused (§46).
 *
 * THE OPEN QUESTION (ROADMAP E11): cell = TruthScope dimension (S15) or first-rank record?
 * RESOLVED: a cell is a FIRST-RANK partition that REUSES the bounded_context already carried by
 * every node — NOT a sixth TruthScope dimension (TruthScope qualifies one truth; a cell is the
 * partition the truth lives in).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): partition / cellPack / checkCrossCellAccess are PURE
 * functions of their input — no clock, no rng, no I/O, no LLM — and canonicalise (sort) before
 * rendering, so the SAME project → byte-identical pack. The Go output is the AUTHORITATIVE
 * truth; this twin reproduces it for the screen. The reproducibility mirror
 * lib/cell-federation.test.ts (fast-check) pins determinism + the two done-criteria (the pack
 * excludes neighbor internals; a cross-cell access without a contract is refused).
 *
 * READ-ONLY (the wall): /cell-federation PROJECTS + CHECKS; it never writes truth. The
 * Context-Map (which cells exist, which contract) persists via a ChangeSet (S101).
 */

export type NodeKind = "layer" | "mirror" | "contract";
export type RatchetState = "green" | "red";

export interface CellNode {
	id: string;
	cell: string;
	kind: NodeKind;
	public?: boolean;
}

export interface Project {
	id: string;
	nodes: CellNode[];
	ratchets?: Record<string, RatchetState>;
}

export interface Cell {
	ref: string;
	nodes: CellNode[];
	ratchet: RatchetState;
}

export interface Contract {
	a: string;
	b: string;
	honored: boolean;
}

export interface Federation {
	contracts: Contract[];
}

export type ExclusionReason = "neighbor-internal" | "no-contract";

export interface Excluded {
	id: string;
	cell: string;
	reason: ExclusionReason;
}

export interface CellContextPack {
	project: string;
	cell: string;
	ownLayers: string[];
	ownMirrors: string[];
	ownContracts: string[];
	neighborContracts: string[];
	excluded: Excluded[];
}

export interface BlockReason {
	code: string;
	message: string;
	howToFix: string[];
}

/** The single S100 refusal code (the Go twin: cell.CodeCrossCellNoContract). */
export const CODE_CROSS_CELL_NO_CONTRACT = "CROSS_CELL_NO_CONTRACT";

const KNOWN_KINDS: NodeKind[] = ["layer", "mirror", "contract"];

/** isKnownKind reports whether k is one of the three closed node kinds. */
export function isKnownKind(k: string): k is NodeKind {
	return (KNOWN_KINDS as string[]).includes(k);
}

/**
 * partition splits a project's Kernel into per-cell sub-Kernels by bounded_context (§43), each
 * with its own ratchet. A node with no cell (or an unknown kind) throws — no node lives outside
 * a cell. Deterministic: cells sorted by ref, nodes by id. A cell with no recorded ratchet
 * defaults to "red" (fail closed). Twin of cell.Partition.
 */
export function partition(p: Project): Cell[] {
	const byCell = new Map<string, CellNode[]>();
	for (const n of p.nodes) {
		if (!n.cell) {
			throw new Error(
				`cell: node ${n.id} carries no bounded context (every node lives in a cell)`,
			);
		}
		if (!isKnownKind(n.kind)) {
			throw new Error(`cell: node ${n.id} unknown kind ${n.kind}`);
		}
		const arr = byCell.get(n.cell) ?? [];
		arr.push(n);
		byCell.set(n.cell, arr);
	}
	const refs = [...byCell.keys()].sort();
	return refs.map((ref) => {
		const nodes = [...(byCell.get(ref) ?? [])].sort((x, y) =>
			x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
		);
		const ratchet: RatchetState =
			p.ratchets?.[ref] === "green" ? "green" : "red";
		return { ref, nodes, ratchet };
	});
}

/** contracted reports whether x and y are connected by a HONORED contract (own cell always true). */
export function contracted(x: string, y: string, fed: Federation): boolean {
	if (x === y) {
		return true;
	}
	return fed.contracts.some(
		(c) => c.honored && ((c.a === x && c.b === y) || (c.a === y && c.b === x)),
	);
}

/**
 * cellPack compiles a cell's context frontier (§145): its OWN layers/mirrors/contracts + ONLY
 * the PUBLIC contracts of CONTRACTED neighbors — never a neighbor's internals. Every other
 * neighbor node is excluded, tagged WHY. Deterministic (all lists sorted). Twin of cell.CellPack.
 */
export function cellPack(
	p: Project,
	target: string,
	fed: Federation,
): CellContextPack {
	const ownLayers: string[] = [];
	const ownMirrors: string[] = [];
	const ownContracts: string[] = [];
	const neighborContracts: string[] = [];
	const excluded: Excluded[] = [];

	for (const n of p.nodes) {
		if (n.cell === target) {
			if (n.kind === "layer") {
				ownLayers.push(n.id);
			} else if (n.kind === "mirror") {
				ownMirrors.push(n.id);
			} else if (n.kind === "contract") {
				ownContracts.push(n.id);
			}
			continue;
		}
		if (n.kind === "contract" && n.public) {
			if (contracted(target, n.cell, fed)) {
				neighborContracts.push(n.id);
			} else {
				excluded.push({ id: n.id, cell: n.cell, reason: "no-contract" });
			}
			continue;
		}
		excluded.push({ id: n.id, cell: n.cell, reason: "neighbor-internal" });
	}
	const sortStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	return {
		project: p.id,
		cell: target,
		ownLayers: ownLayers.sort(sortStr),
		ownMirrors: ownMirrors.sort(sortStr),
		ownContracts: ownContracts.sort(sortStr),
		neighborContracts: neighborContracts.sort(sortStr),
		excluded: excluded.sort((x, y) => sortStr(x.id, y.id)),
	};
}

/** packHasNeighborInternal reports whether a pack leaked any neighbor internal (it never should). */
export function packHasNeighborInternal(
	pack: CellContextPack,
	p: Project,
): boolean {
	const byId = new Map(p.nodes.map((n) => [n.id, n]));
	for (const id of pack.neighborContracts) {
		const n = byId.get(id);
		if (!n || n.cell === pack.cell || n.kind !== "contract" || !n.public) {
			return true;
		}
	}
	return false;
}

/**
 * checkCrossCellAccess is the federation wall (§46): an access from→to is refused unless from===to
 * (own cell) or a HONORED contract connects them. Returns null when allowed, else a typed
 * BlockReason (CROSS_CELL_NO_CONTRACT) naming the fix path. Twin of cell.CheckCrossCellAccess.
 */
export function checkCrossCellAccess(
	from: string,
	to: string,
	fed: Federation,
): BlockReason | null {
	if (contracted(from, to, fed)) {
		return null;
	}
	return {
		code: CODE_CROSS_CELL_NO_CONTRACT,
		message: `cell "${from}" cannot access cell "${to}": no honored contracts_with link connects them (a bounded context crosses only via a versioned, Pact-verified contract — KRD §46)`,
		howToFix: [
			`design a contracts_with link between "${from}" and "${to}" in the Context-Map (S101), versioned and Pact-verified`,
			"or work inside the cell's own bounded context (an agent in cell X sees only its own Kernel + contracted neighbors' public contracts)",
		],
	};
}

/** ships reports whether a cell ships — iff its own ratchet is green (§43 fractal). */
export function ships(c: Cell): boolean {
	return c.ratchet === "green";
}

/** shippableCells returns the sorted refs of the cells that ship — independent per cell. */
export function shippableCells(cells: Cell[]): string[] {
	return cells
		.filter(ships)
		.map((c) => c.ref)
		.sort();
}
