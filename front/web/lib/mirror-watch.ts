/**
 * Mirror watch — the DECLARED TWIN of the Go package back/kernel/mirror/watch (S69, KRD §34/§56).
 * « Matérialiser-et-le-voir-rougir » : the user TRIGGERS materialization of an authored, red mirror
 * toward its runner (Godog / rapid / the fixture interpreter) and watches the verdict stream RED →
 * (stub) → GREEN live. The "watch it fail" of KRD made a product path.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). materialize + runStream are PURE + TOTAL — same input ⇒ same
 * output. The runner dispatch (closed table) and the verdict (a function of code-presence) are
 * deterministic, never an LLM, never a clock. The reproducibility mirror lib/mirror-watch.test.ts
 * pins it (it mirrors the Go property test verbatim).
 *
 * THE WALL (CLAUDE.md §2/§7). This module writes NOTHING. It materializes and computes a run stream
 * as VALUES; it never freezes a mirror into the mirrors schema (that stays the propose → ChangeSet →
 * approval path of S68/S20). The authoritative content-addressed id is the Go one.
 */

import {
	deriveShape,
	type ParsedSpec,
	parse,
	type Shape,
} from "./shape-editor";

/** Runner — the runner a materialized mirror dispatches to (twin of watch.Runner). The CLOSED set. */
export type Runner = "godog" | "rapid" | "fixture";

/** Liveness — a mirror's verdict (twin of records.Liveness): alive=green, dead=red. */
export type Liveness = "alive" | "dead";

/** TruthNature → Runner via the derived shape (the closed dispatch table, KRD §34/§90). */
const SHAPE_TO_RUNNER: Record<Shape, Runner> = {
	gherkin: "godog",
	property: "rapid",
	fixture: "fixture",
};

export const ERR_NO_MIRROR =
	"watch: proposal carries no mirror (nothing to materialize)";
export const ERR_EMPTY_SPEC =
	"watch: proposal carries no parsed spec (no source to materialize)";

export interface MaterializedMirror {
	mirrorId: string;
	projectId: string;
	reflects: string;
	targetRunner: Runner;
	shape: Shape;
	materializedSource: string;
}

export interface MaterializeResult {
	materialized: MaterializedMirror | null;
	error: string | null;
}

/**
 * renderSource re-renders a parsed spec into the canonical runnable source for its runner — PURE,
 * deterministic (same spec ⇒ byte-identical text). Mirrors watch.renderSource verbatim.
 */
function renderSource(spec: ParsedSpec): string | null {
	const lines: string[] = [];
	switch (spec.shape) {
		case "gherkin": {
			if (!spec.title || (spec.steps?.length ?? 0) === 0) return null;
			lines.push(`Scenario: ${spec.title}`);
			for (const s of spec.steps ?? []) lines.push(`${s.keyword} ${s.text}`);
			break;
		}
		case "property": {
			if (
				!spec.title ||
				(spec.quantifier?.length ?? 0) === 0 ||
				!spec.predicate
			)
				return null;
			lines.push(`property: ${spec.title}`);
			lines.push(`forall: ${(spec.quantifier ?? []).join(", ")}`);
			lines.push(`holds: ${spec.predicate}`);
			break;
		}
		case "fixture": {
			if (
				!spec.title ||
				!spec.state ||
				!spec.command ||
				(spec.events?.length ?? 0) === 0
			)
				return null;
			lines.push(`fixture: ${spec.title}`);
			lines.push(`state: ${spec.state}`);
			lines.push(`command: ${spec.command}`);
			for (const e of spec.events ?? []) lines.push(`event: ${e}`);
			break;
		}
		default:
			return null;
	}
	return `${lines.join("\n")}\n`;
}

/**
 * materialize projects an authored mirror (a nature + reflects + source) into a runnable
 * MaterializedMirror — PURE, deterministic. It derives the shape, parses the source, dispatches by
 * shape to the runner (closed table), and renders the canonical source. An unknown nature /
 * unparseable / empty source is refused (never a guessed runner). The mirrorId is a stable handle;
 * the authoritative content-addressed id is the Go one.
 */
export function materialize(
	nature: string,
	reflects: string,
	source: string,
): MaterializeResult {
	const der = deriveShape(nature);
	if (der === null) return { materialized: null, error: ERR_NO_MIRROR };
	const { spec, error } = parse(der.shape, source);
	if (error !== null || spec === null)
		return { materialized: null, error: error ?? ERR_EMPTY_SPEC };
	const rendered = renderSource(spec);
	if (rendered === null) return { materialized: null, error: ERR_EMPTY_SPEC };
	// A stable front handle for the materialized mirror (the Go id is authoritative).
	const mirrorId = `${reflects}:${der.shape}`;
	return {
		materialized: {
			mirrorId,
			projectId: "",
			reflects,
			targetRunner: SHAPE_TO_RUNNER[der.shape],
			shape: der.shape,
			materializedSource: rendered,
		},
		error: null,
	};
}

/** Phase — one ordered step of the live run stream (twin of watch.Phase). */
export type Phase = "queued" | "materialized" | "running" | "verdict";

export const PHASES: Phase[] = ["queued", "materialized", "running", "verdict"];

export interface RunEvent {
	phase: Phase;
	runner: Runner;
	status: Liveness;
	detail: string;
}

export interface Stream {
	mirrorId: string;
	runner: Runner;
	events: RunEvent[];
	final: Liveness;
	red: boolean;
}

export interface RunResult {
	stream: Stream | null;
	error: string | null;
}

/**
 * runStream materializes the live run of a mirror against a code-probe — PURE, deterministic (same
 * (mirror, present) ⇒ byte-identical stream). It walks the fixed phase order and decides the terminal
 * verdict by CODE-PRESENCE: absent ⇒ RED (watch it fail), present ⇒ GREEN. Mirrors watch.RunStream.
 */
export function runStream(
	m: MaterializedMirror,
	codePresent: boolean,
): RunResult {
	if (!m.mirrorId) return { stream: null, error: ERR_NO_MIRROR };
	if (!m.materializedSource) return { stream: null, error: ERR_EMPTY_SPEC };

	const verdict: Liveness = codePresent ? "alive" : "dead";
	const verdictDetail = codePresent
		? `code under ${m.reflects} present — the mirror passes`
		: `no code under ${m.reflects} — the mirror fails (watch it fail)`;

	const events: RunEvent[] = [
		{
			phase: "queued",
			runner: m.targetRunner,
			status: "dead",
			detail: "run accepted, awaiting materialization",
		},
		{
			phase: "materialized",
			runner: m.targetRunner,
			status: "dead",
			detail: `materialized ${m.shape} source for ${m.targetRunner}`,
		},
		{
			phase: "running",
			runner: m.targetRunner,
			status: "dead",
			detail: `running ${m.targetRunner} against ${m.reflects}`,
		},
		{
			phase: "verdict",
			runner: m.targetRunner,
			status: verdict,
			detail: verdictDetail,
		},
	];
	return {
		stream: {
			mirrorId: m.mirrorId,
			runner: m.targetRunner,
			events,
			final: verdict,
			red: verdict === "dead",
		},
		error: null,
	};
}
