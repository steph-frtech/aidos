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
	type HumanValidation,
	humanValidationCovers,
	isBlocked,
	LADDER,
	liveUrl,
	type PhaseInput,
	type Promotion,
	promote,
	type RollbackDecision,
	recordHumanValidation,
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

/** A validated dev validation_humaine for an EXACT phase (DP28) — supplied when an env draw lands
 * on staging so the human gate is satisfied and the S98 behaviour is preserved under the new law. */
function devValidationFor(phaseHash: string): HumanValidation {
	return recordHumanValidation({ env: "preview", phaseHash, validated: true });
}

describe("S98 env-rollback reproducibility mirror", () => {
	it("promotes a stable phase reproducibly", () => {
		fc.assert(
			fc.property(envArb, hashArb, (env, h) => {
				// DP28 — the staging hop needs a validated dev validation_humaine of THIS phase; the
				// preview/prod hops are not gated by this door. Attach it iff the draw lands on staging.
				const dev = env === "staging" ? devValidationFor(h) : null;
				const ph = stablePhase(h, h);
				const a = promote({
					env,
					project: "shop",
					phase: ph,
					devValidation: dev,
				});
				const b = promote({
					env,
					project: "shop",
					phase: ph,
					devValidation: dev,
				});
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
				const dev = env === "staging" ? devValidationFor(h) : null;
				const ph = stablePhase(h, h);
				const a = promote({
					env,
					project: "shop",
					phase: ph,
					devValidation: dev,
				}) as Promotion;
				const b = promote({
					env,
					project: "shop",
					phase: ph,
					devValidation: dev,
				}) as Promotion;
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

/**
 * DP28 — the HUMAN-VALIDATION GATE on the dev (the heart of DP28). The reproducibility mirror pins
 * the user-capital law: promotion preview/dev → STAGING is REFUSED DEV_NOT_HUMAN_VALIDATED unless a
 * validation_humaine validated=true of the EXACT phase is carried (fail-closed), PER PHASE; and the
 * recording of a validation is content-addressed (same input → same id), append-only, never
 * authority.Decide. Verdict-for-verdict with the Go envrollback property mirror.
 */
describe("DP28 — the human-validation gate on the dev", () => {
	it("∀: promotion to staging requires a validated dev validation of the EXACT phase", () => {
		fc.assert(
			fc.property(hashArb, (h) => {
				const ph = stablePhase(h, h);
				// WITHOUT a validation → fail-closed refusal.
				const refused = promote({ env: "staging", project: "shop", phase: ph });
				expect(isBlocked(refused)).toBe(true);
				if (isBlocked(refused)) {
					expect(refused.code).toBe("DEV_NOT_HUMAN_VALIDATED");
				}
				// WITH a validated validation_humaine of THIS phase → permitted.
				const allowed = promote({
					env: "staging",
					project: "shop",
					phase: ph,
					devValidation: devValidationFor(h),
				});
				expect(isBlocked(allowed)).toBe(false);
				const prom = allowed as Promotion;
				// staging serves the RE-EMITTED app of the validated phase (the re-projection).
				expect(prom.emittedAppHash).toBe(emittedAppHash(h, ph.surface));
				expect(prom.env).toBe("staging");
			}),
		);
	});

	it("∀: the validation is PER PHASE — validating phase A never unlocks phase B", () => {
		fc.assert(
			fc.property(hashArb, hashArb, (a, b) => {
				fc.pre(a !== b);
				const phaseB = stablePhase(b, b);
				// a validation of phase A, but we promote phase B → fail-closed, names PER PHASE.
				const refused = promote({
					env: "staging",
					project: "shop",
					phase: phaseB,
					devValidation: devValidationFor(a),
				});
				expect(isBlocked(refused)).toBe(true);
				if (isBlocked(refused)) {
					expect(refused.code).toBe("DEV_NOT_HUMAN_VALIDATED");
				}
				// the matching validation of phase B unlocks phase B.
				const allowed = promote({
					env: "staging",
					project: "shop",
					phase: phaseB,
					devValidation: devValidationFor(b),
				});
				expect(isBlocked(allowed)).toBe(false);
			}),
		);
	});

	it("∀: a REFUSED validation (validated=false) keeps the promotion fail-closed", () => {
		fc.assert(
			fc.property(hashArb, (h) => {
				const ph = stablePhase(h, h);
				const refusal = recordHumanValidation({
					env: "preview",
					phaseHash: h,
					validated: false,
				});
				const r = promote({
					env: "staging",
					project: "shop",
					phase: ph,
					devValidation: refusal,
				});
				expect(isBlocked(r)).toBe(true);
				if (isBlocked(r)) expect(r.code).toBe("DEV_NOT_HUMAN_VALIDATED");
			}),
		);
	});

	it("∀: the prod and preview hops are NOT gated by the dev validation door", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Environment>("preview", "prod"),
				hashArb,
				(env, h) => {
					const ph = stablePhase(h, h);
					const r = promote({ env, project: "shop", phase: ph });
					expect(isBlocked(r)).toBe(false);
				},
			),
		);
	});

	it("∀: recording a validation is reproducible (same input → same id), and covers is fail-closed", () => {
		fc.assert(
			fc.property(hashArb, fc.boolean(), (h, validated) => {
				const a = recordHumanValidation({
					env: "preview",
					phaseHash: h,
					validated,
				});
				const b = recordHumanValidation({
					env: "preview",
					phaseHash: h,
					validated,
				});
				expect(a).toEqual(b);
				expect(a.by).toBe("human");
				// covers: only a validated validation of THIS phase passes (fail-closed).
				expect(humanValidationCovers(a, h)).toBe(validated);
				expect(humanValidationCovers(a, `${h}x`)).toBe(false);
				expect(humanValidationCovers(null, h)).toBe(false);
			}),
		);
	});
});
