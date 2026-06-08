/**
 * doltgres-spike — the TS twin of back/runtime/doltgresspike (S88, ADR 0006
 * addendum 0047). DETERMINISM-FIRST (CLAUDE.md §6/§8): the spike verdict is a
 * PURE function — a count + two comparisons, NEVER an LLM. Same Measurement +
 * Thresholds → byte-identical Decision (same content-addressed id). The Vitest
 * mirror (doltgres-spike.test.ts) pins same-input→same-output and the gating
 * invariants; the authoritative engine is the Go package (this twin lets the
 * Workbench run the verdict from the screen without a backend round-trip).
 *
 * THE WALL (CLAUDE.md §2): pure judgment over a supplied measurement — writes
 * NOTHING. The emitted-app DEFAULT target is ALWAYS plain-postgres (the escape
 * hatch by construction); Doltgres is opt-in iff the verdict is Go.
 */

export type Target = "plain-postgres" | "doltgres";
export type Verdict = "go" | "no-go";
export type Driver = "ts-postgres" | "pgx";

export interface Thresholds {
	/** largest tolerated (Doltgres / plain-Postgres) latency ratio under load. */
	maxPerfRatio: number;
	/** largest tolerated number of failed connections (panic/drop/corruption). */
	maxFailedConns: number;
}

/** the DECLARED S88 criteria (above the line, never learned). */
export const DEFAULT_THRESHOLDS: Thresholds = {
	maxPerfRatio: 6.0,
	maxFailedConns: 0,
};

export interface Measurement {
	driver: Driver;
	/** N — concurrent connections submitted. */
	conns: number;
	/** how many ended in panic / dropped connection / corrupted result. */
	failedConns: number;
	/** measured (Doltgres / plain-Postgres) latency ratio; 0 = not measured. */
	perfRatio: number;
	/** whether a re-run produced the same outcome (a blip never flips the default). */
	reproducible: boolean;
}

export interface Decision {
	id: string;
	verdict: Verdict;
	/** ALWAYS plain-postgres — the escape hatch by construction. */
	defaultTarget: Target;
	/** plain-postgres always; doltgres iff verdict === "go". */
	optInTargets: Target[];
	measurement: Measurement;
	thresholds: Thresholds;
	reasons: string[];
}

/**
 * evaluate is the authoritative pure judgment: Measurement × Thresholds →
 * (verdict, reasons). Total, deterministic, side-effect-free. A no-go requires a
 * REPRODUCIBLE instability past the connection ceiling, OR a perf ratio over the
 * declared ceiling; a non-reproducible blip never flips the default (the
 * done-criteria require a reproducible failure). An unmeasured ratio (0) is the
 * worst case.
 */
export function evaluate(
	m: Measurement,
	th: Thresholds,
): { verdict: Verdict; reasons: string[] } {
	const reasons: string[] = [];

	let stableEnough = m.failedConns <= th.maxFailedConns;
	if (!stableEnough && m.reproducible) {
		reasons.push(
			`reproducible instability: ${m.failedConns}/${m.conns} connections failed (ceiling ${th.maxFailedConns}) under driver "${m.driver}"`,
		);
	}
	if (!stableEnough && !m.reproducible) {
		reasons.push(
			`non-reproducible instability (${m.failedConns}/${m.conns}) — NOT a no-go per done-criteria; recorded as caveat`,
		);
		stableEnough = true;
	}

	const ratio = m.perfRatio;
	const perfOK = ratio > 0 && ratio <= th.maxPerfRatio;
	if (ratio <= 0) {
		reasons.push("perf ratio not measured — treated as worst case (no-go)");
	} else if (!perfOK) {
		reasons.push(
			`perf ratio ${ratio.toFixed(2)}× exceeds declared ceiling ${th.maxPerfRatio.toFixed(2)}×`,
		);
	} else {
		reasons.push(
			`perf ratio ${ratio.toFixed(2)}× within declared ceiling ${th.maxPerfRatio.toFixed(2)}×`,
		);
	}

	if (stableEnough && perfOK) {
		reasons.push(
			`stability OK: ${m.conns - m.failedConns}/${m.conns} connections survived under driver "${m.driver}" → Doltgres offerable as opt-in`,
		);
		return { verdict: "go", reasons };
	}
	return { verdict: "no-go", reasons };
}

/** the canonical bytes hashed into the decision id (twin of the Go canonicalPayload). */
export function canonicalPayload(
	verdict: Verdict,
	defaultTarget: Target,
	optInTargets: Target[],
	m: Measurement,
	th: Thresholds,
): string {
	// Matches Go's json.Marshal field order for byte-identical hashing.
	return JSON.stringify({
		verdict,
		defaultTarget,
		optInTargets,
		measurement: {
			driver: m.driver,
			conns: m.conns,
			failedConns: m.failedConns,
			perfRatio: m.perfRatio,
			reproducible: m.reproducible,
		},
		thresholds: {
			maxPerfRatio: th.maxPerfRatio,
			maxFailedConns: th.maxFailedConns,
		},
	});
}

/**
 * decide turns a Measurement into a content-addressed Decision. The default
 * target is ALWAYS plain-postgres; Doltgres joins the opt-in set only on a Go.
 *
 * The sha256 is imported LAZILY (dynamic `node:crypto`) so this module stays
 * client-bundle-safe — a client component may import the types + DEFAULT_THRESHOLDS
 * + MEASURED_SPIKE without dragging Node crypto into the browser bundle (the same
 * pattern as lib/relation-emitter's actions). `decide` therefore runs server-side
 * (Server Action) or in Node (Vitest), never in the browser.
 */
export async function decide(
	m: Measurement,
	th: Thresholds = DEFAULT_THRESHOLDS,
): Promise<Decision> {
	const { verdict, reasons } = evaluate(m, th);
	const optInTargets: Target[] =
		verdict === "go" ? ["doltgres", "plain-postgres"] : ["plain-postgres"];
	optInTargets.sort();
	const { createHash } = await import("node:crypto");
	const id = createHash("sha256")
		.update(canonicalPayload(verdict, "plain-postgres", optInTargets, m, th))
		.digest("hex");
	return {
		id,
		verdict,
		defaultTarget: "plain-postgres",
		optInTargets,
		measurement: m,
		thresholds: th,
		reasons,
	};
}

export function optInAllowed(d: Decision, t: Target): boolean {
	return d.optInTargets.includes(t);
}

/**
 * The measured S88 run (2026-06-08, decision 7395fa69c2d7): N=64 concurrent
 * connections against a real Doltgres container, 0 failures, reproducible, perf
 * within the declared ceiling → Go. Plain-postgres stays the default. Used to
 * pre-fill the screen so the control is reachable AND executable.
 */
export const MEASURED_SPIKE: Measurement = {
	driver: "pgx",
	conns: 64,
	failedConns: 0,
	perfRatio: 0.3,
	reproducible: true,
};
