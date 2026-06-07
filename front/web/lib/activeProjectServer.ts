import { cookies } from "next/headers";
import { snapshot } from "@/app/projects/actions";
import {
	ACTIVE_PROJECT_COOKIE,
	resolveActiveProjectId,
	type SwitchableProject,
} from "./activeProject";

/**
 * activeProjectServer.ts — the SERVER-SIDE read of the S57 active project.
 *
 * Reads the `AIDOS_PROJECT` cookie (sibling of `NEXT_LOCALE`) and the live project
 * snapshot, then resolves the active project id with the DETERMINISTIC pure
 * resolver (lib/activeProject). Any panel can call `activeProjectContext()` to learn
 * which project it is scoped to — re-scoping every panel to the pinned project
 * without an URL change (CLAUDE.md §6 / ADR 0011 cookie pattern).
 *
 * THE WALL (CLAUDE.md §2): this only READS — the active project is a read-scope
 * selector, never a write door. The `__system__` seed stays isolated (the resolver
 * never silently selects it).
 */

export interface ActiveProjectContext {
	source: "live" | "demo";
	activeId: string | null;
	projects: SwitchableProject[];
}

/** activeProjectContext is the single server entrypoint the switcher + panels share. */
export async function activeProjectContext(): Promise<ActiveProjectContext> {
	const snap = await snapshot();
	const projects: SwitchableProject[] = snap.projects.map((p) => ({
		id: p.id,
		slug: p.slug,
		name: p.name,
		lifecycle: p.lifecycle,
	}));
	const store = await cookies();
	const cookieValue = store.get(ACTIVE_PROJECT_COOKIE)?.value;
	const activeId = resolveActiveProjectId(cookieValue, projects);
	return { source: snap.source, activeId, projects };
}
