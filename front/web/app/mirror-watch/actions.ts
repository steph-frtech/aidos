"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { materialize } from "@/lib/mirror-watch";
import { demoRun, runArgs } from "@/lib/mirror-watch-data";
import { panelScope } from "@/lib/panelScope";
import { runDecoder } from "./live";

/**
 * Server Actions for the /mirror-watch Workbench panel (S69 — « matérialiser-et-le-voir-rougir »).
 *
 * THE STEP (ROADMAP-app-builder S69, KRD §34/§56): the user TRIGGERS materialization of an authored
 * mirror toward its runner (Godog / rapid / the fixture interpreter) and watches the verdict stream
 * RED → (stub) → GREEN live — the "watch it fail" of KRD made a product path. Against absent code the
 * mirror is RED; against a stub it is GREEN.
 *
 * S59/ADR 0092 CUTOVER — the moteur Go is the SINGLE live source. The RUN now reads the LIVE red/green
 * stream from the Go mirror-watch MCP server through the passerelle (`readVia(scope, "watch_run", …)`,
 * the dispatched below-the-line read), with the twin `lib/mirror-watch.runStream()` preserved ONLY as
 * the deterministic demo fallback (`source:"live"|"demo"`, via lib/mirror-watch-data.demoRun). The
 * MATERIALIZE step keeps its voie propre on the twin `materialize`: watch_materialize is DELIBERATELY
 * NOT dispatched (its shapeeditor.Proposal input embeds a changeset.ChangeSet whose Delta.Body is a
 * json.RawMessage — the S59 byte-array scar), so route(watch_materialize) → unknown_tool (the
 * arch-fitness `propose` precedent). The `readVia` frontier import keeps the T5 cliquet GREEN (the twin
 * sits behind the demo fallback, never as the live source).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it materializes the mirror and runs it as
 * VALUES. It never freezes a mirror into the mirrors schema (that stays the propose → ChangeSet →
 * approval path of S68/S20); S69 only RUNS the authored, above-the-line mirror.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the twin demo are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo run (same verdict — absent ⇒ RED, present ⇒ GREEN).
 */

export interface WatchEventView {
	phase: string;
	runner: string;
	status: string;
	detail: string;
}

export interface WatchResultView {
	ok: boolean;
	/** i18n key under "mirrorWatch.messages". */
	messageKey: string;
	error?: string;
	projectId?: string;
	nature?: string;
	shape?: string;
	runner?: string;
	materializedSource?: string;
	codePresent?: boolean;
	red?: boolean;
	final?: string;
	events?: WatchEventView[];
	/** the run's source: "live" (the Go engine via the passerelle) or "demo" (the twin fallback). */
	source?: Source;
}

/**
 * watchAction is the action-capable control behind the watch surface (CLAUDE.md §7 ui-completeness):
 * the user picks a truth-nature + reflected layer, types the authored source, toggles whether the code
 * under test exists, and submits. It materializes the mirror locally (the twin `materialize`, the
 * not-dispatched watch_materialize's voie propre), RUNS it LIVE through the passerelle (`watch_run`),
 * and returns the live red/green stream. Absent code ⇒ RED (watch it fail); a stub ⇒ GREEN. It WRITES
 * NOTHING (the wall). An unknown nature / unparseable source is refused with a message.
 */
export async function watchAction(
	_prev: WatchResultView,
	formData: FormData,
): Promise<WatchResultView> {
	const nature = String(formData.get("nature") ?? "").trim();
	const reflects = String(formData.get("reflects") ?? "").trim();
	const source = String(formData.get("source") ?? "");
	const codePresent = String(formData.get("codePresent") ?? "") === "on";

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;

	// Materialize via the twin — watch_materialize is NOT dispatched (its Proposal input embeds a
	// json.RawMessage ChangeSet body, the S59 scar), so the panel keeps this voie propre.
	const { materialized, error: matErr } = materialize(nature, reflects, source);
	if (matErr !== null || materialized === null) {
		return {
			ok: false,
			messageKey: "materializeRefused",
			error: matErr ?? undefined,
			projectId,
			nature,
		};
	}

	// RUN it LIVE through the passerelle (the dispatched `watch_run`); the twin demoRun() is the
	// deterministic fallback (source:"live"|"demo") — ADR 0092.
	const scope = await panelScope();
	const { data, source: runSource } = await readVia(
		scope,
		"watch_run",
		runArgs(materialized, codePresent),
		runDecoder,
		demoRunFallback(materialized, codePresent),
	);

	return {
		ok: true,
		messageKey: data.red ? "watchRed" : "watchGreen",
		projectId,
		nature,
		shape: materialized.shape,
		runner: data.runner,
		materializedSource: materialized.materializedSource,
		codePresent,
		red: data.red,
		final: data.final,
		events: data.events,
		source: runSource,
	};
}

/**
 * demoRunFallback projects the twin demo run into the live `RunView` shape, so the demo fallback is
 * byte-identical in shape to the decoded live payload. A twin run never fails here (the materialized
 * mirror was already validated), so the fallback is always a well-formed stream.
 */
function demoRunFallback(
	m: Parameters<typeof runArgs>[0],
	codePresent: boolean,
): {
	mirrorId: string;
	runner: string;
	final: string;
	red: boolean;
	events: WatchEventView[];
} {
	const { stream } = demoRun(m, codePresent);
	if (stream === null) {
		return {
			mirrorId: m.mirrorId,
			runner: m.targetRunner,
			final: "dead",
			red: true,
			events: [],
		};
	}
	return {
		mirrorId: stream.mirrorId,
		runner: stream.runner,
		final: stream.final,
		red: stream.red,
		events: stream.events.map((e) => ({
			phase: e.phase,
			runner: e.runner,
			status: e.status,
			detail: e.detail,
		})),
	};
}
