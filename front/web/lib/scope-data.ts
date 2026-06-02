/**
 * Sample candidate records for the /scopes panel (AIDOS step S15).
 *
 * These are ILLUSTRATIVE candidate truths (demo data — the live truth set arrives via the
 * store MCP at its own step, OpenQuestion OQ-S15-fetch). Each carries a lifecycle status
 * and a TruthScope; the page runs the PURE guard (lib/scope.ts, the projection of
 * back/kernel/scope) over each, so the verdict badge is computed, never declared. The set
 * spans the three verdicts the done criteria require: ACCEPTED (a scoped active truth),
 * GLOBAL (explicit, region "*"), and REJECTED (a scope-less active truth).
 *
 * No truth is invented as fact: these are CANDIDATE truths (the form of a truth, no
 * freeze, no mirror) used to exercise the guard — the wall is untouched.
 */

import type { ScopeRecord } from "./scope";

export interface CandidateRecord extends ScopeRecord {
	/** A short human label of the candidate claim (ubiquitous language). */
	label: string;
}

export const CANDIDATE_RECORDS: readonly CandidateRecord[] = [
	{
		label: "La TVA française s'applique au tunnel d'achat web",
		status: "active",
		scope: {
			region: "FR",
			target: "web",
			environment: "prod",
		},
	},
	{
		label: "Les offres premium sont réservées au segment premium en UE",
		status: "active",
		scope: {
			region: "EU",
			userSegment: "premium",
			environment: "prod",
		},
	},
	{
		label: "La promo d'été est valable du 1er juin au 31 août (mobile)",
		status: "active",
		scope: {
			region: "FR",
			target: "mobile",
			timeWindow: { from: "2026-06-01", to: "2026-08-31" },
		},
	},
	{
		label: "Le format de hash content-addressed s'applique partout",
		status: "active",
		scope: {
			region: "*",
		},
	},
	{
		label: "Un mot de passe invalide est toujours refusé (vérité sans scope)",
		status: "active",
		scope: {},
	},
	{
		label: "L'ancien tunnel v1 (déprécié, sans scope — exempt de la règle)",
		status: "deprecated",
		scope: {},
	},
] as const;
