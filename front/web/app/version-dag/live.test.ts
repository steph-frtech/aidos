import { describe, expect, it } from "vitest";
import { countByStratum, DEMO_GRAPH, graphDecoder } from "./live";

/**
 * /version-dag live FULL-GRAPH read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go dag server `dag_get` output
 * (dagsrv.getOutput: `{ nodes, edges, heads }`) — the tool's CONTRACT, NOT a second
 * implementation of the version-space logic. The nodes/edges are computed by the Go dag
 * store (authoritative); this test pins only that the wire shape decodes faithfully (incl.
 * the omitempty `parent_ids`/`label`) and that a malformed payload deterministically falls
 * back to the demo graph.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("version-dag live — dag_get decoder parity", () => {
	it("decodes a byte-faithful Go-sample getOutput", () => {
		const goSample = {
			nodes: [
				{ id: "v0", head: false, stratum: "above", label: "genesis" },
				{ id: "v1", parent_ids: ["v0"], head: false, stratum: "above" },
				{ id: "v2", parent_ids: ["v1"], head: true, stratum: "above" },
				{
					id: "w1",
					parent_ids: ["v1"],
					head: true,
					stratum: "below",
					label: "variant",
				},
			],
			edges: [
				{ from: "v0", to: "v1", changeset: "cs-1" },
				{ from: "v1", to: "v2", changeset: "cs-2" },
				{ from: "v1", to: "w1", changeset: "cs-w1" },
			],
			heads: ["v2", "w1"],
		};
		const decoded = graphDecoder(goSample);
		// omitempty parent_ids on the root v0 decodes to [] (a root, no parents).
		expect(decoded?.nodes[0]).toEqual({
			id: "v0",
			parentIds: [],
			head: false,
			stratum: "above",
			label: "genesis",
		});
		// omitempty label on v1 decodes to null.
		expect(decoded?.nodes[1]).toEqual({
			id: "v1",
			parentIds: ["v0"],
			head: false,
			stratum: "above",
			label: null,
		});
		expect(decoded?.heads).toEqual(["v2", "w1"]);
		expect(decoded?.edges).toHaveLength(3);
	});

	it("decodes an empty (genesis-only) graph", () => {
		const decoded = graphDecoder({
			nodes: [{ id: "genesis", head: true, stratum: "above" }],
			edges: [],
			heads: ["genesis"],
		});
		expect(decoded).toEqual({
			nodes: [
				{
					id: "genesis",
					parentIds: [],
					head: true,
					stratum: "above",
					label: null,
				},
			],
			edges: [],
			heads: ["genesis"],
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(graphDecoder(null)).toBeNull();
		expect(graphDecoder({})).toBeNull(); // missing nodes/edges/heads
		expect(graphDecoder({ nodes: "x", edges: [], heads: [] })).toBeNull();
		// a node missing `head` (a required bool) → null.
		expect(
			graphDecoder({
				nodes: [{ id: "v0", stratum: "above" }],
				edges: [],
				heads: [],
			}),
		).toBeNull();
		// an edge missing `changeset` → null.
		expect(
			graphDecoder({
				nodes: [],
				edges: [{ from: "a", to: "b" }],
				heads: [],
			}),
		).toBeNull();
		// a non-string head element → null.
		expect(graphDecoder({ nodes: [], edges: [], heads: ["v2", 7] })).toBeNull();
	});

	it("the demo graph is the deterministic §120 example (v0→v1→v2 + w1)", () => {
		expect(DEMO_GRAPH.heads).toEqual(["v2", "w1"]);
		expect(DEMO_GRAPH.nodes).toHaveLength(4);
		expect(DEMO_GRAPH.edges).toHaveLength(3);
		// the waterline split (§124): three above the line, one below.
		expect(countByStratum(DEMO_GRAPH.nodes)).toEqual({ above: 3, below: 1 });
	});
});
