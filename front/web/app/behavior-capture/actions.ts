"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	type AttachReadView,
	demoAttach,
	demoLibrary,
	gatewayAttachArgs,
	gatewayLibraryArgs,
} from "@/lib/behavior-capture-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { attachDecoder, libraryDecoder } from "./live";

/**
 * Server Actions for the /behavior-capture Workbench panel (S67 — attach a behavior at capture).
 *
 * THE STEP (ROADMAP-app-builder S67, KRD §24.6): at idea-capture the reusable behaviours library
 * (S79) is surfaced; attaching one DRY-RUN-EXPANDS it as a DRAFT ChangeSet PROPOSAL via the ONE
 * authoritative `expand` (S76's behavior.Expand) — never a second implementation. The expansion the
 * screen shows is BYTE-IDENTICAL to S76's (the expansionId matches the Go content address). The
 * expansion is a PURE FUNCTION, never an LLM.
 *
 * ADR 0092 CUTOVER (the Go engine is the SINGLE live source). Both reads now go LIVE through the
 * passerelle: `surfacedLibrary()` reads the surfaced catalogue from the Go `aidos-behavior-capture`
 * `behavior_library` tool, and `attachBehaviorAction()` runs the dry-run attach through the Go
 * `behavior_attach_at_capture` tool (`readVia(scope, …, decoder, demo)`, the dispatched below-the-line
 * reads). The twin compute (`lib/behavior-capture`) is preserved ONLY as the deterministic demo
 * fallback (`lib/behavior-capture-data`, `source:"live"|"demo"`) — never the live source. The `readVia`
 * frontier import keeps the T5 cliquet (twin-as-live-fitness) GREEN.
 *
 * THE WALL (CLAUDE.md §2/§7). The attach WRITES NOTHING — it is a DRY-RUN (`wrote_kernel` always
 * false) returning the expansion + a DRAFT ChangeSet PROPOSAL as VALUES. Freezing the expanded source
 * into the kernel goes through the wall (idée → miroir → /goal → approbation humaine), via the
 * changeset door (S20) under approval; the agent DB role can never write the kernel/mirrors. The
 * screen PROPOSES, it never writes the Kernel.
 */

/** AttachResultView is the panel's view-model: the flat attach view + the i18n message key + scope. */
export interface AttachResultView extends AttachReadView {
	/** i18n key under "behaviorCapture.messages". */
	messageKey: string;
	projectId?: string;
	/** the source of the displayed attach (live gateway vs demo fallback). */
	source?: "live" | "demo";
}

/**
 * surfacedLibrary is the read control — the reusable behaviours library surfaced at capture. LIVE read
 * through the passerelle (the dispatched `behavior_library` tool); the twin demoLibrary() is the
 * deterministic fallback. Read-only.
 */
export async function surfacedLibrary(): Promise<string[]> {
	const scope = await panelScope();
	const { data } = await readVia(
		scope,
		"behavior_library",
		gatewayLibraryArgs(),
		libraryDecoder,
		demoLibrary(),
	);
	return data;
}

/**
 * attachBehaviorAction is the action-capable control behind the behavior-capture surface (CLAUDE.md
 * §7 ui-completeness): the human gives the captured idea ref + the target entity, picks a behavior,
 * then submits — the action runs the ONE authoritative `expand` (the dispatched Go
 * `behavior_attach_at_capture` dry-run) and returns the dry-run expansion + the DRAFT ChangeSet
 * PROPOSAL. It WRITES NOTHING (the wall): the proposal awaits human approval via the changeset door.
 * A no-idea / unknown-behavior / entity-less attach is refused (a verbatim live verdict). The twin
 * demoAttach() is the deterministic fallback (`source:"live"|"demo"`).
 */
export async function attachBehaviorAction(
	_prev: AttachResultView,
	formData: FormData,
): Promise<AttachResultView> {
	const ideaRef = String(formData.get("ideaRef") ?? "").trim();
	const behavior = String(formData.get("behavior") ?? "").trim();
	const entity = String(formData.get("entity") ?? "").trim();

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId ?? undefined;

	if (!ideaRef) return { ok: false, messageKey: "ideaEmpty", projectId };

	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"behavior_attach_at_capture",
		gatewayAttachArgs(ideaRef, behavior, entity),
		attachDecoder,
		demoAttach(ideaRef, behavior, entity),
	);

	if (!data.ok) {
		return {
			...data,
			messageKey: "attachRefused",
			projectId,
			source,
		};
	}

	return {
		...data,
		messageKey: "attachOk",
		projectId,
		source,
	};
}
