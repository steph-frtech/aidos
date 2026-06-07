/**
 * gateway-sdk.test.ts — the S59 reproducibility mirror (Vitest + fast-check, the frozen
 * front N1 slot). It pins the two S59 done-criteria of the typed SDK:
 *
 *   1. THE CLIENT NEVER DOUBLE-TYPES — the panel's type is INFERRED from the decoder
 *      (Decoded<typeof dec>); a structural drift between the validator and the type is a
 *      compile error, proven here by a type-level assignment + a runtime round-trip.
 *   2. THE DECODER REJECTS A MALFORMED PAYLOAD / FALLS BACK DETERMINISTICALLY when the DB
 *      (gateway) is unreachable — a malformed JSON, a transport error, or no endpoint all
 *      deterministically yield the demo fixture tagged `source:"demo"`; a well-formed
 *      payload yields `source:"live"`. Same input → same verdict, zero LLM.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	arr,
	callGateway,
	type Decoded,
	type Decoder,
	isObject,
	num,
	readVia,
	str,
} from "./gateway-sdk";

// A representative panel snapshot decoder, declared EXACTLY ONCE (the single source). The
// static type below is INFERRED from it — never re-declared (the never-double-typed hinge).
const itemDecoder: Decoder<{ id: string; n: number }> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const n = num(raw.n);
	if (id === null || n === null) return null;
	return { id, n };
};
const snapDecoder: Decoder<{ items: { id: string; n: number }[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const items = arr(itemDecoder)(raw.items);
	if (items === null) return null;
	return { items };
};
type Snap = Decoded<typeof snapDecoder>;
const DEMO: Snap = { items: [{ id: "demo", n: 0 }] };

// A fetch stub: returns a JSON-RPC envelope with the given structuredContent.
function okFetch(content: unknown): typeof fetch {
	return (async () =>
		new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				result: { structuredContent: content },
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		)) as unknown as typeof fetch;
}

describe("gateway-sdk — never double-typed", () => {
	it("the panel type is the decoder's inferred output (no parallel declaration)", () => {
		// If snapDecoder ever drifted from Snap, THIS LINE would fail to compile — the type
		// is derived, never hand-kept. Runtime round-trip confirms the same shape.
		const decoded = snapDecoder({ items: [{ id: "x", n: 3 }] });
		const asSnap: Snap | null = decoded; // assignable iff the inferred type matches
		expect(asSnap).toEqual({ items: [{ id: "x", n: 3 }] });
	});
});

describe("gateway-sdk — decoder rejects malformed payloads (deterministic)", () => {
	it("rejects any non-conforming JSON value (returns null, never coerces)", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.constant(null),
					fc.constant(undefined),
					fc.integer(),
					fc.string(),
					fc.array(fc.anything()),
					fc.record({ items: fc.string() }),
					fc.record({
						// a non-empty array of malformed items (id must be a string, n a number)
						items: fc.array(fc.record({ id: fc.integer() }), {
							minLength: 1,
						}),
					}),
					fc.record({ wrong: fc.anything() }),
				),
				(bad) => {
					// no malformed input is ever accepted as a partial value
					expect(snapDecoder(bad)).toBeNull();
				},
			),
		);
	});

	it("accepts a well-formed payload and is reproducible (same input → same output)", () => {
		fc.assert(
			fc.property(
				fc.array(fc.record({ id: fc.string(), n: fc.integer() })),
				(items) => {
					const a = snapDecoder({ items });
					const b = snapDecoder({ items });
					expect(a).toEqual(b);
					expect(a).toEqual({ items });
				},
			),
		);
	});
});

describe("gateway-sdk — readVia falls back deterministically when the DB is unreachable", () => {
	const scope = { identity: "alice", activeProject: "proj-a" };

	it("no endpoint → demo (deterministic, never throws)", async () => {
		const r = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: null,
		});
		expect(r).toEqual({ data: DEMO, source: "demo" });
	});

	it("transport throws → demo", async () => {
		const boom = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		const r = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: "http://gw",
			fetchImpl: boom,
		});
		expect(r.source).toBe("demo");
		expect(r.data).toEqual(DEMO);
	});

	it("malformed live payload → demo (the decoder rejects it)", async () => {
		const r = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: "http://gw",
			fetchImpl: okFetch({ items: "not-an-array" }),
		});
		expect(r).toEqual({ data: DEMO, source: "demo" });
	});

	it("well-formed live payload → live (the decoded snapshot)", async () => {
		const live: Snap = { items: [{ id: "live-1", n: 7 }] };
		const r = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: "http://gw",
			fetchImpl: okFetch(live),
		});
		expect(r).toEqual({ data: live, source: "live" });
	});

	it("an unexposed tool never hits the wire (closed registry faithfulness)", async () => {
		const r = await callGateway(
			scope,
			"definitely_not_a_tool",
			{},
			"http://gw",
			okFetch({ items: [] }),
		);
		expect(r).toEqual({ ok: false, error: "unknown_tool" });
	});

	it("readVia is reproducible end-to-end: same stub → same verdict", async () => {
		const live: Snap = { items: [{ id: "z", n: 1 }] };
		const f = okFetch(live);
		const a = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: "http://gw",
			fetchImpl: f,
		});
		const b = await readVia(scope, "store_get", {}, snapDecoder, DEMO, {
			endpoint: "http://gw",
			fetchImpl: f,
		});
		expect(a).toEqual(b);
	});
});
