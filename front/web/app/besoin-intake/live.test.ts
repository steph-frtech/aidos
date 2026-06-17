import { describe, expect, it } from "vitest";
import { demoGraphState, gatewayStateArgs } from "../../lib/besoin-intake-data";
import { stateDecoder } from "./live";

/**
 * /besoin-intake live graph-state read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * batch-4A kill-twins flip).
 *
 * It proves the TS `stateDecoder` decodes a SAMPLE of the Go besoin-intake `besoin_graph_state` tool
 * output (besoinintakesrv.stateOutput: `{ project, graph_hash, node_row_count, enterable_level?, done,
 * verdicts[] }`, snake_case) — the tool's CONTRACT, NOT a second implementation of the besoin logic
 * (the Go besoin-intake MCP is authoritative: the enterable level + the per-level verdicts are COMPUTED
 * server-side from the RLS-scoped persisted BesoinGraph). This test pins only that the wire shape
 * decodes faithfully (the snake_case fields, the omitempty `enterable_level`, the verdicts list, an
 * absent verdicts list) and that a malformed payload deterministically falls back to the demo state.
 *
 * THE RLS DIMENSION (the point of the batch): the args carry the active project (the boundary the
 * dispatcher routes the SET LOCAL `aidos.project` GUC on, S55). DETERMINISM-FIRST (§6/§8): same input →
 * same verdict, zero LLM. THE WALL (§2): the read is below-the-line — no truth is written.
 */

describe("besoin-intake live — besoin_graph_state decoder parity", () => {
	it("decodes a Go-sample stateOutput (fresh project: product enterable, zero rows)", () => {
		const goSample = {
			project: "shop-a",
			graph_hash: "abc123",
			node_row_count: 0,
			enterable_level: "product",
			done: false,
			verdicts: [],
		};
		expect(stateDecoder(goSample)).toEqual({
			project: "shop-a",
			graphHash: "abc123",
			nodeRowCount: 0,
			enterableLevel: "product",
			done: false,
			verdicts: [],
		});
	});

	it("decodes a state carrying persisted rows + per-level verdicts", () => {
		const decoded = stateDecoder({
			project: "shop-a",
			graph_hash: "deadbeef",
			node_row_count: 3,
			enterable_level: "view",
			done: false,
			verdicts: [
				{ level: "product", enough: true },
				{
					level: "journey",
					enough: false,
					missing: ["gherkin"],
					open_questions: ["which view?"],
				},
			],
		});
		expect(decoded?.nodeRowCount).toBe(3);
		expect(decoded?.enterableLevel).toBe("view");
		expect(decoded?.verdicts[0]).toEqual({
			level: "product",
			enough: true,
			missing: [],
			openQuestions: [],
		});
		expect(decoded?.verdicts[1]).toEqual({
			level: "journey",
			enough: false,
			missing: ["gherkin"],
			openQuestions: ["which view?"],
		});
	});

	it("tolerates the omitempty enterable_level (a complete graph emits none → '')", () => {
		const decoded = stateDecoder({
			project: "shop-a",
			graph_hash: "fff",
			node_row_count: 9,
			// enterable_level omitted (the graph is complete, EL07)
			done: true,
			verdicts: [],
		});
		expect(decoded?.enterableLevel).toBe("");
		expect(decoded?.done).toBe(true);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(stateDecoder(null)).toBeNull();
		expect(stateDecoder({})).toBeNull(); // no required fields
		// a missing required field (graph_hash) → null.
		expect(
			stateDecoder({ project: "shop-a", node_row_count: 0, done: false }),
		).toBeNull();
		// a non-number count → null.
		expect(
			stateDecoder({
				project: "shop-a",
				graph_hash: "x",
				node_row_count: "zero",
				done: false,
			}),
		).toBeNull();
		// a missing `done` boolean → null.
		expect(
			stateDecoder({ project: "shop-a", graph_hash: "x", node_row_count: 0 }),
		).toBeNull();
		// a malformed verdict (non-grammar level) reds the whole decode (binary).
		expect(
			stateDecoder({
				project: "shop-a",
				graph_hash: "x",
				node_row_count: 1,
				done: false,
				verdicts: [{ level: "not-a-level", enough: true }],
			}),
		).toBeNull();
	});

	it("the demo graph-state matches the decoded fresh project (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin's fresh-project state; round-tripping a Go-sample of the SAME
		// shape through the decoder yields a value of the SAME shape — the twin sits behind
		// source:"demo", identical in shape to the Go-authoritative live state.
		const demo = demoGraphState("shop-a");
		expect(demo.project).toBe("shop-a");
		expect(demo.enterableLevel).toBe("product");
		expect(demo.nodeRowCount).toBe(0);
		expect(demo.done).toBe(false);
		expect(demo.verdicts).toEqual([]);
		// the gateway-arg projection carries the active project (the RLS boundary, S55) — a SCALAR
		// object, never a json.RawMessage body (the S59 transport scar avoided).
		expect(gatewayStateArgs("shop-a")).toEqual({ project: "shop-a" });
	});
});
