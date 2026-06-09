/**
 * The facets twin — the Workbench /facets source (AIDOS FK02).
 *
 * The DECLARED projection of the Go package back/kernel/facets: the eight canonical KRD
 * facets (FKE-1.3, F/I/S/B/R/V/M/X), the COLLAPSIBLE facet-set a kernel declares, and the
 * validator that refuses a kernel with no functional facet, an empty facet, or a declared
 * facet missing its proof pair.
 *
 *   F  fonctionnel      — correct par l'exemple (always present, incompressible)
 *   I  invariants       — vrai partout (universal invariants ∀)
 *   S  sécurité         — sûr (scans, policy, injection evals)
 *   B  budgets          — viable (perf/cost budgets)
 *   R  fiabilité        — résilient (chaos, failover, restore, breakers)
 *   V  évolutivité      — durable (expand-contract migration, backfill)
 *   M  maintenabilité   — sain (the 2nd ratchet §47: declared arch ↔ proven structure)
 *   X  expérience       — utilisable (SOFT §13.6 — informs, never blocks)
 *
 * The INCOMPRESSIBLE minimum of any instantiated facet = its intent (s1) + its proof pair
 * (s4↔s5/s6). A declared facet missing its proof pair is a MONSTER (advisory for the soft X).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): validate and hash are PURE, TOTAL functions of a
 * FacetSet — no clock, no rng, no I/O, no LLM. Same FacetSet → same verdict, same hash. The
 * Go Validate/Hash is the AUTHORITATIVE truth; this twin reproduces it for the screen. The
 * reproducibility mirror lib/facets.test.ts (fast-check) pins determinism + the round-trip.
 *
 * READ-ONLY (the wall): /facets COMPUTES and DISPLAYS; it never writes truth. The facet-set
 * is set on a record by the privileged transition at the legal door, never here.
 */

export type FacetLetter = "F" | "I" | "S" | "B" | "R" | "V" | "M" | "X";

/** A facet: its letter, canonical name, and whether it is a soft (X) lens. */
export interface Facet {
	letter: FacetLetter;
	name: string;
	soft: boolean;
}

/** The eight canonical FKE-1.3 lenses in canonical F→X order (the panel filter set). */
export const FACETS: readonly Facet[] = [
	{ letter: "F", name: "fonctionnel", soft: false },
	{ letter: "I", name: "invariants", soft: false },
	{ letter: "S", name: "sécurité", soft: false },
	{ letter: "B", name: "budgets", soft: false },
	{ letter: "R", name: "fiabilité", soft: false },
	{ letter: "V", name: "évolutivité", soft: false },
	{ letter: "M", name: "maintenabilité", soft: false },
	{ letter: "X", name: "expérience", soft: true },
] as const;

const FACET_RANK: Record<string, number> = Object.fromEntries(
	FACETS.map((f, i) => [f.letter, i]),
);

function isCanonical(letter: string): letter is FacetLetter {
	return letter in FACET_RANK;
}

function isSoft(letter: string): boolean {
	return letter === "X";
}

/** One facet a kernel declares it instantiates (the lens + its intent + its proof pair). */
export interface Instance {
	facet: string;
	hasIntent: boolean;
	hasProofPair: boolean;
}

/** The collapsible set of facets a kernel declares it instantiates (FKE-1.3). */
export interface FacetSet {
	kernelId?: string;
	instances: Instance[];
}

/** The validator error classes (mirror of the Go package errors). */
export const ERR_NO_FUNCTIONAL =
	"facets: kernel declares no functional facet (F is incompressible — always present)";
export const ERR_EMPTY_FACET =
	"facets: a declared facet is empty (no intent, no proof pair) — never instantiate an empty facet";
export const ERR_MISSING_PROOF_PAIR =
	"facets: a declared facet is missing its proof pair (intent without proof = monster)";
export const ERR_UNKNOWN_FACET =
	"facets: declared facet is not one of the eight canonical lenses (F/I/S/B/R/V/M/X)";
export const ERR_DUPLICATE_FACET =
	"facets: a facet is declared more than once in the set";

/** One validator finding against a FacetSet. */
export interface Issue {
	facet: string;
	code: string;
	advisory: boolean;
}

/** The verdict of the facet validator for one FacetSet. */
export interface Result {
	valid: boolean;
	hasFunctional: boolean;
	issues: Issue[];
}

/**
 * validate is the deterministic, pure, TOTAL facet validator (FKE-1.3). It checks the
 * three rules of the collapsible facet-set:
 *   1. the FUNCTIONAL facet (F) is present (incompressible) — else ERR_NO_FUNCTIONAL;
 *   2. no declared facet is EMPTY (no intent, no proof pair) — else ERR_EMPTY_FACET;
 *   3. every declared facet has its PROOF PAIR — else ERR_MISSING_PROOF_PAIR (a monster;
 *      advisory only for the soft X facet, §13.6).
 * It also rejects an unknown facet and a duplicate. Total (never throws). Issues are in
 * canonical facet order so the verdict is stable. Valid iff there is no HARD issue.
 */
