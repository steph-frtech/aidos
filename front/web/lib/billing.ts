import { createHash } from "node:crypto";

/**
 * lib/billing.ts — the S114 BILLING LAYER, the pure TS twin of back/runtime/billing
 * (the Go authority). It mirrors, deterministically and client-side-mirrorably: the
 * account plan ladder + declared quotas, metered usage COUNTED from the recorded
 * AgentRuns (never an estimate, never an LLM), quota enforcement (over-quota →
 * QUOTA_EXCEEDED + an upgrade path, never silent), and inbound provider webhook ingest
 * (idempotent, content-addressed — the S73 async operation run inbound).
 *
 * THE WALL (CLAUDE.md §2). Plans/usage/quotas/webhook-events are runtime/commercial
 * rows; this twin writes NO truth. A plan/limit is DECLARED data (§8 — never learned).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function is PURE and TOTAL; metering is a
 * COUNT; a webhook id is content-addressed (SHA-256 over canonical JSON, byte-identical
 * to the Go records.Hash) so the same event lands the same id (idempotent replay).
 */

export type Plan = "free" | "pro" | "scale" | "enterprise";
export const PLAN_LADDER: Plan[] = ["free", "pro", "scale", "enterprise"];

export function isPlan(p: string): p is Plan {
	return (PLAN_LADDER as string[]).includes(p);
}

/** nextPlan — the next tier up the ladder, or "" at the top (the upgrade path). */
export function nextPlan(p: Plan): Plan | "" {
	const i = PLAN_LADDER.indexOf(p);
	return i >= 0 && i + 1 < PLAN_LADDER.length ? PLAN_LADDER[i + 1] : "";
}

export interface Quota {
	maxLLMTokens: number;
	maxBuildLoopMinutes: number;
	maxSandboxHours: number;
	maxDeployedApps: number;
}

/** The DECLARED quota of each plan — byte-identical to the Go planQuotas table. */
export const PLAN_QUOTAS: Record<Plan, Quota> = {
	free: {
		maxLLMTokens: 100_000,
		maxBuildLoopMinutes: 60,
		maxSandboxHours: 5,
		maxDeployedApps: 1,
	},
	pro: {
		maxLLMTokens: 2_000_000,
		maxBuildLoopMinutes: 1_200,
		maxSandboxHours: 100,
		maxDeployedApps: 10,
	},
	scale: {
		maxLLMTokens: 20_000_000,
		maxBuildLoopMinutes: 12_000,
		maxSandboxHours: 1_000,
		maxDeployedApps: 100,
	},
	enterprise: {
		maxLLMTokens: 1_000_000_000,
		maxBuildLoopMinutes: 1_000_000,
		maxSandboxHours: 100_000,
		maxDeployedApps: 10_000,
	},
};

export function quotaOf(p: Plan): Quota {
	return PLAN_QUOTAS[p];
}

// ── metering (deterministic count) ──

export interface RunMeter {
	tokens: number;
	ciMinutes: number;
}
export interface MeteredRun {
	account: string;
	project: string;
	runId: string;
	meter: RunMeter;
	sandboxSeconds?: number;
	deployedApps?: number;
}
export interface Usage {
	account: string;
	runCount: number;
	llmTokens: number;
	buildLoopMinutes: number;
	sandboxHours: number;
	deployedApps: number;
}

function nonNeg(x: number): number {
	return x < 0 ? 0 : Math.trunc(x);
}

/** meterUsage — COUNT an account's usage from its recorded runs (pure monotone fold). */
export function meterUsage(account: string, runs: MeteredRun[]): Usage {
	const u: Usage = {
		account,
		runCount: 0,
		llmTokens: 0,
		buildLoopMinutes: 0,
		sandboxHours: 0,
		deployedApps: 0,
	};
	let sandboxSecs = 0;
	for (const r of runs) {
		if (r.account !== account) continue;
		u.runCount++;
		u.llmTokens += nonNeg(r.meter.tokens);
		u.buildLoopMinutes += nonNeg(r.meter.ciMinutes);
		sandboxSecs += nonNeg(r.sandboxSeconds ?? 0);
		u.deployedApps += nonNeg(r.deployedApps ?? 0);
	}
	u.sandboxHours = Math.trunc(sandboxSecs / 3600);
	return u;
}

/** meterProject — COUNT the usage attributable to ONE project (exact attribution). */
export function meterProject(
	account: string,
	project: string,
	runs: MeteredRun[],
): Usage {
	return meterUsage(
		account,
		runs.filter((r) => r.account === account && r.project === project),
	);
}

// ── quota enforcement ──

export type BlockCode = "QUOTA_EXCEEDED" | "UNKNOWN_PLAN";
export type Verdict = "allow" | "deny";

export interface BlockReason {
	code: BlockCode;
	severity: string;
	explanation: string;
	howToFix: string[];
}
export interface QuotaDecision {
	verdict: Verdict;
	overAxes?: string[];
	upgradeTo?: Plan | "";
	blockReason?: BlockReason;
}

