import { createHash } from "node:crypto";

/**
 * project.ts — the deterministic TS twin of back/kernel/project (S53). It produces
 * a BYTE-IDENTICAL canonical body + content-address to the Go package, so a project
 * created from the Workbench lands at the SAME id the engine would compute. The
 * canonical form sorts object keys lexicographically with no insignificant
 * whitespace (records.Canonicalize), then hashes with SHA-256 hex (records.Hash).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): content-addressing, slug validation, the
 * uniqueness gate (slug unique per owner) and scoping are PURE functions here — the
 * same input always yields the same output (pinned by the Vitest twin). The Go
 * package is authoritative; this twin must match it.
 *
 * THE WALL (CLAUDE.md §2): a project is BELOW the line (the `projects` schema is not
 * kernel/mirrors/fitness); the /projects panel writes it directly via the store
 * path (a Server Action), append-only — soft delete only.
 */

export type Lifecycle = "active" | "archived" | "deleted";

export const LIFECYCLES: Lifecycle[] = ["active", "archived", "deleted"];

export interface Project {
	id: string;
	slug: string;
	name: string;
	ownerRef: string;
	createdAt: string;
	lifecycle: Lifecycle;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** isValidSlug mirrors back/kernel/project slugRe: a-z0-9 with single hyphens. */
export function isValidSlug(slug: string): boolean {
	return SLUG_RE.test(slug);
}

/**
 * canonicalBody mirrors Project.CanonicalBody in Go: a JSON object with keys in
 * lexicographic order (created_at, kind, lifecycle, name, owner_ref, slug) and no
 * whitespace. The discriminator is kind="project".
 */
export function canonicalBody(p: Omit<Project, "id">): string {
	// Keys MUST be emitted in sorted order to match records.Canonicalize.
	const ordered: Record<string, string> = {
		created_at: p.createdAt,
		kind: "project",
		lifecycle: p.lifecycle,
		name: p.name,
		owner_ref: p.ownerRef,
		slug: p.slug,
	};
	return JSON.stringify(ordered);
}

/** sha256Hex matches records.Hash (canonical SHA-256 hex). */
function sha256Hex(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/** contentAddress returns the id == version == Hash(canonicalBody). */
export function contentAddress(p: Omit<Project, "id">): string {
	return sha256Hex(canonicalBody(p));
}

/** newProject builds a content-addressed project at a given lifecycle. */
export function newProject(
	slug: string,
	name: string,
	ownerRef: string,
	createdAt: string,
	lifecycle: Lifecycle = "active",
): Project {
	const fields = { slug, name, ownerRef, createdAt, lifecycle };
	return { id: contentAddress(fields), ...fields };
}

/** ownerSlug is the uniqueness key — a slug is unique per owner. */
export function ownerSlug(ownerRef: string, slug: string): string {
	return `${ownerRef}/${slug}`;
}

/**
 * canCreate is the deterministic uniqueness gate (slug unique per owner): a
 * non-deleted head holding (owner, slug) blocks creation; a soft-deleted one frees
 * it; an archived one still holds it.
 */
export function canCreate(
	heads: Project[],
	ownerRef: string,
	slug: string,
): boolean {
	const taken = new Set(
		heads
			.filter((p) => p.lifecycle !== "deleted")
			.map((p) => ownerSlug(p.ownerRef, p.slug)),
	);
	return !taken.has(ownerSlug(ownerRef, slug));
}

/**
 * scope is the PURE scoping function: given a project id and rows that carry a
 * projectId, return exactly the rows of that project — two disjoint project graphs
 * never cross-read. The Go twin is project.Scope.
 */
export function scope<T extends { projectId: string }>(
	projectId: string,
	rows: T[],
): T[] {
	return rows.filter((r) => r.projectId === projectId);
}
