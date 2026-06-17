import { describe, expect, it } from "vitest";
import {
	DEMO_EDGES,
	DEMO_HEADS,
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_OUTCOME,
	DEMO_TARGET,
	gatewayCloseArgs,
} from "../../lib/learn-data";
import { outcomeDecoder } from "./live";

/**
 * /learn live close_loop read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `outcomeDecoder` decodes a SAMPLE of the Go learn `close_loop` tool output
 * (learnsrv.closeOutput: `{ outcome }`, the outcome being learn.Outcome with snake_case fields:
 * candidate.idea.provenance{source,detail}, bump{target_id,before,after,moved},
 * wave.items[]{target,reason,layer}, wall.code, wrote_kernel) — the tool's CONTRACT, NOT a second
 * implementation of the loop-closure logic (the Go learn.Close is authoritative). This test pins
 * only that the wire shape decodes faithfully (the `outcome` wrapper, the snake_case parts, the
 * lean projection that drops dependencies/wave_id), that the WALL holds (wall.code refusal +
 * wrote_kernel must be false), and that a malformed payload deterministically falls back to demo.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

/** A faithful sample of the Go learn `close_loop` output for the §S107 out-of-stock loop. */
const goSample = {
	outcome: {
		candidate: {
			idea: {
				id: "idea-out-of-stock",
				proposes: "operation",
				intent: "out-of-stock during checkout must be handled",
				provenance: { source: "incident", detail: "#1042" },
				status: "draft",
			},
			proposes_pinned: false,
		},
		approved_mirror: {
			mirror_id: "mir-out-of-stock-during-checkout",
			reflects: { id: "op-createOrder", version: "v1" },
		},
		bump: {
			target_id: "op-createOrder",
			before: "aaaa1111",
			after: "bbbb2222",
			moved: true,
		},
		wave: {
			items: [
				{
					target: "mir-out-of-stock-during-checkout@v1",
					reason: "version_stale",
					dependencies: [],
					layer: "mirror",
					wave_id: "w1",
				},
				{
					target: "handler-createOrder@v1",
					reason: "version_stale",
					dependencies: [],
					layer: "projection",
					wave_id: "w1",
				},
			],
		},
		wall: {
			code: "REALITY_CANNOT_DECLARE_TRUTH",
			severity: "error",
			explanation: "reality never declares truth",
			how_to_fix: ["open an idea", "derive a mirror", "open a /goal"],
		},
		wrote_kernel: false,
	},
};

describe("learn live — close_loop decoder parity", () => {
	it("decodes a Go-sample closeOutput (the §S107 out-of-stock bump + targeted wave)", () => {
		const decoded = outcomeDecoder(goSample);
		expect(decoded).toEqual({
			provenanceSource: "incident",
			provenanceDetail: "#1042",
			bump: {
				targetId: "op-createOrder",
				before: "aaaa1111",
				after: "bbbb2222",
				moved: true,
			},
			wave: {
				items: [
					{
						target: "mir-out-of-stock-during-checkout@v1",
						reason: "version_stale",
						layer: "mirror",
					},
					{
						target: "handler-createOrder@v1",
						reason: "version_stale",
						layer: "projection",
					},
				],
			},
			wallCode: "REALITY_CANNOT_DECLARE_TRUTH",
			wroteKernel: false,
		});
	});

	it("tolerates a flat payload (outcome fields at the root) and an absent wave items list", () => {
		const decoded = outcomeDecoder({
			candidate: {
				idea: { provenance: { source: "incident", detail: "#7" } },
			},
			bump: { target_id: "op-x", before: "a", after: "a", moved: false },
			wave: {},
			wall: { code: "REALITY_CANNOT_DECLARE_TRUTH" },
			wrote_kernel: false,
		});
		expect(decoded?.provenanceDetail).toBe("#7");
		expect(decoded?.bump.moved).toBe(false);
		expect(decoded?.wave.items).toEqual([]);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(outcomeDecoder(null)).toBeNull();
		expect(outcomeDecoder({})).toBeNull(); // no outcome, no flat fields
		// a non-incident provenance is refused (the loop is always incident-sourced).
		expect(
			outcomeDecoder({
				...goSample.outcome,
				candidate: {
					idea: { provenance: { source: "human", detail: "x" } },
				},
			}),
		).toBeNull();
		// a missing bump field → null.
		expect(
			outcomeDecoder({
				...goSample.outcome,
				bump: { target_id: "op-x", before: "a", after: "b" },
			}),
		).toBeNull();
	});

	it("the WALL — rejects a payload claiming a kernel write or the wrong wall code", () => {
		// wrote_kernel=true is a determinism/wall violation — refused (→ demo).
		expect(
			outcomeDecoder({ ...goSample.outcome, wrote_kernel: true }),
		).toBeNull();
		// any wall code other than the canonical refusal → null.
		expect(
			outcomeDecoder({
				...goSample.outcome,
				wall: { code: "SOMETHING_ELSE" },
			}),
		).toBeNull();
	});

	it("the demo outcome matches the §S107 done-criterion (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin closeLoop() of the canonical out-of-stock loop; it has the
		// SAME shape the live read returns — the twin sits behind source:"demo", identical in shape
		// to the Go-authoritative live outcome.
		expect(DEMO_OUTCOME.provenanceSource).toBe("incident");
		expect(DEMO_OUTCOME.provenanceDetail).toBe(DEMO_INCIDENT_REF);
		expect(DEMO_OUTCOME.bump.moved).toBe(true);
		expect(DEMO_OUTCOME.bump.before).not.toBe(DEMO_OUTCOME.bump.after);
		expect(DEMO_OUTCOME.wave.items.length).toBeGreaterThan(0);
		expect(DEMO_OUTCOME.wave.items[0].layer).toBe("mirror");
		expect(DEMO_OUTCOME.wroteKernel).toBe(false);
		// the gateway-arg projection of the §S107 inputs carries the dispatch-safe object spec_body
		// and the mirror-first edge as a `mirrors` link (the Go close_loop input contract).
		const args = gatewayCloseArgs(
			DEMO_INCIDENT_REF,
			DEMO_MIRROR,
			DEMO_TARGET,
			DEMO_EDGES,
			DEMO_HEADS,
		);
		const target = args.target as Record<string, unknown>;
		expect(target.spec_body).toEqual(DEMO_TARGET.specBody);
		const edges = args.edges as Array<Record<string, unknown>>;
		expect((edges[0].link as Record<string, unknown>).kind).toBe("mirrors");
	});
});
