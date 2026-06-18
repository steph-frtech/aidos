"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	type BlockReason,
	DEMO_SCHEMA,
	emitWorker,
	isBlocked,
	type Schema,
} from "@/lib/relation-emitter";
import {
	demoEmitView,
	type EmitTarget,
	emitTool,
	gatewayEmitArgs,
} from "@/lib/relation-emitter-data";
import { emitDecoder } from "./live";

/**
 * Server Actions for the /relation-emitter Workbench panel (S74 — « émetteurs
 * relation-aware (+ async + blob) »).
 *
 * THE STEP (ROADMAP-app-builder S74): EmitDDL/EmitTS/EmitWorker render a multi-entity
 * schema (entities + relations S71 + async ops S73) to the emitted app's targets (ADR
 * 0040). A N-N emits a JOIN TABLE; the DDL's FKs reference REAL tables; an async node
 * emits a WORKER + OUTBOX table — deterministic & byte-stable.
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The DDL + TS surfaces now
 * read the LIVE artifact from the Go relation-emitter MCP server through the passerelle:
 *   - target=ddl/ts → `readVia(scope, "emit_ddl"|"emit_ts", …)`, decoding the Go artifact source;
 *     the pure twin (`demoEmitView`) is the deterministic fallback (`source:"live"|"demo"`).
 * The WORKER surface stays on the PURE twin (lib/relation-emitter) — its tool collides by name with
 * hono-emitter.emit_worker so it is OFF-dispatch (the panel keeps a deterministic demo projection;
 * the Go relemit.EmitWorker is the authority the twin reproduces byte-for-byte).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action READS below the line — it RENDERS code as VALUES and
 * writes NOTHING to the kernel/mirrors/fitness. The emit is PURE (no LLM); the emitted bytes are a
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
	/** the schema's content address (the Go SourceHash live, or the twin hash in demo). */
	hash?: string;
	/** whether the snapshot came from the live gateway or the demo fixture (ddl/ts surfaces). */
	source?: Source;
	/** the refusal when the schema is malformed. */
	block?: BlockReason;
}

/** sha256 hex over the canonical schema JSON — the source content address twin (worker/demo path). */
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

/** the closed BlockReason the live/demo refusal explanation rides on (the panel's shape). */
function refusal(explanation: string): BlockReason {
	return {
		code: "UNKNOWN_RELATION_TARGET",
		severity: "blocking",
		explanation,
		how_to_fix: [
			"pin_an_identifier : chaque cible de FK (1-1/1-N) et chaque bout d'un N-N porte exactement un attribut identifier.",
			"declare_the_target : une relation ne référence qu'une entité du jeu déclaré (S70).",
			"name_the_async : chaque opération async porte un nom.",
		],
	};
}

/**
 * emitAction is the action-capable control behind the emitter surface (CLAUDE.md §7
 * ui-completeness): the user picks a target (DDL / TS / Worker) and whether to include the
 * async op, and emits. The DDL + TS targets read the LIVE artifact from the Go engine via the
 * passerelle (the dispatched emit_ddl/emit_ts tools), with the pure twin as the deterministic
 * fallback (source:"live"|"demo"); the WORKER target renders the pure twin projection (off-dispatch).
 * A malformed schema yields the BlockReason. It WRITES NOTHING (the wall).
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

	// WORKER surface — off-dispatch (name collision with hono-emitter.emit_worker); the pure twin
	// is the deterministic demo projection (the Go relemit.EmitWorker is the authority it mirrors).
	if (target === "worker") {
		const out = emitWorker(schema);
		if (isBlocked(out)) {
			return { ok: true, target, withAsync, source: "demo", block: out };
		}
		const hash = await schemaHash(schema);
		return { ok: true, target, withAsync, output: out, hash, source: "demo" };
	}

	// DDL / TS surfaces — LIVE read through the passerelle (the dispatched emit_ddl/emit_ts tools);
	// demoEmitView is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const emitTarget: EmitTarget = target;
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		emitTool(emitTarget),
		gatewayEmitArgs(schema),
		emitDecoder,
		demoEmitView(schema, emitTarget),
	);
	if (data.blockExplanation !== undefined) {
		return {
			ok: true,
			target,
			withAsync,
			source,
			block: refusal(data.blockExplanation),
		};
	}
	// In demo the twin carries no hash — fall back to the schema-hash twin so the panel always
	// shows a content address (live supplies the authoritative Go SourceHash).
	const hash = data.hash ?? (await schemaHash(schema));
	return { ok: true, target, withAsync, output: data.output, hash, source };
}
