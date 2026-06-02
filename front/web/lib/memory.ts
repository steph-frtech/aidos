/**
 * Memory adapter — the Workbench /memory-backends source (AIDOS step S31).
 *
 * KRD §136 / §119.1: the engine-side `/brain` store's memory adapter — write a `MemoryItem` and
 * RECALL it by similarity over embeddings, across the four INDEXABLE KRD memories: episodic /
 * semantic / procedural / structural. Working memory (the live context window) and evolutionary
 * memory (the S24 version DAG) are NOT here.
 *
 * CONTEXT FUEL, NEVER TRUTH: a MemoryItem carries content + provenance + validity_scope +
 * expires_at + confidence + taint, is branch-aware, and — by construction — has NO mirror and NO
 * version-freeze. "Recall" retrieves the nearest items by similarity; it is NOT a truth lookup and
 * NOT a RAG that decides. Nothing here reaches the kernel without a mirror (the MemoryFirewall flow,
 * §119.1, is a separate concern).
 *
 * This module is the DETERMINISTIC TWIN of the Go package back/archive/brain/memory — the SAME four
 * kinds, the SAME closed taint enum, the SAME cosine-similarity recall ordered by score descending,
 * the SAME kind/branch filters, the SAME deterministic seeded embedder (so recall is reproducible
 * under a fixed seed, ADR 0025). One semantics, no drift. The reproducibility mirror
 * lib/memory.test.ts (fast-check) pins it.
 *
 * INJECTION SEAM (ADR 0025): two backends behind one recall — `mock` and `real` — sharing the SAME
 * deterministic embedder so they return the SAME top hit (the backends are interchangeable). The
 * toggle on /memory-backends re-runs recall through the other backend, making the seam observable.
 *
 * READ-ONLY against truth (CLAUDE.md §7, the wall): the /brain store is BELOW the waterline (the
 * agent reads/appends memory); this screen never reaches a truth schema.
 */

/** The closed taint enum (twin of memory.Taint) — a memory's provenance-quality markers. */
export type Taint =
	| "unverified"
	| "stale"
	| "user_claim"
	| "incident_derived"
	| "external_source";

/** The closed taint enum in canonical order (twin of memory.Taints). */
export const TAINTS: Taint[] = [
	"unverified",
	"stale",
	"user_claim",
	"incident_derived",
	"external_source",
];

/** The four INDEXABLE KRD memories (twin of memory.Kind). Closed — no working/evolutionary. */
export type Kind = "episodic" | "semantic" | "procedural" | "structural";

/** The four kinds in canonical order (twin of memory.Kinds). */
export const KINDS: Kind[] = [
	"episodic",
	"semantic",
	"procedural",
	"structural",
];

/** A backend behind the Store port — observable in the UI toggle (twin of MockStore/PgxStore). */
export type Backend = "mock" | "real";

/** One entry of the /brain store — context fuel, never truth (twin of memory.MemoryItem). */
export interface MemoryItem {
	readonly id: string;
	readonly kind: Kind;
	readonly content: string;
	readonly provenance: string;
	readonly validityScope: string;
	readonly expiresAt: string;
	readonly confidence: number;
	readonly taint: readonly Taint[];
	readonly branch: string;
}

/** A recall query (twin of memory.RecallQuery). kind/branch are optional filters; k bounds hits. */
export interface RecallQuery {
	readonly queryText: string;
	readonly kind?: Kind;
	readonly branch?: string;
	readonly k: number;
}

/** One recalled memory + its similarity score (twin of memory.Hit). Higher = nearer. */
export interface Hit {
	readonly item: MemoryItem;
	readonly score: number;
}

/** The fixed embedding dimension (ADR 0025, vector(384)). */
export const EMBEDDING_DIM = 384;

/**
 * fnv1a — a small deterministic 32-bit hash (twin role of the Go SHA-256 bucketing). It namespaces
 * with the seed so the embedding space is reproducible and explicitly seeded.
 */
function fnv1a(seed: number, token: string): number {
	let h = (2166136261 ^ seed) >>> 0;
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}

/**
 * embed — the deterministic, model-free embedder (ADR 0025 twin). Maps text to a fixed
 * EMBEDDING_DIM vector by a seeded hashed bag-of-tokens, then L2-normalizes it. Same text + seed ⇒
 * same vector, always — so recall is reproducible under a fixed seed. The two UI backends use two
 * seeds yet the same scheme, so they return the same TOP hit (interchangeable).
 */
export function embed(seed: number, text: string): number[] {
	const vec = new Array<number>(EMBEDDING_DIM).fill(0);
	const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
	for (const tok of tokens) {
		const h = fnv1a(seed, tok);
		const idx = h % EMBEDDING_DIM;
		const sign = (h & 0x100) === 0 ? 1 : -1;
		vec[idx] += sign;
	}
	let sumSq = 0;
	for (const v of vec) sumSq += v * v;
	if (sumSq === 0) return vec;
	const norm = Math.sqrt(sumSq);
	for (let i = 0; i < vec.length; i++) vec[i] /= norm;
	return vec;
}

/** cosineSimilarity — twin of memory.cosineSimilarity; in [-1, 1], 0 for a zero vector. */
export function cosineSimilarity(
	a: readonly number[],
	b: readonly number[],
): number {
	if (a.length !== b.length) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** The per-backend embedder seed (ADR 0025). The mock matches the Go fixture seed (31). */
export const BACKEND_SEED: Record<Backend, number> = { mock: 31, real: 7 };

/**
 * recall — the SHARED pure recall core (twin of memory.rankHits). Embeds the query with the
 * backend's seed, scores every candidate by cosine similarity, applies the kind/branch filters,
 * orders by score descending (ties broken by id ascending for determinism), truncates to k. Pure:
 * same inputs ⇒ same hits. Touches only the given items — never a truth schema.
 */
export function recall(
	backend: Backend,
	items: readonly MemoryItem[],
	query: RecallQuery,
): Hit[] {
	const seed = BACKEND_SEED[backend];
	const queryVec = embed(seed, query.queryText);
	const hits: Hit[] = [];
	for (const c of items) {
		if (query.kind && c.kind !== query.kind) continue;
		if (query.branch && c.branch !== query.branch) continue;
		hits.push({
			item: c,
			score: cosineSimilarity(queryVec, embed(seed, c.content)),
		});
	}
	hits.sort((x, y) =>
		y.score !== x.score ? y.score - x.score : x.item.id < y.item.id ? -1 : 1,
	);
	return query.k >= 0 ? hits.slice(0, query.k) : hits;
}
