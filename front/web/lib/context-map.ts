/**
 * The CONTEXT-MAP twin — the Workbench /context-map source (AIDOS S101).
 *
 * The DECLARED projection of the Go package back/kernel/contextmap: the DESIGN of the
 * federation's edges — the inter-cell CONTRACT PAIRS (consumer expectation ↔ provider surface)
 * verified by Pact, "le seul vrai travail humain" (KRD §46). "L'architecture est conçue,
 * jamais générée." A pair is HONORED iff the provider publishes a SUPERSET of what the consumer
 * expects (matching method/path, every required field, matching status). A cross-cell call that
 * VIOLATES the contract (an unhonored or absent pair) is REFUSED (CROSS_CELL_NO_CONTRACT).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): verifyPair / verifyAll / checkCrossCellCall are PURE
 * functions of their input — no clock, no rng, no I/O, no LLM — and canonicalise (sort) before
 * rendering, so the SAME Context-Map → byte-identical verdicts + hash. The Go output is the
 * AUTHORITATIVE truth; this twin reproduces it for the screen. The reproducibility mirror
 * lib/context-map.test.ts (fast-check) pins determinism + the two done-criteria.
 *
 * THE WALL (the wall): /context-map DESIGNS + VERIFIES + PROPOSES; it never writes truth. The
 * Context-Map persists as Kernel truth ONLY via a DRAFT ChangeSet (propose → ChangeSet →
 * approval) — `propose` returns the envelope; it does not persist it.
 */

export interface Interaction {
	method: string;
	path: string;
	fields: string[];
	status: number;
}

export interface CellSurface {
	cell: string;
	published: Interaction[];
}

export interface ContractPair {
	consumer: string;
	provider: string;
	expected: Interaction[];
}

export interface ContextMap {
	project: string;
	cells: string[];
	surfaces: CellSurface[];
	pairs: ContractPair[];
}

export type PairReason =
	| "HONORED"
	| "NO_INTERACTION"
	| "UNKNOWN_CELL"
	| "PATH_MISMATCH"
	| "CONSUMER_FIELD_UNPUBLISHED"
	| "STATUS_MISMATCH";

export interface PairVerdict {
	consumer: string;
	provider: string;
	honored: boolean;
	reason: PairReason;
	detail?: string;
}

export interface BlockReason {
	code: string;
	message: string;
	howToFix: string[];
}

/** The single S101/S100 cross-cell refusal code (Go twin: cell.CodeCrossCellNoContract). */
export const CODE_CROSS_CELL_NO_CONTRACT = "CROSS_CELL_NO_CONTRACT";

const sortStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sortedFields(fields: string[]): string[] {
	return [...new Set(fields)].sort(sortStr);
}

function statusMatches(expected: number, published: number): boolean {
	return expected === 0 || published === 0 || expected === published;
}

function publishedFor(map: ContextMap, provider: string): Interaction[] {
	return map.surfaces.find((s) => s.cell === provider)?.published ?? [];
}

function hasCell(map: ContextMap, c: string): boolean {
	return map.cells.includes(c);
}

/**
 * verifyPair runs the pact-verifier semantics for ONE pair: HONORED iff, for EVERY consumer
 * expectation, the provider publishes a matching (method, path) whose status matches AND which
 * publishes every required field. The first violation determines (reason, detail). Pure, total.
 * Twin of contextmap.VerifyPair.
 */
export function verifyPair(map: ContextMap, pair: ContractPair): PairVerdict {
	const base = { consumer: pair.consumer, provider: pair.provider };
	if (!hasCell(map, pair.consumer)) {
		return {
			...base,
			honored: false,
			reason: "UNKNOWN_CELL",
			detail: pair.consumer,
		};
	}
	if (!hasCell(map, pair.provider)) {
		return {
			...base,
			honored: false,
			reason: "UNKNOWN_CELL",
			detail: pair.provider,
		};
	}
	if (pair.expected.length === 0) {
		return { ...base, honored: false, reason: "NO_INTERACTION" };
	}
	const published = publishedFor(map, pair.provider);
	for (const want of pair.expected) {
		const match = published.find(
			(p) => p.method === want.method && p.path === want.path,
		);
		if (!match) {
			return {
				...base,
				honored: false,
				reason: "PATH_MISMATCH",
				detail: `${want.method} ${want.path}`,
			};
		}
		if (!statusMatches(want.status, match.status)) {
			return {
				...base,
				honored: false,
				reason: "STATUS_MISMATCH",
				detail: `${want.method} ${want.path} expects ${want.status}, provider offers ${match.status}`,
			};
		}
		const have = new Set(match.fields);
		for (const f of sortedFields(want.fields)) {
			if (!have.has(f)) {
				return {
					...base,
					honored: false,
					reason: "CONSUMER_FIELD_UNPUBLISHED",
					detail: `${want.method} ${want.path} requires field "${f}"`,
				};
			}
		}
	}
	return { ...base, honored: true, reason: "HONORED" };
}

