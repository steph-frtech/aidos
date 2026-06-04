/**
 * agentloop-runtosignal — BA30 front twin of back/runtime/agentloop's RunToSignal GATEWAY
 * (gap I1/I2). The Go package is the AUTHORITY (the pure Classify/RunToSignal engine); this twin
 * REPLICATES the same deterministic classification so the Workbench can show, WITHOUT a backend
 * round-trip, "this run becomes a reality.Signal" and "two distinct runs of the same failure mode
 * collapse into one recurring incident (Recurrence climbs)".
 *
 * IDENTITY-BY-PATTERN (gap I2 — the load-bearing decision). The signal's identity is the PATTERN
 * (failure-class + dominant refusal code + cause class), NOT the run id. Two DISTINCT runs sharing
 * a failure mode share the SAME pattern key, so they collapse into ONE recurring incident — the
 * Recurrence counter is the count of runs per pattern. The run/goal id rides the human-facing
 * provenance prose, OUTSIDE the identity.
 *
 * THE WALL. This twin declares NO truth: the cause sketch is an explicit HYPOTHESIS; the signal is
 * reality (incident_derived taint, no version, no mirror). The far edge stays idea → mirror →
 * /goal → human. An ordinary green run yields no signal — no incident invented.
 *
 * DETERMINISM-FIRST. The classifier is a tally + a switch — code, never an LLM "judge this run"
 * agent. Pure, total, deterministic (same run + thresholds ⇒ same result), no I/O, no Date.now(),
 * no Math.random(). The reproducibility mirror (agentloop-runtosignal.test.ts) pins it.
 */

import { refusalsOf } from "./agentloop-ledger";
import type { AgentRun, Result } from "./agentrun";

/** The closed run-shape classification (twin of agentloop.FailureClass). */
export const FAILURE_CLASSES = [
	"none",
	"still_red",
	"abandoned",
	"blocked",
	"green_hollow",
] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

/** Signal severity (twin of agentloop.Severity): failures are high, hollow-green is low. */
export type Severity = "high" | "low";

/** The reality-side signal a run produces (twin of reality.Signal). */
export interface Signal {
	operation: string;
	error: string;
	recurrence: number;
}

/** The declared green-hollow knobs (twin of agentloop.SignalThresholds). Declared, never learned. */
export interface SignalThresholds {
	/** Refusal count at/above which a GREEN run is flagged hollow. 0 disables the count-trip. */
	thrashRefusals: number;
}

/** The canonical declared thresholds (twin of agentloop.DefaultThresholds). */
export const DEFAULT_THRESHOLDS: SignalThresholds = { thrashRefusals: 3 };

/** The gateway's typed result (twin of agentloop.PatternSignal). */
export interface PatternSignal {
	signal: Signal;
	class: FailureClass;
	/** The stable identity key "<class>|<dominant_code>|<cause_class>" — the basis of Recurrence. */
	pattern: string;
	severity: Severity;
	/** A root-cause HYPOTHESIS (never a truth). */
	causeSketch: string;
	/** Human-facing prose ("agent run R failed on goal G") — OUTSIDE the content address. */
	provenance: string;
}

const CODE_DETERMINISM_GAP = "AGENT_DETERMINISM_GAP";
const CODE_WRITE_ABOVE_WATERLINE = "AGENT_WRITE_ABOVE_WATERLINE";

/** isHollowGreen — twin of agentloop.isHollowGreen: a green run is hollow when it thrashes against
 * the wall (refusals ≥ threshold) OR surfaces a determinism gap. Pure, total. */
function isHollowGreen(run: AgentRun, th: SignalThresholds): boolean {
	const refusals = refusalsOf(run);
	const total = Object.values(refusals).reduce((a, b) => a + b, 0);
	if (th.thrashRefusals > 0 && total >= th.thrashRefusals) return true;
	return (refusals[CODE_DETERMINISM_GAP] ?? 0) > 0;
}

/** classify — twin of agentloop.Classify. Pure, total. */
export function classify(run: AgentRun, th: SignalThresholds): FailureClass {
	switch (run.result as Result) {
		case "still_red":
			return "still_red";
		case "abandoned":
			return "abandoned";
		case "blocked":
			return "blocked";
		case "green":
			return isHollowGreen(run, th) ? "green_hollow" : "none";
		default:
			return "none";
	}
}

