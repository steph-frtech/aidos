/**
 * billing-data — the DETERMINISTIC demo fixtures for the /billing panel (ADR 0092 kill-twins
 * flip). It holds the canonical S114 account ledger (recorded AgentRuns, the declared plan
 * ladder, a counted usage, a quota verdict, an ingest log, the Pact verification) and the twin
 * `lib/billing` compute of them — the demo snapshots the panel falls back to when the gateway is
 * unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /billing computed its
 * displayed plans/usage/quota/webhook/pact from the TS twin `lib/billing` directly, client-side in
 * BillingPanel.tsx — the twin WAS the live source. The flip routes every control through the Go
 * billing MCP server via the passerelle (`readVia(scope, "billing_plans" | "billing_meter" |
 * "billing_meter_project" | "billing_check_quota" | "billing_ingest_webhook" |
 * "billing_pact_verify", …)`, the dispatched below-the-line reads); these fixtures are KEPT only as
 * the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what makes the T5
 * cliquet (twin-as-live-fitness) RECOGNISE `lib/billing` as a twin — the panel stays GREEN because
 * `actions.ts` imports the `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every demo snapshot is the same PURE twin compute the Go
 * `billing` runtime reproduces — same ledger + plan → byte-identical usage/verdict. The parity
 * mirror app/billing/live.test.ts pins the decoders' shape == the Go billingsrv contract.
 *
 * THE WALL (CLAUDE.md §2): plans/usage/quotas/webhook-events are runtime/commercial rows; these
 * fixtures and the panel WRITE NOTHING. A plan/limit is DECLARED data (§8 — never learned).
 */

import {
	applyEvent,
	checkQuota,
	type IngestEvent,
	ingestWebhook,
	type MeteredRun,
	meterProject,
	meterUsage,
	nextPlan,
	PLAN_LADDER,
	PLAN_QUOTAS,
	type Plan,
	type QuotaDecision,
	type Usage,
	type WebhookEvent,
} from "./billing";
import { VerifyContractInBrowser, type VerifyResult } from "./billing-verify";

/** A decoded plan row — the closed plan ladder + its declared quota + its upgrade target. */
export interface PlanRow {
	plan: Plan;
	quota: (typeof PLAN_QUOTAS)[Plan];
	next: Plan | "";
}

/** A run row as the panel edits it (the form shape sent to the gateway / fed to the twin). */
export interface RunRow {
	id: string;
	project: string;
	tokens: number;
	buildMinutes: number;
}

/** The demo account the panel meters by default. */
export const DEMO_ACCOUNT = "acct-1";

/**
 * The demo recorded AgentRuns (S52), each carrying its consumed RunMeter. These are the runs the
 * panel sends to the gateway `billing_meter` tool AND the input to the demo usage. acct-1 totals
 * 230 000 tokens / 9 build-loop minutes across two projects — over the FREE plan's token quota.
 */
export const DEMO_RUNS: RunRow[] = [
	{ id: "run-0", project: "p1", tokens: 30_000, buildMinutes: 5 },
	{ id: "run-1", project: "p2", tokens: 200_000, buildMinutes: 4 },
];

/** The demo plan the panel checks the quota against by default. */
export const DEMO_PLAN: Plan = "free";

/**
 * runArgs maps the panel's RunRow[] (for an account) to the Go `billing_meter` `runs` arg shape:
 * each run is a `{ account, project, run_id, tokens, build_minutes }` scalar object (the
 * billingsrv.runInput contract, snake_case). PURE — a deterministic projection, never an LLM. Each
 * run is a scalar object — no json.RawMessage body, the S59 transport scar avoided by construction.
 */
export function runArgs(
	account: string,
	runs: RunRow[],
): Record<string, unknown>[] {
	return runs.map((r, i) => ({
		account,
		project: r.project,
		run_id: `r${i + 1}`,
		tokens: r.tokens,
		build_minutes: r.buildMinutes,
	}));
}

/** meteredRuns — the twin MeteredRun[] for the same ledger (the demo fallback input). */
export function meteredRuns(account: string, runs: RunRow[]): MeteredRun[] {
	return runs.map((r, i) => ({
		account,
		project: r.project,
		runId: `r${i + 1}`,
		meter: { tokens: r.tokens, ciMinutes: r.buildMinutes },
	}));
}

