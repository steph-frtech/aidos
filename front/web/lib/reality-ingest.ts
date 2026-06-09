/**
 * The reality-ingest twin — the Workbench /reality-ingest source (AIDOS S106, EPIC 12 / E12).
 *
 * The DECLARED projection of the Go package back/runtime/realityingest: the PURE, DETERMINISTIC
 * external loop that turns a DEPLOYED emitted app's production OpenTelemetry DIVERGENCE into a
 * project-scoped RealityMirror (provenance=incident) and a DRAFT idea whose text is a
 * DETERMINISTIC TEMPLATE projection — never an LLM summary (ROADMAP §S106).
 *
 *   - detectDivergence — compare a telemetry report against a mirror's expectation; return the
 *     project-scoped divergence record (error_rate | latency), or null when prod is within the
 *     mirror's promise. The deterministic detection frontier (ROADMAP §S106 "détection = code").
 *   - renderIdeaText — fill a FIXED template over the divergence record. Same record ⇒
 *     byte-identical text. No summarisation, no generation, no judgment.
 *   - ingest — the whole loop: detect → RealityMirror → DRAFT idea (template text,
 *     provenance=incident). Null on a healthy app.
 *
 * THE WALL (CLAUDE.md §2): reality NEVER writes truth. The only outward edge is a DRAFT idea
 * (idea → mirror → /goal → approval); wroteKernel is always false and the direct Reality→Kernel
 * edge is always refused. This twin returns a VALUE — the Go output is AUTHORITATIVE.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE — no clock, no rng, no I/O, no
 * LLM. The reproducibility mirror lib/reality-ingest.test.ts (fast-check) pins same-input ⇒
 * same-output for BOTH the detection and the rédaction.
 */

/** The telemetry-reader per-operation aggregate a deployed app's OTel exporter feeds (S43/E12). */
export interface TelemetryReport {
	operation: string;
	calls: number;
	errors: number;
	p99Ms: number;
}

/** The mirror's PROMISE about an operation in production — the bar the comparison checks. */
export interface MirrorExpectation {
	mirrorRef: string;
	operation: string;
	/** highest tolerated error rate in [0,1]. */
	maxErrorRate: number;
	/** highest tolerated p99 in ms; 0 ⇒ unchecked. */
	maxP99Ms: number;
}

export type DivergenceKind = "error_rate" | "latency";

/** The project-scoped record of one way production disagreed with a mirror (S106). */
export interface Divergence {
	id: string;
	projectId: string;
	operation: string;
	kind: DivergenceKind;
	mirrorRef: string;
	observed: number;
	expected: number;
	calls: number;
}

/** The DRAFT idea a divergence sketched (provenance=incident; intent = template text). */
export interface DraftFromDivergence {
	projectId: string;
	divergence: Divergence;
	idea: {
		proposes: string;
		intent: string;
		provenanceSource: "incident";
		provenanceDetail: string;
		status: "draft";
	};
	proposesPinned: boolean;
	openQuestion?: string;
	wroteKernel: false;
	toKernelRefusalCode: "REALITY_CANNOT_DECLARE_TRUTH";
}

/** the observed error rate in [0,1]; zero calls ⇒ 0. */
export function errorRate(r: TelemetryReport): number {
	if (r.calls <= 0) return 0;
	return r.errors / r.calls;
}

/** formatRate renders a rate in [0,1] as a fixed one-decimal percentage ("30.0%"). */
export function formatRate(r: number): string {
	return `${(r * 100).toFixed(1)}%`;
}

/** formatMs renders a ms value as a fixed integer-ms string ("1800ms"). */
export function formatMs(ms: number): string {
	return `${Math.round(ms)}ms`;
}

/**
 * A deterministic content-address over the divergence body (the project scope IS part of it).
 * It mirrors the Go records.Hash over a canonical key-sorted body; here a stable FNV-1a hex over
 * the same canonical JSON keeps the twin self-consistent (the Go id is authoritative on the wire).
 */
