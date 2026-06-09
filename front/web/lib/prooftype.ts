/**
 * The E0-E7 proof-typing twin — the Workbench /proof-type source (AIDOS FK05, KRD FKE-16).
 *
 * The DECLARED projection of the Go package back/kernel/mirror/prooftype: the EXPAND half of the
 * E0-E7 migration. It declares the N0-N5 → E0-E7 mapping as a pure function and the additive,
 * E-typed proof contract a kernel carries. The *expand* step adds E-typing ALONGSIDE the
 * N-levels (it modifies no existing N-typed mirror — "zéro miroir N existant modifié"); the
 * *contract* step (the dry schema switch) is FK16, post-S117.
 *
 * The added types (FK05 objective) are reached only via the right gate:
 *   - E4 (security: gosec/gitleaks/evals-injection) ⇐ the S (sécurité) facet,
 *   - E6 (runtime proof / monitoring / rollback)    ⇐ the R (fiabilité) or V (évolutivité) facet,
 *   - E7 (formal / quasi-formal)                     ⇐ the rare formal-cap flag (T2), never an N or facet.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): mapNToE, facetEvidence, contractFor and tag are PURE &
 * TOTAL — no clock, no rng, no I/O, no LLM. The Go package is the AUTHORITATIVE truth; this twin
 * reproduces it for the screen. The reproducibility mirror lib/prooftype.test.ts (fast-check)
 * pins same-input ⇒ same-output.
 *
 * READ-ONLY (the wall): /proof-type COMPUTES and DISPLAYS the E-typed contract; it never writes
 * truth. The N-label is set by S06, the facet-set at the FK02 door, never from this screen.
 */

import type { FacetLetter } from "./grid";

/** The six KRD N0-N5 proof levels (the V-slices, Livre IV §14), canonical order. Closed, declared. */
export type NLevel = "N0" | "N1" | "N2" | "N3" | "N4" | "N5";

export const N_LEVELS: NLevel[] = ["N0", "N1", "N2", "N3", "N4", "N5"];

/** Canonical KRD name of each N-level (français — what the slice proves). */
export const N_NAME: Record<NLevel, string> = {
	N0: "intention / parcours",
	N1: "métier / invariant ∀",
	N2: "fonctionnel / workflow",
	N3: "contrat / port",
	N4: "code / unitaire",
	N5: "infra / adaptateur",
};

/** The eight KRD E0-E7 evidence levels (FKE-16), an ordered ladder E0(none)…E7(formal). */
export type ELevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const E_LEVELS: ELevel[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Canonical KRD name of each E-level (français — the evidence-first taxonomy). */
export const E_NAME: Record<ELevel, string> = {
	0: "aucune",
	1: "syntaxe / typecheck / lint",
	2: "tests unitaires",
	3: "contrat / intégration",
	4: "sécurité / régression",
	5: "fuzz / mutation / benchmark / evals",
	6: "runtime / monitoring / rollback",
	7: "preuve formelle / quasi-formelle",
};

/**
 * The CLOSED, DECLARED N0-N5 → E0-E7 mapping (KRD FKE-16 mapping line). Declared, never learned
 * (§8). Each N maps to the evidence its slice inherently requires:
 *   N0 journey   → E3 ; N1 invariant → E5 ; N2 workflow → E3 ; N3 contrat → E3 ;
 *   N4 unit      → E1,E2 ; N5 infra → E3,E4.
 */
const N_TO_E: Record<NLevel, ELevel[]> = {
	N0: [3],
	N1: [5],
	N2: [3],
	N3: [3],
	N4: [1, 2],
	N5: [3, 4],
};

/**
 * mapNToE — the PURE, TOTAL N→E mapping. Returns the (fresh, sorted-ascending) evidence set an
 * N-level inherently requires. TOTAL: an unknown N maps to the EMPTY set (never a throw). The
 * reproducibility-mirror'd function (same N → same E set).
 */
export function mapNToE(n: NLevel | string): ELevel[] {
	const src = N_TO_E[n as NLevel];
	if (!src) return [];
	return [...src].sort((a, b) => a - b);
}

/**
 * The DECLARED facet → ADDED-evidence table (FK05: "ajoute explicitement E4 sécurité, E6 runtime
 * et E7 formel au MÊME contrat"). These E-levels are earned by INSTANTIATING the facet (FK02):
 *   S → E4 ; R → E6 ; I → E5 ; B → E5 ; V → E6 ; M → E1.
 * F adds nothing (its evidence IS the N→E base mapping). X is SOFT (§13.6) — it adds no hard E.
 */
const FACET_TO_E: Partial<Record<FacetLetter, ELevel[]>> = {
	S: [4],
	R: [6],
	I: [5],
	B: [5],
	V: [6],
	M: [1],
};

/**
 * facetEvidence — the PURE, TOTAL facet → added-E mapping. Returns the (fresh, sorted) E-levels a
 * facet ADDS when instantiated. F and X map to the EMPTY set (X never adds a hard E — §13.6).
 */
export function facetEvidence(f: FacetLetter): ELevel[] {
	const src = FACET_TO_E[f];
	if (!src) return [];
	return [...src].sort((a, b) => a - b);
}

/** The FK05 input read-model: a kernel's legacy N-label + the facets it instantiates + a formal flag. */
export interface KernelProof {
	nLevel: NLevel | string;
	facets: FacetLetter[];
	requiresFormal: boolean;
}

/** The FK05 output: the additive, E-typed proof contract (the double-label's E half). */
export interface EvidenceContract {
	nLevel: NLevel | string;
	fromN: ELevel[];
	fromFacets: ELevel[];
	required: ELevel[];
}

/** The canonical FK02 facet order (so the union is stable regardless of input order). */
const FACET_ORDER: FacetLetter[] = ["F", "I", "S", "B", "R", "V", "M", "X"];

/**
 * contractFor — the PURE, TOTAL composition (FK05 core). Builds the E-typed contract from the
 * N-label and facets WITHOUT touching either input (additive). Required = MapNToE(N) ∪
 * Σ facetEvidence(f) ∪ (E7 iff requiresFormal), sorted & deduplicated. DETERMINISTIC &
 * order-independent.
 */
export function contractFor(k: KernelProof): EvidenceContract {
	const fromN = mapNToE(k.nLevel);

	const seen = new Set<ELevel>();
	const fromFacets: ELevel[] = [];
	for (const f of FACET_ORDER) {
		if (!k.facets.includes(f)) continue;
		for (const e of facetEvidence(f)) {
			if (!seen.has(e)) {
				seen.add(e);
				fromFacets.push(e);
			}
		}
	}
	fromFacets.sort((a, b) => a - b);

	const req = new Set<ELevel>([...fromN, ...fromFacets]);
	if (k.requiresFormal) req.add(7);
	const required = [...req].sort((a, b) => a - b);

	return { nLevel: k.nLevel, fromN, fromFacets, required };
}

/** The double-étiquetage additif record: the preserved N alongside the derived E contract. */
export interface EvidenceTag {
	n: NLevel | string;
	e: EvidenceContract;
}

/**
 * tag — the PURE additive double-labeller (FK05). Returns the EvidenceTag pairing the PRESERVED N
 * (copied verbatim — "zéro miroir N existant modifié") with the DERIVED E contract. Mutates nothing.
 */
export function tag(k: KernelProof): EvidenceTag {
	return { n: k.nLevel, e: contractFor(k) };
}
