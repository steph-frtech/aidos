// lib/law-coverage.ts — the TS MIRROR of back/cmd/aidos/lawcoverage (S45). It is the
// SAME CONTRACT as the Go law-coverage harness: the closed registry of the ten KRD
// §82.1 laws plus the §29 completeness law, each with its krd_ref, owning verb,
// reused detector_ref, and a DETERMINISTIC per-law breach detector that returns a
// S13-shaped Breach (code / severity / explanation / how_to_fix[]) on a violating
// fragment or null on a satisfying one.
//
// Determinism-first (CLAUDE.md §6/§8): every detect() is a pure function of its
// fragment → Breach | null — no clock, no rng, no I/O — so the /check panel shows
// EXACTLY what `aidos check` prints, identically across runs. The Go package is the
// authoritative verdict; this mirror lets the Workbench EXECUTE a law's red/green
// fixture from the screen (ui-completeness: the op is reachable AND executable, not
// only displayed) and agree byte-for-byte with the CLI. Covered by law-coverage.test.ts.

export type Verb = "check" | "impact" | "stable" | "diff" | "explain";

export type LawId =
	| "truth_without_kind"
	| "mirror_incompatible"
	| "scope_absent"
	| "authority_absent"
	| "memory_without_goal"
	| "phase_not_stable"
	| "composes_weight"
	| "mutation_score"
	| "invariant_too_global"
	| "context_decision_untest"
	| "completeness";

