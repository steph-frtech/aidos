/**
 * The checkout-regulatory AuthorityGraph + its candidate admission rows for the
 * /authorities panel (AIDOS step S16).
 *
 * The graph is the KRD §13.8 "checkout-regulatory" graph, VERBATIM — the agent invents no
 * role, no truth_kind, no decision branch. The admission rows are the four fixture rows of
 * tests/kernel/checkout-regulatory_authority.fixture.md: the page runs the PURE decider
 * (lib/authority.ts, the projection of back/kernel/authority) over each, so each decision
 * badge is computed, never declared.
 *
 * No truth is invented as fact: the graph is a CANDIDATE source (the form of a truth, no
 * freeze, no mirror) used to exercise the decider — the wall is untouched.
 */

import type { AuthorityGraph, Role } from "./authority";

/** The KRD §13.8 checkout-regulatory graph, verbatim. */
export const CHECKOUT_REGULATORY: AuthorityGraph = {
	domain: "checkout",
	truthKind: "regulatory",
	approvers: ["legal", "product_owner"],
	veto: ["security"],
	escalation: ["architecture_board"],
};

/** A candidate admission row: a human label + the set of roles that granted approval/veto. */
export interface AdmissionRow {
	/** A short human label of the candidate admission (ubiquitous language). */
	label: string;
	/** The roles that have granted their approval/veto for the truth. */
	granted: Role[];
}

/**
 * The four admission rows of the checkout-regulatory fixture: no approval (blocked /
 * MISSING_AUTHORITY_APPROVAL — THE done case), full approval (admitted), full approval + a
 * veto (blocked / VETOED), partial approval (escalated → architecture_board).
 */
export const ADMISSION_ROWS: readonly AdmissionRow[] = [
	{
		label: "Règle réglementaire soumise sans aucune approbation",
		granted: [],
	},
	{
		label: "Règle réglementaire approuvée par legal et product_owner",
		granted: ["legal", "product_owner"],
	},
	{
		label: "Règle approuvée mais frappée d'un veto sécurité",
		granted: ["legal", "product_owner", "security"],
	},
	{
		label: "Règle approuvée seulement par product_owner (legal manquant)",
		granted: ["product_owner"],
	},
] as const;
