import { describe, expect, it } from "vitest";
import { WHY_TREE_CASES } from "../../lib/why-tree-data";
import { buildDecoder, gatewayBuildArgs } from "./live";

/**
 * /why-tree live build read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `buildDecoder` decodes a SAMPLE of the Go why-tree `build` tool output
 * (whytreesrv.buildOut: `{ ok, symptom, provenance, causes:[{cause_id,depth,reproduced}],
 * root_cause, is_leaf, mirror_id, error }`, snake_case) — the tool's CONTRACT, NOT a second
 * implementation of the WhyTree-build logic (the Go whytree.Build — and its TS twin
 * lib/why-tree.build — is authoritative; the Go engine is the SINGLE live source). It also pins
 * that `gatewayBuildArgs` projects the front BuildInput to the exact Go `buildIn` wire shape
 * (edges[{from,to}], reproductions[{cause_id,…}], terminal{mirror_id,reflects_root_cause}) — a
 * PLAIN object (no json.RawMessage, the S59 scar guard).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM. A malformed payload
 * deterministically returns null so readVia falls back to the demo build (source:"demo").
 */

describe("why-tree live — build decoder parity", () => {
	it("decodes a Go-sample buildOut (the incident → tree → root mirror success)", () => {
		const goSample = {
			ok: true,
			symptom: "checkout-accept",
			provenance: "incident",
			causes: [
				{ cause_id: "createOrder", depth: 1, reproduced: true },
				{ cause_id: "Order", depth: 2, reproduced: true },
				{ cause_id: "authzPolicy", depth: 2, reproduced: true },
				{ cause_id: "add_total_col", depth: 3, reproduced: true },
			],
			root_cause: "add_total_col",
			is_leaf: false,
			mirror_id: "mir-antirecur-add_total_col",
		};
		const decoded = buildDecoder(goSample);
		expect(decoded?.ok).toBe(true);
		if (!decoded?.ok) throw new Error("expected a successful tree");
		expect(decoded.tree.symptom).toBe("checkout-accept");
		expect(decoded.tree.provenance).toBe("incident");
		expect(decoded.tree.rootCause).toBe("add_total_col");
		expect(decoded.tree.terminal).toEqual({
			mirrorId: "mir-antirecur-add_total_col",
			reflectsRootCause: "add_total_col",
		});
		expect(decoded.tree.causes.map((c) => c.causeId)).toEqual([
			"createOrder",
			"Order",
			"authzPolicy",
			"add_total_col",
		]);
		expect(decoded.tree.causes[0]).toEqual({
			causeId: "createOrder",
			depth: 1,
			reproduced: true,
		});
	});

	it("decodes a leaf success (no upstream reproduced cause — empty causes)", () => {
		const decoded = buildDecoder({
			ok: true,
			symptom: "checkout-accept",
			provenance: "human",
			causes: [],
			root_cause: "checkout-accept",
			is_leaf: true,
			mirror_id: "mir-x",
		});
		expect(decoded?.ok).toBe(true);
		if (!decoded?.ok) throw new Error("expected a leaf success");
		expect(decoded.tree.causes).toEqual([]);
		expect(decoded.tree.rootCause).toBe("checkout-accept");
	});

	it("decodes the closed refusals (the Go classify codes ride in `error`)", () => {
		// ok is ALWAYS true on the Go side; a refusal is carried in `error`.
		const noMirror = buildDecoder({ ok: true, error: "WHYTREE_NO_MIRROR" });
		expect(noMirror).toEqual({ ok: false, error: "WHYTREE_NO_MIRROR" });

		const notReproduced = buildDecoder({
			ok: true,
			error: "WHYTREE_CAUSE_NOT_REPRODUCED",
		});
		expect(notReproduced).toEqual({
			ok: false,
			error: "WHYTREE_CAUSE_NOT_REPRODUCED",
		});

		const cycle = buildDecoder({ ok: true, error: "CAUSED_BY_CYCLE" });
		expect(cycle).toEqual({ ok: false, error: "CAUSED_BY_CYCLE" });

		// a mismatch carries the offending root as a cause hint.
		const mismatch = buildDecoder({
			ok: true,
			error: "WHYTREE_TERMINAL_MISMATCH",
			root_cause: "add_total_col",
		});
		expect(mismatch).toEqual({
			ok: false,
			error: "WHYTREE_TERMINAL_MISMATCH",
			cause: "add_total_col",
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(buildDecoder(null)).toBeNull();
		expect(buildDecoder({})).toBeNull(); // ok !== true
		expect(buildDecoder({ ok: false })).toBeNull();
		// an UNKNOWN (non-closed) error code → null (never a coerced refusal).
		expect(buildDecoder({ ok: true, error: "SOMETHING_ELSE" })).toBeNull();
		// a success missing a required tree field → null.
		expect(
			buildDecoder({
				ok: true,
				symptom: "checkout-accept",
				provenance: "incident",
				causes: [],
				// root_cause missing
				mirror_id: "mir-x",
			}),
		).toBeNull();
		// a success with an off-set provenance → null.
		expect(
			buildDecoder({
				ok: true,
				symptom: "checkout-accept",
				provenance: "telepathy",
				causes: [],
				root_cause: "checkout-accept",
				mirror_id: "mir-x",
			}),
		).toBeNull();
	});
});

describe("why-tree live — gatewayBuildArgs projects the Go buildIn wire shape", () => {
	it("projects the incident scenario to snake_case edges/reproductions/terminal", () => {
		const incident = WHY_TREE_CASES.find((c) => c.id === "incident-rooted");
		if (incident === undefined)
			throw new Error("missing incident-rooted fixture");
		const args = gatewayBuildArgs(incident.input);

		expect(args.symptom).toBe("checkout-accept");
		expect(args.provenance).toBe("incident");

		// edges → [{from:{id,version}, to:{id,version}}]
		expect(args.edges).toEqual([
			{
				from: { id: "checkout-accept", version: "v1" },
				to: { id: "createOrder", version: "v1" },
			},
			{
				from: { id: "createOrder", version: "v1" },
				to: { id: "Order", version: "v1" },
			},
			{
				from: { id: "createOrder", version: "v1" },
				to: { id: "authzPolicy", version: "v1" },
			},
			{
				from: { id: "Order", version: "v1" },
				to: { id: "add_total_col", version: "v1" },
			},
		]);

		// reproductions → [{cause_id, reproduced, detail?}] (snake_case cause_id)
		const repros = args.reproductions as Array<Record<string, unknown>>;
		expect(repros[0]).toEqual({
			cause_id: "createOrder",
			reproduced: true,
			detail: "createOrder fixture red on re-run",
		});

		// terminal → {mirror_id, reflects_root_cause}
		expect(args.terminal).toEqual({
			mirror_id: "mir-antirecur-add_total_col",
			reflects_root_cause: "add_total_col",
		});
	});

	it("omits the optional detail when absent and stays a plain object (no RawMessage)", () => {
		const notRepro = WHY_TREE_CASES.find((c) => c.id === "not-reproduced");
		if (notRepro === undefined)
			throw new Error("missing not-reproduced fixture");
		const args = gatewayBuildArgs(notRepro.input);
		const repros = args.reproductions as Array<Record<string, unknown>>;
		// createOrder has no detail in the fixture → the key is omitted (not detail:undefined).
		expect("detail" in repros[0]).toBe(false);
		expect(repros[0]).toEqual({ cause_id: "createOrder", reproduced: true });
		// the whole args object is JSON-roundtrippable (a plain object, no Buffer/RawMessage).
		expect(JSON.parse(JSON.stringify(args))).toEqual(args);
	});
});
