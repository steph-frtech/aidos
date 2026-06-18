import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
} from "@/lib/facetwire";
import type { Source } from "@/lib/gateway-sdk";
import type { LiveColumn } from "./live";

/**
 * Non-action module for /facet-wire (FK08): the wiring scenarios + view types + empty view.
 * Kept OUT of actions.ts because a "use server" module may export ONLY async Server Actions.
 * Each scenario instantiates the five non-functional columns (S/R/V/M/X) of a kernel and
 * perturbs one pair to demonstrate the three FK08 outcomes: all aligned (green), a HARD column
 * broken (red — the right column reddens), and the SOFT X column broken (green + advisory).
 */

function fullColumn(facet: Facet): Column {
	return {
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	};
}

function breakEvidence(col: Column): Column {
	return {
		...col,
		rungs: col.rungs.map((r) =>
			r.rung === "6-evidence" ? { ...r, proven: false } : r,
		),
	};
}

function allColumns(): Column[] {
	return NON_FUNCTIONAL_COLUMNS.map(fullColumn);
}

function withBroken(facet: Facet): Column[] {
	return allColumns().map((c) => (c.facet === facet ? breakEvidence(c) : c));
}

export interface Scenario {
	id: string;
	label: string;
	columns: Column[];
}

/** the three FK08 demonstration scenarios. */
export const SCENARIOS: Scenario[] = [
	{
		id: "aligned",
		label: "Toutes les facettes alignées (vert)",
		columns: allColumns(),
	},
	{
		id: "break-security",
		label: "Casser une paire de S — Sécurité (rouge)",
		columns: withBroken("S"),
	},
	{
		id: "break-reliability",
		label: "Casser une paire de R — Fiabilité (rouge)",
		columns: withBroken("R"),
	},
	{
		id: "break-experience",
		label: "Casser une paire de X — Expérience (advisory, reste vert)",
		columns: withBroken("X"),
	},
];

export interface FacetWireView {
	ok: boolean;
	kernelId?: string;
	verdict?: "green" | "red";
	columns: LiveColumn[];
	verdictAgain?: "green" | "red";
	deterministic?: boolean;
	error?: string;
	/** whether the verdict came from the live gateway or the deterministic demo fixture. */
	source?: Source;
}

export const emptyView: FacetWireView = { ok: false, columns: [] };
