import { SYSTEM_SLUG } from "./projectScope";

/**
 * activeProject.ts — the DETERMINISTIC core of the S57 project switcher.
 *
 * S57 pins the ACTIVE project_id in a cookie (`AIDOS_PROJECT`, exactly like
 * `NEXT_LOCALE` — no URL prefix, so the 48 existing Workbench routes stay intact)
 * and re-scopes every panel to it. This module is the single source of truth for
 * "which project is active, given the cookie and the set of live projects?".
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): the resolution is a PURE FUNCTION — same cookie
 * + same project set → same active id — never an LLM, never a guess. Pinned by the
 * Vitest+fast-check twin lib/activeProject.test.ts (the reproducibility mirror).
 *
 * THE WALL (CLAUDE.md §2): a project_id is a read-SCOPE selector, not a write door.
 * Nothing here writes truth; selecting a project only changes which project's
 * below-the-line rows a panel reads (the read scope of S54 projectScope.scopedSelect).
 *
 * ISOLATION: the reserved seed project `__system__` (the Order demo, S54) is NEVER
 * silently selected — it is selectable only by an EXPLICIT, exact cookie match, so
 * a user landing with no cookie (or a stale/forged cookie) never falls into the
 * system graph (the e2e proves `__system__` stays isolated).
 */

/** The cookie name pinning the active project — sibling of NEXT_LOCALE (ADR 0011). */
export const ACTIVE_PROJECT_COOKIE = "AIDOS_PROJECT";

/** A minimal projection of a project sufficient to resolve the active one. */
export interface SwitchableProject {
	id: string;
	slug: string;
	name: string;
	lifecycle: "active" | "archived" | "deleted";
}

/**
 * selectableProjects mirrors the switcher's offered set: only `active`-lifecycle
 * projects are switchable (archived/deleted are masked, append-only — S56). The
 * order is preserved from the input (the caller orders by id). The `__system__`
 * seed is NOT filtered out here (it is a real active project) but it is never the
 * DEFAULT — see resolveActiveProjectId.
 */
export function selectableProjects(
	projects: SwitchableProject[],
): SwitchableProject[] {
	return projects.filter((p) => p.lifecycle === "active");
}

/**
 * resolveActiveProjectId is the PURE resolver: given the cookie value and the live
 * projects, return the active project id deterministically.
 *
 * Rules (closed, deterministic):
 *  1. If the cookie names an EXISTING, selectable (active) project → that id.
 *     This is the ONLY way `__system__` can become active: an explicit exact match.
 *  2. Else fall back to the first selectable NON-`__system__` project (so the demo
 *     seed is never silently selected — the isolation guarantee).
 *  3. Else (only `__system__` or nothing selectable) → null (no active project).
 *
 * Same (cookie, projects) → same result, always.
 */
export function resolveActiveProjectId(
	cookieValue: string | undefined,
	projects: SwitchableProject[],
): string | null {
	const selectable = selectableProjects(projects);

	if (cookieValue) {
		const hit = selectable.find((p) => p.id === cookieValue);
		if (hit) return hit.id;
	}

	const nonSystem = selectable.find((p) => p.slug !== SYSTEM_SLUG);
	if (nonSystem) return nonSystem.id;

	return null;
}

/**
 * isSystemProject — a deterministic predicate so a panel can refuse to treat the
 * Order-demo seed as a user project (defensive: the demo `__system__` stays isolated).
 */
export function isSystemProject(p: SwitchableProject): boolean {
	return p.slug === SYSTEM_SLUG;
}

/**
 * activeProjectLabel renders the switcher's current label deterministically. When
 * no project is active it returns the empty string (the caller shows a placeholder).
 */
export function activeProjectLabel(
	activeId: string | null,
	projects: SwitchableProject[],
): string {
	if (!activeId) return "";
	const p = projects.find((x) => x.id === activeId);
	return p ? p.name : "";
}
