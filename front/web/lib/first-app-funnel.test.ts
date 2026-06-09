import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	captureFunnelIdea,
	DEFAULT_PATH,
	deploySubdomain,
	FUNNEL_STEPS,
	type FunnelInput,
	funnelRedSet,
	runFunnel,
} from "./first-app-funnel";
import { instantiate } from "./templates";

/**
 * The S115 reproducibility mirror (fast-check + Vitest) — the funnel is a PURE, TOTAL,
 * DETERMINISTIC state machine: same FunnelInput → byte-identical FunnelState, the closed
 * step ordering, and the exact ids of the canonical sample. It also pins the two paths'
 * semantics: the template-first DEFAULT reaches a deployed app driven by the real engine,
 * while the blank-idea ADVANCED path is gated separately.
 *
 * mirror record: reflects=front.first-app.funnel, test_kind=property,
 *                cert_language=fast-check, liveness=alive, authority=above
 */

const GREEN_SENSORS = (refs: string[]): Record<string, "green" | "red"> =>
	Object.fromEntries(refs.map((r) => [r, "green" as const]));

// A fully-green template-first input that reaches deploy.
const happyTemplate = (): FunnelInput => {
	const starter = instantiate("ecommerce", "ma-boutique");
	const ideaId = "x"; // recomputed below; only used to build the green sensors
	const tmp: FunnelInput = {
		path: "template-first",
		email: "alice@example.com",
		template: "ecommerce",
		slug: "ma-boutique",
		proposes: "operation",
		intent: "ajouter un code promo au paiement",
		verdict: "sharp",
		sensors: {},
		priorGreen: "intact",
		mutation: 0.9,
	};
	// derive the real red set, then make every sensor green
	const idea = captureFunnelIdea(tmp);
	const redSet = funnelRedSet("template-first", starter, idea.id);
	void ideaId;
	return { ...tmp, sensors: GREEN_SENSORS(redSet) };
};

describe("first-app-funnel — the S115 real onboarding funnel", () => {
	it("default path is template-first (a newcomer succeeds via instantiate→modify)", () => {
		expect(DEFAULT_PATH).toBe("template-first");
	});

	it("the funnel steps are the closed, ordered journey", () => {
		expect([...FUNNEL_STEPS]).toEqual([
			"signup",
			"project",
			"idea",
			"grill",
			"goal",
			"build",
			"deploy",
		]);
	});

	it("template-first, fully green → a deployed app driven by the real engine", () => {
		const s = runFunnel(happyTemplate());
		expect(s.deployed).toBe(true);
		expect(s.reached).toBe(FUNNEL_STEPS.length);
		expect(s.buildVerdict).toBe("green");
		expect(s.starter).toBeDefined();
		// every checklist row is tied to a REAL artefact (not confetti)
		for (const row of s.checklist) {
			expect(row.done).toBe(true);
			expect(row.artefact).not.toBe("");
		}
		// the red set rides on the starter's mirrors + the modification mirror
		expect(s.redSet.length).toBe(8); // 7 starter mirrors + 1 modification
		expect(s.subdomain).toMatch(/^[0-9a-f]{16}$/);
	});

	it("blank-idea is the ADVANCED path: tested separately, no starter", () => {
		const idea = captureFunnelIdea({
			path: "blank-idea",
			email: "bob@example.com",
			template: "ecommerce",
			slug: "mon-app",
			proposes: "operation",
			intent: "une appli de suivi de plantes",
			verdict: "sharp",
			sensors: {},
			priorGreen: "intact",
			mutation: 0.9,
		});
		const redSet = funnelRedSet("blank-idea", undefined, idea.id);
		const s = runFunnel({
			path: "blank-idea",
			email: "bob@example.com",
			template: "ecommerce",
			slug: "mon-app",
			proposes: "operation",
			intent: "une appli de suivi de plantes",
			verdict: "sharp",
			sensors: GREEN_SENSORS(redSet),
			priorGreen: "intact",
			mutation: 0.9,
		});
		expect(s.starter).toBeUndefined();
		expect(s.redSet.length).toBe(1); // only the new-behaviour mirror, no starter to ride on
		expect(s.deployed).toBe(true);
	});

	it("an empty email blocks at signup (honest: no project without an account)", () => {
		const s = runFunnel({ ...happyTemplate(), email: "  " });
		expect(s.reached).toBe(0);
		expect(s.deployed).toBe(false);
		expect(s.checklist[0].done).toBe(false);
	});

	it("a fuzzy/bad grill verdict stops before the goal (routes to /spike or reject)", () => {
		const fuzzy = runFunnel({ ...happyTemplate(), verdict: "fuzzy" });
		expect(fuzzy.checklist[3].done).toBe(false); // grill row not done
		expect(fuzzy.deployed).toBe(false);
		const bad = runFunnel({ ...happyTemplate(), verdict: "bad" });
		expect(bad.deployed).toBe(false);
	});

	it("a non-green build stops before deploy (the Stop is non-gameable)", () => {
		const base = happyTemplate();
		// flip one sensor red → the goal cannot close → build is not green → no deploy
		const oneRed = { ...base.sensors };
		const firstKey = Object.keys(oneRed)[0];
		oneRed[firstKey] = "red";
		const s = runFunnel({ ...base, sensors: oneRed });
		expect(s.buildVerdict).not.toBe("green");
		expect(s.deployed).toBe(false);
		expect(s.checklist[5].done).toBe(false); // build row not done
	});

	it("a sub-floor mutation score blocks the build (declared floor, not learned)", () => {
		const s = runFunnel({ ...happyTemplate(), mutation: 0.3 });
		expect(s.deployed).toBe(false);
	});

	it("deploySubdomain is content-addressed and stable", () => {
		const starter = instantiate("ecommerce", "ma-boutique");
		const a = deploySubdomain("ma-boutique", starter, "");
		const b = deploySubdomain("ma-boutique", starter, "");
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		// a different slug → a different subdomain
		expect(deploySubdomain("autre", starter, "")).not.toBe(a);
	});

	it("PROPERTY: same input → byte-identical FunnelState (reproducible)", () => {
		fc.assert(
			fc.property(
				fc.record({
					path: fc.constantFrom(
						"template-first" as const,
						"blank-idea" as const,
					),
					email: fc.string(),
					template: fc.constantFrom(
						"ecommerce" as const,
						"crm" as const,
						"booking" as const,
					),
					slug: fc.string(),
					intent: fc.string(),
					verdict: fc.constantFrom(
						"sharp" as const,
						"fuzzy" as const,
						"bad" as const,
					),
					priorGreen: fc.constantFrom("intact" as const, "broken" as const),
					mutation: fc.double({ min: 0, max: 1, noNaN: true }),
				}),
				(r) => {
					const input: FunnelInput = {
						...r,
						proposes: "operation",
						sensors: {},
					};
					const a = JSON.stringify(runFunnel(input));
					const b = JSON.stringify(runFunnel(input));
					expect(a).toBe(b);
				},
			),
		);
	});

	it("PROPERTY: the funnel never declares deploy without a green build", () => {
		fc.assert(
			fc.property(
				fc.dictionary(
					fc.string({ minLength: 1 }),
					fc.constantFrom("green" as const, "red" as const),
				),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(sensors, mutation) => {
					const s = runFunnel({
						...happyTemplate(),
						sensors,
						mutation,
					});
					if (s.deployed) {
						// deploy implies the build verdict was green (non-gameable)
						expect(s.buildVerdict).toBe("green");
					}
				},
			),
		);
	});
});
