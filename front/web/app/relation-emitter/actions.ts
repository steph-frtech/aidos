"use server";

import {
	type BlockReason,
	DEMO_SCHEMA,
	emitDDL,
	emitTS,
	emitWorker,
	isBlocked,
	type Schema,
} from "@/lib/relation-emitter";

/**
 * Server Actions for the /relation-emitter Workbench panel (S74 — « émetteurs
 * relation-aware (+ async + blob) »).
 *
 * THE STEP (ROADMAP-app-builder S74): EmitDDL/EmitTS/EmitWorker render a multi-entity
 * schema (entities + relations S71 + async ops S73) to the emitted app's targets (ADR
 * 0040). A N-N emits a JOIN TABLE; the DDL's FKs reference REAL tables; an async node
 * emits a WORKER + OUTBOX table — deterministic & byte-stable.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it RENDERS code as VALUES.
 * The emit is PURE (lib/relation-emitter), never an LLM; the emitted bytes are a
 * projection (S78 owns regeneration), never a kernel write.
 */

export interface EmitView {
	ok: boolean;
	/** the emit target chosen (ddl | ts | worker). */
	target: "ddl" | "ts" | "worker" | null;
	/** whether the async op (worker + outbox) was included. */
	withAsync: boolean;
	/** the rendered bytes when emitted. */
	output?: string;
	/** the schema's content address (source hash) when emitted. */
	hash?: string;
	/** the refusal when the schema is malformed. */
	block?: BlockReason;
}

/** sha256 hex over the canonical schema JSON — the source content address (twin of Go SchemaHash). */
async function schemaHash(s: Schema): Promise<string> {
	const { createHash } = await import("node:crypto");
	// Canonical view: entities sorted by name, async sorted by name (input-order invariant).
	const ents = [...s.entities].sort((a, b) =>
		a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
	);
	const async = [...(s.asyncOps ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	const body = JSON.stringify({ project: s.project, entities: ents, async });
	return createHash("sha256").update(body).digest("hex");
}

/**
 * emitAction is the action-capable control behind the emitter surface (CLAUDE.md §7
 * ui-completeness): the user picks a target (DDL / TS / Worker) and whether to include the
 * async op, and emits — the action RENDERS the chosen projection deterministically over the
 * demo multi-entity schema and content-addresses the source. A malformed schema yields the
 * BlockReason. It WRITES NOTHING (the wall).
 */
export async function emitAction(
	_prev: EmitView,
	formData: FormData,
): Promise<EmitView> {
	const target = String(formData.get("target") ?? "ddl") as
		| "ddl"
		| "ts"
		| "worker";
	const withAsync = formData.get("withAsync") === "on";

	const schema: Schema = {
		...DEMO_SCHEMA,
		asyncOps: withAsync ? DEMO_SCHEMA.asyncOps : [],
	};

	let out: string | BlockReason;
	switch (target) {
		case "ts":
			out = emitTS(schema);
			break;
		case "worker":
			out = emitWorker(schema);
			break;
		default:
			out = emitDDL(schema);
			break;
	}

	if (isBlocked(out)) {
		return { ok: true, target, withAsync, block: out };
	}
	const hash = await schemaHash(schema);
	return { ok: true, target, withAsync, output: out, hash };
}
