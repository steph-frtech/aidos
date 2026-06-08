/**
 * The S98 ENVIRONMENTS + ROLLBACK-TO-PHASE twin reproducibility mirror (fast-check — the frozen
 * front property slot). It pins the same done-criteria as the Go rapid mirror:
 *   1. reproducibility — same input → byte-identical Promotion / RollbackDecision (same id);
 *   2. re-projection — the rollback's served app hash EQUALS a fresh re-emit of the TARGET phase;
 *      rollbackProducesReProjection accepts EXACTLY that hash and rejects the stale artifact;
 *   3. the Stop-gate — promoting a NON-STABLE phase is ALWAYS refused ENV_PROMOTE_NOT_STABLE;
 *      a rollback to a target NOT in the lineage is ALWAYS refused ROLLBACK_NOT_EARLIER;
 *   4. content-address sensitivity — a different actor/reason/env/target → a different decision id.
 * Same input → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Environment,
	emittedAppHash,
	isBlocked,
	LADDER,
	liveUrl,
	type PhaseInput,
	type Promotion,
	promote,
	type RollbackDecision,
	rollback,
	rollbackProducesReProjection,
} from "./env-rollback";

function stablePhase(phaseHash: string, tag: string): PhaseInput {
	return {
		phase: { phaseHash, stable: true, reasons: [] },
		gate: { mutationScore: 0.9, mutationThreshold: 0.8, monsterCount: 0 },
		surface: {
			project: "shop",
			serverBundleHash: `srv-${tag}`,
			frontBundleHash: `fnt-${tag}`,
			infraHash: `inf-${tag}`,
			datastoreHash: `dst-${tag}`,
		},
	};
}

function redPhase(phaseHash: string, tag: string): PhaseInput {
	const p = stablePhase(phaseHash, tag);
	p.phase = { phaseHash, stable: false, reasons: ["createOrder.fixture"] };
	return p;
}

const hashArb = fc.stringMatching(/^[a-f0-9]{6,16}$/);
const envArb = fc.constantFrom<Environment>(...LADDER);

describe("S98 env-rollback reproducibility mirror", () => {
	it("promotes a stable phase reproducibly", () => {
		fc.assert(
			fc.property(envArb, hashArb, (env, h) => {
				const ph = stablePhase(h, h);
				const a = promote({ env, project: "shop", phase: ph });
				const b = promote({ env, project: "shop", phase: ph });
				expect(isBlocked(a)).toBe(false);
				expect(a).toEqual(b);
				const prom = a as Promotion;
				expect(prom.stackName.startsWith(`${env}-shop-d-`)).toBe(true);
			}),
		);
	});

	it("surfaces a deterministic, always-https live URL per env (S99/DP29)", () => {
		fc.assert(
			fc.property(envArb, hashArb, (env, h) => {
				const ph = stablePhase(h, h);
				const a = promote({ env, project: "shop", phase: ph }) as Promotion;
				const b = promote({ env, project: "shop", phase: ph }) as Promotion;
				// reproducible + always TLS (https), URL carries the env + the per-phase subdomain.
				expect(a.liveUrl).toBe(b.liveUrl);
				expect(a.liveUrl.startsWith("https://")).toBe(true);
				expect(a.liveUrl).toBe(liveUrl(env, h, a.domainRoot));
				expect(a.liveUrl.includes(`${env}-d-`)).toBe(true);
			}),
		);
	});

	it("links a custom domain into the live URL deterministically (S99/DP29)", () => {
		fc.assert(
			fc.property(hashArb, (h) => {
				const ph = stablePhase(h, h);
				const root = "shop.example.com";
				const a = promote({
					env: "prod",
					project: "shop",
					phase: ph,
					domainRoot: root,
				}) as Promotion;
				expect(a.domainRoot).toBe(root);
				expect(a.liveUrl.endsWith(`.${root}`)).toBe(true);
				expect(a.liveUrl.startsWith("https://")).toBe(true);
			}),
		);
	});

	it("always refuses promoting a non-stable phase (ENV_PROMOTE_NOT_STABLE)", () => {
		fc.assert(
			fc.property(envArb, hashArb, (env, h) => {
				const r = promote({ env, project: "shop", phase: redPhase(h, h) });
				expect(isBlocked(r)).toBe(true);
				if (isBlocked(r)) expect(r.code).toBe("ENV_PROMOTE_NOT_STABLE");
			}),
		);
	});

	it("rolls back to an earlier stable phase, serving a fresh re-emit of N-1", () => {
		fc.assert(
			fc.property(hashArb, hashArb, (a, b) => {
				fc.pre(a !== b);
				const prev = stablePhase(a, a);
				const curr = stablePhase(b, b);
				const dec = rollback({
					env: "prod",
					project: "shop",
					current: curr,
					target: prev,
					lineage: [a],
					actor: "alice",
					reason: "incident",
				});
				expect(isBlocked(dec)).toBe(false);
				const d = dec as RollbackDecision;
				const fresh = emittedAppHash(a, prev.surface);
				expect(d.reProjectedAppHash).toBe(fresh);
				expect(rollbackProducesReProjection(d, prev, fresh)).toBe(true);
				// the STALE served artifact of N is rejected.
				const stale = emittedAppHash(b, curr.surface);
				if (stale !== fresh) {
					expect(rollbackProducesReProjection(d, prev, stale)).toBe(false);
				}
			}),
		);
	});

	it("always refuses a rollback to a non-ancestor (ROLLBACK_NOT_EARLIER)", () => {
		fc.assert(
			fc.property(hashArb, hashArb, (a, b) => {
				fc.pre(a !== b);
				const dec = rollback({
					env: "prod",
					project: "shop",
					current: stablePhase(b, b),
					target: stablePhase(a, a),
					lineage: [], // target not an ancestor
					actor: "alice",
					reason: "x",
				});
				expect(isBlocked(dec)).toBe(true);
				if (isBlocked(dec)) expect(dec.code).toBe("ROLLBACK_NOT_EARLIER");
			}),
		);
	});

	it("a different reason/actor yields a different decision id", () => {
		const prev = stablePhase("aaaa11", "aaaa11");
		const curr = stablePhase("bbbb22", "bbbb22");
		const base = {
			env: "prod" as Environment,
			project: "shop",
			current: curr,
			target: prev,
			lineage: ["aaaa11"],
			actor: "alice",
			reason: "incident",
		};
		const d0 = rollback(base) as RollbackDecision;
		const d1 = rollback({ ...base, reason: "other" }) as RollbackDecision;
		const d2 = rollback({ ...base, actor: "bob" }) as RollbackDecision;
		expect(d0.id).not.toBe(d1.id);
		expect(d0.id).not.toBe(d2.id);
	});
});
