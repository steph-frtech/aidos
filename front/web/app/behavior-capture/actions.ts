"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	attachBehaviorAtCapture,
	type Expansion,
	type Kind,
	library,
	proposalPieceCount,
	proposalPreview,
} from "@/lib/behavior-capture";

/**
 * Server Actions for the /behavior-capture Workbench panel (S67 — attach a behavior at capture).
 *
 * THE STEP (ROADMAP-app-builder S67, KRD §24.6): at idea-capture the reusable behaviours library
 * (S79) is surfaced; attaching one DRY-RUN-EXPANDS it as a DRAFT ChangeSet PROPOSAL via the ONE
 * authoritative `expand` (the TS twin of S76's behavior.Expand) — never a second implementation.
 * The expansion the screen shows is BYTE-IDENTICAL to S76's (the expansionId matches the Go content
 * address, pinned by lib/behavior.test.ts). The expansion is a PURE FUNCTION, never an LLM.
 *
 * THE WALL (CLAUDE.md §2/§7). The attach WRITES NOTHING — it returns the dry-run expansion + a DRAFT
 * ChangeSet PROPOSAL as VALUES. Freezing the expanded source into the kernel goes through the wall
 * (idée → miroir → /goal → approbation humaine), via the changeset door (S20) under approval; the
 * agent DB role can never write the kernel/mirrors. The screen PROPOSES, it never writes the Kernel.
 */

export interface AttachResultView {
	ok: boolean;
	/** i18n key under "behaviorCapture.messages". */
	messageKey: string;
	/** The actionable refusal message (verbatim), when refused. */
	error?: string;
	ideaRef?: string;
	behavior?: string;
	entity?: string;
	expansionId?: string;
	changeSetRef?: string;
	changeSetStatus?: string;
	pieceCount?: number;
	preview?: string[];
	expansion?: Expansion;
	projectId?: string;
}

/** surfacedLibrary is the read control — the reusable behaviours library surfaced at capture. */
export async function surfacedLibrary(): Promise<Kind[]> {
	return library();
}

/**
 * attachBehaviorAction is the action-capable control behind the behavior-capture surface (CLAUDE.md
 * §7 ui-completeness): the human gives the captured idea ref + the target entity, picks a behavior,
 * then submits — the action runs the ONE authoritative `expand` through the pure twin and returns the
 * dry-run expansion + the DRAFT ChangeSet PROPOSAL. It WRITES NOTHING (the wall): the proposal awaits
 * human approval via the changeset door. A no-idea / unknown-behavior / entity-less attach is refused.
 */
export async function attachBehaviorAction(
	_prev: AttachResultView,
	formData: FormData,
): Promise<AttachResultView> {
	const ideaRef = String(formData.get("ideaRef") ?? "").trim();
	const behavior = String(formData.get("behavior") ?? "").trim() as Kind;
	const entity = String(formData.get("entity") ?? "").trim();

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;

	if (!ideaRef) return { ok: false, messageKey: "ideaEmpty", projectId };

	const { result, error } = attachBehaviorAtCapture(ideaRef, {
		behavior,
		entity,
	});
	if (error !== null || result === null) {
		return {
			ok: false,
			messageKey: "attachRefused",
			error: error ?? undefined,
			projectId,
		};
	}

	return {
		ok: true,
		messageKey: "attachOk",
		ideaRef: result.ideaRef,
		behavior: result.expansion.behavior,
		entity: result.expansion.entity,
		expansionId: result.expansion.expansionId,
		changeSetRef: result.changeSet.ref,
		changeSetStatus: result.changeSet.status,
		pieceCount: proposalPieceCount(result),
		preview: proposalPreview(result),
		expansion: result.expansion,
		projectId,
	};
}
