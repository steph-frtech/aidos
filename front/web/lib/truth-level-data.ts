/**
 * truth-level-data — the DETERMINISTIC demo fixtures + gateway-arg projections for the
 * /truth-level panel (FK01; S59 cutover, ADR 0092). It holds the gateway-arg projection of a
 * record's signals and the demo verdicts the panel falls back to when the gateway is unreachable
 * / undispatched / refused (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /truth-level
 * computed each record's level + parity from the PURE TS twin (lib/truth-level `compute` /
 * `checkParity`) as its live answer. The cutover routes the reads through the Go engine via the
 * passerelle (`readVia(scope, "compute", …)` then `readVia(scope, "check_parity", …)`, and
 * `readVia(scope, "levels", …)` for the reference ladder — the dispatched below-the-line reads of
 * the truth-level MCP server). These fixtures are KEPT only as the deterministic fallback, and
 * they are DERIVED from the same PURE twin (lib/truth-level) so the demo is byte-identical to what
 * the Go engine reproduces (same signals → same rung, same name; same stored rung → same parity).
 * The presence of this `-data.ts` sibling + the `readVia` frontier import in actions.ts is what
 * keeps the T5 cliquet (twin-as-live-fitness) GREEN — it RECOGNISES lib/truth-level as a twin
 * sitting behind `source:"demo"`.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdicts are the SAME shape the Go truthlevelsrv
 * computeOutput / parityOutput / levelsOutput reproduce — no clock, no rng, no LLM. The parity
 * mirror app/truth-level/live.test.ts pins the decoders == the Go tools' CONTRACT.
 *
 * THE WALL (CLAUDE.md §2): all reads are BELOW the line — they return a computed level, a parity
 * verdict and the rung ladder as VALUES; the level is set on a record by the privileged transition
 * at the legal door, never from this screen.
 */

import type {
	ComputeVerdict,
	LevelRow,
	ParityVerdict,
} from "../app/truth-level/live";
import { checkParity, compute, LEVELS, type Signals } from "./truth-level";

export type { DemoRecord, LevelName, Signals } from "./truth-level";
// Re-export the closed sets + demo catalogue so the panel imports them from one demo door.
export { DEMO_RECORDS, LEVELS } from "./truth-level";

/** The gateway args for a `compute` call — the record's FKE-5 provenance signals. */
export function gatewayComputeArgs(signals: Signals): Record<string, unknown> {
	return { signals };
}

/** The gateway args for a `check_parity` call — the stored rung + the signals to recompute from. */
export function gatewayParityArgs(
	stored: number,
	signals: Signals,
): Record<string, unknown> {
	return { stored, signals };
}

/** The gateway args for a `levels` call — none (the reference table is parameterless). */
export function gatewayLevelsArgs(): Record<string, unknown> {
	return {};
}

/**
 * demoCompute reproduces the Go `compute` verdict from the PURE twin: the highest satisfied rung
 * for the given signals + its canonical name. The SAME shape truthlevelsrv.computeOutput
 * ({ ok, level, name }) reproduces. PURE.
 */
export function demoCompute(signals: Signals): ComputeVerdict {
	const lvl = compute(signals);
	return { ok: true, level: lvl.rung, name: lvl.name };
}

/**
 * demoParity reproduces the Go `check_parity` verdict from the PURE twin: recompute the level from
 * the signals and compare to the stored rung. The SAME shape truthlevelsrv.parityOutput
 * ({ ok, aligned, stored, computed }) reproduces. PURE.
 */
export function demoParity(stored: number, signals: Signals): ParityVerdict {
	const res = checkParity(stored, signals);
	return {
		ok: true,
		aligned: res.aligned,
		stored: res.stored.rung,
		computed: res.computed.rung,
	};
}

/**
 * demoLevels reproduces the Go `levels` reference table from the PURE twin: the seven canonical
 * FKE-5 rungs in Raw→Reconciled order. The SAME shape truthlevelsrv.levelsOutput rows
 * ({ level, name }) reproduce. PURE.
 */
export function demoLevels(): LevelRow[] {
	return LEVELS.map((l) => ({ level: l.rung, name: l.name }));
}
