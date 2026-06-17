import { describe, expect, it } from "vitest";
import { lookup } from "../../lib/gateway";
import { kindsDecoder, proposalDecoder } from "./live";

/**
 * /dsl-editor live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 kill-twins
 * batch-3).
 *
 * It proves the TS `kindsDecoder` / `proposalDecoder` decode a SAMPLE of the Go dsl-editor MCP tools'
 * output (dsleditorsrv.kindsOutput: { kinds: string[] } ; proposeOutput: { ok, error?, kind?, name?,
 * wrote_kernel, changeset_ref?, changeset_status? }) — the tools' CONTRACT, NOT a second
 * implementation of the DSL parser (the Go dsleditor.ParseDoc / ProposeEdit is authoritative). This
 * test pins only that the wire shape decodes faithfully (the closed kinds set, the FLAT proposeOutput
 * projection, the always-false wrote_kernel, a verbatim error on ok:false) and that a malformed
 * payload deterministically falls back (the decoder returns null → readVia yields the demo proposal).
 *
 * It ALSO proves the FLIP IS NOT HOLLOW: the front registry resolves `dsl_kinds` / `dsl_parse` /
 * `dsl_propose` to the `dsl-editor` server, so readVia wraps a real dispatched call (without that
 * registration route(tool)→unknown_tool→always source:"demo" — the cliquet's readVia-frontier blind
 * spot).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("dsl-editor live — gateway registration (the flip is not hollow)", () => {
	it("resolves dsl_propose to the dsl-editor server", () => {
		expect(lookup("dsl_propose")).toEqual({
			name: "dsl_propose",
			server: "dsl-editor",
			disposition: "below_line",
		});
	});

	it("resolves dsl_parse to the dsl-editor server", () => {
		expect(lookup("dsl_parse")?.server).toBe("dsl-editor");
	});

	it("resolves dsl_kinds to the dsl-editor server", () => {
		expect(lookup("dsl_kinds")?.server).toBe("dsl-editor");
	});
});

describe("dsl-editor live — kindsDecoder parity", () => {
	it("decodes the four editable kinds in canonical order", () => {
		const decoded = kindsDecoder({
			kinds: ["operation", "policy", "control", "action"],
		});
		expect(decoded).toEqual(["operation", "policy", "control", "action"]);
	});

	it("rejects a kinds payload carrying an unknown kind (→ demo fallback)", () => {
		expect(kindsDecoder({ kinds: ["operation", "saga"] })).toBeNull();
		expect(kindsDecoder({})).toBeNull(); // no kinds list
		expect(kindsDecoder(null)).toBeNull();
	});
});

describe("dsl-editor live — proposalDecoder parity", () => {
	it("decodes an ok proposeOutput (DRAFT ChangeSet handle, wrote_kernel false)", () => {
		const goSample = {
			ok: true,
			kind: "policy",
			name: "canPlaceOrder",
			wrote_kernel: false,
			changeset_ref: "dsl-edit@policy:canPlaceOrder",
			changeset_status: "DRAFT",
		};
		const decoded = proposalDecoder(goSample);
		expect(decoded).toEqual({
			ok: true,
			kind: "policy",
			name: "canPlaceOrder",
			changesetRef: "dsl-edit@policy:canPlaceOrder",
			changesetStatus: "DRAFT",
			wroteKernel: false,
		});
	});

	it("decodes a refusal proposeOutput carrying the verbatim engine error", () => {
		const decoded = proposalDecoder({
			ok: false,
			error: "dsleditor: a typed editor forbids free code",
			wrote_kernel: false,
		});
		expect(decoded).toEqual({
			ok: false,
			error: "dsleditor: a typed editor forbids free code",
			wroteKernel: false,
		});
	});

	it("tolerates an absent wrote_kernel (a pure read defaults to false)", () => {
		const decoded = proposalDecoder({
			ok: true,
			kind: "operation",
			name: "createOrder",
			changeset_ref: "dsl-edit@operation:createOrder",
			changeset_status: "DRAFT",
		});
		expect(decoded?.wroteKernel).toBe(false);
		expect(decoded?.kind).toBe("operation");
	});

	it("rejects a malformed proposeOutput payload (→ demo fallback)", () => {
		expect(proposalDecoder(null)).toBeNull();
		expect(proposalDecoder({})).toBeNull(); // no ok flag
		// a non-boolean ok → null.
		expect(proposalDecoder({ ok: "yes" })).toBeNull();
		// the wall: a TRUE wrote_kernel is a malformed/forbidden payload → null (never rendered).
		expect(
			proposalDecoder({
				ok: true,
				kind: "policy",
				name: "x",
				wrote_kernel: true,
			}),
		).toBeNull();
		// a non-boolean wrote_kernel → null.
		expect(
			proposalDecoder({
				ok: true,
				kind: "policy",
				name: "x",
				wrote_kernel: "false",
			}),
		).toBeNull();
		// an ok:true missing the parsed kind → null.
		expect(
			proposalDecoder({ ok: true, name: "x", wrote_kernel: false }),
		).toBeNull();
		// an ok:true carrying an unknown kind → null.
		expect(
			proposalDecoder({
				ok: true,
				kind: "saga",
				name: "x",
				wrote_kernel: false,
			}),
		).toBeNull();
	});
});
