import type {
	BlockCode,
	IngestEvent,
	Plan,
	QuotaDecision,
	Usage,
	WebhookKind,
} from "../../lib/billing";
import { isPlan } from "../../lib/billing";
import type { IngestRead, PactRead, PlanRow } from "../../lib/billing-data";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /billing live reads — the decoders over the Go billing MCP tools' output (ADR 0092 kill-twins
 * flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions) so the
 * parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of
 * the live wire shape; the static PlanRow / Usage / QuotaDecision / IngestRead / PactRead are the
 * front twin's types the decoders fill. The parity mirror pins the decoders == the Go billingsrv
 * contract (plansOutput.plans[{plan, quota, next}] ; meterOutput.usage ; checkQuotaOutput{verdict,
 * over_axes, upgrade_to, code, explanation, how_to_fix} ; ingestOutput{accepted, duplicate,
 * event_id, applied_to, next_plan, log, code, explanation} ; pactVerifyOutput{pass, provider,
 * reason, interactions}), NOT a second implementation of the billing logic (the Go billing runtime
 * is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo snapshot. THE WALL (§2): every read is below-the-line — plans/usage/quotas
 * are DECLARED/counted rows, read-only; no truth is written.
 */

function decodePlan(raw: unknown): Plan | null {
	const s = str(raw);
	if (s === null) return null;
	return isPlan(s) ? s : null;
}

/** decodeUsage decodes the Go `billing.Usage` (snake_case) into the front Usage. */
function decodeUsage(raw: unknown): Usage | null {
	if (!isObject(raw)) return null;
	const account = str(raw.account);
	const runCount = num(raw.run_count);
	const llmTokens = num(raw.llm_tokens);
	const buildLoopMinutes = num(raw.build_loop_minutes);
	const sandboxHours = num(raw.sandbox_hours);
	const deployedApps = num(raw.deployed_apps);
	if (
		account === null ||
		runCount === null ||
		llmTokens === null ||
		buildLoopMinutes === null ||
		sandboxHours === null ||
		deployedApps === null
	) {
		return null;
	}
	return {
		account,
		runCount,
		llmTokens,
		buildLoopMinutes,
		sandboxHours,
		deployedApps,
	};
}

/**
 * plansDecoder decodes the Go `billing_plans` plansOutput ({ plans: [{plan, quota, next}] }) into
 * the front PlanRow[]. The quota is the declared `billing.Quota` (snake_case). A missing required
 * field on any row → null (→ demo fallback).
 */
export const plansDecoder: Decoder<PlanRow[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr<PlanRow>((r) => {
		if (!isObject(r)) return null;
		const plan = decodePlan(r.plan);
		if (plan === null) return null;
		const q = r.quota;
		if (!isObject(q)) return null;
		const maxLLMTokens = num(q.max_llm_tokens);
		const maxBuildLoopMinutes = num(q.max_build_loop_minutes);
		const maxSandboxHours = num(q.max_sandbox_hours);
		const maxDeployedApps = num(q.max_deployed_apps);
		if (
			maxLLMTokens === null ||
			maxBuildLoopMinutes === null ||
			maxSandboxHours === null ||
			maxDeployedApps === null
		) {
			return null;
		}
		// `next` is the upgrade target — "" at the top of the ladder (omitempty on the Go side).
		const nextRaw = str(r.next) ?? "";
		const next: Plan | "" = isPlan(nextRaw) ? nextRaw : "";
		return {
			plan,
			quota: {
				maxLLMTokens,
				maxBuildLoopMinutes,
				maxSandboxHours,
				maxDeployedApps,
			},
			next,
		};
	})(raw.plans);
};

/**
 * usageDecoder decodes the Go `billing_meter` / `billing_meter_project` meterOutput ({ usage })
 * into the front Usage. A missing usage / required count → null (→ demo fallback).
 */
export const usageDecoder: Decoder<Usage> = (raw) => {
	if (!isObject(raw)) return null;
	return decodeUsage(raw.usage);
};

/**
 * quotaDecoder decodes the Go `billing_check_quota` checkQuotaOutput ({ verdict, over_axes,
 * upgrade_to, code, explanation, how_to_fix }) into the front QuotaDecision. A deny carries the
 * over-axes + the upgrade path + a BlockReason rebuilt from the FLAT advisory triplet (code /
 * explanation / how_to_fix). An absent code → no BlockReason (an allow). A missing/invalid verdict
 * → null (→ demo fallback).
 */
export const quotaDecoder: Decoder<QuotaDecision> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = str(raw.verdict);
	if (verdict !== "allow" && verdict !== "deny") return null;
	if (verdict === "allow") return { verdict: "allow" };
	const overAxes = arr(str)(raw.over_axes ?? []) ?? [];
	const upgradeRaw = str(raw.upgrade_to) ?? "";
	const upgradeTo: Plan | "" = isPlan(upgradeRaw) ? upgradeRaw : "";
	const code = str(raw.code) ?? "";
	const explanation = str(raw.explanation) ?? "";
	const howToFix = arr(str)(raw.how_to_fix ?? []) ?? [];
	const decision: QuotaDecision = { verdict: "deny", overAxes, upgradeTo };
	if (code !== "") {
		decision.blockReason = {
			code: code as BlockCode,
			severity: "blocking",
			explanation,
			howToFix,
		};
	}
	return decision;
};

