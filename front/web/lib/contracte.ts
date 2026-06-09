/**
 * The E0-E7 CONTRACT-bascule twin — the Workbench /proof-levels source post-FK16 (KRD FKE-16).
 *
 * The DECLARED projection of the Go package back/kernel/mirror/contracte: the CONTRACT half of the
 * E0-E7 migration — the LAST step of the FK track. FK05 (lib/prooftype.ts) was the EXPAND (the
 * N→E mapping declared alongside the N-levels). This twin is the *contract*: it re-labels the
 * existing N-typed mirror corpus to E0-E7 WITHOUT LOSS — each mirror carries its DERIVED E
 * (from the deterministic proof it runs) AND its PRESERVED, now-Deprecated N-label.
 *
 * "N déprécié via lifecycle, jamais supprimé" (FK16): NLifecycle marks the N-label Active (the
 * pre-FK16 source) or Deprecated (preserved-for-provenance only, post-FK16) — never deleted.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): certToE, kindToE, mirrorE, relabel and deprecate are PURE &
 * TOTAL — no clock, no rng, no I/O, no LLM. The Go package is the AUTHORITATIVE truth; this twin
 * reproduces it for the screen. The reproducibility mirror lib/contracte.test.ts (fast-check) pins
 * same-input ⇒ same-output.
 *
 * READ-ONLY (the wall): /proof-levels COMPUTES and DISPLAYS the E-typed corpus; it never writes
 * truth. The actual schema switch (the evidence_level column, the n_lifecycle deprecation) is an
 * expand-contract Postgres migration applied by the privileged aidos role, gated by DataTruthScope.
 */

import { E_NAME, type ELevel } from "./prooftype";

export { E_LEVELS, E_NAME, type ELevel } from "./prooftype";

/** The certification languages a mirror can be written in (KRD §34), closed set. */
export type CertLanguage =
	| "gherkin"
	| "xstate"
	| "fast-check"
	| "rapid"
	| "zod"
	| "pact"
	| "type-check"
	| "k6"
	| "fixture"
	| "snapshot"
	| "unit"
	| "prose";

/** The natures of proof a mirror runs (KRD §34), closed set. */
export type TestKind =
	| "acceptance"
	| "e2e"
	| "property"
	| "fixture"
	| "contract"
	| "schema"
	| "unit"
	| "snapshot"
	| "meter";

/** The lifecycle of the legacy N-label across the bascule. Never deleted (append-only). */
export type NLifecycle = "active" | "deprecated";

/** Non-executable certs attain E0 (no evidence; KRD §805) regardless of test_kind. */
const NON_EXECUTABLE: ReadonlySet<CertLanguage> = new Set<CertLanguage>([
	"prose",
]);

/**
 * The CLOSED, DECLARED cert_language → attained E-level table (FK16). The max evidence rung the
 * language reaches. Declared, never learned (§8). A cert absent here attains E0 (the floor).
 */
const CERT_TO_E: Record<CertLanguage, ELevel> = {
	gherkin: 3,
	xstate: 3,
	"fast-check": 5,
	rapid: 5,
	zod: 1,
	pact: 3,
	"type-check": 1,
	k6: 5,
	fixture: 3,
	snapshot: 2,
	unit: 2,
	prose: 0,
};

/** certToE — PURE, TOTAL cert_language → attained E (unknown → E0). */
export function certToE(c: CertLanguage | string): ELevel {
	if (!Object.hasOwn(CERT_TO_E, c)) return 0;
	return CERT_TO_E[c as CertLanguage];
}

/**
 * The CLOSED, DECLARED test_kind → attained E-level table (FK16), the second lens (the NATURE of
 * the proof). Declared, never learned. A kind absent here attains E0.
 */
const KIND_TO_E: Record<TestKind, ELevel> = {
	acceptance: 3,
	e2e: 3,
	property: 5,
	fixture: 3,
	contract: 3,
	schema: 1,
	unit: 2,
	snapshot: 2,
	meter: 6,
};

/** kindToE — PURE, TOTAL test_kind → attained E (unknown → E0). */
export function kindToE(k: TestKind | string): ELevel {
	if (!Object.hasOwn(KIND_TO_E, k)) return 0;
	return KIND_TO_E[k as TestKind];
}

/**
 * mirrorE — the PURE, TOTAL evidence level a mirror ATTAINS (FK16 core). MAX of the two lenses
 * (cert language × proof nature), EXCEPT a non-executable cert (prose) attains E0 regardless of
 * kind — a proof that does not run is no evidence (KRD §805). DETERMINISTIC.
 */
export function mirrorE(
	k: TestKind | string,
	c: CertLanguage | string,
): ELevel {
	if (NON_EXECUTABLE.has(c as CertLanguage)) return 0;
	const ce = certToE(c);
	const ke = kindToE(k);
	return (ce >= ke ? ce : ke) as ELevel;
}

/** deprecate — the PURE monotone lifecycle transition: always Deprecated, never reverses. */
export function deprecate(_s: NLifecycle): NLifecycle {
	return "deprecated";
}

/** The FK16 input read-model of one existing mirror. */
export interface MirrorIn {
	mirrorId: string;
	testKind: TestKind | string;
	certLanguage: CertLanguage | string;
	n: string;
}

/** The FK16 output re-labelling of one mirror: preserved N + lifecycle + derived E. */
export interface MirrorTag {
	mirrorId: string;
	n: string;
	nLifecycle: NLifecycle;
	e: ELevel;
	eName: string;
}

/** relabelOne — PURE per-record bascule: derive E, preserve N, deprecate N. */
export function relabelOne(m: MirrorIn): MirrorTag {
	const e = mirrorE(m.testKind, m.certLanguage);
	return {
		mirrorId: m.mirrorId,
		n: m.n,
		nLifecycle: "deprecated",
		e,
		eName: E_NAME[e],
	};
}

/** relabel — PURE, TOTAL corpus bascule with ZERO LOSS; output order mirrors input. */
export function relabel(corpus: MirrorIn[]): MirrorTag[] {
	return corpus.map(relabelOne);
}

/**
 * noLoss — the computed "zéro perte" predicate: one tag per input, same ids in order, each tag
 * keeping its N (never empty) and Deprecated. The bascule is only legal when this holds.
 */
export function noLoss(corpus: MirrorIn[], tags: MirrorTag[]): boolean {
	if (corpus.length !== tags.length) return false;
	return corpus.every(
		(m, i) =>
			tags[i].mirrorId === m.mirrorId &&
			tags[i].n === m.n &&
			tags[i].nLifecycle === "deprecated",
	);
}

/** eHistogram — count re-labelled mirrors per E-level (E0..E7), every rung zero-filled. */
export function eHistogram(tags: MirrorTag[]): Record<ELevel, number> {
	const h = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as Record<
		ELevel,
		number
	>;
	for (const t of tags) h[t.e] += 1;
	return h;
}
