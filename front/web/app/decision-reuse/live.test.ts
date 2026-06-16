import { describe, expect, it } from "vitest";
import { contextGraphDecoder, DEMO_CONTEXT_GRAPH } from "./live";

/**
 * /decision-reuse live CONTEXTGRAPH read — the PARITY MIRROR (Vitest, the frozen front N1
 * slot; ADR 0092 kill-twins batch).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go context server `context_graph_query`
 * output (contextsrv.graphQueryOutput: `{ layers, mirrors, contracts, memory }`) — the tool's
 * CONTRACT, NOT a second ContextRouter. The graph is compiled by the Go router (authoritative);
 * this test pins only that the wire shape decodes faithfully and that a malformed payload
 * deterministically falls back to the demo view.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("decision-reuse live — context_graph_query decoder parity", () => {
	it("decodes a byte-faithful Go-sample graphQueryOutput", () => {
		const goSample = {
			layers: [
				{
					id: "checkout.total",
					bounded_context: "checkout",
					branch: "main",
					load_bearing: true,
					project: "shop",
				},
			],
			mirrors: [
				{ id: "checkout.invariant", bounded_context: "checkout", red: true },
			],
			contracts: [
				{ id: "billing.charges", bounded_context: "billing", public: true },
			],
			memory: [
				{
					id: "mem-tva-eu",
					kind: "semantic",
					scope: "checkout",
					confidence: "repeated",
					stale: false,
					approved: true,
				},
			],
		};
		expect(contextGraphDecoder(goSample)).toEqual({
			layers: [
				{
					id: "checkout.total",
					boundedContext: "checkout",
					branch: "main",
					loadBearing: true,
				},
			],
			mirrors: [
				{ id: "checkout.invariant", boundedContext: "checkout", red: true },
			],
			contracts: [
				{ id: "billing.charges", boundedContext: "billing", public: true },
			],
			memory: [
				{
					id: "mem-tva-eu",
					kind: "semantic",
					scope: "checkout",
					confidence: "repeated",
					stale: false,
					approved: true,
				},
			],
		});
	});

	it("decodes a numeric confidence (stringified, never coerced to NaN)", () => {
		const decoded = contextGraphDecoder({
			layers: [],
			mirrors: [],
			contracts: [],
			memory: [
				{
					id: "m",
					kind: "episodic",
					scope: "checkout",
					confidence: 2,
					stale: false,
					approved: false,
				},
			],
		});
		expect(decoded?.memory[0]?.confidence).toBe("2");
	});

	it("defaults an omitted bucket to []", () => {
		// the Go encoder may omit an empty slice; the decoder must not reject it.
		const decoded = contextGraphDecoder({ layers: [] });
		expect(decoded).toEqual({
			layers: [],
			mirrors: [],
			contracts: [],
			memory: [],
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(contextGraphDecoder(null)).toBeNull();
		expect(contextGraphDecoder({ layers: "x" })).toBeNull();
		// a layer missing load_bearing (a required bool) → null.
		expect(
			contextGraphDecoder({
				layers: [{ id: "l", bounded_context: "checkout", branch: "main" }],
			}),
		).toBeNull();
		// a mirror missing red → null.
		expect(
			contextGraphDecoder({
				mirrors: [{ id: "m", bounded_context: "checkout" }],
			}),
		).toBeNull();
	});

	it("the demo graph is the deterministic §142 checkout subgraph", () => {
		expect(DEMO_CONTEXT_GRAPH.layers[0]?.loadBearing).toBe(true);
		expect(DEMO_CONTEXT_GRAPH.mirrors[0]?.red).toBe(true);
		expect(DEMO_CONTEXT_GRAPH.contracts[0]?.public).toBe(true);
		expect(DEMO_CONTEXT_GRAPH.memory[0]?.approved).toBe(true);
	});
});