/** dominantRefusalCode — the most frequent refusal code, ties broken lexically (twin of the Go
 * helper). Empty when the run had no refusal. Pure, total. */
function dominantRefusalCode(run: AgentRun): string {
	const refusals = refusalsOf(run);
	const codes = Object.keys(refusals);
	if (codes.length === 0) return "";
	codes.sort((a, b) =>
		refusals[a] !== refusals[b]
			? refusals[b] - refusals[a]
			: a.localeCompare(b),
	);
	return codes[0];
}

/** causeClass — the coarse cause bucket (twin of agentloop.causeClass). Pure, total. */
function causeClass(cls: FailureClass, code: string): string {
	if (code === CODE_DETERMINISM_GAP) return "determinism_gap";
	if (code === CODE_WRITE_ABOVE_WATERLINE) return "wall_thrash";
	if (code !== "") return `refused_${code}`;
	if (cls === "abandoned") return "budget_breach";
	return "goal_unmet";
}

function shortRun(id: string): string {
	return id.length <= 12 ? id : id.slice(0, 12);
}

/**
 * runToSignal — the GATEWAY (twin of agentloop.RunToSignal). An ordinary green run yields
 * [null, false]; any failure class and an abnormal green yield [signal, true]. The signal's
 * identity is the PATTERN (not the run id), so two distinct runs of the same mode share it.
 * PURE, TOTAL. The cause sketch is a HYPOTHESIS; the run/goal id rides the provenance prose.
 */
export function runToSignal(
	run: AgentRun,
	th: SignalThresholds = DEFAULT_THRESHOLDS,
): [PatternSignal | null, boolean] {
	const cls = classify(run, th);
	if (cls === "none") return [null, false];

	const code = dominantRefusalCode(run);
	const cause = causeClass(cls, code);
	const pattern = `${cls}|${code}|${cause}`;
	const severity: Severity = cls === "green_hollow" ? "low" : "high";

	const operation = `agent_run:${cls}`;
	const error = code !== "" ? `${code} (${cause})` : cause;

	const causeSketch =
		`HYPOTHÈSE (pas une vérité) : un run d'agent de classe « ${cls} » est un signal récurrent ` +
		`(sévérité ${severity}). Le noyau est peut-être incomplet ou le goal sous-spécifié ici — ` +
		`l'humain décide l'assertion au /goal.` +
		(code !== "" ? ` Refus de mur dominant : ${code}.` : "");

	return [
		{
			signal: { operation, error, recurrence: 1 },
			class: cls,
			pattern,
			severity,
			causeSketch,
			provenance: `run d'agent ${shortRun(run.id)} ${cls} sur le goal « ${run.goal} »`,
		},
		true,
	];
}

/** A classified row for the panel: the run, its [signal, signalled], and the recurring pattern. */
export interface SignalEntry {
	run: AgentRun;
	signalled: boolean;
	signal: PatternSignal | null;
}

/** A grouped view: how many reported runs share each pattern (the Recurrence proof). */
export interface SignalView {
	entries: SignalEntry[];
	/** pattern → count of runs that collapse to it (Recurrence climbs when > 1). */
	patternRecurrence: Record<string, number>;
}

/**
 * runsToSignals — classify a list of runs, returning per-run entries (stable input order) plus the
 * per-pattern recurrence count. Two distinct runs of the same pattern push the count past 1 — the
 * identity-by-pattern proof. PURE, TOTAL.
 */
export function runsToSignals(
	runs: AgentRun[],
	th: SignalThresholds = DEFAULT_THRESHOLDS,
): SignalView {
	const entries: SignalEntry[] = [];
	const patternRecurrence: Record<string, number> = {};
	for (const r of runs) {
		const [signal, signalled] = runToSignal(r, th);
		entries.push({ run: r, signalled, signal });
		if (signalled && signal) {
			patternRecurrence[signal.pattern] =
				(patternRecurrence[signal.pattern] ?? 0) + 1;
		}
	}
	return { entries, patternRecurrence };
}
