/**
 * Archive curation + QD selection — the Workbench /archive-curation source (AIDOS step S26).
 *
 * KRD §44.4 (ArchiveCurationPolicy) + §62 / §123 (quality-diversity, MAP-Elites): the curation
 * policy keeps the version DAG a LIVING MEMORY rather than an infinite dump (a `décharge`) by
 * classifying each node keep / compress / tombstone; the QD selection keeps ONE élite per
 * behavioral niche. Critical history is NEVER destroyed — a tombstone MARKS a node (append-only),
 * a compress SUMMARIZES it; neither deletes. The keystone: a variant enters a niche ONLY IF it has
 * a GREEN mirror — the Judge is the deterministic mirror, never the score.
 *
 * This module is the DECLARED TWIN of the Go deciders back/archive/curation/Curate and
 * back/archive/qd/Elites — the SAME three declared bands, the SAME safety precedence
 * (tombstone > keep > compress, keep the conservative default), the SAME MAP-Elites rule (one
 * green-mirror élite per niche by max anchored fitness). One semantics, no drift — so the
 * /archive-curation panel renders EXACTLY the verdicts the Go deciders compute.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock (`now` is a
 * parameter), no rng, no I/O — so the same input always yields the same verdicts. The
 * reproducibility mirror lib/archive-curation.test.ts (fast-check) pins determinism,
 * any-unsafe⇒tombstone, keep-band⇒keep, no-node-dropped, no-green⇒no-élite, one-élite-per-niche.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /archive-curation PROJECTS the verdicts;
 * recording a decision/élite rides the S20 ChangeSet path under the `aidos` writer role — never a
 * write from this screen. The agent DB role is SELECT-only on dag.curation_decision / dag.niche_elite.
 */

/** A curation band — the closed set KRD §44.4 names. */
export type Verdict = "keep" | "compress" | "tombstone";

/** A declared node flag the membership predicates read (never learned), mirrors curation.Flag. */
export type Flag =
	| "unsafe"
	| "obsolete_experiment"
	| "pareto_elite"
	| "incident_related"
	| "high_novelty"
	| "failed"
	| "duplicate_behavior";

/** A DAG node handed to the curator (mirrors curation.Node). */
export interface Node {
	id: string;
	/** The node kind; "stable_phase" is a keep band member. */
	kind?: string;
	/** The declared metadata the predicates read. */
	flags: Flag[];
	/** The node's creation instant (ISO-8601) for the `>30d` age predicate; empty = unknown. */
	createdAt?: string;
}

/** A curation decision for one node (mirrors curation.CurationDecision). */
export interface CurationDecision {
	nodeId: string;
	verdict: Verdict;
	/** The band/predicate that decided the verdict (e.g. "tombstone:unsafe"). */
	reason: string;
}

/** The age threshold for the compress band: a failed variant compresses only after 30 days. */
const COMPRESS_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const TOMBSTONE_FLAGS: Flag[] = ["unsafe", "obsolete_experiment"];
const KEEP_FLAGS: Flag[] = ["pareto_elite", "incident_related", "high_novelty"];
const KEEP_KINDS = ["stable_phase"];
const COMPRESS_FLAGS: Flag[] = ["duplicate_behavior"];
const COMPRESS_AGED_FLAGS: Flag[] = ["failed"];

/**
 * classify is the per-node decision following the safety PRECEDENCE tombstone > keep > compress,
 * with keep the conservative default (when in doubt, KEEP, never drop). Mirrors curation.classify.
 */
function classify(n: Node, now: number): { verdict: Verdict; reason: string } {
	const has = (f: Flag) => n.flags.includes(f);
	for (const f of TOMBSTONE_FLAGS)
		if (has(f)) return { verdict: "tombstone", reason: `tombstone:${f}` };
	for (const f of KEEP_FLAGS)
		if (has(f)) return { verdict: "keep", reason: `keep:${f}` };
	if (n.kind && KEEP_KINDS.includes(n.kind))
		return { verdict: "keep", reason: `keep:kind=${n.kind}` };
	for (const f of COMPRESS_FLAGS)
		if (has(f)) return { verdict: "compress", reason: `compress:${f}` };
	for (const f of COMPRESS_AGED_FLAGS) {
		if (has(f) && n.createdAt) {
			const created = Date.parse(n.createdAt);
			if (!Number.isNaN(created) && now - created > COMPRESS_AGE_MS) {
				return { verdict: "compress", reason: `compress:${f}_after_30d` };
			}
		}
	}
	return { verdict: "keep", reason: "keep:default" };
}

/**
 * curate is the PURE curation decision — the deterministic twin of the Go curation.Curate
 * (KRD §44.4). Every input node yields EXACTLY one decision in input order (tombstone/compress
 * never drop a node — append-only). `now` is a parameter (never Date.now()) so it is replayable.
 */
export function curate(nodes: Node[], now: number): CurationDecision[] {
	return nodes.map((n) => {
		const { verdict, reason } = classify(n, now);
		return { nodeId: n.id, verdict, reason };
	});
}

/** A variant's mirror verdict — the deterministic Judge (mirrors qd.MirrorStatus). */
export type MirrorStatus = "green" | "red";

/** A QD candidate variant (mirrors qd.Variant). */
export interface Variant {
	id: string;
	/** The declared behavioral niche descriptor (the niche key), e.g. "createOrder/discount". */
	niche: string;
	/** The mirror verdict — only green admits the variant into a niche. */
	mirror: MirrorStatus;
	/** The anchored fitness consumed from the prior fitness steps (never coined here). */
	fitness: number;
}

/** A niche cell: its key, its single élite (or null = empty cell, red-mirror-only candidates). */
export interface NicheCell {
	niche: string;
	elite: Variant | null;
}

/**
 * elites is the PURE MAP-Elites selection — the deterministic twin of the Go qd.Elites (KRD §62):
 * ONE élite per niche, the green-mirror variant with MAX anchored fitness (ties by smaller id). A
 * red-mirror variant is NEVER an élite, WHATEVER its fitness (the anti-Goodhart anchor). It never
 * invents a niche/fitness — every élite traces to a real input variant.
 */
export function elites(variants: Variant[]): Map<string, Variant> {
	const out = new Map<string, Variant>();
	for (const v of variants) {
		if (v.mirror !== "green") continue; // the keystone: no promotion without a green mirror.
		const cur = out.get(v.niche);
		if (
			!cur ||
			v.fitness > cur.fitness ||
			(v.fitness === cur.fitness && v.id < cur.id)
		) {
			out.set(v.niche, v);
		}
	}
	return out;
}

/**
 * nicheGrid renders the MAP-Elites grid: one cell PER distinct niche present in the input variants,
 * each carrying its single élite OR null (an EMPTY cell when the niche's only candidates have red
 * mirrors — "no promotion without a green mirror" made visible). Cells are sorted by niche key for
 * a stable, byte-deterministic render.
 */
export function nicheGrid(variants: Variant[]): NicheCell[] {
	const winners = elites(variants);
	const niches = [...new Set(variants.map((v) => v.niche))].sort((a, b) =>
		a < b ? -1 : a > b ? 1 : 0,
	);
	return niches.map((niche) => ({ niche, elite: winners.get(niche) ?? null }));
}
