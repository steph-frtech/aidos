import { describe, expect, it } from "vitest";
import { DEMO_SCHEMA, emitDDL, emitTS } from "../../lib/relation-emitter";
import {
	demoEmitView,
	emitTool,
	gatewayEmitArgs,
} from "../../lib/relation-emitter-data";
import { emitDecoder } from "./live";

/**
 * /relation-emitter live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins).
 *
 * It proves the TS `emitDecoder` decodes a SAMPLE of the Go `emit_ddl` / `emit_ts` tools' output
 * (relationemittersrv.artifactOutput — `ok` / `artifact` {path, target, source, source_hash,
 * output_hash, protected} / the refusal `block`) — the tool's CONTRACT, NOT a second implementation
 * of the projection logic (the Go relemit.EmitDDL/EmitTS is authoritative). It pins that the string
 * `source` (the dispatch-safe mirror of relemit.Artifact.Bytes — exposed as a STRING, never a
 * base64 number-array; the S59 byte-array transport scar) is the rendered source DIRECTLY, that a
 * refusal carries its explanation, that a malformed payload deterministically falls back (null →
 * demo), and that the demo fallback shape EQUALS the live decoder's output shape (the twin sits
 * behind source:"demo"). It also asserts the gateway-arg projection carries NO json.RawMessage
 * byte-array body (the S59 scar): the entities/relations/async ride as plain objects.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("relation-emitter live — emitDecoder parity", () => {
	it("decodes a Go-sample artifactOutput (ok, string source → rendered DDL)", () => {
		const rendered = emitDDL(DEMO_SCHEMA);
		if (typeof rendered !== "string") throw new Error("demo schema must emit");
		// the Go artifactOut.Source is the rendered string DIRECTLY (no base64) — the dispatch-safe
		// mirror of relemit.Artifact.Bytes. The Go marker line carries the source hash inline; the
		// decoder is agnostic to the bytes' content — it just surfaces them verbatim.
		const goSample = {
			ok: true,
			artifact: {
				path: "gen/library/schema.sql",
				target: "rel-pg-ddl",
				source: rendered,
				source_hash:
					"b8db29b36def94c988f3f88aeb40da54fd890f348e8c2c1efc903a4facb8d03f",
				output_hash: "h-out-def456",
				protected: true,
			},
		};
		const decoded = emitDecoder(goSample);
		expect(decoded).toEqual({
			output: rendered,
			hash: "b8db29b36def94c988f3f88aeb40da54fd890f348e8c2c1efc903a4facb8d03f",
			path: "gen/library/schema.sql",
		});
	});

	it("decodes a Go-sample emit_ts artifactOutput (the TS target rides the same shape)", () => {
		const rendered = emitTS(DEMO_SCHEMA);
		if (typeof rendered !== "string") throw new Error("demo schema must emit");
		const decoded = emitDecoder({
			ok: true,
			artifact: {
				path: "gen/library/model.ts",
				target: "rel-ts-model",
				source: rendered,
				source_hash: "h-ts-abc",
			},
		});
		expect(decoded?.output).toBe(rendered);
		expect(decoded?.hash).toBe("h-ts-abc");
	});

	it("decodes a refused artifactOutput (malformed schema → block explanation)", () => {
		const decoded = emitDecoder({
			ok: false,
			block: {
				code: "UNKNOWN_RELATION_TARGET",
				severity: "blocking",
				explanation:
					"Émission multi-entités refusée : la relation tags cible tag (non déclarée).",
				how_to_fix: ["declare_the_target"],
			},
		});
		expect(decoded?.output).toBeUndefined();
		expect(decoded?.blockExplanation).toBe(
			"Émission multi-entités refusée : la relation tags cible tag (non déclarée).",
		);
	});

	it("rejects a malformed artifactOutput (→ demo fallback)", () => {
		expect(emitDecoder(null)).toBeNull();
		expect(emitDecoder({})).toBeNull();
		// ok:true but no artifact → null.
		expect(emitDecoder({ ok: true })).toBeNull();
		// ok:true, artifact with no string source → null.
		expect(
			emitDecoder({ ok: true, artifact: { source_hash: "h" } }),
		).toBeNull();
		// ok:false but no block → null.
		expect(emitDecoder({ ok: false })).toBeNull();
	});
});

describe("relation-emitter live — gateway-arg projection (no RawMessage body)", () => {
	it("projects DEMO_SCHEMA to the Go schemaInput.schema (entities/relations as objects, capitalised wrappers)", () => {
		const args = gatewayEmitArgs(DEMO_SCHEMA);
		const schema = args.schema as Record<string, unknown>;
		expect(schema.Project).toBe("library");
		const ents = schema.Entities as Array<Record<string, unknown>>;
		// the entities ride as an array of OBJECTS, never a json.RawMessage byte-array (the S59 scar).
		expect(Array.isArray(ents)).toBe(true);
		// the relemit.EntityRelations wrapper is CAPITALISED (no json tag), the inner entity lowercase.
		const book = ents.find(
			(e) => (e.Entity as Record<string, unknown>).name === "book",
		);
		expect(book).toBeDefined();
		const rels = (book as Record<string, unknown>).Relations as Array<
			Record<string, unknown>
		>;
		// the N-N relation carries the closed S71 semantic "association"; a 1-N is "fk".
		const tags = rels.find((r) => r.name === "tags");
		expect(tags).toEqual({
			name: "tags",
			target: "tag",
			cardinality: "N-N",
			semantic: "association",
			required: false,
		});
		const author = rels.find((r) => r.name === "author");
		expect(author).toEqual({
			name: "author",
			target: "author",
			cardinality: "1-N",
			semantic: "fk",
			required: true,
		});
		// the async op wrapper is CAPITALISED (Name/Async), the trigger lowercase (kind/at).
		const async = schema.AsyncOps as Array<Record<string, unknown>>;
		expect(async[0].Name).toBe("sendReminder");
		expect((async[0].Async as Record<string, unknown>).trigger).toEqual({
			kind: "cron",
			at: "2026-06-08T09:00:00Z",
		});
	});

	it("emitTool maps each LIVE target to its dispatched (non-colliding) tool", () => {
		expect(emitTool("ddl")).toBe("emit_ddl");
		expect(emitTool("ts")).toBe("emit_ts");
	});
});

describe("relation-emitter live — demo fallback ≡ the live contract shape (twin behind source:demo)", () => {
	it("the demo emit view decodes to the same shape the live read returns", () => {
		const demo = demoEmitView(DEMO_SCHEMA, "ddl");
		const rendered = emitDDL(DEMO_SCHEMA);
		if (typeof rendered !== "string") throw new Error("demo schema must emit");
		// the demo view has the exact EmitView shape the live decoder produces (output present,
		// no block) — the twin sits behind source:"demo".
		expect(demo.output).toBe(rendered);
		expect(demo.blockExplanation).toBeUndefined();
	});

	it("the demo emit view surfaces a refusal explanation on a malformed schema", () => {
		const bad = demoEmitView({ project: "x", entities: [] }, "ddl");
		expect(bad.output).toBeUndefined();
		expect(typeof bad.blockExplanation).toBe("string");
	});
});
