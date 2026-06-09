"use server";

import {
	type CharacterizationMirror,
	carve,
	DEMO_DRIFTING,
	DEMO_LEGACY,
	DEMO_PRESERVING,
	freeze,
	type RefactorObservation,
	type RefactorVerdict,
	refactor,
	type StranglerCell,
} from "@/lib/strangler";

/**
 * Server Actions for the /strangler Workbench panel (S104 — absorption de legacy par
 * strangler-fig, §50).
 *
 * THE STEP (ROADMAP-app-builder S104): carve a cell around the legacy, FREEZE its current
 * behaviour with auto-generated CHARACTERIZATION mirrors, publish its contract, then let the
 * build-loop refactor INSIDE the frozen cell — the characterization mirrors stay GREEN across
 * an internal refactor and the published contract is honored.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it runs the PURE twin lib/strangler
 * and returns the result as VALUES. Characterization-mirror generation is DETERMINISTIC code,
 * never an LLM; the StranglerCell + its mirrors persist via ChangeSet (the mirrors schema is
 * above the line), never a kernel write from the screen.
 */

export interface CarveView {
	ok: boolean;
	cell?: StranglerCell;
	mirrors?: CharacterizationMirror[];
	error?: string;
}

/**
 * startStranglerAction is the action-capable control behind "démarrer une cellule strangler"
 * (the done-criterion's UI half, CLAUDE.md §7 ui-completeness): the user CARVES a cell around
 * the legacy and FREEZES its current behaviour into characterization mirrors — the green net a
 * later refactor must keep green. WRITES NOTHING (the wall).
 */
export async function startStranglerAction(
	_prev: CarveView,
	_formData: FormData,
): Promise<CarveView> {
	const { cell, error } = carve(DEMO_LEGACY);
	if (error || !cell) return { ok: false, error: error ?? "carve failed" };
	const mirrors = freeze(cell);
	return { ok: true, cell, mirrors };
}

export interface RefactorView {
	ok: boolean;
	/** whether the user broke observable behaviour (a characterization drift). */
	brokeBehaviour: boolean;
	/** whether the user broke the published contract. */
	brokeContract: boolean;
	verdict?: RefactorVerdict;
}

/**
 * runRefactorAction is the action-capable control behind the refactor surface (§50): the user
 * runs the build-loop's refactor inside the frozen cell, optionally BREAKING observable
 * behaviour (a characterization drift) and/or BREAKING the published contract. A
 * behaviour-preserving, contract-honoring refactor is ACCEPTED; a drift is refused
 * (STRANGLER_CHARACTERIZATION_DRIFT); a broken contract is refused
 * (STRANGLER_PUBLISHED_CONTRACT_BROKEN). WRITES NOTHING (the wall).
 */
export async function runRefactorAction(
	_prev: RefactorView,
	formData: FormData,
): Promise<RefactorView> {
	const brokeBehaviour = formData.get("brokeBehaviour") === "on";
	const brokeContract = formData.get("brokeContract") === "on";

	const { cell } = carve(DEMO_LEGACY);
	if (!cell) return { ok: false, brokeBehaviour, brokeContract };
	const mirrors = freeze(cell);

	const base = brokeBehaviour ? DEMO_DRIFTING : DEMO_PRESERVING;
	const obs: RefactorObservation = { ...base, contractHonored: !brokeContract };

	const verdict = refactor(cell, mirrors, obs);
	return { ok: true, brokeBehaviour, brokeContract, verdict };
}