function divergenceId(d: Omit<Divergence, "id">): string {
	const canonical = JSON.stringify({
		calls: d.calls,
		div_kind: d.kind,
		expected: d.expected,
		kind: "divergence",
		mirror_ref: d.mirrorRef,
		observed: d.observed,
		operation: d.operation,
		project_id: d.projectId,
	});
	let h = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i++) {
		h ^= canonical.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * detectDivergence is the DETERMINISTIC detector (ROADMAP §S106 "détection = code"): a pure
 * numeric comparison of a telemetry report against a mirror's expectation — NEVER an LLM. It
 * returns the project-scoped divergence record when prod broke a promise, or null when within
 * bounds. Error-rate is checked first (byte-stable order); the first broken promise is reported.
 */
export function detectDivergence(
	projectId: string,
	report: TelemetryReport,
	exp: MirrorExpectation,
): Divergence | null {
	if (report.operation === "" || report.operation !== exp.operation)
		return null;

	const rate = errorRate(report);
	if (rate > exp.maxErrorRate) {
		const body = {
			projectId,
			operation: report.operation,
			kind: "error_rate" as const,
			mirrorRef: exp.mirrorRef,
			observed: rate,
			expected: exp.maxErrorRate,
			calls: report.calls,
		};
		return { id: divergenceId(body), ...body };
	}
	if (exp.maxP99Ms > 0 && report.p99Ms > exp.maxP99Ms) {
		const body = {
			projectId,
			operation: report.operation,
			kind: "latency" as const,
			mirrorRef: exp.mirrorRef,
			observed: report.p99Ms,
			expected: exp.maxP99Ms,
			calls: report.calls,
		};
		return { id: divergenceId(body), ...body };
	}
	return null;
}

/**
 * renderIdeaText is THE deterministic TEMPLATE projection (ROADMAP §S106: "la rédaction du texte
 * de l'Idea est une projection déterministe (template), jamais un résumé LLM"). It fills a FIXED
 * template over the divergence record — same record ⇒ byte-identical text. No summarisation.
 */
export function renderIdeaText(div: Divergence): string {
	if (div.kind === "error_rate") {
		return (
			`Production diverged from mirror "${div.mirrorRef}" in project "${div.projectId}": ` +
			`operation "${div.operation}" observed an error rate of ${formatRate(div.observed)} over ${div.calls} calls, ` +
			`but the mirror promises at most ${formatRate(div.expected)}. The kernel is incomplete by omission — ` +
			`a case prod hit that no fixture covered. Propose a mirror that covers this failure mode (human grills, then /goal decides).`
		);
	}
	return (
		`Production diverged from mirror "${div.mirrorRef}" in project "${div.projectId}": ` +
		`operation "${div.operation}" observed a p99 latency of ${formatMs(div.observed)} over ${div.calls} calls, ` +
		`but the mirror promises at most ${formatMs(div.expected)}. The kernel is incomplete by omission — ` +
		`a case prod hit that no fixture covered. Propose a mirror that covers this failure mode (human grills, then /goal decides).`
	);
}

/**
 * ingest is the S106 pipeline: detect the divergence, reflect it as a project-scoped
 * RealityMirror, and project it into a DRAFT idea whose text is the template rendering. Null when
 * prod is within the mirror's promise (no divergence ⇒ no idea invented). PURE — wroteKernel is
 * always false; the direct Reality→Kernel edge is always refused.
 */
export function ingest(
	projectId: string,
	report: TelemetryReport,
	exp: MirrorExpectation,
): DraftFromDivergence | null {
	const div = detectDivergence(projectId, report, exp);
	if (div === null) return null;

	// A failing OPERATION reference pins proposes=operation (REUSES reality.InferProposes); a
	// signal without an operation leaves it unset with an OpenQuestion (never guessed, §8).
	const pinned = div.operation !== "";
	return {
		projectId,
		divergence: div,
		idea: {
			proposes: pinned ? "operation" : "",
			intent: renderIdeaText(div),
			provenanceSource: "incident",
			provenanceDetail: div.id,
			status: "draft",
		},
		proposesPinned: pinned,
		openQuestion: pinned
			? undefined
			: `OQ: the divergence for operation "${div.operation}" in project "${projectId}" does not pin a proposes kind.`,
		wroteKernel: false,
		toKernelRefusalCode: "REALITY_CANNOT_DECLARE_TRUTH",
	};
}

// ── demo fixtures (the §S106 canonical out-of-stock divergence the panel boots with) ──

/** The canonical S106 mirror promise: createOrder succeeds (0 error tolerance, p99 ≤ 500ms). */
export const DEMO_EXPECTATION: MirrorExpectation = {
	mirrorRef: "createOrder-succeeds",
	operation: "createOrder",
	maxErrorRate: 0,
	maxP99Ms: 500,
};

/** The §S106 canonical divergent telemetry: createOrder fails 30% (300/1000) — out-of-stock. */
export const DEMO_DIVERGENT_REPORT: TelemetryReport = {
	operation: "createOrder",
	calls: 1000,
	errors: 300,
	p99Ms: 220,
};

/** A healthy report within the mirror's promise (0 errors) — produces NO idea. */
export const DEMO_HEALTHY_REPORT: TelemetryReport = {
	operation: "createOrder",
	calls: 1000,
	errors: 0,
	p99Ms: 220,
};

/** The deployed app this telemetry belongs to (multi-tenant scope, S55). */
export const DEMO_PROJECT_ID = "shop-42";
