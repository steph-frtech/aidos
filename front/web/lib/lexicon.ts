/**
 * The Lexicon projection — the Workbench /lexicon source (AIDOS step FK14).
 *
 * KRD FKE-21 / ROADMAP FK14: a concept NAMED across the 16 layers as a single source, and a PURE
 * inter-layer linter that detects a symbol OUT of that lexicon, per layer — a language drift made
 * verifiable by computation. The 16 layers (FKE-21): human, bdd, code, test, db, api, event, log,
 * metric, mcp, skill, agent, doc, ci, policy, memory.
 *
 * This module is the DECLARED projection of the Go package back/kernel/lexicon — the SAME closed
 * 16-layer set, the SAME three drift kinds (RENAMED / UNKNOWN_SYMBOL / UNKNOWN_LAYER), the SAME
 * stable drift order — so the /lexicon panel lints exactly as the Go Lint computes. One source,
 * no drift.
 *
 * THE STORAGE FORK (tranché ici, FK14): a lexicon rides inside a content-addressed kernel.link body
 * (link_kind:"lexicon"), NOT a new record kind. serializeBody mirrors the Go body shape (the symbols
 * emitted in the closed layer order, so the body is map-order independent).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O,
 * NO LLM — so the same (lexicon, observations) always yields the same drifts. The judge is a
 * set-membership check, never a prompt. The reproducibility mirror lib/lexicon.test.ts (fast-check)
 * pins determinism, the "drift = pure function of lexicon + symbols" law, and the stable order.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /lexicon LINTS; it never writes truth.
 * Freezing/updating a lexicon goes via propose → /goal → approval, never from this screen.
 */

/** The lexicon link-kind discriminator (mirrors the Go body's link_kind:"lexicon"). */
export const LEXICON_KIND = "lexicon" as const;

/** The 16 closed layers, in canonical order (FKE-21). The order is the contract (drift sort key). */
export const LAYERS = [
	"human",
	"bdd",
	"code",
	"test",
	"db",
	"api",
	"event",
	"log",
	"metric",
	"mcp",
	"skill",
	"agent",
	"doc",
	"ci",
	"policy",
	"memory",
] as const;

export type Layer = (typeof LAYERS)[number];

/** isKnownLayer reports whether l is one of the 16 closed layers. */
export function isKnownLayer(l: string): l is Layer {
	return (LAYERS as readonly string[]).includes(l);
}

/** layerIndex is the canonical position of a layer (unknown layers sort last). */
export function layerIndex(l: string): number {
	const i = (LAYERS as readonly string[]).indexOf(l);
	return i === -1 ? LAYERS.length : i;
}

/** A Lexicon Kernel binds ONE concept to its legal symbol in each named layer. */
export type LexiconKernel = {
	concept: string;
	symbols: Partial<Record<Layer, string>>;
};

/** An Observation is a symbol seen in some layer (a real table/function/metric name). */
export type Observation = { layer: string; symbol: string };

/** The closed reason an observation is out of lexicon (mirrors lexicon.DriftKind). */
export type DriftKind = "UNKNOWN_LAYER" | "UNKNOWN_SYMBOL" | "RENAMED";

/** A Drift is one out-of-lexicon observation. */
export type Drift = {
	layer: string;
	symbol: string;
	expected?: string;
	kind: DriftKind;
};

/**
 * lint is the PURE inter-layer linter (FK14). For each observation:
 *  1. the layer is one of the 16 closed layers — else UNKNOWN_LAYER;
 *  2. the lexicon pins a symbol for the concept in that layer — else UNKNOWN_SYMBOL;
 *  3. the observed symbol EQUALS the lexicon's symbol — else RENAMED.
 * Returns every drift in a stable order (layer canonical index, then symbol). Total, deterministic.
 */
export function lint(k: LexiconKernel, obs: Observation[]): Drift[] {
	const drifts: Drift[] = [];
	for (const o of obs) {
		if (!isKnownLayer(o.layer)) {
			drifts.push({ layer: o.layer, symbol: o.symbol, kind: "UNKNOWN_LAYER" });
			continue;
		}
		const want = k.symbols[o.layer];
		if (want === undefined) {
			drifts.push({ layer: o.layer, symbol: o.symbol, kind: "UNKNOWN_SYMBOL" });
			continue;
		}
		if (o.symbol !== want) {
			drifts.push({
				layer: o.layer,
				symbol: o.symbol,
				expected: want,
				kind: "RENAMED",
			});
		}
	}
	drifts.sort((a, b) => {
		const li = layerIndex(a.layer);
		const lj = layerIndex(b.layer);
		if (li !== lj) return li - lj;
		return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
	});
	return drifts;
}

/** clean reports whether the observations are wholly IN lexicon (no drift) — the green verdict. */
export function clean(k: LexiconKernel, obs: Observation[]): boolean {
	return lint(k, obs).length === 0;
}

/** A validation refusal (mirrors lexicon.Err*). */
export type ValidateError =
	| "NO_CONCEPT"
	| "UNKNOWN_LAYER"
	| "EMPTY_SYMBOL"
	| null;

/** validate checks a LexiconKernel's shape; returns null when valid, else the closed refusal code. */
export function validate(k: LexiconKernel): ValidateError {
	if (!k.concept) return "NO_CONCEPT";
	for (const [layer, sym] of Object.entries(k.symbols)) {
		if (!isKnownLayer(layer)) return "UNKNOWN_LAYER";
		if (!sym) return "EMPTY_SYMBOL";
	}
	return null;
}

/**
 * serializeBody renders the content-addressed kernel.link body carrying the Lexicon Kernel — the
 * storage fork (a lexicon rides inside a kernel.link body, link_kind:"lexicon"). The symbols are
 * emitted in the closed layer order so the body is independent of object key order. Mirrors the Go
 * SerializeBody body shape.
 */
export function serializeBody(k: LexiconKernel): string {
	const pairs = LAYERS.filter((l) => k.symbols[l] !== undefined).map((l) => ({
		layer: l,
		symbol: k.symbols[l] as string,
	}));
	return JSON.stringify({
		kind: "link",
		link_kind: LEXICON_KIND,
		concept: k.concept,
		symbols: pairs,
	});
}