export interface Breach {
	law: LawId;
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

export interface LawEntry {
	id: LawId;
	krdRef: string;
	owningVerb: Verb;
	detectorRef: string;
	/** Detect a breach on the law's red or green fixture (null = satisfied = green). */
	detect: (kind: "red" | "green") => Breach | null;
}

// The five core compiler verbs, canonical order.
export const verbs: Verb[] = ["check", "impact", "stable", "diff", "explain"];

// breach is a tiny constructor pinning the S13 shape per law.
function breach(
	law: LawId,
	code: string,
	explanation: string,
	howToFix: string[],
): Breach {
	return { law, code, severity: "blocking", explanation, howToFix };
}

// registry — the CLOSED canonical law registry, KRD §82.1 order then §29. Mirrors
// back/cmd/aidos/lawcoverage/lawcoverage.go verbatim (the codes + verbs must match).
export const registry: LawEntry[] = [
	{
		id: "truth_without_kind",
		krdRef: "§82.1 (vérité sans TruthKind) / §13.4",
		owningVerb: "check",
		detectorRef: "S14 kernel/truthtyping.Classify",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"truth_without_kind",
						"TRUTH_WITHOUT_KIND",
						"Une vérité doit déclarer son TruthKind (KRD §13.4 / §82.1) : une affirmation sans type épistémique est rejetée par le typage de vérité.",
						[
							"classify_truth : assignez l'un des sept TruthKind §13.4 à la vérité.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "mirror_incompatible",
		krdRef: "§82.1 (miroir incompatible) / §34, §90",
		owningVerb: "check",
		detectorRef: "S06 kernel/mirror/records.RequiredTestKinds",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"mirror_incompatible",
						"MIRROR_INCOMPATIBLE",
						"Le miroir n'a pas une forme compatible avec le type de vérité de sa couche (KRD §34/§90).",
						[
							"derive_mirror : choisissez la forme de miroir de la couche.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "scope_absent",
		krdRef: "§82.1 (scope absent) / §13.7",
		owningVerb: "check",
		detectorRef: "S15 kernel/scope.IsEmpty",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"scope_absent",
						"OUT_OF_SCOPE",
						"La vérité active ne déclare aucun scope (KRD §13.7 / §82.1) : toute vérité active porte un périmètre explicite.",
						[
							"view : déclarez le TruthScope de la vérité.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "authority_absent",
		krdRef: "§82.1 (autorité absente) / §13.8",
		owningVerb: "check",
		detectorRef: "S16 kernel/authority.Decide",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"authority_absent",
						"MISSING_AUTHORITY",
						"Le changement exige une autorité non assignée (KRD §13.8 / §82.1).",
						[
							"assign_authority : faites accorder l'approbation de chaque approver requis.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "memory_without_goal",
		krdRef: "§82.1 (mémoire sans Idea→Mirror→Goal) / §119.1",
		owningVerb: "check",
		detectorRef: "S30 archive/brain (MemoryFirewall)",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"memory_without_goal",
						"MEMORY_CANNOT_DECLARE_TRUTH",
						"Une mémoire entre dans le noyau sans Idea→Mirror→Goal (MemoryFirewall, KRD §119.1). La mémoire propose ; le noyau déclare le vrai.",
						[
							"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel",
							"rerun aidos check",
						],
					),
	},
	{
		id: "phase_not_stable",
		krdRef: "§82.1 (phase non stable) / §43",
		owningVerb: "stable",
		detectorRef: "S23 archive/phases.IsStable",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"phase_not_stable",
						"PHASE_NOT_STABLE",
						"La coupe courante n'est PAS une phase stable (KRD §43 / §82.1) : un lien pend ou un senseur est rouge.",
						["resolve_links_and_green_sensors", "rerun aidos stable"],
					),
	},
	{
		id: "composes_weight",
		krdRef: "§82.1 (poids composes non justifié) / §112",
		owningVerb: "check",
		detectorRef: "S19 kernel/composes (Weight)",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"composes_weight",
						"COMPOSES_WEIGHT_UNJUSTIFIED",
						"Un poids composes load-bearing n'est pas justifié (KRD §112 / §82.1).",
						[
							"semantic-diff : ouvrez un /goal de re-qualification enregistrant la raison.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "mutation_score",
		krdRef: "§82.1 (mutation score insuffisant) / §40",
		owningVerb: "check",
		detectorRef: "S40 runtime/debt (MutationStatus)",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"mutation_score",
						"MUTATION_SCORE_INSUFFICIENT",
						"Le score de mutation est sous le seuil déclaré (KRD §40 / §82.1) : des mutants survivants.",
						["add_mirrors_to_kill_mutants", "rerun aidos check"],
					),
	},
	{
		id: "invariant_too_global",
		krdRef: "§82.1 (invariant global trop large) / §13.7",
		owningVerb: "check",
		detectorRef: "S08 kernel/scope.IsGlobal",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"invariant_too_global",
						"INVARIANT_TOO_GLOBAL",
						"Un invariant est porté au scope global explicite « * » (KRD §13.7 / §82.1).",
						[
							"view : ramenez l'invariant au scope étroit où il tient.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "context_decision_untest",
		krdRef: "§82.1 (ContextGraphDecision non testée) / §119.2",
		owningVerb: "check",
		detectorRef: "S32 runtime/context (ContextGraphDecision)",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"context_decision_untest",
						"CONTEXT_DECISION_UNTESTED",
						"Une ContextGraphDecision n'a pas de Decision Reuse Test vivant (KRD §119.2 / §82.1).",
						[
							"context : attachez le Decision Reuse Test à la décision.",
							"rerun aidos check",
						],
					),
	},
	{
		id: "completeness",
		krdRef: "§29 (loi de complétude, pas de monstre) / §82",
		owningVerb: "check",
		detectorRef: "S06/S12 kernel/mirror/completeness.Gate",
		detect: (k) =>
			k === "green"
				? null
				: breach(
						"completeness",
						"MONSTER",
						"La loi de complétude est rouge (KRD §29 / §82) : un monstre existe — une vérité sans miroir vivant, ou un miroir orphelin.",
						[
							"check-completeness : écrivez le miroir manquant ou rattachez le miroir orphelin.",
							"rerun aidos check",
						],
					),
	},
];

/** lookupLaw returns the registry entry for a law id, or undefined. */
export function lookupLaw(id: LawId): LawEntry | undefined {
	return registry.find((l) => l.id === id);
}

/**
 * checkDemo runs every `check`-owned law over the demo project (all green) and
 * returns the ordered breach list (empty = GREEN). Mirrors `aidos check demo`: the
 * laws owned by stable/diff/explain are reached through those verbs, not re-run here.
 */
export function checkDemo(): Breach[] {
	return registry
		.filter((l) => l.owningVerb === "check")
		.map((l) => l.detect("green"))
		.filter((b): b is Breach => b !== null)
		.sort((a, b) => a.code.localeCompare(b.code));
}

/** checkRed runs one law's red fixture (mirrors `aidos check --red <law>`). */
export function checkRed(id: LawId): Breach[] {
	const l = lookupLaw(id);
	if (!l) return [];
	const b = l.detect("red");
	return b ? [b] : [];
}
