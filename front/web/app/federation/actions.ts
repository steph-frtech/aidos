"use server";

import {
	affectedCells,
	type CellRedWave,
	type CellViolation,
	DEMO_CONTRACTS,
	DEMO_PARTICIPANTS,
	DEMO_POLICY_CELLS,
	DEMO_VIOLATIONS,
	fanOut,
	type SagaRun,
	sagaOverCells,
} from "@/lib/federation";

/**
 * Server Actions for the /federation Workbench panel (S103 — composition des invariants de
 * fédération + changement transverse, §51).
 *
 * THE STEP (ROADMAP-app-builder S103): wire S48 GlobalInvariant / S49 SagaInvariant / S50
 * TemporalInvariant onto REAL multiple cells (S100); a saga holds on two real cells and
 * breaking a leg triggers compensation; a GLOBAL policy expressed ONCE fans out to a
 * RedWorkQueue PER CELL, the cells not affected staying GREEN.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it COMPOSES the prior steps' pure
 * functions and returns the result as VALUES. The composition is PURE (lib/federation), never
 * an LLM; the per-cell RedWorkQueue rows are a projection (the S22 hook does the INSERT below
 * the waterline), never a kernel write.
 */

export interface SagaView {
	ok: boolean;
	/** whether the user broke a leg (the order leg failed: no order_confirmed). */
	brokenLeg: boolean;
	run?: SagaRun;
}

/**
 * runSagaAction is the action-capable control behind the saga surface (CLAUDE.md §7
 * ui-completeness): the user runs the canonical saga over the two REAL cells order + payment,
 * optionally BREAKING a leg. The happy path is satisfied; a broken leg triggers the declared
 * compensation, after which the saga is satisfied VIA compensation. WRITES NOTHING (the wall).
 */
export async function runSagaAction(
	_prev: SagaView,
	formData: FormData,
): Promise<SagaView> {
	const brokenLeg = formData.get("brokenLeg") === "on";
	const trace = brokenLeg
		? ["payment_captured"]
		: ["payment_captured", "order_confirmed"];
	const run = sagaOverCells(DEMO_PARTICIPANTS, DEMO_CONTRACTS, trace);
	return { ok: true, brokenLeg, run };
}

export interface FanOutView {
	ok: boolean;
	waves?: CellRedWave[];
	affected?: string[];
}

/**
 * fanOutAction is the action-capable control behind the global-policy surface (§51): the user
 * fires a GLOBAL policy change ("tout PII oubliable") expressed ONCE over the federation; it
 * fans out to a RedWorkQueue PER CELL — order + payment (which violate the policy) each get
 * their own queue; shipping (which does NOT violate) stays GREEN. WRITES NOTHING (the wall;
 * the S22 hook does the INSERT below the waterline).
 */
export async function fanOutAction(
	_prev: FanOutView,
	_formData: FormData,
): Promise<FanOutView> {
	const violations: CellViolation[] = DEMO_VIOLATIONS;
	const waves = fanOut(DEMO_POLICY_CELLS, "policy-bump-abc123", violations);
	return { ok: true, waves, affected: affectedCells(waves) };
}
