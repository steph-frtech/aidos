/**
 * ContextGraphDecision — the Workbench /decision-reuse source (AIDOS step S32).
 *
 * KRD §119.2: the DETERMINISTIC, LLM-FREE control-plane gate that decides whether a PAST
 * decision / MemoryItem may be REUSED for a new request, by checking EXACTLY four declared
 * dimensions — time / scope / authority / conditions — and emitting
 * {mayReuse, reason, checked, requiredHumanReview}. The verdict is FALSE-DOMINANT: any failing
 * check blocks reuse. "Le LLM ne vit pas dans le ContextGraph" — the graph PERMITS or BLOCKS;
 * agents PROPOSE; the Execution Layer ACTS.
 *
 * This module is the DECLARED TWIN of the Go package back/archive/brain/contextgraph — the SAME
 * pure `decide(candidate, request, now)`, the SAME four declared predicates in the SAME order,
 * the SAME false-dominance. One semantics, no drift — so /decision-reuse renders EXACTLY what the
 * Go engine computes. NO LLM call, NO network, NO clock (now is passed in). The reproducibility
 * mirror lib/contextgraph.test.ts (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /decision-reuse PROJECTS the recorded reuse
 * ledger; `context` is a TRUTH schema above the waterline (the agent reads SELECT-only). A new
 * decision is recorded by the aidos writer role via a ChangeSet (S20), never this screen.
 */

/** The EXACTLY FOUR declared reuse dimensions (twin of contextgraph.Dimension). */
export type Dimension = "time" | "scope" | "authority" | "conditions";

/** The four dimensions in canonical false-dominant evaluation order (twin of Dimensions()). */
export const DIMENSIONS: Dimension[] = [
	"time",
	"scope",
	"authority",
	"conditions",
];

/** A TruthScope (twin of S15 scope.TruthScope) — where/when/for-whom a decision held. */
export interface TruthScope {
	region?: string;
	tenant?: string;
	target?: string;
	userSegment?: string;
	environment?: string;
	timeWindow?: { from?: string; to?: string };
}

/** A declared reuse condition (twin of contextgraph.Condition): facts[key] must equal value. */
export interface Condition {
	key: string;
	equals: string;
}

/** The candidate past decision being judged for reuse (twin of contextgraph.Candidate). */
export interface Candidate {
	id: string;
	scope: TruthScope;
	expiresAt?: string;
	authority?: { domain?: string; truthKind?: string };
	conditions?: Condition[];
}

/** The new request the reuse is judged against (twin of contextgraph.RequestContext). */
export interface RequestContext {
	scope: TruthScope;
	domain?: string;
	truthKind?: string;
	facts?: Record<string, string>;
}

/** The §119.2 verdict (twin of contextgraph.ContextGraphDecision). */
export interface ContextGraphDecision {
	candidateId: string;
	mayReuse: boolean;
	reason: string;
	checked: Dimension[];
	requiredHumanReview: boolean;
}

const REGION_GLOBAL = "*";

function timeContains(
	c: Candidate,
	now: Date,
): { ok: boolean; reason: string } {
	const from = c.scope.timeWindow?.from ?? "";
	let to = c.scope.timeWindow?.to ?? "";
	if (to === "") to = c.expiresAt ?? "";

	if (from !== "") {
		const start = Date.parse(from);
		if (Number.isNaN(start))
			return {
				ok: false,
				reason: `dimension time : la borne de début « ${from} » est mal formée — bloqué.`,
			};
		if (now.getTime() < start)
			return {
				ok: false,
				reason: `dimension time : « now » précède le début de la fenêtre de validité (${from}) — bloqué.`,
			};
	}
	if (to !== "") {
		const end = Date.parse(to);
		if (Number.isNaN(end))
			return {
				ok: false,
				reason: `dimension time : la borne de fin « ${to} » est mal formée — bloqué.`,
			};
		if (now.getTime() > end)
			return {
				ok: false,
				reason: `dimension time : la décision a expiré (fenêtre jusqu'à ${to}). Une décision expirée n'est pas réutilisable.`,
			};
	}
	return { ok: true, reason: "" };
}

function dimMismatch(
	name: string,
	candidate?: string,
	request?: string,
): string | null {
	if (candidate && candidate !== "" && request !== candidate)
		return `dimension scope : la décision visait ${name}=« ${candidate} » mais la requête vise « ${request ?? "(non spécifié)"} » — hors scope (no_reuse_outside_scope).`;
	return null;
}

