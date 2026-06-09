import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AccountView,
	assemble,
	CLI_SURFACE,
	type ProjectStatus,
} from "./account-release";
import type { Capability } from "./adoption";

// S117 reproducibility mirror (fast-check) — the determinism-first invariant: the
// per-account release pack twin is a pure, total function of (view, now); same input ⇒
// same pack; the id excludes assembledAt; nothing is fabricated; the next adoption tier
// is advised. Mirrors back/runtime/adoption/accountrelease.

const arbStatus: fc.Arbitrary<ProjectStatus> = fc.constantFrom("real", "demo");
const arbCap: fc.Arbitrary<Capability> = fc.constantFrom(
	"tests",
	"mutation",
	"one_krd_cell",
	"kernel",
);

const arbView: fc.Arbitrary<AccountView> = fc.record({
	account: fc.stringMatching(/^[a-z]{1,6}$/),
	projects: fc.array(
		fc.record({
			id: fc.stringMatching(/^[a-z]{1,5}$/),
			status: arbStatus,
		}),
		{ maxLength: 5 },
	),
	cliSurface: fc.constant([]),
	workbenchRoutes: fc.constant([]),
	docs: fc.constant([]),
	mirrors: fc.constant([]),
	changesets: fc.constant([]),
	declaredLimits: fc.array(
		fc.record({ ref: fc.stringMatching(/^[a-z]{1,5}$/) }),
		{ maxLength: 3 },
	),
	capabilities: fc.array(arbCap, { maxLength: 4 }),
});

describe("account-release twin", () => {
	it("same (view, now) ⇒ byte-identical pack", () => {
		fc.assert(
			fc.property(arbView, fc.integer(), (view, now) => {
				expect(assemble(view, now)).toEqual(assemble(view, now));
			}),
		);
	});

	it("the pack id excludes assembledAt", () => {
		fc.assert(
			fc.property(arbView, fc.integer(), fc.integer(), (view, n1, n2) => {
				expect(assemble(view, n1).id).toBe(assemble(view, n2).id);
			}),
		);
	});

	it("never mutates its input view", () => {
		fc.assert(
			fc.property(arbView, fc.integer(), (view, now) => {
				const snapshot = JSON.stringify(view);
				assemble(view, now);
				expect(JSON.stringify(view)).toBe(snapshot);
			}),
		);
	});

	it("every project and limit traces to the view (no fabrication)", () => {
		fc.assert(
			fc.property(arbView, fc.integer(), (view, now) => {
				const pack = assemble(view, now);
				expect(pack.projects.length).toBe(view.projects.length);
				expect(pack.knownLimits.length).toBe(view.declaredLimits.length);
				const inIds = new Set(view.projects.map((p) => p.id));
				for (const p of pack.projects) expect(inIds.has(p.id)).toBe(true);
			}),
		);
	});

	it("preserves each project's honest demo-vs-real status", () => {
		const view: AccountView = {
			account: "a",
			projects: [
				{ id: "x", status: "real" },
				{ id: "y", status: "demo" },
			],
			cliSurface: [],
			workbenchRoutes: [],
			docs: [],
			mirrors: [],
			changesets: [],
			declaredLimits: [],
			capabilities: [],
		};
		const pack = assemble(view, 0);
		const byId = Object.fromEntries(pack.projects.map((p) => [p.id, p.status]));
		expect(byId.x).toBe("real");
		expect(byId.y).toBe("demo");
	});

	it("advises the next adoption tier (empty ⇒ T0 current, T1 next)", () => {
		const pack = assemble(
			{
				account: "empty",
				projects: [],
				cliSurface: [],
				workbenchRoutes: [],
				docs: [],
				mirrors: [],
				changesets: [],
				declaredLimits: [],
				capabilities: [],
			},
			0,
		);
		expect(pack.adoptionPlan.current).toBe("T0");
		expect(pack.adoptionPlan.next).toBe("T1");
	});

	it("the CLI surface lists 5 core + 6 gateway verbs", () => {
		expect(CLI_SURFACE).toHaveLength(11);
		const gateway = CLI_SURFACE.filter((v) => v.kind === "gateway");
		expect(gateway.map((v) => v.name).sort()).toEqual([
			"goal",
			"grill",
			"harvest",
			"init",
			"spike",
			"trim",
		]);
		const goal = CLI_SURFACE.find((v) => v.name === "goal");
		expect(goal?.tool).toBe("changeset_open");
	});
});