/** decodeIngestEvent decodes one Go `billing.IngestEvent` (nested event, snake_case) into the front shape. */
function decodeIngestEvent(raw: unknown): IngestEvent | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const ev = raw.event;
	if (id === null || !isObject(ev)) return null;
	const kind = str(ev.kind);
	const providerId = str(ev.provider_id);
	const account = str(ev.account);
	if (kind === null || providerId === null || account === null) return null;
	const planRaw = str(ev.plan) ?? "";
	const plan: Plan | "" = isPlan(planRaw) ? planRaw : "";
	const appliedRaw = str(raw.applied_to) ?? "";
	const appliedTo: Plan | "" = isPlan(appliedRaw) ? appliedRaw : "";
	const out: IngestEvent = {
		id,
		event: { kind: kind as WebhookKind, providerId, account, plan },
	};
	if (appliedTo !== "") out.appliedTo = appliedTo;
	return out;
}

/**
 * ingestDecoder decodes the Go `billing_ingest_webhook` ingestOutput into the front IngestRead. The
 * log is the full ingest ledger after the event; `next_plan` is the account's plan AFTER the
 * transition. A refused (malformed) event rides `accepted:false` + a code/explanation. A missing
 * `accepted` boolean or a malformed log → null (→ demo fallback).
 */
export const ingestDecoder: Decoder<IngestRead> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.accepted !== "boolean") return null;
	const log = arr(decodeIngestEvent)(raw.log ?? []);
	if (log === null) return null;
	const nextRaw = str(raw.next_plan) ?? "";
	const nextPlanVal: Plan | "" = isPlan(nextRaw) ? nextRaw : "";
	const appliedRaw = str(raw.applied_to) ?? "";
	const appliedTo: Plan | "" = isPlan(appliedRaw) ? appliedRaw : "";
	const out: IngestRead = {
		accepted: raw.accepted,
		duplicate: raw.duplicate === true,
		eventId: str(raw.event_id) ?? "",
		appliedTo,
		nextPlan: nextPlanVal,
		log,
	};
	const code = str(raw.code);
	if (code !== null && code !== "") out.code = code;
	const explanation = str(raw.explanation);
	if (explanation !== null && explanation !== "") out.explanation = explanation;
	return out;
};

/**
 * pactDecoder decodes the Go `billing_pact_verify` pactVerifyOutput ({ pass, provider, reason,
 * interactions }) into the front PactRead. A missing `pass` boolean → null (→ demo fallback).
 */
export const pactDecoder: Decoder<PactRead> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.pass !== "boolean") return null;
	const provider = str(raw.provider) ?? "";
	const reason = str(raw.reason) ?? "";
	const interactions = arr(str)(raw.interactions ?? []) ?? [];
	return { pass: raw.pass, provider, reason, interactions };
};
