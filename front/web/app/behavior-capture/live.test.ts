import { describe, expect, it } from "vitest";
import {
	demoAttach,
	demoLibrary,
	gatewayAttachArgs,
} from "../../lib/behavior-capture-data";
import { attachDecoder, libraryDecoder } from "./live";

/**
 * /behavior-capture live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * PHASE-4 kill-twins flip).
 *
 * It proves the TS decoders decode a SAMPLE of the Go `aidos-behavior-capture` tools' output:
 *   - `libraryDecoder`  over `behaviorcapturesrv.libraryOutput` `{ behaviors: [...] }`
 *   - `attachDecoder`   over `behaviorcapturesrv.attachOutput` `{ ok, error?, idea_ref, behavior,
 *       entity, expansion_id, wrote_kernel(false), changeset_ref, changeset_status, proposal_id,
 *       piece_count, preview[], pieces{attributes[],relations[],operations[],policies[],fixtures[]} }`
 *
 * It pins ONLY that the wire shapes decode faithfully — the tools' CONTRACT, NOT a second
 * implementation of the expansion logic (the Go behaviorcapture.Library / AttachBehaviorAtCapture are
 * authoritative). A refusal (ok:false) is a LEGITIMATE live verdict (verbatim error), distinct from a
 * malformed envelope (→ null → demo fallback). DETERMINISM-FIRST (§6/§8): same input → same verdict,
 * zero LLM.
 */

describe("behavior-capture live — library decoder parity", () => {
	it("decodes a Go-sample libraryOutput (the surfaced catalogue)", () => {
		const goSample = {
			behaviors: ["ownable", "soft-deletable", "auditable"],
		};
		expect(libraryDecoder(goSample)).toEqual([
			"ownable",
			"soft-deletable",
			"auditable",
		]);
	});

	it("rejects a malformed library payload (→ demo fallback)", () => {
		expect(libraryDecoder(null)).toBeNull();
		expect(libraryDecoder({})).toBeNull(); // no behaviors list
		expect(libraryDecoder({ behaviors: "ownable" })).toBeNull(); // not an array
		expect(libraryDecoder({ behaviors: [1, 2] })).toBeNull(); // not strings
	});

	it("the demo library matches the surfaced-catalogue shape (twin ≡ the live shape)", () => {
		const demo = demoLibrary();
		expect(demo.length).toBeGreaterThan(0);
		for (const k of demo) expect(typeof k).toBe("string");
		// the §24.6 owner-scoping behaviour is in the catalogue.
		expect(demo).toContain("ownable");
	});
});

describe("behavior-capture live — attach decoder parity", () => {
	it("decodes a Go-sample attachOutput (the §24.6 owner-scoping dry-run)", () => {
		const goSample = {
			ok: true,
			idea_ref: "idea-001",
			behavior: "ownable",
			entity: "Order",
			expansion_id: "abc123def",
			wrote_kernel: false,
			changeset_ref: "abc123def",
			changeset_status: "DRAFT",
			proposal_id: "prop-xyz",
			piece_count: 3,
			preview: ["attr:owner_id", "pol:owner-scoping", "rel:owner"],
			pieces: {
				attributes: [{ name: "owner_id", type: "string", required: true }],
				relations: [
					{ name: "owner", target: "User", cardinality: "many-to-one" },
				],
				operations: [],
				policies: [
					{
						name: "owner-scoping",
						scope: "row",
						operation: "read",
						effect: "allow",
					},
				],
				fixtures: [],
			},
		};
		expect(attachDecoder(goSample)).toEqual({
			ok: true,
			ideaRef: "idea-001",
			behavior: "ownable",
			entity: "Order",
			expansionId: "abc123def",
			changeSetRef: "abc123def",
			changeSetStatus: "DRAFT",
			pieceCount: 3,
			preview: ["attr:owner_id", "pol:owner-scoping", "rel:owner"],
			attributes: ["owner_id"],
			relations: ["owner→User"],
			operations: [],
			policies: ["owner-scoping"],
			fixtures: [],
		});
	});

	it("tolerates an attach with an absent `preview` (omitempty → [])", () => {
		const decoded = attachDecoder({
			ok: true,
			idea_ref: "idea-x",
			behavior: "auditable",
			entity: "E",
			expansion_id: "h",
			wrote_kernel: false,
			changeset_ref: "h",
			changeset_status: "DRAFT",
			piece_count: 0,
			pieces: {},
		});
		expect(decoded?.preview).toEqual([]);
		expect(decoded?.attributes).toEqual([]);
		expect(decoded?.relations).toEqual([]);
	});

	it("decodes a refusal (ok:false) to a verbatim error — a legitimate live verdict", () => {
		const decoded = attachDecoder({
			ok: false,
			error: "behaviorcapture: attach has no captured-idea ref",
		});
		expect(decoded).toEqual({
			ok: false,
			error: "behaviorcapture: attach has no captured-idea ref",
		});
	});

	it("rejects a malformed envelope (no `ok`, or a missing field on success) → demo fallback", () => {
		expect(attachDecoder(null)).toBeNull();
		expect(attachDecoder({})).toBeNull(); // no ok field
		// ok:true but a required field (expansion_id) is missing → null.
		expect(
			attachDecoder({
				ok: true,
				idea_ref: "i",
				behavior: "ownable",
				entity: "E",
				changeset_ref: "r",
				changeset_status: "DRAFT",
				piece_count: 1,
			}),
		).toBeNull();
		// a non-number piece_count → null.
		expect(
			attachDecoder({
				ok: true,
				idea_ref: "i",
				behavior: "ownable",
				entity: "E",
				expansion_id: "x",
				changeset_ref: "x",
				changeset_status: "DRAFT",
				piece_count: "1",
			}),
		).toBeNull();
	});

	it("the gateway-arg projection carries the idea ref, behavior, entity + parent phase", () => {
		const args = gatewayAttachArgs("idea-001", "ownable", "Order");
		expect(args.idea_ref).toBe("idea-001");
		expect(args.behavior).toBe("ownable");
		expect(args.entity).toBe("Order");
		expect(args.parent_phase).toBe("phase-0");
	});

	it("the demo attach matches the decoded-contract shape (twin ≡ the live shape)", () => {
		// the demo is the twin attachBehaviorAtCapture dry-run; its AttachReadView shape is identical to
		// what the live decoder produces from the Go attachOutput — the twin sits behind source:"demo".
		const demo = demoAttach("idea-001", "ownable", "Order");
		expect(demo.ok).toBe(true);
		expect(typeof demo.expansionId).toBe("string");
		expect(demo.changeSetStatus).toBe("DRAFT");
		expect((demo.pieceCount ?? 0) > 0).toBe(true);
		// the §24.6 owner-scoping policy appears in the dry-run preview.
		expect(demo.policies).toContain("owner-scoping");
		expect(demo.preview).toContain("attr:owner_id");
	});

	it("the demo attach refuses an empty idea (verbatim error, no expansion)", () => {
		const demo = demoAttach("", "ownable", "Order");
		expect(demo.ok).toBe(false);
		expect(demo.error).toBeTruthy();
		expect(demo.expansionId).toBeUndefined();
	});
});
