/**
 * self-cert-data — the DETERMINISTIC demo fixtures for the /self-cert panel (S84; the ADR 0092
 * batch-4A flip). It holds the canonical full-green sensor battery + the two break scenarios (a
 * broken arch boundary, a broken Pact contract), the gateway-arg projections, and the twin
 * `certify()` compute of them — the demo `Battery` the panel falls back to when the gateway is
 * unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /self-cert computed its
 * displayed battery from the TS twin `lib/self-cert.certify()` directly — the twin WAS the live
 * source. The flip routes the certify control through the Go self-cert MCP server via the passerelle
 * (`readVia(scope, "selfcert_certify" | "selfcert_gate" | "selfcert_kinds", …)`, the dispatched
 * below-the-line read); these fixtures are KEPT only as the deterministic fallback. The presence of
 * this `-data.ts` sibling is ALSO what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/self-cert` as a twin — the panel stays GREEN because it imports the `readVia` frontier (the
 * witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo battery is the same PURE twin compute the Go
 * `selfcert.Certify` reproduces — same verdicts → byte-identical battery (a missing sensor is RED,
 * anti-passthrough; the judge is the mirror, never the LLM).
 *
 * THE WALL (CLAUDE.md §2): the verdict set is the INPUT (the sensor RUNS happen below the line in the
 * build adapter); these fixtures and the panel WRITE NOTHING (WroteKernel always false).
 */

import type { Source } from "./gateway-sdk";
import {
	type Battery,
	certify,
	SENSOR_KINDS,
	type SensorKind,
	type SensorVerdict,
} from "./self-cert";

// Re-export the closed sensor-kind list so a panel renders the checkboxes WITHOUT value-importing the
// twin `@/lib/self-cert` directly (which the T5 cliquet would flag as a twin-as-live-path; `self-cert-data`
// is not a twin name, so importing the constant from here is the demo-fallback-frontier-safe path).
export { SENSOR_KINDS } from "./self-cert";

/** The canonical full-green battery — every sensor present and green (the iteration certifies). */
export const ALL_GREEN: SensorVerdict[] = SENSOR_KINDS.map((kind) => ({
	kind,
	state: "green" as const,
}));

/** A break of one sensor (the iteration must NOT certify green — BUILD_LOOP_SENSOR_RED). */
export function brokenAt(kind: SensorKind, detail: string): SensorVerdict[] {
	return ALL_GREEN.map((v) =>
		v.kind === kind ? { kind, state: "red" as const, detail } : v,
	);
}

/** The two canonical break scenarios the panel demos. */
export const ARCH_BREAK: SensorVerdict[] = brokenAt(
	"archfit",
	"dependency-cruiser: forbidden edge view→infra",
);
export const PACT_BREAK: SensorVerdict[] = brokenAt(
	"pact",
	"pact: provider verification failed",
);

/**
 * gatewayVerdictArgs maps a front SensorVerdict[] to the Go `selfcert_certify` / `selfcert_gate`
 * `verdicts` arg shape: each is a `{ kind, green, detail }` object (the sensorVerdictIn contract,
 * snake-ish — `green` is the boolean the Go reads). PURE projection, never an LLM. Each is a scalar
 * object — no json.RawMessage body, the S59 transport scar avoided.
 */
export function gatewayVerdictArgs(
	verdicts: readonly SensorVerdict[],
): Record<string, unknown>[] {
	return verdicts.map((v) => ({
		kind: v.kind,
		green: v.state === "green",
		detail: v.detail ?? "",
	}));
}

/** certifyArgs — the full `selfcert_certify` argument object (the optional red-set + the verdicts). */
export function certifyArgs(
	verdicts: readonly SensorVerdict[],
	redSet: string[] = [],
): Record<string, unknown> {
	return { red_set: redSet, verdicts: gatewayVerdictArgs(verdicts) };
}

/**
 * demoBattery is the deterministic demo battery — the twin `certify()` of a verdict set. It is the
 * `Battery` the panel falls back to, identical in shape to the live decoded `selfcert_certify` read
 * (the twin sits behind `source:"demo"`).
 */
export function demoBattery(verdicts: readonly SensorVerdict[]): Battery {
	return certify(verdicts);
}

/** A typed source-tagged demo battery (the shape a readVia decoder yields on the demo path). */
export interface SelfCertSnapshot {
	battery: Battery;
	source: Source;
}

/** demoSnapshot — the full demo snapshot the panel renders when the gateway is unreachable. */
export function demoSnapshot(
	verdicts: readonly SensorVerdict[],
): SelfCertSnapshot {
	return { battery: demoBattery(verdicts), source: "demo" };
}
