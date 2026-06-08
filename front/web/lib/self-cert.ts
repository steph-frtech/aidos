/**
 * self-cert.ts — the deterministic TS twin of back/runtime/buildloop/selfcert (S84).
 *
 * THE STEP (ROADMAP S84): COMPUTATIONAL SELF-CERTIFICATION in the build loop. At each diff the
 * loop self-certifies over the REAL computational sensor battery — types / lint / unit /
 * fixtures / properties / Pact contract / arch-fitness of the emitted TS tree (dependency-
 * cruiser) — gating EVERY iteration. The iteration is GREEN only when every sensor passes; a
 * diff that breaks an arch boundary or a Pact contract reddens its sensor and BLOCKS the
 * iteration before green (the done-criterion).
 *
 * THE TWIN (no drift): this module mirrors the Go authority byte-for-byte — the SAME seven
 * closed sensor kinds, the SAME conjunction gate (anti-passthrough: a missing/red sensor ⇒ not
 * green), the SAME BUILD_LOOP_SENSOR_RED refusal. The reproducibility mirror lib/self-cert.test.ts
 * (fast-check) pins same-verdicts → same-battery.
 *
 * THE WALL (CLAUDE.md §2): the gate is a PURE FUNCTION of the sensor verdicts — never an LLM
 * judgment. This module writes NOTHING; the sensor RUNS happen below the line over the sandbox
 * (S82); a green build proposes its truth through propose→ChangeSet (S85).
 */

/** The seven closed computational sensor kinds (twin of selfcert.SensorKinds). */
export type SensorKind =
	| "types"
	| "lint"
	| "unit"
	| "fixture"
	| "property"
	| "pact"
	| "archfit";

/** The closed sensor-kind set, in canonical order (twin of selfcert.SensorKinds). */
export const SENSOR_KINDS: readonly SensorKind[] = [
	"types",
	"lint",
	"unit",
	"fixture",
	"property",
	"pact",
	"archfit",
];

/** A sensor's CLOSED two-value verdict — no "unknown"; missing/unreadable ⇒ red. */
export type SensorState = "red" | "green";

/** One sensor's outcome over the candidate diff. */
export interface SensorVerdict {
	kind: SensorKind;
	state: SensorState;
	/** when red, which type error / Pact contract / arch boundary failed. */
	detail?: string;
}

/** The BUILD_LOOP_SENSOR_RED refusal (twin of selfcert.CodeBuildLoopSensorRed). */
export const CODE_BUILD_LOOP_SENSOR_RED = "BUILD_LOOP_SENSOR_RED" as const;

/** The full self-certification report over one diff. */
export interface Battery {
	/** the seven sensor verdicts in canonical order (always the full battery). */
	sensors: SensorVerdict[];
	/** the COMPUTED conjunction: true iff every sensor is green. Never declared. */
	green: boolean;
	/** the actionable refusal when red, undefined when green. */
	blockCode?: typeof CODE_BUILD_LOOP_SENSOR_RED;
	/** the red sensor kinds in canonical order (the BlockReason names them). */
	redSensors?: SensorKind[];
}

/** indexVerdicts folds a verdict slice into a kind→verdict map, last-wins on a duplicate. */
function indexVerdicts(
	verdicts: readonly SensorVerdict[],
): Map<SensorKind, SensorVerdict> {
	const m = new Map<SensorKind, SensorVerdict>();
	for (const v of verdicts) m.set(v.kind, v);
	return m;
}

/**
 * gateGreen — the PURE conjunction over a verdict set: true iff EVERY canonical sensor is
 * present AND green (anti-passthrough — a missing or red sensor ⇒ not green). Twin of
 * selfcert.GateGreen.
 */
export function gateGreen(verdicts: readonly SensorVerdict[]): boolean {
	const byKind = indexVerdicts(verdicts);
	for (const k of SENSOR_KINDS) {
		if (byKind.get(k)?.state !== "green") return false;
	}
	return true;
}

/** redSensors — the kinds NOT green (red or missing), in canonical order. */
export function redSensors(verdicts: readonly SensorVerdict[]): SensorKind[] {
	const byKind = indexVerdicts(verdicts);
	const red: SensorKind[] = [];
	for (const k of SENSOR_KINDS) {
		if (byKind.get(k)?.state !== "green") red.push(k);
	}
	return red;
}

/**
 * certify — the PURE assembly of the full Battery report from a set of sensor verdicts. It
 * normalises into canonical order (a MISSING sensor is materialised RED — anti-passthrough),
 * computes the gate, and attaches the refusal when red. Twin of selfcert.Certify: same
 * verdicts ⇒ same battery. A diff that breaks an arch boundary or a Pact contract arrives as a
 * red archfit/pact verdict, so green is false and the iteration is blocked before green.
 */
export function certify(verdicts: readonly SensorVerdict[]): Battery {
	const byKind = indexVerdicts(verdicts);
	const ordered: SensorVerdict[] = SENSOR_KINDS.map((k) => {
		const v = byKind.get(k);
		return v ?? { kind: k, state: "red" as const, detail: "sensor not run" };
	});
	const green = gateGreen(ordered);
	const battery: Battery = { sensors: ordered, green };
	if (!green) {
		battery.blockCode = CODE_BUILD_LOOP_SENSOR_RED;
		battery.redSensors = redSensors(ordered);
	}
	return battery;
}

/**
 * toStopSensors — projects a battery onto the red-set mirror → state map (the non-gameable Stop
 * input). Fail-closed: every red-set mirror is green ONLY when the battery is fully green;
 * otherwise every one is red. Twin of selfcert.ToStopSensors.
 */
export function toStopSensors(
	redSet: readonly string[],
	battery: Battery,
): Record<string, SensorState> {
	const state: SensorState = battery.green ? "green" : "red";
	const out: Record<string, SensorState> = {};
	for (const m of redSet) out[m] = state;
	return out;
}
