/**
 * The TruthScope projection — the Workbench /scopes source (AIDOS step S15).
 *
 * KRD §13.7 (TruthScope — "aucune vérité n'est universelle par défaut"): a TruthScope is
 * ONE of the four truth QUALIFIERS (KRD §13.6: truth_kind / TruthScope / VerifiabilityLevel
 * / AuthorityGraph) — it qualifies a Kernel truth, it is NOT a truth itself. It says
 * WHERE / WHEN / FOR-WHOM a truth holds: region, tenant, target, time_window, user_segment,
 * environment. The rule: "Une vérité sans scope est suspecte. Une décision réutilisée hors
 * scope est une hallucination structurelle." → an ACTIVE truth (TruthLifecycle §44.2) must
 * carry a scope, unless it is EXPLICITLY global (region "*", a deliberate escape hatch —
 * never the implicit default).
 *
 * This module is the DECLARED projection of the Go package back/kernel/scope — the same
 * §13.7 enums, the same IsGlobal == (region "*") predicate, the same active-truth guard —
 * so the /scopes panel verdicts exactly as the Go guard verdicts. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng,
 * no I/O — so the same record always yields the same verdict. The reproducibility mirror
 * lib/scope.test.ts (fast-check) pins the load-bearing reject rule, the explicit-global
 * pass, the present-scope pass, the non-active exemption, IsGlobal ⇔ "*", §13.7 enum
 * cardinalities, and determinism.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /scopes renders the guard's verdict over
 * candidate records; it never writes truth (the wall). Truth-writes (and any rescope) go
 * via propose → ChangeSet → approval (SemanticDiff change_type `rescope`, KRD §44.1),
 * never from this screen.
 */

/** The four KRD §13.7 regions (incl. the EXPLICIT global "*"), in canonical order. */
export const REGIONS = ["FR", "EU", "US", "*"] as const;
export type Region = (typeof REGIONS)[number];

/** The explicit global escape hatch (KRD §13.7). Never implicit. */
export const REGION_GLOBAL: Region = "*";

/** The five KRD §13.7 targets, in canonical order. */
export const TARGETS = ["web", "mobile", "voice", "xr", "iot"] as const;
export type Target = (typeof TARGETS)[number];

/** The three KRD §13.7 user segments, in canonical order. */
export const USER_SEGMENTS = ["premium", "standard", "guest"] as const;
export type UserSegment = (typeof USER_SEGMENTS)[number];

/** The three KRD §13.7 environments, in canonical order. */
export const ENVIRONMENTS = ["prod", "staging", "dev"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** The four KRD §44.2 TruthLifecycle statuses, in canonical order. */
export const LIFECYCLE_STATUSES = [
	"active",
	"deprecated",
	"shadowed",
	"removed",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/** A §13.7 validity window (opaque string bounds — §13.7 leaves the type as "..."). */
export interface TimeWindow {
	from?: string;
	to?: string;
}

/** The §13.7 "where/when/for-whom" qualifier — the six dimensions verbatim. */
export interface TruthScope {
	region?: string;
	tenant?: string;
	target?: string;
	timeWindow?: TimeWindow;
	userSegment?: string;
	environment?: string;
}

/** The minimal projection of a truth this guard reads (mirrors scope.Record). */
export interface ScopeRecord {
	status: string;
	scope: TruthScope;
}

/** The S15-local refusal code (mirrors scope.CodeActiveTruthWithoutScope). */
export const CODE_ACTIVE_TRUTH_WITHOUT_SCOPE = "active-truth-without-scope";

/** The guard verdict for a record (the value the /scopes panel renders). */
export type Verdict = "accepted" | "global" | "rejected";

function timeWindowIsZero(w?: TimeWindow): boolean {
	return !w || ((w.from ?? "") === "" && (w.to ?? "") === "");
}

/**
 * isEmpty — a scope carries NO dimension at all (the absent scope). Mirrors
 * scope.TruthScope.IsEmpty. A scope with any dimension set is non-empty.
 */
export function isEmpty(s: TruthScope): boolean {
	return (
		(s.region ?? "") === "" &&
		(s.tenant ?? "") === "" &&
		(s.target ?? "") === "" &&
		timeWindowIsZero(s.timeWindow) &&
		(s.userSegment ?? "") === "" &&
		(s.environment ?? "") === ""
	);
}

/**
 * isGlobal — the EXPLICIT global "*" (KRD §13.7). A named, deliberate predicate: global
 * is NEVER implicit, so the empty scope is NOT global. isGlobal ⇔ region === "*".
 */
export function isGlobal(s: TruthScope): boolean {
	return s.region === REGION_GLOBAL;
}

/**
 * verdict — the pure guard of KRD §13.7's rule, mirroring scope.Validate:
 *   status === "active" ∧ scope empty ∧ ¬isGlobal ⇒ "rejected" (active truth without a scope)
 *   status === "active" ∧ isGlobal               ⇒ "global"  (the explicit universal passes)
 *   otherwise (non-active, OR a present non-empty scope) ⇒ "accepted".
 */
export function verdict(r: ScopeRecord): Verdict {
	if (r.status !== "active") return "accepted";
	if (isGlobal(r.scope)) return "global";
	if (isEmpty(r.scope)) return "rejected";
	return "accepted";
}

/** rejectionCode — the S15 code when verdict is "rejected" (empty otherwise). */
export function rejectionCode(r: ScopeRecord): string {
	return verdict(r) === "rejected" ? CODE_ACTIVE_TRUTH_WITHOUT_SCOPE : "";
}

/** The non-empty, labelled scope dimensions for a record, in canonical order. */
export interface ScopeDimension {
	key: string;
	value: string;
}

export function dimensions(s: TruthScope): ScopeDimension[] {
	const out: ScopeDimension[] = [];
	if (s.region) out.push({ key: "region", value: s.region });
	if (s.tenant) out.push({ key: "tenant", value: s.tenant });
	if (s.target) out.push({ key: "target", value: s.target });
	if (!timeWindowIsZero(s.timeWindow)) {
		const w = s.timeWindow as TimeWindow;
		out.push({
			key: "time_window",
			value: `${w.from ?? "…"} → ${w.to ?? "…"}`,
		});
	}
	if (s.userSegment) out.push({ key: "user_segment", value: s.userSegment });
	if (s.environment) out.push({ key: "environment", value: s.environment });
	return out;
}
