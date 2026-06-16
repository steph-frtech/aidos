"use server";

import {
	arr,
	type Decoder,
	isObject,
	num,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /ops-observability live read (S59 cutover). It reads the LIVE OpenTelemetry spans/metrics
 * landed in Postgres for the active project through the typed S58 gateway via the S59 SDK —
 * the below-the-line `telemetry_query` read of the dispatched telemetry-reader server (S92,
 * SELECT-only on reality) — decoded with a PURE decoder, with the deterministic demo fixture
 * preserved as the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. telemetry_query is SELECT-only on the landed
 * reality; the ops layer is RENDER, never a kernel on-ramp (the RealityMirror / E12 is the
 * single on-ramp). No truth-write ever originates from this screen.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo telemetry.
 */

/** A live span row — the telemetry_query SpanRow shape, decoded ONCE (attributes elided). */
export interface LiveSpan {
	traceId: string;
	spanId: string;
	name: string;
	status: string;
}

/** A live metric row — the telemetry_query MetricRow shape, decoded ONCE. */
export interface LiveMetric {
	name: string;
	value: number;
}

export interface LiveTelemetryView {
	spans: LiveSpan[];
	metrics: LiveMetric[];
	source: Source;
}

const spanDecoder: Decoder<LiveSpan> = (raw) => {
	if (!isObject(raw)) return null;
	const traceId = str(raw.trace_id);
	const spanId = str(raw.span_id);
	const name = str(raw.name);
	const status = str(raw.status);
	if (traceId === null || spanId === null || name === null || status === null) {
		return null;
	}
	return { traceId, spanId, name, status };
};

const metricDecoder: Decoder<LiveMetric> = (raw) => {
	if (!isObject(raw)) return null;
	const name = str(raw.name);
	const value = num(raw.value);
	if (name === null || value === null) return null;
	return { name, value };
};

// The decoder is the SINGLE declaration of the live telemetry shape (never double-typed).
const reportDecoder: Decoder<{ spans: LiveSpan[]; metrics: LiveMetric[] }> = (
	raw,
) => {
	if (!isObject(raw)) return null;
	const spans = arr(spanDecoder)(raw.spans);
	const metrics = arr(metricDecoder)(raw.metrics);
	if (spans === null || metrics === null) return null;
	return { spans, metrics };
};

/** The deterministic demo telemetry — one healthy createOrder span + its latency metric. */
function demoTelemetry(): { spans: LiveSpan[]; metrics: LiveMetric[] } {
	return {
		spans: [
			{
				traceId: "trace-0001",
				spanId: "span-0001",
				name: "createOrder",
				status: "ok",
			},
		],
		metrics: [{ name: "createOrder.p99_ms", value: 180 }],
	};
}

/** liveTelemetry reads the active project's OTel spans/metrics (live → demo fallback). */
export async function liveTelemetry(): Promise<LiveTelemetryView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"telemetry_query",
		{},
		reportDecoder,
		demoTelemetry(),
	);
	// Never render a blank live report: an empty live landing still falls back to the demo
	// fixture so the panel and its e2e stay autonomous (the example is always visible).
	if (
		source === "live" &&
		data.spans.length === 0 &&
		data.metrics.length === 0
	) {
		const demo = demoTelemetry();
		return { spans: demo.spans, metrics: demo.metrics, source: "demo" };
	}
	return { spans: data.spans, metrics: data.metrics, source };
}
