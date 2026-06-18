import { describe, expect, it } from "vitest";
import { DEMO_SPEC, emitServer } from "../../lib/hono-emitter";
import { demoServerView, gatewayServerArgs } from "../../lib/hono-emitter-data";
import { serverDecoder } from "./live";

/**
 * /hono-emitter live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins).
 *
 * It proves the TS `serverDecoder` decodes a SAMPLE of the Go `emit_server` tool's output
 * (honoemittersrv.artifactOutput — `ok` / `artifact` {path, bytes (base64), source_hash} / the
 * refusal `block`) — the tool's CONTRACT, NOT a second implementation of the projection logic (the
 * Go honoemit.EmitServer is authoritative). It pins that the base64 wire bytes decode back to the
 * rendered source, that a refusal carries its explanation, that a malformed payload deterministically
 * falls back (null → demo), and that the demo fallback shape EQUALS the live decoder's output shape
 * (the twin sits behind source:"demo"). It also asserts the gateway-arg projection carries NO
 * json.RawMessage byte-array body (the S59 scar): the ops ride as plain objects.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

/** toB64 mirrors the Go []byte → base64 JSON marshaling, for the wire-sample fixtures. */
function toB64(s: string): string {
	return Buffer.from(s, "utf8").toString("base64");
}

describe("hono-emitter live — serverDecoder parity", () => {
	it("decodes a Go-sample artifactOutput (ok, base64 bytes → rendered source)", () => {
		const rendered = emitServer(DEMO_SPEC);
		if (typeof rendered !== "string") throw new Error("demo spec must emit");
		const goSample = {
			ok: true,
			artifact: {
				path: "src/server.ts",
				target: "ts-hono",
				bytes: toB64(rendered),
				source_hash: "h-server-abc123",
				output_hash: "h-out-def456",
				protected: true,
			},
		};
		const decoded = serverDecoder(goSample);
		expect(decoded).toEqual({
			output: rendered,
			hash: "h-server-abc123",
			path: "src/server.ts",
		});
	});

	it("decodes a refused artifactOutput (malformed spec → block explanation)", () => {
		const decoded = serverDecoder({
			ok: false,
			block: {
				code: "OUT_OF_SCOPE",
				severity: "blocking",
				explanation: "Émission refusée : le spec n'épingle aucune operation.",
				how_to_fix: ["pin_the_source"],
			},
		});
		expect(decoded?.output).toBeUndefined();
		expect(decoded?.blockExplanation).toBe(
			"Émission refusée : le spec n'épingle aucune operation.",
		);
	});

	it("rejects a malformed artifactOutput (→ demo fallback)", () => {
		expect(serverDecoder(null)).toBeNull();
		expect(serverDecoder({})).toBeNull();
		// ok:true but no artifact → null.
		expect(serverDecoder({ ok: true })).toBeNull();
		// ok:true, artifact with non-string/invalid bytes → null.
		expect(
			serverDecoder({ ok: true, artifact: { source_hash: "h" } }),
		).toBeNull();
		// ok:false but no block → null.
		expect(serverDecoder({ ok: false })).toBeNull();
	});
});

describe("hono-emitter live — gateway-arg projection (no RawMessage body)", () => {
	it("projects DEMO_SPEC to the Go serverInput.spec (ops as objects, capitalised keys)", () => {
		const args = gatewayServerArgs(DEMO_SPEC);
		const spec = args.spec as Record<string, unknown>;
		expect(spec.Project).toBe("shop");
		const ops = spec.Ops as Array<Record<string, unknown>>;
		// the ops ride as an array of OBJECTS, never a json.RawMessage byte-array (the S59 scar).
		expect(Array.isArray(ops)).toBe(true);
		const create = ops.find((o) => o.Name === "createOrder");
		expect(create).toEqual({
			Name: "createOrder",
			Async: false,
			Trigger: { kind: "", at: "" },
		});
		const receipt = ops.find((o) => o.Name === "sendReceipt");
		expect(receipt).toEqual({
			Name: "sendReceipt",
			Async: true,
			Trigger: { kind: "notification", at: "" },
		});
	});
});

describe("hono-emitter live — demo fallback ≡ the live contract shape (twin behind source:demo)", () => {
	it("the demo server view decodes to the same shape the live read returns", () => {
		const demo = demoServerView(DEMO_SPEC);
		const rendered = emitServer(DEMO_SPEC);
		if (typeof rendered !== "string") throw new Error("demo spec must emit");
		// the demo view has the exact EmitServerView shape the live decoder produces.
		expect(demo.output).toBe(rendered);
		expect(typeof demo.hash).toBe("string");
		expect(demo.blockExplanation).toBeUndefined();
	});
});
