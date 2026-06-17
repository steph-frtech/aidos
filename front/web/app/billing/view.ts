import type { Plan, QuotaDecision, Usage } from "@/lib/billing";
import type { IngestRead, PactRead, PlanRow } from "@/lib/billing-data";
import type { Source } from "@/lib/gateway-sdk";

/**
 * view.ts — the result shapes the /billing server actions return to the panel (ADR 0092 kill-twins
 * flip). Each carries a `source` tag: whether the snapshot came from the live Go billing engine
 * (the dispatched billing_* read) or the deterministic demo fallback.
 *
 * THE WALL (CLAUDE.md §2): every view is a below-the-line READ — plans/usage/quotas/webhook-events
 * are DECLARED/counted rows; the panel WRITES NOTHING.
 */

/** PlansView — the decoded plan ladder + its declared quotas + each plan's upgrade target. */
export interface PlansView {
	ran: boolean;
	plans: PlanRow[];
	source?: Source;
}

/** MeterView — the counted usage (account-wide or per-project). */
export interface MeterView {
	ran: boolean;
	usage?: Usage;
	scopeLabel: string;
	source?: Source;
}

export const METER_INITIAL: MeterView = { ran: false, scopeLabel: "" };

/** QuotaView — the quota enforcement verdict (allow / deny + upgrade path + BlockReason). */
export interface QuotaView {
	ran: boolean;
	plan?: Plan;
	decision?: QuotaDecision;
	source?: Source;
}

export const QUOTA_INITIAL: QuotaView = { ran: false };

/** IngestView — the inbound webhook ingest read (idempotent log + plan transition). */
export interface IngestView {
	ran: boolean;
	read?: IngestRead;
	source?: Source;
}

export const INGEST_INITIAL: IngestView = { ran: false };

/** PactView — the Pact provider-verification read (pass/fail + replayed interactions). */
export interface PactView {
	ran: boolean;
	pact?: PactRead;
	source?: Source;
}

export const PACT_INITIAL: PactView = { ran: false };