function overQuotaAxes(q: Quota, u: Usage): string[] {
	const axes: string[] = [];
	if (u.llmTokens > q.maxLLMTokens) axes.push("llm_tokens");
	if (u.buildLoopMinutes > q.maxBuildLoopMinutes)
		axes.push("build_loop_minutes");
	if (u.sandboxHours > q.maxSandboxHours) axes.push("sandbox_hours");
	if (u.deployedApps > q.maxDeployedApps) axes.push("deployed_apps");
	return axes.sort();
}

/** checkQuota — over quota on ANY axis ⇒ DENY with QUOTA_EXCEEDED + an upgrade path. */
export function checkQuota(plan: string, u: Usage): QuotaDecision {
	if (!isPlan(plan)) {
		return {
			verdict: "deny",
			blockReason: {
				code: "UNKNOWN_PLAN",
				severity: "blocking",
				explanation: `le plan « ${plan} » n'est pas l'un des quatre plans déclarés (free, pro, scale, enterprise).`,
				howToFix: [
					`choisissez un plan valide parmi : ${PLAN_LADDER.join(", ")}`,
				],
			},
		};
	}
	const axes = overQuotaAxes(quotaOf(plan), u);
	if (axes.length === 0) return { verdict: "allow" };
	const up = nextPlan(plan);
	const fix = [
		`réduisez la consommation sur : ${axes.join(", ")} (attendez le prochain cycle ou trimmez les runs)`,
	];
	if (up)
		fix.push(
			`passez au plan supérieur « ${up} » pour relever le quota (chemin d'upgrade)`,
		);
	else
		fix.push(
			`contactez le support : le plan « ${plan} » est déjà le plus élevé (quota sur-mesure)`,
		);
	return {
		verdict: "deny",
		overAxes: axes,
		upgradeTo: up,
		blockReason: {
			code: "QUOTA_EXCEEDED",
			severity: "blocking",
			explanation: `le quota du plan « ${plan} » est dépassé sur ${axes.join(", ")} — un build au-delà du quota est refusé, JAMAIS un échec silencieux (le métrage est compté depuis les AgentRun enregistrés).`,
			howToFix: fix,
		},
	};
}

/** canRunBuild — the named gate the build-loop consults: may this account run a build? */
export function canRunBuild(plan: string, u: Usage): boolean {
	return checkQuota(plan, u).verdict === "allow";
}

// ── inbound provider webhooks (S73 async op, run inbound) ──

export type WebhookKind =
	| "checkout.completed"
	| "payment.succeeded"
	| "payment.failed"
	| "subscription.updated"
	| "subscription.canceled";

export const WEBHOOK_KINDS: WebhookKind[] = [
	"checkout.completed",
	"payment.succeeded",
	"payment.failed",
	"subscription.updated",
	"subscription.canceled",
];

export function isWebhookKind(k: string): k is WebhookKind {
	return (WEBHOOK_KINDS as string[]).includes(k);
}

export const PROVIDER_NAME = "stripe";
export const WEBHOOK_PATH = `/billing/webhooks/${PROVIDER_NAME}`;

export interface WebhookEvent {
	kind: WebhookKind;
	providerId: string;
	account: string;
	plan?: Plan | "";
}
export interface IngestEvent {
	id: string;
	event: WebhookEvent;
	appliedTo?: Plan | "";
}

function eventId(e: WebhookEvent): string {
	// canonical JSON (keys sorted) — byte-identical to the Go records.Canonicalize body.
	const body = {
		account: (e.account ?? "").trim(),
		kind: e.kind,
		plan: e.plan ?? "",
		provider_id: (e.providerId ?? "").trim(),
	};
	const sorted: Record<string, unknown> = {};
	for (const k of Object.keys(body).sort())
		sorted[k] = (body as Record<string, unknown>)[k];
	return createHash("sha256")
		.update(Buffer.from(JSON.stringify(sorted), "utf8"))
		.digest("hex");
}

export class InvalidWebhookError extends Error {}

function validWebhook(e: WebhookEvent): boolean {
	if (!isWebhookKind(e.kind)) return false;
	if (!(e.providerId ?? "").trim() || !(e.account ?? "").trim()) return false;
	if (
		(e.kind === "checkout.completed" || e.kind === "subscription.updated") &&
		!isPlan(String(e.plan))
	)
		return false;
	return true;
}

/** ingestWebhook — record an inbound event idempotently; a replay is suppressed. */
export function ingestWebhook(
	log: IngestEvent[],
	e: WebhookEvent,
): { log: IngestEvent[]; record: IngestEvent } {
	if (!validWebhook(e)) throw new InvalidWebhookError("invalid webhook event");
	const id = eventId(e);
	const prior = log.find((p) => p.id === id);
	if (prior) return { log, record: prior };
	const rec: IngestEvent = { id, event: e };
	if (e.kind === "checkout.completed" || e.kind === "subscription.updated")
		rec.appliedTo = e.plan;
	return { log: [...log, rec], record: rec };
}

/** applyEvent — the authoritative plan transition AFTER an event (never an LLM). */
export function applyEvent(current: Plan, e: WebhookEvent): Plan {
	switch (e.kind) {
		case "checkout.completed":
		case "subscription.updated":
			return isPlan(String(e.plan)) ? (e.plan as Plan) : current;
		case "subscription.canceled":
			return "free";
		default:
			return current;
	}
}