export function validate(fs: FacetSet): Result {
	const seen = new Set<string>();
	let hasFunctional = false;
	const byFacet = new Map<string, Issue[]>();
	const setIssues: Issue[] = [];

	const push = (f: string, code: string, advisory = false) => {
		const list = byFacet.get(f) ?? [];
		list.push({ facet: f, code, advisory });
		byFacet.set(f, list);
	};

	for (const inst of fs.instances) {
		const f = inst.facet;
		if (!isCanonical(f)) {
			push(f, ERR_UNKNOWN_FACET);
			continue;
		}
		if (seen.has(f)) {
			push(f, ERR_DUPLICATE_FACET);
			continue;
		}
		seen.add(f);
		if (f === "F") hasFunctional = true;

		const empty = !inst.hasIntent && !inst.hasProofPair;
		if (empty) {
			push(f, ERR_EMPTY_FACET);
		} else if (!inst.hasProofPair) {
			push(f, ERR_MISSING_PROOF_PAIR, isSoft(f));
		}
	}

	if (!hasFunctional) {
		setIssues.push({ facet: "", code: ERR_NO_FUNCTIONAL, advisory: false });
	}

	const issues: Issue[] = [...setIssues];
	for (const f of FACETS) {
		const list = byFacet.get(f.letter);
		if (list) {
			issues.push(...list);
			byFacet.delete(f.letter);
		}
	}
	// remaining (unknown facets), sorted by letter for stability.
	const rest = [...byFacet.keys()].sort();
	for (const f of rest) {
		const list = byFacet.get(f);
		if (list) issues.push(...list);
	}

	const valid = !issues.some((is) => !is.advisory);
	return { valid, hasFunctional, issues };
}

/**
 * canonicalize returns the deterministic, order-independent form of a FacetSet's facet
 * declarations: the instances totally ordered (facet rank, then letter, then flags), with
 * kernelId excluded. Two sets that declare the same facets canonicalise identically
 * regardless of declaration order. PURE.
 */
export function canonicalize(fs: FacetSet): Instance[] {
	const out = [...fs.instances];
	out.sort((a, b) => {
		const ra = FACET_RANK[a.facet];
		const rb = FACET_RANK[b.facet];
		const oka = ra !== undefined;
		const okb = rb !== undefined;
		if (oka !== okb) return oka ? -1 : 1;
		if (oka && okb && ra !== rb) return ra - rb;
		if (a.facet !== b.facet) return a.facet < b.facet ? -1 : 1;
		if (a.hasIntent !== b.hasIntent) return a.hasIntent ? 1 : -1;
		if (a.hasProofPair !== b.hasProofPair) return a.hasProofPair ? 1 : -1;
		return 0;
	});
	return out;
}

/**
 * djb2 hex digest — a small, deterministic, dependency-free content address for the facet
 * signature on the screen. (The AUTHORITATIVE address is the Go SHA-256 facets.Hash; this
 * twin only needs order-independence + sensitivity for the panel's round-trip demo.)
 */
function digest(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * hash returns the content-addressed facet signature: the order/kernel-independent digest
 * of the declared facets (the round-trip content-addressed done-criterion). PURE.
 */
export function hash(fs: FacetSet): string {
	const canon = canonicalize(fs);
	const repr = canon
		.map((i) => `${i.facet}:${i.hasIntent ? 1 : 0}:${i.hasProofPair ? 1 : 0}`)
		.join("|");
	return digest(repr);
}

/** A demo kernel carrying its declared facet-set — what the panel validates + filters. */
export interface DemoKernel {
	id: string;
	labelFr: string;
	labelEn: string;
	facetSet: FacetSet;
}

const full = (f: FacetLetter): Instance => ({
	facet: f,
	hasIntent: true,
	hasProofPair: true,
});
const intentOnly = (f: FacetLetter): Instance => ({
	facet: f,
	hasIntent: true,
	hasProofPair: false,
});

/**
 * A small honest catalogue of kernels with different collapsed facet-sets — the panel
 * validates each and lets the user filter by which facet is instantiated. These are the
 * legal shapes from FKE-1.3: a pure function (F+I+M), a PII endpoint (all eight), a
 * declarative view (F+X), and two MONSTERS (no F, and a declared S without its proof pair).
 */
export const DEMO_KERNELS: readonly DemoKernel[] = [
	{
		id: "k-sort",
		labelFr: "Fonction pure de tri",
		labelEn: "Pure sort function",
		facetSet: {
			kernelId: "k-sort",
			instances: [full("F"), full("I"), full("M")],
		},
	},
	{
		id: "k-pii",
		labelFr: "Endpoint PII user-facing",
		labelEn: "PII user-facing endpoint",
		facetSet: {
			kernelId: "k-pii",
			instances: [
				full("F"),
				full("I"),
				full("S"),
				full("B"),
				full("R"),
				full("V"),
				full("M"),
				full("X"),
			],
		},
	},
	{
		id: "k-view",
		labelFr: "Kernel-vue déclaratif",
		labelEn: "Declarative view kernel",
		facetSet: { kernelId: "k-view", instances: [full("F"), full("X")] },
	},
	{
		id: "k-nof",
		labelFr: "MONSTRE : aucune facette fonctionnelle",
		labelEn: "MONSTER: no functional facet",
		facetSet: { kernelId: "k-nof", instances: [full("I"), full("M")] },
	},
	{
		id: "k-nopair",
		labelFr: "MONSTRE : sécurité déclarée sans sa paire de preuve",
		labelEn: "MONSTER: security declared without its proof pair",
		facetSet: {
			kernelId: "k-nopair",
			instances: [full("F"), intentOnly("S")],
		},
	},
] as const;
