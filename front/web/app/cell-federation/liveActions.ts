"use server";

import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /cell-federation LIVE Server Action — verify a cell's PUBLIC contract through the typed S58
 * gateway via the S59 SDK (the below-the-line `pact_verify` read of the closed registry),
 * decoded with a PURE decoder, with a deterministic demo verdict preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * ── A CHEAP READ ONLY (the OBJECTIVE) ───────────────────────────────────────────────────
 * pact_verify is dispatched SYNCHRONOUSLY because the pact-verifier server is DEP-FREE: it
 * stands the emitted handler up IN-PROCESS (net/http/httptest, ADR 0026) and asserts the field
 * set — a CHEAP pure verification, no Postgres, no subprocess, no Ruby daemon. So the front may
 * dispatch it on render. There is no heavy variant to trigger from the screen.
 *
 * THE WALL (CLAUDE.md §2): a READ only — pact_verify stages no truth; recording the
 * Context-Map (which cells, which contract) persists via a ChangeSet (S101), never from the
 * screen. The CellFederationPanel above stays the action-capable demo computation (the pure
 * twin lib/cell-federation); this section only surfaces the live provider verdict alongside it.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo verdict.
 */

export interface LivePactView {
	operation: string;
	pass: boolean;
	reason: string;
	method: string;
	route: string;
	interactions: string[];
	source: Source;
}

// pact_verify → { pass, reason, method, route, interactions:[string], … } (pactverifiersrv.
// verifyOutput), decoded ONCE (never double-typed). We surface the verdict + the verified
// interactions; contract_json / operation_hash are not rendered by this status section.
const pactDecoder: Decoder<{
	pass: boolean;
	reason: string;
	method: string;
	route: string;
	interactions: string[];
}> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.pass !== "boolean") return null;
	const reason = str(raw.reason);
	if (reason === null) return null;
	const method = str(raw.method);
	if (method === null) return null;
	const route = str(raw.route);
	if (route === null) return null;
	// interactions is omitted (null) when the operation is unknown — treat absent as empty.
	let interactions: string[] = [];
	if (raw.interactions != null) {
		const rows = arr(str)(raw.interactions);
		if (rows === null) return null;
		interactions = rows;
	}
	return { pass: raw.pass, reason, method, route, interactions };
};

/** The deterministic demo verdict — the canonical createOrder contract, honoured. */
const DEMO_VERDICT: {
	pass: boolean;
	reason: string;
	method: string;
	route: string;
	interactions: string[];
} = {
	pass: true,
	reason: "demo — createOrder honoured the contract (offline projection)",
	method: "POST",
	route: "/orders",
	interactions: ["createOrder → 201 Created"],
};

/**
 * livePact verifies a cell's PUBLIC contract for the canonical checkout operation (createOrder)
 * live (live → demo fallback). An unscoped / unwired gateway falls back to the demo verdict.
 */
export async function livePact(): Promise<LivePactView> {
	const operation = "createOrder";
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"pact_verify",
		{ operation },
		pactDecoder,
		DEMO_VERDICT,
	);
	return {
		operation,
		pass: data.pass,
		reason: data.reason,
		method: data.method,
		route: data.route,
		interactions: data.interactions,
		source,
	};
}