/** usageArgs maps a twin Usage to the Go `billing.Usage` arg shape (snake_case). PURE projection. */
export function usageArgs(u: Usage): Record<string, unknown> {
	return {
		account: u.account,
		run_count: u.runCount,
		llm_tokens: u.llmTokens,
		build_loop_minutes: u.buildLoopMinutes,
		sandbox_hours: u.sandboxHours,
		deployed_apps: u.deployedApps,
	};
}

/** ingestArgs maps a webhook event (+ prior log + current plan) to the Go `billing_ingest_webhook` args. */
export function ingestArgs(
	e: WebhookEvent,
	prior: IngestEvent[],
	current: Plan,
): Record<string, unknown> {
	return {
		kind: e.kind,
		provider_id: e.providerId,
		account: e.account,
		plan: e.plan ?? "",
		current,
		prior: prior.map((p) => ({
			id: p.id,
			event: {
				kind: p.event.kind,
				provider_id: p.event.providerId,
				account: p.event.account,
				plan: p.event.plan ?? "",
			},
			applied_to: p.appliedTo ?? "",
		})),
	};
}

// ── the demo snapshots (the twin compute the Go engine reproduces) ──

/** demoPlans is the deterministic demo plan ladder — the twin PLAN_LADDER + PLAN_QUOTAS. */
export function demoPlans(): PlanRow[] {
	return PLAN_LADDER.map((p) => ({
		plan: p,
		quota: PLAN_QUOTAS[p],
		next: nextPlan(p),
	}));
}

/** demoUsage is the deterministic demo Usage — the twin `meterUsage()` of the demo ledger. */
export function demoUsage(account: string, runs: RunRow[]): Usage {
	return meterUsage(account, meteredRuns(account, runs));
}

/** demoUsageProject is the per-project demo Usage — the twin `meterProject()`. */
export function demoUsageProject(
	account: string,
	project: string,
	runs: RunRow[],
): Usage {
	return meterProject(account, project, meteredRuns(account, runs));
}

/** demoQuota is the deterministic demo QuotaDecision — the twin `checkQuota()`. */
export function demoQuota(plan: string, u: Usage): QuotaDecision {
	return checkQuota(plan, u);
}

/** The decoded ingest read — the log + the freshly recorded event + the plan transition. */
export interface IngestRead {
	accepted: boolean;
	duplicate: boolean;
	eventId: string;
	appliedTo: Plan | "";
	nextPlan: Plan | "";
	log: IngestEvent[];
	code?: string;
	explanation?: string;
}

/**
 * demoIngest is the deterministic demo ingest read — the twin `ingestWebhook()` of the event over
 * the prior log, plus the `applyEvent()` plan transition. Identical in shape to the live decoded
 * `billing_ingest_webhook` read (the twin sits behind `source:"demo"`).
 */
export function demoIngest(
	e: WebhookEvent,
	prior: IngestEvent[],
	current: Plan,
): IngestRead {
	try {
		const { log, record } = ingestWebhook(prior, e);
		const duplicate = log.length === prior.length;
		return {
			accepted: true,
			duplicate,
			eventId: record.id,
			appliedTo: record.appliedTo ?? "",
			nextPlan: applyEvent(current, e),
			log,
		};
	} catch {
		return {
			accepted: false,
			duplicate: false,
			eventId: "",
			appliedTo: "",
			nextPlan: "",
			log: prior,
			code: "INVALID_WEBHOOK",
			explanation:
				"l'événement entrant est mal formé (kind/provider_id/account/plan) — refusé, jamais silencieusement ignoré.",
		};
	}
}

/** The decoded Pact verify read — pass/fail + provider + the replayed interactions. */
export interface PactRead {
	pass: boolean;
	provider: string;
	reason: string;
	interactions: string[];
}

/** demoPact is the deterministic demo Pact verification — the browser-pure twin VerifyContract. */
export function demoPact(): PactRead {
	const r: VerifyResult = VerifyContractInBrowser();
	return {
		pass: r.pass,
		provider: "stripe",
		reason: r.reason,
		interactions: r.interactions,
	};
}
