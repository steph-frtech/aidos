/**
 * grilling-loop-data — the DETERMINISTIC demo fixtures + gateway-arg projection for the /grilling-loop
 * panel (S65; the ADR 0092 batch-4B flip). It holds the gateway-arg shape for the dispatched READ tool
 * (grill_route) and the twin compute of it — the demo VerdictRecord the panel falls back to when the
 * gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /grilling-loop computed the
 * routed VerdictRecord from the TS twin `lib/grilling-loop.route` directly — the twin WAS the live source
 * (then persisted the routed `ideas` row). The flip routes that computation through the Go grilling-loop
 * MCP server via the passerelle (`readVia(scope, "grill_route", …)`, the dispatched below-the-line read);
 * the twin compute is KEPT only as the deterministic fallback. The persistence of the routed `ideas` row
 * stays the below-the-line write the action already does (the canonical door is idea-intake — the
 * recorded OpenQuestion). The presence of this `-data.ts` sibling is ALSO what makes the T5 cliquet
 * RECOGNISE `lib/grilling-loop` as a twin — the panel stays GREEN because its actions.ts imports the
 * `readVia` frontier.
 *
 * grill_verify_verdict / grill_verdicts also dispatch (all three grilling-loop tools are pure reads with
 * scalar I/O — no RawMessage), but the panel's authoritative verdict gate is the twin knownVerdict pre-
 * flight; the live grill_route already re-validates server-side.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo compute is the same PURE twin the Go grillingloop.Route
 * reproduces — same (proposes, intention, verdict) → byte-identical routed idea (the content-address id +
 * the routed lane). THE WALL (CLAUDE.md §2): the routed idea is a CANDIDATE-truth (no version, no mirror);
 * promotion is the /goal flow, never a write from this screen.
 */

import type { Proposes } from "./capture-idea";
import type { GrillVerdict } from "./exploration";
import { type Intention, route, type VerdictRecord } from "./grilling-loop";

/** routeArgs — the `grill_route` argument object (proposes + intent + scenarios + verdict + detail + reason). */
export function routeArgs(
	proposes: Proposes,
	intention: Intention,
	verdict: GrillVerdict,
	detail: string,
	reason: string,
): Record<string, unknown> {
	return {
		proposes,
		intent: intention.intent,
		scenarios: intention.scenarios,
		verdict,
		detail,
		reason,
	};
}

/** demoRoute — the twin `route()` of an intention (the routed VerdictRecord the panel falls back to). */
export function demoRoute(
	proposes: Proposes,
	intention: Intention,
	verdict: GrillVerdict,
	detail: string,
	reason: string,
): VerdictRecord {
	return route(proposes, intention, verdict, detail, reason);
}
