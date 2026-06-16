"use server";

import {
	type Decoder,
	isObject,
	num,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	DEMO_DIVERGENT_REPORT,
	DEMO_EXPECTATION,
	DEMO_PROJECT_ID,
} from "@/lib/reality-ingest";

/**
 * /reality-ingest live read (S59 cutover). It runs the LIVE deterministic divergence detector
 * over the active project through the typed S58 gateway via the S59 SDK — the below-the-line
 * `detect_divergence` read of the dispatched reality-ingest server (S106/E12) — over the
 * canonical out-of-stock report + the mirror's promise. The live backend's PURE comparison is
 * confirmed against the twin, with the deterministic demo record preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. detect_divergence returns a VALUE (WroteKernel always
 * false); the direct Reality→Kernel edge is always refused. The only legal on-ramp stays
 * idea → mirror → /goal → approval — never a truth-write from this screen.
 *
 * DETERMINISM-FIRST (§6/§8): the detector is a PURE comparison (no LLM); same report +
 * expectation → byte-identical divergence record. A malformed / undispatched / refused
 * gateway answer deterministically yields the demo record.
 */

/** A live divergence record — the detect_divergence Divergence shape, decoded ONCE. */
export interface LiveDivergence {
	id: string;
	projectId: string;
	operation: string;
	kind: string;
	mirrorRef: string;
	observed: number;
	expected: number;
	calls: number;
}

export interface LiveDivergenceView {
	diverged: boolean;
	divergence: LiveDivergence | null;
	source: Source;
}

const divergenceDecoder: Decoder<LiveDivergence> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const projectId = str(raw.project_id);
	const operation = str(raw.operation);
	const kind = str(raw.kind);
	const mirrorRef = str(raw.mirror_ref);
	const observed = num(raw.observed);
	const expected = num(raw.expected);
	const calls = num(raw.calls);
	if (
		id === null ||
		projectId === null ||
		operation === null ||
		kind === null ||
		mirrorRef === null ||
		observed === null ||
		expected === null ||
		calls === null
	) {
		return null;
	}
	return {
		id,
		projectId,
		operation,
		kind,
		mirrorRef,
		observed,
		expected,
		calls,
	};
};

// The decoder is the SINGLE declaration of the detect_divergence output (never double-typed).
const detectDecoder: Decoder<{
	diverged: boolean;
	divergence: LiveDivergence | null;
}> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.diverged !== "boolean") return null;
	if (raw.divergence === undefined || raw.divergence === null) {
		return { diverged: raw.diverged, divergence: null };
	}
	const divergence = divergenceDecoder(raw.divergence);
	if (divergence === null) return null;
	return { diverged: raw.diverged, divergence };
};

/**
 * The deterministic demo record — the canonical out-of-stock createOrder divergence (30%
 * errors vs a 0-tolerance mirror), mirroring the twin's detect over the same demo inputs.
 */
function demoDetect(): {
	diverged: boolean;
	divergence: LiveDivergence | null;
} {
	return {
		diverged: true,
		divergence: {
			id: "demo-divergence",
			projectId: DEMO_PROJECT_ID,
			operation: DEMO_DIVERGENT_REPORT.operation,
			kind: "error_rate",
			mirrorRef: DEMO_EXPECTATION.mirrorRef,
			observed: 0.3,
			expected: 0,
			calls: DEMO_DIVERGENT_REPORT.calls,
		},
	};
}

/**
 * liveDetect runs the LIVE deterministic detector over the canonical divergent report + the
 * mirror promise (live → demo fallback). The wire field names are snake_case — the SAME shape
 * the Go realityingest.TelemetryReport / MirrorExpectation expose.
 */
export async function liveDetect(): Promise<LiveDivergenceView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"detect_divergence",
		{
			project_id: DEMO_PROJECT_ID,
			report: {
				operation: DEMO_DIVERGENT_REPORT.operation,
				calls: DEMO_DIVERGENT_REPORT.calls,
				errors: DEMO_DIVERGENT_REPORT.errors,
				p99_ms: DEMO_DIVERGENT_REPORT.p99Ms,
			},
			expectation: {
				mirror_ref: DEMO_EXPECTATION.mirrorRef,
				operation: DEMO_EXPECTATION.operation,
				max_error_rate: DEMO_EXPECTATION.maxErrorRate,
				max_p99_ms: DEMO_EXPECTATION.maxP99Ms,
			},
		},
		detectDecoder,
		demoDetect(),
	);
	return { diverged: data.diverged, divergence: data.divergence, source };
}
