import type { ConsciousnessReport } from "@/lib/conscience";
import { SCENARIOS as DATA_SCENARIOS } from "@/lib/conscience-data";
import type { Source } from "@/lib/gateway-sdk";

/**
 * Non-action module for /conscience (FK09): the select options (id + label) + the view types +
 * the empty view. Kept OUT of actions.ts because a "use server" module may export ONLY async Server
 * Actions.
 *
 * KILL-TWINS CUTOVER (ADR 0092): the reconciliation INPUT (a kernel's FK08 facet columns + the
 * extra sourced verdicts) now lives in `lib/conscience-data.ts` (the demo fixture / twin sibling),
 * which the cutover action sends to the Go `reconcile` tool via the passerelle. This module only
 * surfaces the scenario id+label for the panel's select and the view shape — no twin compute.
 */

/** The select options the panel renders — id + label, projected from the data scenarios. */
export interface ScenarioOption {
	id: string;
	label: string;
}

export const SCENARIOS: ScenarioOption[] = DATA_SCENARIOS.map((s) => ({
	id: s.id,
	label: s.label,
}));

export interface ConscienceView {
	ok: boolean;
	report?: ConsciousnessReport;
	/** live (Go engine via the passerelle) vs demo (the deterministic twin fallback) — ADR 0092. */
	source?: Source;
	deterministic?: boolean;
	error?: string;
}

export const emptyView: ConscienceView = { ok: false };