/** verifyAll verifies every designed pair, sorted (consumer, provider). Twin of VerifyAll. */
export function verifyAll(map: ContextMap): PairVerdict[] {
	return map.pairs
		.map((p) => verifyPair(map, p))
		.sort((a, b) =>
			a.consumer !== b.consumer
				? sortStr(a.consumer, b.consumer)
				: sortStr(a.provider, b.provider),
		);
}

/** contracted reports whether from↔to is connected by a HONORED pair (own cell always true). */
export function contracted(from: string, to: string, map: ContextMap): boolean {
	if (from === to) {
		return true;
	}
	return map.pairs.some((p) => {
		if (!verifyPair(map, p).honored) {
			return false;
		}
		return (
			(p.consumer === from && p.provider === to) ||
			(p.consumer === to && p.provider === from)
		);
	});
}

/**
 * checkCrossCellCall is the federation wall (§46): a call from→to is refused unless from===to or
 * a HONORED pair connects them. A pair that EXISTS but is UNHONORED does NOT authorize the call.
 * Returns null when allowed, else a typed BlockReason. Twin of contextmap.CheckCrossCellCall.
 */
export function checkCrossCellCall(
	from: string,
	to: string,
	map: ContextMap,
): BlockReason | null {
	if (contracted(from, to, map)) {
		return null;
	}
	return {
		code: CODE_CROSS_CELL_NO_CONTRACT,
		message: `cell "${from}" cannot access cell "${to}": no honored contracts_with link connects them (a bounded context crosses only via a versioned, Pact-verified contract — KRD §46)`,
		howToFix: [
			`design a contracts_with pair between "${from}" and "${to}" in the Context-Map (S101), and make it pass Pact (the provider must publish a superset of the consumer's expectation)`,
			"or work inside the cell's own bounded context",
		],
	};
}

/** A DRAFT ChangeSet envelope (the only legal way to persist the Context-Map — the wall). */
export interface ProposedChangeSet {
	status: "DRAFT";
	label: string;
	parentPhase: string;
	specTarget: string;
	verdicts: PairVerdict[];
}

/**
 * canonicalize sorts cells/surfaces/pairs + each interaction's fields so the SAME design yields
 * the SAME bytes (content-addressing). Twin of contextmap.Canonicalize.
 */
export function canonicalize(map: ContextMap): ContextMap {
	const canonInteractions = (xs: Interaction[]): Interaction[] =>
		xs
			.map((i) => ({ ...i, fields: sortedFields(i.fields) }))
			.sort((a, b) =>
				a.method !== b.method
					? sortStr(a.method, b.method)
					: sortStr(a.path, b.path),
			);
	return {
		project: map.project,
		cells: [...new Set(map.cells)].sort(sortStr),
		surfaces: map.surfaces
			.map((s) => ({ cell: s.cell, published: canonInteractions(s.published) }))
			.sort((a, b) => sortStr(a.cell, b.cell)),
		pairs: map.pairs
			.map((p) => ({ ...p, expected: canonInteractions(p.expected) }))
			.sort((a, b) =>
				a.consumer !== b.consumer
					? sortStr(a.consumer, b.consumer)
					: sortStr(a.provider, b.provider),
			),
	};
}

/**
 * stableStringify renders the canonical Context-Map as deterministic JSON — the content-address
 * input. (Object keys are emitted in declaration order by JSON.stringify over a fixed shape.)
 */
export function stableStringify(map: ContextMap): string {
	const c = canonicalize(map);
	return JSON.stringify({ kind: "context-map", ...c });
}

/**
 * propose builds the DRAFT ChangeSet envelope (propose → ChangeSet → approval — the ONLY legal
 * way to persist the Context-Map, the wall). It writes NOTHING; it returns the envelope a human
 * approves. The spec target is a content-address of the canonical design. Twin of Propose.
 */
export function propose(
	map: ContextMap,
	label: string,
	parentPhase: string,
): ProposedChangeSet {
	return {
		status: "DRAFT",
		label,
		parentPhase,
		specTarget: `context-map:${stableStringify(map)}`,
		verdicts: verifyAll(canonicalize(map)),
	};
}
