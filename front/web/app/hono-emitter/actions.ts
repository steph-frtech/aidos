"use server";

import {
	type BlockReason,
	DEMO_MANIFEST,
	DEMO_SPEC,
	digest,
	emitPulumi,
	emitServer,
	emitWorker,
	isBlocked,
} from "@/lib/hono-emitter";

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
 * TWO ops are bound (action-capable, CLAUDE.md §7):
 *   - projectServerAction  → emit the Hono/TS server (or worker) from the Kernel ops;
 *   - emitPulumiAction     → emit the Pulumi/TS infra program from the StackManifest.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it RENDERS code as VALUES. The
 * emit is PURE (lib/hono-emitter), never an LLM; the emitted bytes are a projection (S78 owns
 * regeneration), never a kernel write.
 */

export interface EmitView {
	ok: boolean;
	/** which surface ran (server | worker | pulumi). */
	surface: "server" | "worker" | "pulumi" | null;
	/** the rendered bytes when emitted. */
	output?: string;
	/** the source content address (FNV digest twin) when emitted. */
	hash?: string;
	/** the refusal when the source is malformed. */
	block?: BlockReason;
}

/**
 * projectServerAction is the action-capable control behind the emitted SERVER surface
 * (ui-completeness, §7): the user picks server or worker and emits — the action RENDERS the
 * chosen Hono/TS projection deterministically over the demo Kernel ops. A malformed spec
 * yields the BlockReason. It WRITES NOTHING (the wall).
 */
export async function projectServerAction(
	_prev: EmitView,
	formData: FormData,
): Promise<EmitView> {
	const which = String(formData.get("surface") ?? "server");
	const out =
		which === "worker" ? emitWorker(DEMO_SPEC) : emitServer(DEMO_SPEC);
	const surface = which === "worker" ? "worker" : "server";
	if (isBlocked(out)) return { ok: true, surface, block: out };
	return { ok: true, surface, output: out, hash: digest(out) };
}

/**
 * emitPulumiAction is the second action-capable control: emit the Pulumi/TS infra program
 * from the StackManifest (ADR 0043). PURE, byte-stable, writes nothing (the wall).
 */
export async function emitPulumiAction(
	_prev: EmitView,
	_formData: FormData,
): Promise<EmitView> {
	const out = emitPulumi(DEMO_MANIFEST);
	if (isBlocked(out)) return { ok: true, surface: "pulumi", block: out };
	return { ok: true, surface: "pulumi", output: out, hash: digest(out) };
}
