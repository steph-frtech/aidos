"use server";

import {
	type IngestEvent,
	isPlan,
	isWebhookKind,
	type Plan,
	type Usage,
	type WebhookEvent,
} from "@/lib/billing";
import {
	demoIngest,
	demoPact,
	demoPlans,
	demoQuota,
	demoUsage,
	demoUsageProject,
	ingestArgs,
	type RunRow,
	runArgs,
	usageArgs,
} from "@/lib/billing-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	ingestDecoder,
	pactDecoder,
	plansDecoder,
	quotaDecoder,
	usageDecoder,
} from "./live";
import type {
	IngestView,
	MeterView,
	PactView,
	PlansView,
	QuotaView,
} from "./view";

/**
 * Server Actions for the /billing Workbench panel (S114 — the customer-facing economic plane:
 * plans, deterministic metered usage, quota enforcement, inbound provider webhooks, the Pact
 * contract).
 *
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). Every control now reads the LIVE
 * snapshot from the Go billing MCP server through the passerelle (`readVia(scope, "billing_plans" |
 * "billing_meter" | "billing_meter_project" | "billing_check_quota" | "billing_ingest_webhook" |
 * "billing_pact_verify", …)`, the dispatched below-the-line reads), with the twin `lib/billing`
 * compute preserved ONLY as the deterministic demo fallback (`lib/billing-data`, tagged
 * `source:"live"|"demo"`). The panel NO LONGER calls the twin functions client-side. The `readVia`
 * frontier import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback, never as the
 * live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallback (the same pure twin compute
 * the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * snapshot. THE WALL (§2/§9): every billing_* tool is below the line — a plan/quota is DECLARED
 * data, the metering a COUNT over the ledger; the panel WRITES NO TRUTH. The webhook ingest /
 * Pact verify are READS (dry-run, content-addressed, no kernel write).
 */

function parseRuns(raw: string): RunRow[] {
	try {
		const v: unknown = JSON.parse(raw);
		if (!Array.isArray(v)) return [];
		return v.flatMap((x, i): RunRow[] => {
			if (typeof x !== "object" || x === null) return [];
			const o = x as Record<string, unknown>;
			return [
				{
					id: typeof o.id === "string" ? o.id : `run-${i}`,
					project: typeof o.project === "string" ? o.project : "p1",
					tokens: typeof o.tokens === "number" ? o.tokens : 0,
					buildMinutes: typeof o.buildMinutes === "number" ? o.buildMinutes : 0,
				},
			];
		});
	} catch {
		return [];
	}
}

function parsePriorLog(raw: string): IngestEvent[] {
	try {
		const v: unknown = JSON.parse(raw);
		if (!Array.isArray(v)) return [];
		return v.flatMap((x): IngestEvent[] => {
			if (typeof x !== "object" || x === null) return [];
			const o = x as Record<string, unknown>;
			const ev = o.event;
			if (typeof ev !== "object" || ev === null) return [];
			const e = ev as Record<string, unknown>;
			if (typeof o.id !== "string") return [];
			const planRaw = typeof e.plan === "string" ? e.plan : "";
			return [
				{
					id: o.id,
					event: {
						kind: String(e.kind) as WebhookEvent["kind"],
						providerId: typeof e.providerId === "string" ? e.providerId : "",
						account: typeof e.account === "string" ? e.account : "",
						plan: isPlan(planRaw) ? (planRaw as Plan) : "",
					},
					appliedTo:
						typeof o.appliedTo === "string" && isPlan(o.appliedTo)
							? (o.appliedTo as Plan)
							: undefined,
				},
			];
		});
	} catch {
		return [];
	}
}

export async function plansAction(): Promise<PlansView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"billing_plans",
		{},
		plansDecoder,
		demoPlans(),
	);
	return { ran: true, plans: data, source };
}

export async function meterAction(
	_prev: MeterView,
	formData: FormData,
): Promise<MeterView> {
	const account = String(formData.get("account") ?? "acct-1");
	const runs = parseRuns(String(formData.get("runs") ?? "[]"));
	const project = formData.get("project");
	const scope = await panelScope();
	// LIVE read through the passerelle: account-wide or per-project metering (the dispatched
	// billing_meter / billing_meter_project tools); the twin demoUsage() is the deterministic
	// fallback (source:"live"|"demo") — ADR 0092.
	if (typeof project === "string" && project !== "") {
		const { data, source } = await readVia(
			scope,
			"billing_meter_project",
			{ account, project, runs: runArgs(account, runs) },
			usageDecoder,
			demoUsageProject(account, project, runs),
		);
		return {
			ran: true,
			usage: data,
			scopeLabel: project,
			source,
		};
	}
	const { data, source } = await readVia(
		scope,
		"billing_meter",
		{ account, runs: runArgs(account, runs) },
		usageDecoder,
		demoUsage(account, runs),
	);
	return { ran: true, usage: data, scopeLabel: "", source };
}

export async function quotaAction(
	_prev: QuotaView,
	formData: FormData,
): Promise<QuotaView> {
	const account = String(formData.get("account") ?? "acct-1");
	const planRaw = String(formData.get("plan") ?? "free");
	const plan: Plan = isPlan(planRaw) ? (planRaw as Plan) : "free";
	const runs = parseRuns(String(formData.get("runs") ?? "[]"));
	const scope = await panelScope();
	// The usage is COUNTED first (the same demo/live read), then enforced against the plan quota.
	const u: Usage = demoUsage(account, runs);
	const { data, source } = await readVia(
		scope,
		"billing_check_quota",
		{ plan, usage: usageArgs(u) },
		quotaDecoder,
		demoQuota(plan, u),
	);
	return { ran: true, plan, decision: data, source };
}

export async function ingestAction(
	_prev: IngestView,
	formData: FormData,
): Promise<IngestView> {
	const account = String(formData.get("account") ?? "acct-1");
	const kindRaw = String(formData.get("kind") ?? "checkout.completed");
	const planRaw = String(formData.get("plan") ?? "pro");
	const currentRaw = String(formData.get("current") ?? "free");
	const prior = parsePriorLog(String(formData.get("prior") ?? "[]"));
	const current: Plan = isPlan(currentRaw) ? (currentRaw as Plan) : "free";
	const event: WebhookEvent = {
		kind: isWebhookKind(kindRaw) ? kindRaw : (kindRaw as WebhookEvent["kind"]),
		providerId: "evt_demo",
		account,
		plan: isPlan(planRaw) ? (planRaw as Plan) : "",
	};
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched billing_ingest_webhook tool — a READ /
	// dry-run, content-addressed, idempotent; it writes NO kernel truth). The twin demoIngest() is
	// the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"billing_ingest_webhook",
		ingestArgs(event, prior, current),
		ingestDecoder,
		demoIngest(event, prior, current),
	);
	return { ran: true, read: data, source };
}

export async function pactAction(
	_prev: PactView,
	_formData: FormData,
): Promise<PactView> {
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched billing_pact_verify tool); the
	// browser-pure twin demoPact() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"billing_pact_verify",
		{},
		pactDecoder,
		demoPact(),
	);
	return { ran: true, pact: data, source };
}
