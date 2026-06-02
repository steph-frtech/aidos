/**
 * Canonical fixture data for the /decision-reuse panel (S32) — the reuse-ledger candidates from
 * the ContextGraphDecision fixture mirror (back/archive/brain/contextgraph). Render-only; the
 * reuse-gate logic lives in lib/contextgraph.ts (the Go twin). The verdicts shown on screen are
 * computed by that pure twin, never an LLM (the layer is LLM-free, KRD §119.2).
 */

import type { Candidate, RequestContext } from "@/lib/contextgraph";

/** One row of the ledger: a candidate + the request it is judged against, plus a stable id. */
export interface LedgerEntry {
	rowId: string;
	candidate: Candidate;
	request: RequestContext;
}

/** The fixed clock the panel judges against (passed in — never read from the browser clock). */
export const LEDGER_NOW = new Date("2026-05-30T00:00:00Z");

/** The reuse ledger — one entry per fixture row. The first two are THE done criteria
 * (expired ⇒ BLOCK on time; out-of-scope ⇒ BLOCK on scope). */
export const LEDGER: LedgerEntry[] = [
	{
		// Expired ⇒ BLOCK, the time chip lit (THE done criterion, time).
		rowId: "expired",
		candidate: {
			id: "S15-eu-truth-pin",
			scope: { region: "EU" },
			expiresAt: "2026-01-01T00:00:00Z",
		},
		request: { scope: { region: "EU" } },
	},
	{
		// Out-of-scope (EU decision, US request) ⇒ BLOCK, the scope chip lit (THE done criterion, scope).
		rowId: "out-of-scope",
		candidate: {
			id: "S15-eu-truth-pin",
			scope: { region: "EU" },
			expiresAt: "2027-01-01T00:00:00Z",
		},
		request: { scope: { region: "US" } },
	},
	{
		// In-time, in-scope, in-authority ⇒ ALLOW.
		rowId: "allowed",
		candidate: {
			id: "S15-eu-truth-pin",
			scope: { region: "EU" },
			expiresAt: "2027-01-01T00:00:00Z",
			authority: { domain: "checkout", truthKind: "behavioral" },
		},
		request: { scope: { region: "EU" }, domain: "checkout" },
	},
	{
		// Authority no longer holds for the request domain ⇒ BLOCK + needs human review.
		rowId: "needs-review",
		candidate: {
			id: "S16-authority-pin",
			scope: { region: "EU" },
			expiresAt: "2027-01-01T00:00:00Z",
			authority: { domain: "checkout", truthKind: "behavioral" },
		},
		request: { scope: { region: "EU" }, domain: "payouts" },
	},
	{
		// A declared reuse condition that fails ⇒ BLOCK on conditions.
		rowId: "failing-condition",
		candidate: {
			id: "S15-eu-truth-pin",
			scope: { region: "EU" },
			expiresAt: "2027-01-01T00:00:00Z",
			conditions: [{ key: "channel", equals: "web" }],
		},
		request: { scope: { region: "EU" }, facts: { channel: "mobile" } },
	},
];
