"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	type Budgets,
	canClose,
	type PilotBlock,
	pilotCloseGoal,
	pilotOpenGoal,
	type StopInput,
} from "@/lib/goal-piloting";

/**
 * Server Actions for the /goal-piloting Workbench panel (S66 — the UI-piloted /goal).
 *
 * THE STEP (ROADMAP-app-builder S66, KRD §56–§59, §63 ①): from a grilled idea, a user PORTEUR
 * D'AUTORITÉ (S63) opens a goal — the engine PROPOSES a DRAFT ChangeSet (Truth + Mirror) and
 * computes the LIVE red set; the panel shows the live red-set worklist; the Stop is NON-GAMEABLE.
 * The routing/close logic is DETERMINISTIC and AUTHORITATIVE (the pure twin lib/goal-piloting,
 * byte-identical to back/runtime/goalpiloting, reusing the S29 close gate + the S63 actor gate).
 *
 * THE WALL (CLAUDE.md §2/§7). Opening a goal and stamping it CLOSED are TRUTH writes — the agent
 * DB role is SELECT-only on ideas.goal + changesets (the migrations grant it nothing more). So this
 * screen NEVER writes the Kernel: the open action is a PROPOSE — it computes the DRAFT ChangeSet
 * PROPOSAL + the live red set as VALUES, for human approval; persistence rides the changeset door
 * (S20) + the approval gate (S85), the aidos CLI writer role. The close action is a pure verdict —
 * it never stamps CLOSED. "Done" is computed (the non-gameable stop), never declared.
 *
 * FORWARD-DEPENDENCY (documented OpenQuestion, ROADMAP note 3). S63 (authoritybinding) is built, so
 * the actor is REAL (an identity + display, refused if placeholder/agent). The full AuthorityGraph
 * scope-domain approval lands at S85's approval gate; until then S66 enforces the FIRST actor gate
 * (a real human, never nobody) and PROPOSES the ChangeSet — it never persists the goal. This does
 * NOT block the step (by-design forward-dependency).
 */

export interface ProposeResult {
	ok: boolean;
	/** i18n key under "goalPiloting.messages" describing the outcome. */
	messageKey: string;
	/** The actionable refusal, when the open was refused (its code surfaced verbatim). */
	block?: PilotBlock;
	/** The proposed goal id (content-address anchored to the idea). */
	goalId?: string;
	/** The proposed DRAFT ChangeSet ref. */
	changeSetRef?: string;
	/** The DRAFT status — always "DRAFT" on success (a proposal, never applied). */
	changeSetStatus?: string;
	/** The LIVE red-set worklist the panel renders. */
	redSet?: string[];
	/** The active project the proposal is scoped to. */
	projectId?: string;
	/** The acting human the proposal is attributed to. */
	actorDisplay?: string;
}

export interface CloseResult {
	ok: boolean;
	/** Whether the four-condition non-gameable stop holds. */
	closeable: boolean;
	/** The GOAL_STILL_RED refusal when not closeable. */
	block?: PilotBlock;
	/** The four conditions, individually, for the live indicator. */
	conditions?: {
		redSetGreen: boolean;
		priorGreenIntact: boolean;
		mutationOk: boolean;
		noMonster: boolean;
	};
}

const BUDGETS: Budgets = { timeSeconds: 600, turns: 20, tokens: 100000 };

/**
 * proposeGoalAction is the action-capable control behind the goal-piloting surface (CLAUDE.md §7
 * ui-completeness): the human gives their actor identity + display, the source idea, whether it
 * carries a mirror, and the LIVE red set (the failing mirrors), then submits — the action runs the
 * actor gate + the open through the pure twin and returns the DRAFT ChangeSet PROPOSAL + the live
 * red set. It WRITES NOTHING (the wall): the proposal awaits human approval via the changeset door.
 */
export async function proposeGoalAction(
	_prev: ProposeResult,
	formData: FormData,
): Promise<ProposeResult> {
	const actorIdentity = String(formData.get("actorIdentity") ?? "").trim();
	const actorDisplay = String(formData.get("actorDisplay") ?? "").trim();
	const ideaId = String(formData.get("ideaId") ?? "").trim();
	const hasMirror = String(formData.get("hasMirror") ?? "") === "on";
	const specTarget =
		String(formData.get("specTarget") ?? "").trim() || "Order.discount";
	// The LIVE red set — the failing mirrors, one per line in a textarea; blanks dropped.
	const redSet = String(formData.get("redSet") ?? "")
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");

	if (!ideaId) return { ok: false, messageKey: "ideaEmpty" };

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;

	const { result, block } = pilotOpenGoal(
		{ identity: actorIdentity, display: actorDisplay },
		{
			ideaId,
			specDelta: { kind: "add", target: specTarget },
			mirrorDelta: hasMirror
				? { kind: "add", target: `${specTarget}.fixture` }
				: undefined,
			parentPhase: "phase-0",
			redSet,
			budgets: BUDGETS,
		},
	);

	if (block !== null || result === null) {
		return {
			ok: false,
			messageKey: "openRefused",
			block: block ?? undefined,
			projectId,
		};
	}

	return {
		ok: true,
		messageKey: "proposeOk",
		goalId: result.goal.id,
		changeSetRef: result.goal.changeSetRef,
		changeSetStatus: result.goal.changeSetStatus,
		redSet: result.goal.redSet,
		projectId,
		actorDisplay: result.actor.display,
	};
}

/**
 * checkCloseAction is the live non-gameable Stop control: the human sets the live verdicts (red set
 * green or not, prior green intact or broken, the mutation score + its declared floor, monsters) and
 * the action returns whether the goal is closeable AND the four computed conditions — never on the
 * agent's say-so. It NEVER stamps CLOSED (the wall): closing is the aidos CLI role via S20's gate.
 */
export async function checkCloseAction(
	_prev: CloseResult,
	formData: FormData,
): Promise<CloseResult> {
	const redSet = String(formData.get("redSet") ?? "")
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");
	const redGreen = String(formData.get("redGreen") ?? "") === "on";
	const priorIntact = String(formData.get("priorIntact") ?? "") === "on";
	const mutation = Number(formData.get("mutation") ?? "0");
	const mutationFloor = Number(formData.get("mutationFloor") ?? "0.8");
	const hasMonster = String(formData.get("hasMonster") ?? "") === "on";

	const sensors: Record<string, "green" | "red"> = {};
	for (const m of redSet) sensors[m] = redGreen ? "green" : "red";

	const input: StopInput = {
		sensors,
		priorGreen: priorIntact ? "intact" : "broken",
		mutation: Number.isFinite(mutation) ? mutation : 0,
		mutationFloor: Number.isFinite(mutationFloor) ? mutationFloor : 0.8,
		monsters: hasMonster ? ["monster"] : [],
	};

	const block = pilotCloseGoal(redSet, input);
	const closeable = canClose(redSet, input);
	return {
		ok: true,
		closeable,
		block: block ?? undefined,
		conditions: {
			redSetGreen:
				redSet.length > 0 && redSet.every((m) => sensors[m] === "green"),
			priorGreenIntact: input.priorGreen === "intact",
			mutationOk: input.mutation >= input.mutationFloor,
			noMonster: input.monsters.length === 0,
		},
	};
}
