"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import { readVia, type Source } from "@/lib/gateway-sdk";
import type { PilotBlock } from "@/lib/goal-piloting";
import { DEMO_OPEN_RESULT, DEMO_SPEC_TARGET } from "@/lib/goal-piloting-data";
import { panelScope } from "@/lib/panelScope";
import { closeDecoder, openDecoder } from "./live";

/**
 * Server Actions for the /goal-piloting Workbench panel (S66 — the UI-piloted /goal).
 *
 * THE STEP (ROADMAP-app-builder S66, KRD §56–§59, §63 ①): from a grilled idea, a user PORTEUR
 * D'AUTORITÉ (S63) opens a goal — the engine PROPOSES a DRAFT ChangeSet (Truth + Mirror) and
 * computes the LIVE red set; the panel shows the live red-set worklist; the Stop is NON-GAMEABLE.
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). proposeGoalAction now reads the
 * LIVE proposal from the Go goal-piloting MCP server through the passerelle
 * (readVia(scope, "goal_pilot_open", …), the dispatched below-the-line read); checkCloseAction reads
 * the LIVE non-gameable verdict (readVia(scope, "goal_pilot_close", …)). The TS twin
 * (lib/goal-piloting.pilotOpenGoal / pilotCloseGoal / liveRedSet) is no longer the live source — it
 * is preserved ONLY behind the deterministic demo fallback (source:"live"|"demo"), via the
 * goal-piloting-data fixtures. The readVia frontier import keeps the T5 cliquet
 * (twin-as-live-fitness) GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * THE WALL (CLAUDE.md §2/§7). Opening a goal and stamping it CLOSED are TRUTH writes — the agent DB
 * role is SELECT-only on ideas.goal + changesets. So this screen NEVER writes the Kernel: the
 * goal_pilot_open tool PROPOSES (it returns a DRAFT ChangeSet PROPOSAL + the live red set as VALUES,
 * for human approval); the goal_pilot_close tool is a pure verdict — it never stamps CLOSED. Both are
 * below-the-line reads. "Done" is computed (the non-gameable stop), never declared; no
 * agent-confidence is ever an input.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallback (the same pure values the Go
 * engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo proposal /
 * verdict.
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
	/** Whether the proposal came from the live gateway or the demo fixture. */
	source?: Source;
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
	/** Whether the verdict came from the live gateway or the demo fixture. */
	source?: Source;
}

const BUDGETS = { time_seconds: 600, turns: 20, tokens: 100000 } as const;

/**
 * proposeGoalAction is the action-capable control behind the goal-piloting surface (CLAUDE.md §7
 * ui-completeness): the human gives their actor identity + display, the source idea, whether it
 * carries a mirror, and the LIVE red set (the failing mirrors), then submits — the action runs the
 * LIVE goal_pilot_open tool (the Go actor gate + open) through the passerelle and returns the DRAFT
 * ChangeSet PROPOSAL + the live red set, or the actionable refusal. It WRITES NOTHING (the wall):
 * the proposal awaits human approval via the changeset door. A malformed / unreachable answer falls
 * back to the demo proposal (source:"demo").
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
		String(formData.get("specTarget") ?? "").trim() || DEMO_SPEC_TARGET;
	// The LIVE red set — the failing mirrors, one per line in a textarea; blanks dropped.
	const redSet = String(formData.get("redSet") ?? "")
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");

	if (!ideaId) return { ok: false, messageKey: "ideaEmpty" };

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;
	const scope = await panelScope();

	// LIVE read through the passerelle (the dispatched goal-piloting `goal_pilot_open` tool); the
	// demo proposal is the deterministic fallback (source:"live"|"demo") — ADR 0092. The args are a
	// plain object (no json.RawMessage) so the HTTP input schema accepts them (the S59 scar guard).
	const { data, source } = await readVia(
		scope,
		"goal_pilot_open",
		{
			actor_identity: actorIdentity,
			actor_display: actorDisplay,
			idea_id: ideaId,
			spec_delta: { kind: "add", target: specTarget },
			...(hasMirror
				? { mirror_delta: { kind: "add", target: `${specTarget}.fixture` } }
				: {}),
			parent_phase: "phase-0",
			red_set: redSet,
			time_seconds: BUDGETS.time_seconds,
			turns: BUDGETS.turns,
			tokens: BUDGETS.tokens,
		},
		openDecoder,
		DEMO_OPEN_RESULT,
	);

	if (!data.ok) {
		return {
			ok: false,
			messageKey: "openRefused",
			block: data.block,
			projectId,
			source,
		};
	}

	return {
		ok: true,
		messageKey: "proposeOk",
		goalId: data.goalId,
		changeSetRef: data.changeSetRef,
		changeSetStatus: data.changeSetStatus,
		redSet: data.redSet,
		projectId,
		actorDisplay: data.actorDisplay,
		source,
	};
}

/**
 * checkCloseAction is the live non-gameable Stop control: the human sets the live verdicts (red set
 * green or not, prior green intact or broken, the mutation score + its declared floor, monsters) and
 * the action runs the LIVE goal_pilot_close tool (the four-condition stop) through the passerelle,
 * returning whether the goal is closeable AND the four computed conditions — never on the agent's
 * say-so. It NEVER stamps CLOSED (the wall): closing is the aidos CLI role via S20's gate. A
 * malformed / unreachable answer falls back to the demo verdict (source:"demo").
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
	const mutationRaw = Number(formData.get("mutation") ?? "0");
	const mutationFloorRaw = Number(formData.get("mutationFloor") ?? "0.8");
	const mutation = Number.isFinite(mutationRaw) ? mutationRaw : 0;
	const mutationFloor = Number.isFinite(mutationFloorRaw)
		? mutationFloorRaw
		: 0.8;
	const hasMonster = String(formData.get("hasMonster") ?? "") === "on";

	// The live sensor verdicts (one per red-set mirror) the Go close gate reads.
	const sensors = redSet.map((mirror) => ({
		mirror,
		state: redGreen ? "green" : "red",
	}));

	const scope = await panelScope();

	// The deterministic demo verdict: replays the four-condition stop locally for the fallback only
	// (never the live path) — closeable IFF all four hold, exactly as the Go gate computes it.
	const allRedGreen = redSet.length > 0 && redGreen;
	const demoCloseable =
		allRedGreen && priorIntact && mutation >= mutationFloor && !hasMonster;

	// LIVE read through the passerelle (the dispatched goal-piloting `goal_pilot_close` tool) — the
	// NON-GAMEABLE stop computed by the Go engine. ADR 0092.
	const { data, source } = await readVia(
		scope,
		"goal_pilot_close",
		{
			red_set: redSet,
			sensors,
			prior_green: priorIntact ? "intact" : "broken",
			mutation,
			mutation_floor: mutationFloor,
			monsters: hasMonster ? ["monster"] : [],
		},
		closeDecoder,
		{ closeable: demoCloseable },
	);

	return {
		ok: true,
		closeable: data.closeable,
		block: data.block,
		// The four conditions echo the human's live inputs (presentation, not a twin verdict).
		conditions: {
			redSetGreen: allRedGreen,
			priorGreenIntact: priorIntact,
			mutationOk: mutation >= mutationFloor,
			noMonster: !hasMonster,
		},
		source,
	};
}
