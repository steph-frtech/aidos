import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";
import type { PilotBlock } from "../../lib/goal-piloting";

/**
 * /goal-piloting live read — the decoders over the Go goal-piloting `goal_pilot_open` +
 * `goal_live_red_set` tool outputs (S66; the S59 cutover, ADR 0092). Kept OUT of actions.ts (a Next
 * "use server" module may only export async functions) so the parity mirror (live.test.ts) can
 * import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `openDecoder` / `redSetDecoder` are the SINGLE
 * runtime declarations of the live `goalpilotingsrv.openOutput` / `redSetOutput` shapes; the front
 * twin's types (ProposeResult / PilotBlock) are filled by them. The parity mirror pins each decoder
 * == the Go tool's contract — the `openOutput` snake_case fields (ok, block{code,severity,
 * explanation,how_to_fix}, goal_id, idea_ref, changeset_ref, changeset_status, status, red_set,
 * actor_identity, actor_display) and the `redSetOutput` ({red_set}) — NOT a second implementation
 * of the goal-piloting logic (the Go goalpiloting.PilotOpenGoal / LiveRedSet — and its TS twin
 * lib/goal-piloting — is authoritative; the Go engine is the SINGLE live source).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo open / red set (source:"demo").
 *
 * THE WALL (CLAUDE.md §2): this only DECODES below-the-line reads — opening a goal PROPOSES a DRAFT
 * ChangeSet (it never APPLIES it), the red-set read is pure; freezing the goal goes
 * idea → mirror → /goal → approval.
 */

/** The successfully-decoded open proposal the panel renders (the DRAFT ChangeSet + the live red set). */
export interface OpenProposal {
	ok: true;
	goalId: string;
	ideaRef: string;
	changeSetRef: string;
	changeSetStatus: string;
	status: string;
	redSet: string[];
	actorIdentity: string;
	actorDisplay: string;
}

/** A refused open — the actionable PilotBlock (code verbatim) the Go actor/open gate returned. */
export interface OpenRefusal {
	ok: false;
	block: PilotBlock;
}

/** The decoded `goal_pilot_open` outcome — a proposal or a refusal (the front discriminated union). */
export type OpenResult = OpenProposal | OpenRefusal;

/** decodeBlock decodes a Go `blockOutput` ({code,severity,explanation,how_to_fix}) → PilotBlock. */
function decodeBlock(raw: unknown): PilotBlock | null {
	if (!isObject(raw)) return null;
	const code = str(raw.code);
	const severity = str(raw.severity);
	const explanation = str(raw.explanation);
	if (code === null || severity === null || explanation === null) return null;
	const howToFix = arr(str)(raw.how_to_fix ?? []) ?? [];
	return { code, severity, explanation, howToFix };
}

/**
 * openDecoder decodes the Go `goal_pilot_open` tool output (goalpilotingsrv.openOutput) into the
 * OpenResult discriminated union. The Go tool always answers a JSON object carrying `ok`:
 *   - ok:false → a refusal: the `block` (PLACEHOLDER_ACTOR / IDEA_WITHOUT_MIRROR / NO_RED_SET) is
 *     decoded verbatim; a missing/malformed block → null (→ demo fallback);
 *   - ok:true  → the proposal: goal_id / changeset_ref / changeset_status (always "DRAFT") / status
 *     ("OPEN") / red_set (the LIVE worklist) / the actor. A missing required field → null.
 * It NEVER coerces a partial value — the wall: the open PROPOSES, it writes nothing.
 */
export const openDecoder: Decoder<OpenResult> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) {
		const block = decodeBlock(raw.block);
		return block === null ? null : { ok: false, block };
	}
	const goalId = str(raw.goal_id);
	const ideaRef = str(raw.idea_ref);
	const changeSetRef = str(raw.changeset_ref);
	const changeSetStatus = str(raw.changeset_status);
	const status = str(raw.status);
	const actorIdentity = str(raw.actor_identity);
	const actorDisplay = str(raw.actor_display);
	const redSet = arr(str)(raw.red_set ?? []);
	if (
		goalId === null ||
		ideaRef === null ||
		changeSetRef === null ||
		changeSetStatus === null ||
		status === null ||
		actorIdentity === null ||
		actorDisplay === null ||
		redSet === null
	) {
		return null;
	}
	return {
		ok: true,
		goalId,
		ideaRef,
		changeSetRef,
		changeSetStatus,
		status,
		redSet,
		actorIdentity,
		actorDisplay,
	};
};

/**
 * redSetDecoder decodes the Go `goal_live_red_set` tool output (redSetOutput: { red_set }) into the
 * stable-sorted worklist. A non-array/missing red_set → null (→ demo fallback). The Go LiveRedSet is
 * authoritative for the sort order; this only reads its VALUE.
 */
export const redSetDecoder: Decoder<string[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(str)(raw.red_set ?? []);
};

/** The decoded `goal_pilot_close` verdict — the NON-GAMEABLE close gate's answer. */
export interface CloseVerdict {
	/** true iff red set→green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster. */
	closeable: boolean;
	/** The GOAL_STILL_RED refusal, present only when not closeable. */
	block?: PilotBlock;
}

/**
 * closeDecoder decodes the Go `goal_pilot_close` tool output (closeOutput: { closeable, block? })
 * into the CloseVerdict. `closeable` is required (a non-boolean → null → demo fallback); the
 * `block` (GOAL_STILL_RED) is decoded verbatim when present, dropped on a closeable verdict. The Go
 * PilotCloseGoal is authoritative — it takes NO agent-confidence input, "done" is computed.
 */
export const closeDecoder: Decoder<CloseVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.closeable !== "boolean") return null;
	if (raw.block === undefined || raw.block === null) {
		return { closeable: raw.closeable };
	}
	const block = decodeBlock(raw.block);
	return block === null
		? { closeable: raw.closeable }
		: { closeable: raw.closeable, block };
};
