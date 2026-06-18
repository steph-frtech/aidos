/**
 * mirror-watch-data — the DETERMINISTIC demo fixture + gateway-arg projection for the
 * /mirror-watch panel (S69; the ADR 0092 PHASE-4 flip). It holds the `watch_run` argument
 * projection (the materialized mirror + the code-presence probe) and the twin compute of the
 * run stream — the demo value the panel falls back to when the gateway is unreachable
 * (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /mirror-watch
 * computed its displayed run stream from the TS twin `lib/mirror-watch.runStream()` directly —
 * the twin WAS the live source. The flip routes the RUN through the Go mirror-watch MCP server
 * via the passerelle (`readVia(scope, "watch_run", …)`, the dispatched below-the-line read);
 * the twin compute is KEPT only as the deterministic fallback. The presence of this
 * `-data.ts` sibling is ALSO what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/mirror-watch` as a twin — the panel stays GREEN because `actions.ts` imports the
 * `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * watch_materialize is NOT flipped (no Go dispatch): its input (shapeeditor.Proposal) embeds a
 * changeset.ChangeSet whose Delta.Body is a json.RawMessage (the S59 byte-array scar), so it is
 * DELIBERATELY NOT dispatched (route(watch_materialize) → unknown_tool). The panel keeps that
 * voie propre via the twin `materialize` — the arch-fitness `propose` precedent. Only the RUN
 * (watch_run, a scalar-object input) flips to the live engine.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the gateway-arg projection + the demo run are the same
 * PURE twin the Go `watch.RunStream` reproduces — same (materialized, code-presence) ⇒
 * byte-identical stream (absent ⇒ RED, present ⇒ GREEN). THE WALL (CLAUDE.md §2): every compute
 * writes nothing — running only READS the authored, above-the-line mirror.
 */

import {
	type MaterializedMirror,
	type RunResult,
	runStream,
} from "./mirror-watch";

/**
 * runArgs — the `watch_run` argument object (the materialized mirror + the code-presence
 * probe), projected to the Go runInput contract (`{ materialized, code_present }`). The Go
 * `watch.MaterializedMirror` carries NO json tags, so its fields marshal with Go's
 * PascalCase names — we send them as the Go side expects to decode them.
 */
export function runArgs(
	m: MaterializedMirror,
	codePresent: boolean,
): Record<string, unknown> {
	return {
		materialized: {
			MirrorID: m.mirrorId,
			ProjectID: m.projectId,
			Reflects: m.reflects,
			TargetRunner: m.targetRunner,
			Shape: m.shape,
			MaterializedSource: m.materializedSource,
		},
		code_present: codePresent,
	};
}

/**
 * demoRun — the deterministic demo run stream the panel falls back to when the gateway is
 * unreachable / undispatched / refused. It is the SAME pure twin compute the Go `watch.RunStream`
 * reproduces (absent code ⇒ RED, a stub ⇒ GREEN), so the displayed verdict is identical whether
 * the source is "live" or "demo".
 */
export function demoRun(
	m: MaterializedMirror,
	codePresent: boolean,
): RunResult {
	return runStream(m, codePresent);
}
