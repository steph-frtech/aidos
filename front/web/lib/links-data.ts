/**
 * The canonical six-link example graph + the current heads for the /link-graph panel
 * (AIDOS step S17).
 *
 * The edges reuse the layer refs pinned by prior steps — createOrder (S10 operation),
 * checkout-submit (S11 action), checkout-button (S11 control) — and exercise all SIX KRD §41
 * link kinds. The agent coins no new target, no new kind. The page runs the PURE resolve
 * (lib/links.ts, the projection of back/kernel/links) over each edge against `heads`, so each
 * edge colour is computed, never declared.
 *
 * THE DONE CRITERION is visible here: the `binds` edge checkout-submit → createOrder@v3 is
 * GREEN under the head-pinned heads (createOrder head = v3) and ABSENT (red) under the
 * absent-target heads (createOrder removed) — a link to an absent version is red.
 *
 * No truth is invented as fact: these are CANDIDATE link rows (the form of a link, no freeze)
 * used to exercise the staleness check — the wall is untouched.
 */

import type { Heads, Link } from "./links";

/** The six-link example graph — one edge per KRD §41 kind, every `to` pinned id@version. */
export const EXAMPLE_LINKS: readonly Link[] = [
	{
		kind: "binds",
		from: { id: "checkout-submit", version: "v1" },
		to: { id: "createOrder", version: "v3" },
	},
	{
		kind: "triggers",
		from: { id: "checkout-button", version: "v1" },
		to: { id: "checkout-submit", version: "v1" },
	},
	{
		kind: "mirrors",
		from: { id: "createOrder-fixture", version: "v1" },
		to: { id: "createOrder", version: "v3" },
	},
	{
		kind: "projects_to",
		from: { id: "order-entity", version: "v2" },
		to: { id: "order-ddl", version: "v2" },
	},
	{
		kind: "derives_from",
		from: { id: "createOrder", version: "v3" },
		to: { id: "order-entity", version: "v2" },
	},
	{
		kind: "contracts_with",
		from: { id: "checkout-cell", version: "v1" },
		to: { id: "payments-cell", version: "v4" },
	},
] as const;

/**
 * The HEAD-PINNED heads: every target's head matches its pinned version, so every edge
 * resolves GREEN — including the binds edge checkout-submit → createOrder@v3.
 */
export const HEADS_ALL_GREEN: Heads = {
	createOrder: "v3",
	"checkout-submit": "v1",
	"order-entity": "v2",
	"order-ddl": "v2",
	"payments-cell": "v4",
};

/**
 * The ABSENT-TARGET heads: createOrder is REMOVED (no head at all) — so the binds edge
 * checkout-submit → createOrder@v3 resolves ABSENT (red). THE done criterion, rendered. (The
 * mirrors edge → createOrder@v3 also goes absent; derives_from → order-entity@v2 stays green.)
 */
export const HEADS_ABSENT_TARGET: Heads = {
	"checkout-submit": "v1",
	"order-entity": "v2",
	"order-ddl": "v2",
	"payments-cell": "v4",
};
