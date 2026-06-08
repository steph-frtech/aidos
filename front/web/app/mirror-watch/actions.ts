"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	materialize,
	type Phase,
	type RunEvent,
	runStream,
} from "@/lib/mirror-watch";

/**
 * Server Actions for the /mirror-watch Workbench panel (S69 — « matérialiser-et-le-voir-rougir »).
 *
 * THE STEP (ROADMAP-app-builder S69, KRD §34/§56): the user TRIGGERS materialization of an authored
 * mirror toward its runner (Godog / rapid / the fixture interpreter) and watches the verdict stream
 * RED → (stub) → GREEN live — the "watch it fail" of KRD made a product path. Against absent code the
 * mirror is RED; against a stub it is GREEN. Materialization + verdict are PURE FUNCTIONS, never an LLM.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it materializes the mirror and computes the
 * live run stream as VALUES. It never freezes a mirror into the mirrors schema (that stays the propose →
 * ChangeSet → approval path of S68/S20); S69 only RUNS the authored, above-the-line mirror.
 */

export interface WatchEventView {
	phase: Phase;
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
}

function toView(events: RunEvent[]): WatchEventView[] {
	return events.map((e) => ({
		phase: e.phase,
		runner: e.runner,
		status: e.status,
		detail: e.detail,
	}));
}

/**
 * watchAction is the action-capable control behind the watch surface (CLAUDE.md §7 ui-completeness):
 * the user picks a truth-nature + reflected layer, types the authored source, toggles whether the code
 * under test exists, and submits — the action runs the pure twin (materialize + runStream) and returns
 * the live red/green stream. Absent code ⇒ RED (watch it fail); a stub ⇒ GREEN. It WRITES NOTHING (the
 * wall). An unknown nature / unparseable source is refused with a message.
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

	const { stream, error: runErr } = runStream(materialized, codePresent);
	if (runErr !== null || stream === null) {
		return {
			ok: false,
			messageKey: "materializeRefused",
			error: runErr ?? undefined,
			projectId,
			nature,
		};
	}

	return {
		ok: true,
		messageKey: stream.red ? "watchRed" : "watchGreen",
		projectId,
		nature,
		shape: materialized.shape,
		runner: stream.runner,
		materializedSource: materialized.materializedSource,
		codePresent,
		red: stream.red,
		final: stream.final,
		events: toView(stream.events),
	};
}
