import {
	type IngestEvent,
	ingestWebhook,
	WEBHOOK_KINDS,
	type WebhookEvent,
} from "./billing";

/**
 * lib/billing-verify.ts — the BROWSER-pure provider verification of the S114 Pact contract
 * (ADR 0049). It mirrors the Go billing.VerifyContract: it replays the contract's interactions
 * (one ACK per webhook kind + one DENY for a malformed event) against the SAME ingest the
 * runtime performs (ingestWebhook), in-memory (no httptest server, no network). A valid event
 * is ACKed (ingested idempotently); a malformed event is refused. Deterministic — no LLM.
 *
 * This makes the Pact-verify control reachable AND executable from the Workbench screen
 * (ui-completeness) without a network dependency; the authoritative provider verification stays
 * the Go billing.VerifyContract (the pact-verifier), which this twin mirrors.
 */

export interface VerifyResult {
	pass: boolean;
	reason: string;
	interactions: string[];
}

export function VerifyContractInBrowser(): VerifyResult {
	const interactions: string[] = [];
	let log: IngestEvent[] = [];

	// ACK interaction per kind.
	for (const kind of WEBHOOK_KINDS) {
		const e: WebhookEvent = {
			kind,
			providerId: `evt_${kind}`,
			account: "acct_example",
		};
		if (kind === "checkout.completed" || kind === "subscription.updated")
			e.plan = "pro";
		try {
			const { log: next } = ingestWebhook(log, e);
			log = next;
			interactions.push(`${kind} is acknowledged`);
		} catch {
			return {
				pass: false,
				reason: `${kind} should be acknowledged but was refused`,
				interactions,
			};
		}
	}

	// DENY interaction: a malformed event must be refused.
	try {
		ingestWebhook(log, {
			kind: "not.a.kind" as WebhookEvent["kind"],
			providerId: "evt_bad",
			account: "acct_example",
		});
		return {
			pass: false,
			reason: "a malformed event must be refused (it was accepted)",
			interactions,
		};
	} catch {
		interactions.push("a malformed event is refused");
	}

	return {
		pass: true,
		reason: "all interactions honoured the contract",
		interactions,
	};
}
