import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ACTIVE_PROJECT_COOKIE,
	activeProjectLabel,
	isSystemProject,
	resolveActiveProjectId,
	type SwitchableProject,
	selectableProjects,
} from "./activeProject";
import { SYSTEM_SLUG } from "./projectScope";

/**
 * Reproducibility mirror for the S57 active-project resolver (CLAUDE.md §6
 * determinism-first). The switcher's "which project is active?" decision is a PURE
 * function — these property tests pin: same input → same output, the `__system__`
 * seed never silently selected, and archived/deleted projects never switchable.
 */

const sysProject: SwitchableProject = {
	id: "sys-id",
	slug: SYSTEM_SLUG,
	name: "AIDOS System",
	lifecycle: "active",
};
const alpha: SwitchableProject = {
	id: "alpha-id",
	slug: "alpha-shop",
	name: "Alpha Shop",
	lifecycle: "active",
};
const beta: SwitchableProject = {
	id: "beta-id",
	slug: "beta-crm",
	name: "Beta CRM",
	lifecycle: "active",
};

describe("activeProject — cookie name", () => {
	it("pins AIDOS_PROJECT, a sibling of NEXT_LOCALE (no URL prefix)", () => {
		expect(ACTIVE_PROJECT_COOKIE).toBe("AIDOS_PROJECT");
	});
});

describe("selectableProjects — only active are switchable", () => {
	it("masks archived and deleted (append-only, S56)", () => {
		const projects: SwitchableProject[] = [
			alpha,
			{ ...beta, lifecycle: "archived" },
			{ id: "g-id", slug: "gamma", name: "Gamma", lifecycle: "deleted" },
		];
		expect(selectableProjects(projects).map((p) => p.id)).toEqual(["alpha-id"]);
	});
});

describe("resolveActiveProjectId — deterministic resolution", () => {
	it("an explicit cookie naming an active project wins", () => {
		expect(resolveActiveProjectId("beta-id", [alpha, beta])).toBe("beta-id");
	});

	it("__system__ is selected ONLY by an explicit exact cookie match", () => {
		// Explicit cookie → allowed.
		expect(resolveActiveProjectId("sys-id", [sysProject, alpha])).toBe(
			"sys-id",
		);
	});

	it("with no cookie, __system__ is NEVER silently selected (isolation)", () => {
		expect(resolveActiveProjectId(undefined, [sysProject, alpha])).toBe(
			"alpha-id",
		);
	});

	it("a stale/forged cookie falls back to the first non-system project", () => {
		expect(resolveActiveProjectId("does-not-exist", [sysProject, beta])).toBe(
			"beta-id",
		);
	});

	it("an archived project named by the cookie is NOT selected", () => {
		expect(
			resolveActiveProjectId("beta-id", [
				alpha,
				{ ...beta, lifecycle: "archived" },
			]),
		).toBe("alpha-id");
	});

	it("only __system__ present and no explicit cookie → null (stays isolated)", () => {
		expect(resolveActiveProjectId(undefined, [sysProject])).toBeNull();
	});

	it("nothing selectable → null", () => {
		expect(resolveActiveProjectId("x", [])).toBeNull();
	});

	it("is reproducible: same input → same output", () => {
		fc.assert(
			fc.property(
				fc.option(fc.string(), { nil: undefined }),
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1 }),
						slug: fc.string({ minLength: 1 }),
						name: fc.string(),
						lifecycle: fc.constantFrom(
							"active" as const,
							"archived" as const,
							"deleted" as const,
						),
					}),
				),
				(cookie, projects) => {
					const a = resolveActiveProjectId(cookie, projects);
					const b = resolveActiveProjectId(cookie, projects);
					expect(a).toBe(b);
				},
			),
		);
	});

	it("never silently returns __system__ without an explicit cookie match", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1 }),
						slug: fc.constantFrom(SYSTEM_SLUG, "alpha", "beta", "gamma"),
						name: fc.string(),
						lifecycle: fc.constantFrom(
							"active" as const,
							"archived" as const,
							"deleted" as const,
						),
					}),
				),
				(projects) => {
					const resolved = resolveActiveProjectId(undefined, projects);
					if (resolved === null) return;
					const sys = projects.find(
						(p) => p.slug === SYSTEM_SLUG && p.lifecycle === "active",
					);
					// If __system__ is resolved with NO cookie, there must be no other
					// selectable non-system project — i.e. it can never be PREFERRED.
					if (sys && resolved === sys.id) {
						const otherNonSystem = projects.find(
							(p) => p.slug !== SYSTEM_SLUG && p.lifecycle === "active",
						);
						expect(otherNonSystem).toBeUndefined();
					}
				},
			),
		);
	});
});

describe("isSystemProject — predicate", () => {
	it("matches only the __system__ slug", () => {
		expect(isSystemProject(sysProject)).toBe(true);
		expect(isSystemProject(alpha)).toBe(false);
	});
});

describe("activeProjectLabel — deterministic label", () => {
	it("returns the active project's name", () => {
		expect(activeProjectLabel("beta-id", [alpha, beta])).toBe("Beta CRM");
	});
	it("returns empty string when none active", () => {
		expect(activeProjectLabel(null, [alpha, beta])).toBe("");
	});
});
