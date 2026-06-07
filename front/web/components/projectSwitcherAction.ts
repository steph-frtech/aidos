"use server";

import { selectableProjects } from "@/lib/activeProject";
import {
	type ActiveProjectContext,
	activeProjectContext,
} from "@/lib/activeProjectServer";

/**
 * Server Action backing the header ProjectSwitcher (S57). The WorkbenchHeader is a
 * client component rendered by 48 routes, so the switcher self-fetches its context
 * (the live project list + the resolved active id from the AIDOS_PROJECT cookie)
 * rather than threading props through every page. Read-only — the cookie WRITE is
 * done client-side (document.cookie, like LanguageSwitcher); this only RESOLVES the
 * active project deterministically and offers the selectable (active) projects.
 */
export async function switcherContext(): Promise<{
	source: ActiveProjectContext["source"];
	activeId: string | null;
	projects: ActiveProjectContext["projects"];
}> {
	const ctx = await activeProjectContext();
	return {
		source: ctx.source,
		activeId: ctx.activeId,
		projects: selectableProjects(ctx.projects),
	};
}
