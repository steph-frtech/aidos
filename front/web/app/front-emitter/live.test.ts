import { describe, expect, it } from "vitest";
import type { FrontSpec } from "../../lib/front-emitter";
import { ORDER_ENTITY } from "../../lib/front-emitter-data";
import {
	bundleDecoder,
	filesDecoder,
	gatewaySpecArgs,
	hashDecoder,
} from "./live";

/**
 * /front-emitter live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS decoders decode a SAMPLE of the Go front-emitter tool outputs
 * (frontemittersrv.filesOutput / artifactOutput / hashOutput) — the tools' CONTRACT, NOT a
 * second emitter (the Go runtime/frontemit — and its TS twin lib/front-emitter — is
 * authoritative; the Go engine is the SINGLE live source). It also pins that `gatewaySpecArgs`
 * projects the front FrontSpec to the exact Go `frontInput.Spec` wire shape — the SCAR shape
 * (memory 6215): the FrontSpec/EntityModel/ControlModel/FixtureRow wrappers carry NO json tags
 * (Go FIELD names: Project/Entities/Controls/Entity/Blobs/Refs/Name/View/Label/Operation/
 * Fixtures/Given/Visible/Enabled), the INNER kernel structs carry snake_case tags — and that it
 * is a PLAIN object (no json.RawMessage, the S59 scar guard).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM. A malformed payload
 * deterministically returns null so readVia falls back to the demo emit (source:"demo").
 */

const SPEC: FrontSpec = {
	project: "shop",
	entities: [ORDER_ENTITY],
	controls: [
		{
			name: "create-order",
			view: "order",
			label: "order.create",
			operation: "CreateOrder",
			fixtures: [{ given: "cart-non-empty", visible: true, enabled: true }],
		},
	],
};

// A Go Artifact.Bytes value is a base64 STRING in structured output (json.Marshal []byte).
const b64 = (s: string): string => Buffer.from(s, "utf-8").toString("base64");

describe("front-emitter live — output decoders parity", () => {
	it("filesDecoder decodes a Go emit_front output (filesOutput) into FrontFile[]", () => {
		const goSample = {
			ok: true,
			files: [
				{
					path: "gen/shop/web/index.tsx",
					target: "front-index",
					bytes: b64("// index source\n"),
					source_hash: "abc",
					output_hash: "def",
					protected: true,
				},
				{
					path: "gen/shop/web/order.form.tsx",
					target: "front-entity-form",
					bytes: b64('<input type="file" />\n'),
					source_hash: "abc",
					output_hash: "ghi",
					protected: true,
				},
			],
		};
		const decoded = filesDecoder(goSample);
		expect(decoded).not.toBeNull();
		if (decoded === null) throw new Error("expected files");
		expect(decoded.map((f) => f.target)).toEqual([
			"front-index",
			"front-entity-form",
		]);
		expect(decoded[0].path).toBe("gen/shop/web/index.tsx");
		expect(decoded[0].bytes).toBe("// index source\n");
		expect(decoded[1].bytes).toContain('type="file"');
	});

	it("filesDecoder also decodes the array-of-numbers []byte shape (the S93 DISPATCH NOTE)", () => {
		const src = "// arr\n";
		const arrBytes = Array.from(new TextEncoder().encode(src));
		const decoded = filesDecoder({
			ok: true,
			files: [{ path: "p", target: "front-index", bytes: arrBytes }],
		});
		expect(decoded?.[0].bytes).toBe(src);
	});

	it("bundleDecoder decodes a Go emit_bundle output (artifactOutput) into the bundle source", () => {
		const decoded = bundleDecoder({
			ok: true,
			artifact: {
				path: "gen/shop/web/_bundle.tsx",
				target: "front-bundle",
				bytes: b64("// FRONT bundle\n"),
				source_hash: "abc",
				output_hash: "jkl",
			},
		});
		expect(decoded).toBe("// FRONT bundle\n");
	});

	it("hashDecoder decodes a Go front_hash output (hashOutput)", () => {
		expect(hashDecoder({ ok: true, hash: "deadbeef" })).toBe("deadbeef");
	});

	it("rejects malformed / refused payloads (→ demo fallback)", () => {
		// not ok → null (a refused emit carries ok:false + a block).
		expect(
			filesDecoder({ ok: false, block: { code: "OUT_OF_SCOPE" } }),
		).toBeNull();
		expect(bundleDecoder({ ok: false })).toBeNull();
		expect(hashDecoder({ ok: false })).toBeNull();
		// missing required fields → null.
		expect(filesDecoder(null)).toBeNull();
		expect(filesDecoder({})).toBeNull();
		expect(filesDecoder({ ok: true, files: [{ path: "p" }] })).toBeNull();
		expect(bundleDecoder({ ok: true })).toBeNull();
		expect(hashDecoder({ ok: true, hash: "" })).toBeNull();
		// undecodable bytes (not string/array) → the whole file decode fails.
		expect(
			filesDecoder({
				ok: true,
				files: [{ path: "p", target: "t", bytes: { not: "bytes" } }],
			}),
		).toBeNull();
	});
});

describe("front-emitter live — gatewaySpecArgs projects the Go frontInput wire shape", () => {
	it("projects FrontSpec to {spec:{Project,Entities,Controls}} with Go field-name wrappers", () => {
		const args = gatewaySpecArgs(SPEC);
		const spec = args.spec as Record<string, unknown>;

		// the wrappers carry NO json tags → Go field names (capitalized).
		expect(spec.Project).toBe("shop");
		const entities = spec.Entities as Array<Record<string, unknown>>;
		expect(entities).toHaveLength(1);

		// EntityModel.Entity is the embedded entities.Entity (snake_case inner tags).
		const entity = entities[0].Entity as Record<string, unknown>;
		expect(entity.name).toBe("order");
		const attrs = entity.attributes as Array<Record<string, unknown>>;
		expect(attrs[0]).toEqual({
			name: "id",
			type: "int",
			required: false,
			identifier: true,
		});
		expect(attrs[1]).toEqual({
			name: "total",
			type: "decimal",
			required: true,
		});

		// Blobs (snake_case allowed_mime / max_bytes).
		const blobs = entities[0].Blobs as Array<Record<string, unknown>>;
		expect(blobs[0]).toEqual({
			name: "receipt",
			allowed_mime: ["image/png", "application/pdf"],
			max_bytes: 5_000_000,
		});

		// Refs (snake_case cardinality, plus the defaulted closed-set semantic "fk").
		const refs = entities[0].Refs as Array<Record<string, unknown>>;
		expect(refs[0]).toEqual({
			name: "customer",
			target: "Customer",
			cardinality: "1-N",
			semantic: "fk",
			required: true,
		});

		// Controls carry Go field-name wrappers + Go field-name Fixtures.
		const controls = spec.Controls as Array<Record<string, unknown>>;
		expect(controls[0].Name).toBe("create-order");
		expect(controls[0].View).toBe("order");
		expect(controls[0].Label).toBe("order.create");
		expect(controls[0].Operation).toBe("CreateOrder");
		expect(controls[0].Fixtures).toEqual([
			{ Given: "cart-non-empty", Visible: true, Enabled: true },
		]);
	});

	it("stays a plain JSON object (no Buffer / RawMessage — the S59 scar guard)", () => {
		const args = gatewaySpecArgs(SPEC);
		expect(JSON.parse(JSON.stringify(args))).toEqual(args);
	});
});
