/**
 * The canonical "add order discount" envelope + the lifecycle rows the /changeset panel renders
 * (AIDOS step S20). These mirror tests/archive/changeset_lifecycle.fixture.md.
 *
 * The agent coins no truth as fact: these are the CANONICAL FIXTURE rows of KRD §98 (the form of a
 * ChangeSet envelope + its lifecycle), used to exercise the state machine. A real project's
 * envelopes are written through the changeset MCP / the commit-gate, never guessed here.
 *
 * THE DONE CRITERIA are visible: apply of the complete envelope → APPLIED with applied_at; apply of
 * a spec-without-mirror envelope → blocked INCOMPLETE_CHANGESET; edit of an APPLIED → blocked
 * APPLIED_IS_IMMUTABLE; revert → a NEW DRAFT inverse, the source stamped REVERTED but still present.
 */

import type { ChangeSet } from "./changeset";

/** The §98 "add order discount" DRAFT — spec_delta + mirror_delta together (atomic). */
export const ADD_ORDER_DISCOUNT: ChangeSet = {
	id: "cs-A",
	label: "add order discount",
	status: "DRAFT",
	parentPhase: "phase-7",
	specDelta: { kind: "add", target: "Order.discount" },
	mirrorDelta: { kind: "add", target: "Order.discount.fixture" },
	reverts: null,
	appliedAt: null,
};

/** A spec-without-mirror envelope — the incomplete (monster) case the gate blocks. */
export const SPEC_WITHOUT_MIRROR: ChangeSet = {
	id: "cs-incomplete",
	label: "add order discount (incomplete)",
	status: "DRAFT",
	parentPhase: "phase-7",
	specDelta: { kind: "add", target: "Order.discount" },
	mirrorDelta: null,
	reverts: null,
	appliedAt: null,
};

/** The deterministic applied_at used for the rendered example (no clock in the pure panel). */
export const EXAMPLE_APPLIED_AT = "2026-05-31T12:00:00Z";

/** The deterministic id of the inverse envelope used for display (server computes the real hash). */
export const INVERSE_ID = "cs-B";
