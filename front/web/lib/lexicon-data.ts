/**
 * Canonical Lexicon scenarios for the /lexicon panel (FK14). These are the worked examples the
 * Workbench lints — the FKE-21 ReturnRequest concept named across the layers, plus the FK14
 * fault-injection (a renamed DB table out of lexicon → red) and the unknown-layer / unknown-symbol
 * drifts. Pure data; the lint itself is lib/lexicon.ts (mirroring back/kernel/lexicon).
 */

import type { LexiconKernel, Observation } from "./lexicon";

/** The FKE-21 worked example: ReturnRequest named across the layers. */
export const RETURN_REQUEST: LexiconKernel = {
	concept: "ReturnRequest",
	symbols: {
		human: "demande de retour",
		bdd: "create_return_request",
		code: "createReturnRequest",
		test: "create_return_request_should_create_pending_return",
		db: "return_requests",
		api: "POST /return-requests",
		event: "ReturnRequestCreated",
		metric: "return_request_created_total",
		mcp: "returns.create_return_request",
		skill: "analyze_return_request",
		agent: "return_request_agent",
		ci: "test_return_request_kernel",
		policy: "return_request_access_policy",
	},
};

/** A named lint scenario the panel can run against the lexicon. */
export interface LexiconCase {
	id: string;
	labelKey: string;
	lexicon: LexiconKernel;
	observations: Observation[];
}

export const LEXICON_CASES: LexiconCase[] = [
	{
		// every observation matches the pinned symbol → no drift (green).
		id: "in-lexicon",
		labelKey: "caseInLexicon",
		lexicon: RETURN_REQUEST,
		observations: [
			{ layer: "db", symbol: "return_requests" },
			{ layer: "code", symbol: "createReturnRequest" },
			{ layer: "event", symbol: "ReturnRequestCreated" },
			{ layer: "metric", symbol: "return_request_created_total" },
		],
	},
	{
		// THE FK14 FAULT-INJECTION: a renamed DB table out of lexicon → RENAMED drift (red).
		id: "renamed-table",
		labelKey: "caseRenamedTable",
		lexicon: RETURN_REQUEST,
		observations: [
			{ layer: "code", symbol: "createReturnRequest" },
			{ layer: "db", symbol: "orders_returns" }, // renamed away from return_requests
		],
	},
	{
		// a layer the lexicon does not pin → UNKNOWN_SYMBOL (not a free pass).
		id: "unknown-symbol",
		labelKey: "caseUnknownSymbol",
		lexicon: RETURN_REQUEST,
		observations: [{ layer: "log", symbol: "return_request.created" }],
	},
	{
		// a symbol in a layer outside the 16 → UNKNOWN_LAYER.
		id: "unknown-layer",
		labelKey: "caseUnknownLayer",
		lexicon: RETURN_REQUEST,
		observations: [{ layer: "frobnicate", symbol: "whatever" }],
	},
];
