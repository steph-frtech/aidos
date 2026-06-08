/**
 * The S94 preview twin reproducibility mirror (fast-check — the frozen front property slot).
 * It pins the same done-criteria as the Go rapid mirror:
 *   1. reproducibility — same input → byte-identical plan (id + URL + commands);
 *   2. phase keying — two DISTINCT phases never collide on a subdomain/URL;
 *   3. app-hash content-addressing — any byte change in any component → a new emitted-app hash;
 *   4. served↔emitted equality — the honest served hash always matches, any other is refused;
 *   5. boot/teardown determinism — `pulumi up` boot + `pulumi destroy` teardown, always present.
 * Same input → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildPlan,
	type EmittedSurface,
	emittedAppHash,
	isBlocked,
	type PhaseRef,
	type PreviewInput,
	servedMatchesEmitted,
} from "./preview";

const project = fc.constantFrom("shop", "blog", "crm", "invoice");
const hashStr = fc.stringMatching(/^[a-f0-9]{8,16}$/);

function surfaceOf(p: string, salt: string): EmittedSurface {
	return {
		project: p,
		serverBundleHash: `srv-${salt}`,
		frontBundleHash: `frt-${salt}`,
		infraHash: `inf-${salt}`,
		datastoreHash: `dst-${salt}`,
	};
}

function inputOf(p: string, phaseHash: string, salt: string): PreviewInput {
	return {
		phase: { phaseHash },
		surface: surfaceOf(p, salt),
		programPath: `gen/${p}/infra/index.ts`,
		programBytes: "export function program() {}\n",
	};
}

describe("preview twin reproducibility (S94)", () => {
	it("1. same input → byte-identical plan", () => {
		fc.assert(
			fc.property(
				project,
				hashStr,
				fc.stringMatching(/^[a-f0-9]{0,8}$/),
				(p, ph, salt) => {
					const a = buildPlan(inputOf(p, `phase-${ph}`, salt));
					const b = buildPlan(inputOf(p, `phase-${ph}`, salt));
					if (isBlocked(a) || isBlocked(b)) return false;
					return (
						a.id === b.id &&
						a.url === b.url &&
						a.emittedAppHash === b.emittedAppHash &&
						JSON.stringify(a.boot) === JSON.stringify(b.boot)
					);
				},
			),
		);
	});

	it("2. distinct phases never collide on subdomain/URL", () => {
		fc.assert(
			fc.property(
				project,
				hashStr,
				hashStr,
				fc.stringMatching(/^[a-f0-9]{0,8}$/),
				(p, h1, h2, salt) => {
					fc.pre(h1 !== h2);
					const a = buildPlan(inputOf(p, `phase-${h1}`, salt));
					const b = buildPlan(inputOf(p, `phase-${h2}`, salt));
					if (isBlocked(a) || isBlocked(b)) return false;
					return a.subdomain !== b.subdomain && a.url !== b.url;
				},
			),
		);
	});

	it("3. any component change → a new emitted-app hash", () => {
		fc.assert(
			fc.property(
				project,
				hashStr,
				fc.stringMatching(/^[a-f0-9]{1,8}$/),
				fc.integer({ min: 0, max: 3 }),
				(p, ph, salt, which) => {
					const phase: PhaseRef = { phaseHash: `phase-${ph}` };
					const base = surfaceOf(p, salt);
					const h0 = emittedAppHash(phase, base);
					const mut = { ...base };
					if (which === 0) mut.serverBundleHash += "X";
					else if (which === 1) mut.frontBundleHash += "X";
					else if (which === 2) mut.infraHash += "X";
					else mut.datastoreHash = `${mut.datastoreHash}X`;
					return emittedAppHash(phase, mut) !== h0;
				},
			),
		);
	});

	it("4. honest served hash matches; any other refused", () => {
		fc.assert(
			fc.property(
				project,
				hashStr,
				fc.stringMatching(/^[a-f0-9]{0,8}$/),
				(p, ph, salt) => {
					const plan = buildPlan(inputOf(p, `phase-${ph}`, salt));
					if (isBlocked(plan)) return false;
					const ok = servedMatchesEmitted(plan, plan.emittedAppHash);
					const bad = servedMatchesEmitted(
						plan,
						`${plan.emittedAppHash}-stale`,
					);
					return ok === true && bad !== true && isBlocked(bad);
				},
			),
		);
	});

	it("5. boot runs `pulumi up`, teardown runs `pulumi destroy`", () => {
		fc.assert(
			fc.property(
				project,
				hashStr,
				fc.stringMatching(/^[a-f0-9]{0,8}$/),
				(p, ph, salt) => {
					const plan = buildPlan(inputOf(p, `phase-${ph}`, salt));
					if (isBlocked(plan)) return false;
					return (
						plan.boot.join(" ").includes("pulumi up") &&
						plan.teardown.join(" ").includes("pulumi destroy") &&
						plan.subdomain.startsWith("p-")
					);
				},
			),
		);
	});

	it("refuses a preview with no phase", () => {
		const r = buildPlan({
			phase: { phaseHash: "" },
			surface: surfaceOf("shop", "a"),
			programPath: "gen/shop/infra/index.ts",
			programBytes: "x",
		});
		expect(isBlocked(r)).toBe(true);
	});
});
