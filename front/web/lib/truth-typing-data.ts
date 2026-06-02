/**
 * Sample candidate truths for the /truth-typing panel (AIDOS step S14).
 *
 * These are ILLUSTRATIVE candidate truths (demo data — the live truth set arrives
 * via the store MCP at its own step, OpenQuestion OQ-S14-fetch). Each carries the two
 * epistemic-typing fields the classifier reads; the page runs the PURE classifier
 * (lib/truth-typing.ts, the projection of back/kernel/truthtyping) over each, so the
 * routing badge is computed, never declared. The set spans the three badge cases the
 * done criteria require: KERNEL (admitted), /SPIKE (routed away), REJECTED (no/unknown
 * kind).
 *
 * No truth is invented as fact: these are CANDIDATE truths (the form of a truth, no
 * freeze, no mirror) used to exercise the classifier — the wall is untouched.
 */

import type { Truth } from "./truth-typing";

export interface CandidateTruth extends Truth {
	/** A short human label of the candidate claim (ubiquitous language). */
	label: string;
}

export const CANDIDATE_TRUTHS: readonly CandidateTruth[] = [
	{
		label: "Un mot de passe invalide est toujours refusé à la connexion",
		truthKind: "behavioral",
		verifiabilityLevel: "deterministic",
	},
	{
		label: "Le module paiement ne dépend jamais du module reporting",
		truthKind: "structural",
		verifiabilityLevel: "deterministic",
	},
	{
		label: "Le RGPD impose la purge des données après 30 jours d'inactivité",
		truthKind: "regulatory",
		verifiabilityLevel: "deterministic",
	},
	{
		label: "La variante B du tunnel d'achat convertit mieux que A",
		truthKind: "statistical",
		verifiabilityLevel: "statistical",
	},
	{
		label: "L'écran d'accueil inspire confiance aux nouveaux utilisateurs",
		truthKind: "experiential",
		verifiabilityLevel: "human_judged",
	},
	{
		label: "Le nouveau parcours d'onboarding « semble plus clair »",
		truthKind: "experiential",
		verifiabilityLevel: "unverifiable",
	},
	{
		label: "Une refonte UI radicale pourrait doubler la rétention (à explorer)",
		truthKind: "exploratory",
		verifiabilityLevel: "delayed",
	},
	{
		label: "Le système devrait être « meilleur » (claim non typé)",
		truthKind: "",
		verifiabilityLevel: "",
	},
	{
		label: "Le ton de l'app doit donner de bonnes « vibes »",
		truthKind: "vibes",
		verifiabilityLevel: "human_judged",
	},
] as const;
