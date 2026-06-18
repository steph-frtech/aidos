// The pure form-option + demo-entity CONSTANTS the panel renders (cardinalities, semantics, demo
// entity names). Re-exported from the twin through the -data fixture so the panel imports them via
// the demo frontier (the cliquet's twin-as-live rule), never the twin namespace directly.
export { CARDINALITIES, DEMO_ENTITIES, SEMANTICS } from "./entity-relation";

/**
 * entity-relation-data — the DETERMINISTIC demo fixtures for the /entity-relation panel (S59
 * cutover, ADR 0092). It holds the gateway-arg projection of a relation node and the demo
 * verdicts the panel falls back to when the gateway is unreachable / undispatched / refused
 * (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /entity-relation
 * computed the relation's resolution + content address from the PURE TS twin (lib/entity-relation
 * `address`) as its live answer. The cutover routes BOTH reads through the Go engine via the
 * passerelle (`readVia(scope, "relation_resolve", …)` then `readVia(scope, "relation_address", …)`,
 * the dispatched below-the-line reads of the entity-relation MCP server): the resolution verdict
 * (UNKNOWN_RELATION_TARGET, the S71 honesty core) and the content-addressed round-trip (id + body)
 * are read LIVE. These fixtures are KEPT only as the deterministic fallback, and they are DERIVED
 * from the same PURE twin (lib/entity-relation) so the demo is byte-identical to what the Go engine
 * reproduces (same relation + declared set → same verdict, same id, same body). The presence of
 * this `-data.ts` sibling is also what keeps the T5 cliquet (twin-as-live-fitness) GREEN — it
 * RECOGNISES lib/entity-relation as a twin sitting behind `source:"demo"`, witnessed by the
 * `readVia` frontier import in actions.ts.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdicts are the SAME shape the Go
 * entityrelationsrv resolveOutput / addressOutput reproduce — no clock, no rng, no LLM. The parity
 * mirror app/entity-relation/live.test.ts pins the decoders == the Go tools' CONTRACT.
 *
 * THE WALL (CLAUDE.md §2): both reads are BELOW the line — they return the relation's resolution +
 * content address as VALUES; a relation is a SOURCE above the line, a truth-write goes via
 * propose → ChangeSet → approval, never from this screen.
 */

import type {
	AddressVerdict,
	ResolveVerdict,
} from "../app/entity-relation/live";
import {
	address,
	type Cardinality,
	isBlocked,
	type Relation,
	relationBody,
	resolve,
	type Semantic,
} from "./entity-relation";

/** The gateway args for a `relation_resolve` call — the relation node + the declared entity cut. */
export function gatewayResolveArgs(
	relation: Relation,
	known: readonly string[],
): Record<string, unknown> {
	return { relation, known: [...known] };
}

/** The gateway args for a `relation_address` call — the (shape-valid) relation node to address. */
export function gatewayAddressArgs(
	relation: Relation,
): Record<string, unknown> {
	return { relation };
}

/**
 * demoResolve reproduces the Go `relation_resolve` verdict from the PURE twin: a target outside the
 * declared set (or an out-of-set kind) yields the UNKNOWN_RELATION_TARGET / UNKNOWN_RELATION_KIND
 * block; a resolvable relation yields ok. The block's `code` mirrors the Go blockreason
 * (OUT_OF_SCOPE), with the specific UNKNOWN_RELATION_* surfaced in the explanation (as the screen reads it).
 */
export function demoResolve(
	relation: Relation,
	known: readonly string[],
): ResolveVerdict {
	const cause = resolve(relation, known);
	if (cause === null) return { ok: true, block: null };
	// the twin's address() returns the canonical BlockReason on a refusal — reuse its shape.
	const out = address(relation, known);
	if (isBlocked(out)) {
		return {
			ok: false,
			block: {
				code: out.code,
				severity: out.severity,
				explanation: out.explanation,
				how_to_fix: [...out.how_to_fix],
			},
		};
	}
	// unreachable (resolve failed ⇒ address blocks), but stay total.
	return { ok: true, block: null };
}

/**
 * demoAddress reproduces the Go `relation_address` round-trip from the PURE twin: a shape-valid
 * relation yields its content address (id = relationId) + canonical body; a malformed shape yields
 * the block. Note relation_address validates SHAPE only (it does NOT resolve the target) — exactly
 * like the Go addressOutput.
 */
export function demoAddress(relation: Relation): AddressVerdict {
	// address() over an empty known-set resolves shape first; if the target were the only failure
	// the round-trip still needs the resolution gate (done by demoResolve), so here we address with
	// the relation's own target treated as declared to mirror relation_address's shape-only check.
	const out = address(relation, [relation.target]);
	if (isBlocked(out)) {
		return {
			ok: false,
			id: "",
			body: "",
			block: {
				code: out.code,
				severity: out.severity,
				explanation: out.explanation,
				how_to_fix: [...out.how_to_fix],
			},
		};
	}
	return { ok: true, id: out, body: relationBody(relation), block: null };
}

// Re-export the closed sets so the panel imports them from one demo door if it chooses.
export type { Cardinality, Relation, Semantic };