function scopeContains(
	candidate: TruthScope,
	request: TruthScope,
): { ok: boolean; reason: string } {
	if (
		candidate.region &&
		candidate.region !== "" &&
		candidate.region !== REGION_GLOBAL
	) {
		if (request.region !== candidate.region)
			return {
				ok: false,
				reason: `dimension scope : la décision visait la région « ${candidate.region} » mais la requête vise « ${request.region ?? "(aucune région)"} » — hors scope (no_reuse_outside_scope). Une décision réutilisée hors scope est une hallucination structurelle.`,
			};
	}
	for (const [name, c, r] of [
		["tenant", candidate.tenant, request.tenant],
		["target", candidate.target, request.target],
		["user_segment", candidate.userSegment, request.userSegment],
		["environment", candidate.environment, request.environment],
	] as const) {
		const msg = dimMismatch(name, c, r);
		if (msg) return { ok: false, reason: msg };
	}
	return { ok: true, reason: "" };
}

function authorityHolds(
	auth: Candidate["authority"],
	request: RequestContext,
): { ok: boolean; reason: string } {
	if (!request.domain || request.domain === "") return { ok: true, reason: "" };
	const domain = auth?.domain ?? "";
	const truthKind = auth?.truthKind ?? "";
	if (domain !== "" && request.domain !== domain)
		return {
			ok: false,
			reason: `dimension authority : le détenteur d'autorité gouverne le domaine « ${domain} » mais la requête vise « ${request.domain} » — l'autorité ne tient plus, une revue humaine est requise (KRD §13.8).`,
		};
	if (
		request.truthKind &&
		request.truthKind !== "" &&
		truthKind !== "" &&
		request.truthKind !== truthKind
	)
		return {
			ok: false,
			reason: `dimension authority : le détenteur gouverne le truth_kind « ${truthKind} » mais la requête vise « ${request.truthKind} » — l'autorité ne tient plus, revue humaine requise (KRD §13.8).`,
		};
	return { ok: true, reason: "" };
}

function conditionsHold(
	conds: Condition[] | undefined,
	facts: Record<string, string> | undefined,
): { ok: boolean; reason: string } {
	for (const c of conds ?? []) {
		const v = facts?.[c.key];
		if (v === undefined || v !== c.equals)
			return {
				ok: false,
				reason: `dimension conditions : la condition de réutilisation déclarée (${c.key} == « ${c.equals} ») ne tient pas — bloqué.`,
			};
	}
	return { ok: true, reason: "" };
}

/**
 * decide — the pure, LLM-free reuse gate of KRD §119.2 (twin of Go contextgraph.Decide). It
 * evaluates the four declared predicates in canonical order (time → scope → authority →
 * conditions), false-dominant: the first failing check blocks reuse and the verdict names the
 * failing dimension. `now` is passed in (never read from the clock) so the verdict is
 * deterministic and replayable.
 */
export function decide(
	candidate: Candidate,
	request: RequestContext,
	now: Date,
): ContextGraphDecision {
	const checked: Dimension[] = [];

	checked.push("time");
	const t = timeContains(candidate, now);
	if (!t.ok)
		return {
			candidateId: candidate.id,
			mayReuse: false,
			reason: t.reason,
			checked,
			requiredHumanReview: false,
		};

	checked.push("scope");
	const s = scopeContains(candidate.scope, request.scope);
	if (!s.ok)
		return {
			candidateId: candidate.id,
			mayReuse: false,
			reason: s.reason,
			checked,
			requiredHumanReview: false,
		};

	checked.push("authority");
	const a = authorityHolds(candidate.authority, request);
	if (!a.ok)
		return {
			candidateId: candidate.id,
			mayReuse: false,
			reason: a.reason,
			checked,
			requiredHumanReview: true,
		};

	checked.push("conditions");
	const cd = conditionsHold(candidate.conditions, request.facts);
	if (!cd.ok)
		return {
			candidateId: candidate.id,
			mayReuse: false,
			reason: cd.reason,
			checked,
			requiredHumanReview: false,
		};

	return {
		candidateId: candidate.id,
		mayReuse: true,
		reason: `réutilisation autorisée : les quatre dimensions déclarées sont satisfaites pour le candidat « ${candidate.id} ».`,
		checked,
		requiredHumanReview: false,
	};
}

/** A per-dimension pass/fail mark for the ledger chips. A dimension not yet reached is "skip". */
export type ChipState = "pass" | "fail" | "skip";

/** chipStates — the four dimension chips for a verdict: passed (reached, not the blocker), failed
 * (the blocking dimension = the last checked when blocked), or skip (never reached, false-dominant). */
export function chipStates(
	d: ContextGraphDecision,
): Record<Dimension, ChipState> {
	const out: Record<Dimension, ChipState> = {
		time: "skip",
		scope: "skip",
		authority: "skip",
		conditions: "skip",
	};
	const blocked = !d.mayReuse;
	d.checked.forEach((dim, i) => {
		const isLast = i === d.checked.length - 1;
		out[dim] = blocked && isLast ? "fail" : "pass";
	});
	return out;
}
