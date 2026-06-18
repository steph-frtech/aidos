/**
 * relation-emitter-data.ts — the deterministic DEMO fixture + the gateway-arg projection for the
 * /relation-emitter panel's LIVE emit read (S74 — ADR 0092 kill-twins, batch « relation-emitter »).
 *
 * KILL-TWINS CUTOVER (the Go engine is the SINGLE live source). The /relation-emitter « émettre »
 * control now reads the LIVE multi-entity artifact from the Go relation-emitter MCP server through
 * the passerelle (the dispatched `emit_ddl` / `emit_ts` tools). This module carries the two pure
 * companions the cutover needs, kept OUT of the "use server" actions.ts (a Next "use server" module
 * may only export async functions) so the parity mirror (live.test.ts) imports them directly:
 *   - gatewayEmitArgs(schema) → the gateway args the Go emit_ddl/emit_ts unmarshal (schemaInput);
 *   - demoEmitView(schema, target) → the deterministic demo fallback (the SAME pure twin the Go
 *                                    engine reproduces), tagged source:"demo" when the gateway is
 *                                    unavailable.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every value here is a PURE function of its input — no clock,
 * no rng, no I/O, never an LLM. Same schema cut → byte-identical output. THE WALL (§2): the read is
 * below-the-line (a projection); it writes NOTHING.
 */

import { emitDDL, emitTS, isBlocked, type Schema } from "./relation-emitter";

/** The two LIVE emit targets the cutover dispatches (worker stays OFF-dispatch — name collision). */
export type EmitTarget = "ddl" | "ts";

/** The gateway tool a target dispatches on (the dispatched, non-colliding relation-emitter reads). */
export function emitTool(target: EmitTarget): "emit_ddl" | "emit_ts" {
	return target === "ts" ? "emit_ts" : "emit_ddl";
}

/**
 * EmitView is the live shape the /relation-emitter emit read returns — the decoded `emit_ddl` /
 * `emit_ts` artifact (or a refusal). It is declared ONCE here and re-exported by live.ts as the
 * decoder's inferred type's twin (never double-typed: the decoder fills exactly this shape).
 */
export interface EmitView {
	/** the rendered bytes (the Postgres DDL or the TS model), when emitted. */
	output?: string;
	/** the source content address (the Go SourceHash, or the schema-hash twin in demo). */
	hash?: string;
	/** the emitted file's relative path, when the live engine renders one. */
	path?: string;
	/** the refusal explanation when the schema is malformed. */
	blockExplanation?: string;
}

/**
 * gatewayEmitArgs projects a Schema into the gateway args the Go `emit_ddl` / `emit_ts` tools
 * unmarshal: `{ schema }` where schema mirrors relemit.Schema. The relemit.Schema / EntityRelations
 * / AsyncOp structs carry NO json tags, so their keys are CAPITALISED (Project / Entities / Entity /
 * Relations / AsyncOps / Name / Async); the nested entities.Entity / ref.Relation / operation.Async
 * DO carry lowercase tags (name / attributes / target / cardinality / semantic / trigger / effects).
 * The args ride as a plain object tree — NO json.RawMessage byte-array body (the S59 scar avoided).
 *
 * The semantic is REQUIRED by relemit.Validate (ref.Resolve refuses an empty semantic): a 1-1/1-N
 * relation is an `fk`, an N-N is an `association` (the closed S71 set, never guessed). A cron async
 * carries `at`; the effects ride empty (the worker is not the dispatched read here).
 */
export function gatewayEmitArgs(schema: Schema): Record<string, unknown> {
	return {
		schema: {
			Project: schema.project,
			Entities: schema.entities.map((e) => ({
				Entity: {
					name: e.name,
					attributes: e.attributes.map((a) => ({
						name: a.name,
						type: a.type,
						required: a.required === true,
						identifier: a.identifier === true,
					})),
				},
				Relations: (e.relations ?? []).map((r) => ({
					name: r.name,
					target: r.target,
					cardinality: r.cardinality,
					semantic: r.cardinality === "N-N" ? "association" : "fk",
					required: r.required === true,
				})),
			})),
			AsyncOps: (schema.asyncOps ?? []).map((a) => ({
				Name: a.name,
				Async: {
					trigger: { kind: a.kind, at: a.at ?? "" },
					effects: [],
				},
			})),
		},
	};
}

/**
 * demoEmitView renders the deterministic demo fallback for a target — the SAME pure twin
 * (lib/relation-emitter.emitDDL / emitTS) the Go engine reproduces. A malformed schema yields the
 * refusal explanation; a well-formed schema yields the bytes (the Go content-hash is authoritative;
 * the twin carries no hash in demo — the live read supplies the live SourceHash). PURE.
 */
export function demoEmitView(schema: Schema, target: EmitTarget): EmitView {
	const out = target === "ts" ? emitTS(schema) : emitDDL(schema);
	if (isBlocked(out)) return { blockExplanation: out.explanation };
	return { output: out };
}
