"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import {
	type BlockReason,
	DEMO_MANIFEST,
	DEMO_SPEC,
	digest,
	emitPulumi,
	emitWorker,
	isBlocked,
} from "@/lib/hono-emitter";
import { demoServerView, gatewayServerArgs } from "@/lib/hono-emitter-data";
import { panelScope } from "@/lib/panelScope";
import { serverDecoder } from "./live";

/**
 * Server Actions for the /hono-emitter Workbench panel (S87 — « scaffold serveur de l'app
 * émise (Hono/TS) + émetteur IaC Pulumi »).
 *
 * THE STEP (ROADMAP-app-builder S87 + ADR 0040 + ADR 0043). EmitServer/EmitWorker render the
 * project's Kernel operations into a BOOTABLE Hono/TS server (main+router+middleware+/healthz+
 * one handler per SYNC op, delegating to the Go interpreter callback) + an async worker;
 * EmitPulumiProgram renders the StackManifest into a Pulumi/TS infra program (one
 * docker.Container per service on the shared Traefik network) — deterministic & byte-stable.
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The SERVER surface now
 * reads the LIVE artifact from the Go hono-emitter MCP server through the passerelle:
 *   - `projectServerAction` (surface=server) → `readVia(scope, "emit_server", …)`, decoding the Go
 *     artifact bytes; the demo twin (`demoServerView`) is the deterministic fallback
 *     (`source:"live"|"demo"`).
 * The worker + Pulumi surfaces stay on the PURE twin (lib/hono-emitter) as the deterministic demo
 * projection — their cheap reads are not the dispatched server read of this cutover (the Go output
 * is the authority the twin reproduces byte-for-byte).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action READS below the line — it RENDERS code as VALUES and
 * writes NOTHING to the kernel/mirrors/fitness. The emit is PURE (no LLM); the emitted bytes are a
 * projection (S78 owns regeneration), never a kernel write.
 */

export interface EmitView {
	ok: boolean;
	/** which surface ran (server | worker | pulumi). */
	surface: "server" | "worker" | "pulumi" | null;
	/** the rendered bytes when emitted. */
	output?: string;
	/** the source content address (the Go SourceHash live, or the FNV digest twin in demo). */
	hash?: string;
	/** whether the snapshot came from the live gateway or the demo fixture (server surface). */
	source?: Source;
	/** the refusal when the source is malformed. */
	block?: BlockReason;
}

/** a small OUT_OF_SCOPE BlockReason carrying the live/demo refusal explanation (the panel's shape). */
function refusal(explanation: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation,
		how_to_fix: [
			"pin_the_source : complétez la source dans le Kernel (operations nommées).",
			"rerun aidos project : relancez l'émission une fois la source complète et bien typée.",
		],
	};
}

/**
 * projectServerAction is the action-capable control behind the emitted SERVER surface
 * (ui-completeness, §7): the user picks server or worker and emits. The SERVER surface reads the
 * LIVE Hono/TS artifact from the Go engine via the passerelle (the dispatched `emit_server` tool),
 * with the pure demo twin as the deterministic fallback (source:"live"|"demo"); the WORKER surface
 * renders the pure twin projection. A malformed spec yields the BlockReason. It WRITES NOTHING.
 */
export async function projectServerAction(
	_prev: EmitView,
	formData: FormData,
): Promise<EmitView> {
	const which = String(formData.get("surface") ?? "server");
	if (which === "worker") {
		const out = emitWorker(DEMO_SPEC);
		if (isBlocked(out)) return { ok: true, surface: "worker", block: out };
		return {
			ok: true,
			surface: "worker",
			output: out,
			hash: digest(out),
			source: "demo",
		};
	}
	// SERVER surface — LIVE read through the passerelle (the dispatched emit_server tool);
	// demoServerView(DEMO_SPEC) is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"emit_server",
		gatewayServerArgs(DEMO_SPEC),
		serverDecoder,
		demoServerView(DEMO_SPEC),
	);
	if (data.blockExplanation !== undefined) {
		return {
			ok: true,
			surface: "server",
			source,
			block: refusal(data.blockExplanation),
		};
	}
	return {
		ok: true,
		surface: "server",
		output: data.output,
		hash: data.hash,
		source,
	};
}

/**
 * emitPulumiAction is the second action-capable control: emit the Pulumi/TS infra program
 * from the StackManifest (ADR 0043). PURE, byte-stable, writes nothing (the wall). It renders the
 * deterministic twin projection (the Go honoemit.EmitPulumiProgram is the authority it reproduces).
 */
export async function emitPulumiAction(
	_prev: EmitView,
	_formData: FormData,
): Promise<EmitView> {
	const out = emitPulumi(DEMO_MANIFEST);
	if (isBlocked(out)) return { ok: true, surface: "pulumi", block: out };
	return {
		ok: true,
		surface: "pulumi",
		output: out,
		hash: digest(out),
		source: "demo",
	};
}
