/**
 * The pii-forgettable-federation GlobalInvariant + its admission rows for the
 * /global-invariants panel (AIDOS step S48).
 *
 * The invariant is the KRD §49 fan-out example ("tout agrégat portant du PII doit implémenter
 * Forgettable"), VERBATIM — the agent invents no scope, blast_radius, or authority tier beyond
 * the frozen §49.1 enums. The admission rows are the fixture rows of
 * tests/kernel/pii-forgettable-federation_global_invariant.fixture.md: the page runs the PURE
 * decider (lib/global-invariant.ts, the projection of back/kernel/globalinvariant) over each,
 * so each decision badge is computed, never declared.
 *
 * No truth is invented as fact: the invariant is a CANDIDATE source used to exercise the
 * decider — the wall is untouched.
 */

import type { Authority, GlobalInvariant } from "./global-invariant";

/** The KRD §49 / §49.1 federation invariant, verbatim. */
export const PII_FORGETTABLE_FEDERATION: GlobalInvariant = {
	name: "pii-forgettable-federation",
	scope: "federation_policy",
	cells: ["checkout", "profile", "billing"],
	predicate: "every_pii_aggregate_implements_forgettable",
	blastRadius: "global",
	approvalRequired: "architecture_owner",
};

/** The cell whose violation drives the red-wave panel (the §49 example). */
export const VIOLATED_CELL = "billing";

/** A candidate admission row: a human label + the granted approval tier. */
export interface AdmissionRow {
	label: string;
	granted: Authority;
}

/**
 * The admission rows of the pii-forgettable-federation fixture: a cell_owner approval
 * (blocked / INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS — THE done case), a both_contract_owners
 * approval (escalated — one tier below), an architecture_owner approval (admitted).
 */
export const ADMISSION_ROWS: readonly AdmissionRow[] = [
	{
		label: "Invariant global approuvé seulement par le cell_owner",
		granted: "cell_owner",
	},
	{
		label: "Invariant global approuvé par les both_contract_owners",
		granted: "both_contract_owners",
	},
	{
		label: "Invariant global approuvé par l'architecture_owner",
		granted: "architecture_owner",
	},
] as const;
