/**
 * The weighted, thresholded red-propagation projection — the Workbench /red-propagation source
 * (AIDOS step S19).
 *
 * KRD §112 (la propagation pondérée et seuillée — chaque lien composes porte un poids déclaré, le
 * parent porte un activation_threshold déclaré, fire: activation ← Σ poids(enfants changés); si
 * activation ≥ seuil alors agrégat ROUGE sinon vert; "épingle un défaut, pas un changement") · §114
 * (l'exemple filé view "cart" composes checkout-button{load-bearing}, promo-field{load-bearing},
 * help-link{cosmetic}) · §2463 (le sens backprop: un lien `critical` n'est admis que sur une
 * weight evidence enregistrée) · ADR 0018 (le tier `critical` + la règle d'admission).
 *
 * This module is the DECLARED projection of the Go package back/kernel/propagation — the same §112
 * activation, the same `critical`-needs-evidence admission — so the /red-propagation panel colours
 * each fire row + admission row exactly as the Go FireParent / ValidateWeight compute them. One
 * source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (graph, parent) always yields the same verdict. Weights/thresholds are DECLARED,
 * never learned (§2465). The reproducibility mirror lib/red-propagation.test.ts (fast-check) pins
 * totality/determinism, the cosmetic-does-not-redden invariant, the no-critical-without-evidence
 * invariant, and the monotone tier ordering.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /red-propagation renders the fire/admission verdicts; it
 * never writes truth (the wall). Truth-writes (a composes weight, an activation_threshold) go via
 * propose → ChangeSet → approval, never from this screen.
 */

/** The DECLARED weight of a composes edge (KRD §112 pair + the ADR 0018 `critical` extension). */
export type Weight = "cosmetic" | "load-bearing" | "critical";

/** A parent's aggregate verdict — the closed two-set. */
export type Verdict = "GREEN" | "RED";

/** A PINNED layer reference: an id plus the concrete version it points at (id@version). */
export interface Ref {
	id: string;
	version: string;
}

/** A composes edge as a value, carrying the declared weight + (critical only) weight_evidence. */
export interface Link {
	parent: Ref;
	child: Ref;
	weight: Weight;
	/** A recorded provenance reference (e.g. an incident id); required iff weight === "critical". */
	weightEvidence?: string;
}

/** The minimal read-model of a composite layer the engine needs (mirrors propagation.Parent). */
export interface Parent {
	layerId: string;
	version: string;
	activationThreshold: number;
}

/** The composes graph + the children changed this cut (mirrors propagation.Graph). */
export interface Graph {
	parents: Record<string, Parent>;
	edges: readonly Link[];
	changed?: readonly string[];
}

/** The actionable reason a weight admission was refused (KRD §44.5 codes, mirrors propagation). */
export type BlockCode = "CRITICAL_WEIGHT_WITHOUT_EVIDENCE" | "UNKNOWN_WEIGHT";

/** The actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). */
export interface BlockReason {
	code: BlockCode;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The declared weight tiers in canonical (ascending activation) order — never invented downstream. */
export const WEIGHTS: readonly Weight[] = [
	"cosmetic",
	"load-bearing",
	"critical",
];

/**
 * activation maps a DECLARED weight to its §112 activation contribution (ADR 0018, monotone, never
 * learned): cosmetic = 0 < load-bearing = 1 < critical = 2. An unknown weight contributes 0.
 */
export function activation(w: Weight): number {
	switch (w) {
		case "critical":
			return 2.0;
		case "load-bearing":
			return 1.0;
		default:
			return 0.0;
	}
}

/**
 * validateWeight enforces the §112 / ADR 0018 admission discipline (mirrors propagation.ValidateWeight):
 * a `critical` weight WITHOUT weightEvidence is rejected with CRITICAL_WEIGHT_WITHOUT_EVIDENCE;
 * cosmetic/load-bearing need none; `critical` WITH a non-empty evidence ref is accepted; a weight
 * outside the closed set is rejected with UNKNOWN_WEIGHT. Returns null when admissible. Pure.
 */
export function validateWeight(
	l: Pick<Link, "weight" | "weightEvidence">,
): BlockReason | null {
	if (l.weight === "cosmetic" || l.weight === "load-bearing") return null;
	if (l.weight === "critical") {
		if (!l.weightEvidence) {
			return {
				code: "CRITICAL_WEIGHT_WITHOUT_EVIDENCE",
				severity: "error",
				explanation:
					"un poids composes `critical` est un engagement above-the-line (KRD §112, §2463) : " +
					"il n'est admis que sur une weight evidence enregistrée (ex. un id d'incident), jamais sur " +
					"une intuition — ce lien déclare `critical` sans weight_evidence.",
				howToFix: ["attach_incident_evidence", "downgrade_to_load_bearing"],
			};
		}
		return null;
	}
	return {
		code: "UNKNOWN_WEIGHT",
		severity: "error",
		explanation: `le poids ${l.weight} est hors de l'ensemble fermé {cosmetic|load-bearing|critical} (KRD §112 + ADR 0018).`,
		howToFix: ["declare_one_of_cosmetic_load_bearing_critical"],
	};
}

/**
 * activationOf — Σ activation(weight) over the declared composes edges of `parentId` whose child is
 * in the graph's `changed` set (KRD §112). Pure; reads only declared weights/edges.
 */
export function activationOf(g: Graph, parentId: string): number {
	const changed = new Set(g.changed ?? []);
	return g.edges
		.filter((e) => e.parent.id === parentId && changed.has(e.child.id))
		.reduce((sum, e) => sum + activation(e.weight), 0);
}

/**
 * fireParent implements the §112 weighted fire (mirrors propagation.FireParent): if Σ activation of
 * changed children ≥ the parent's DECLARED activation_threshold the parent goes RED, else GREEN. A
 * zero/negative threshold means "any contributing change reopens" (red iff activation > 0). An
 * absent parent stays GREEN (the engine invents no threshold). Pure + total.
 */
export function fireParent(g: Graph, parentId: string): Verdict {
	const parent = g.parents[parentId];
	if (parent === undefined) return "GREEN";
	const act = activationOf(g, parentId);
	if (parent.activationThreshold <= 0) return act > 0 ? "RED" : "GREEN";
	return act >= parent.activationThreshold ? "RED" : "GREEN";
}
