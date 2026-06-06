/**
 * governance.test.ts — GV01 front reproducibility mirror. The twin must agree with the
 * Go authority (back/runtime/governance) AND be a pure, total, byte-stable derivation of
 * its declared table. fast-check drives many reads to assert no drift; the structural
 * checks pin the contract (ten risks, the wall-never-abandoned verdict).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ADR_NUMBER,
	ADR_STATUS,
	adrParity,
	adrSummary,
	buildTrustChain,
	checkCompliance,
	checkInjected,
	compilePolicy,
	complianceAudit,
	count,
	coverages,
	DEMO_RUNS,
	evaluateSRE,
	gateUnderPolicy,
	mirrorFor,
	mirrors,
	POLICY_PROBE_ACTIONS,
	pillarVerdicts,
	policyAudit,
	REFERENCE_SURFACE,
	RISKS,
	residuals,
	SAMPLE_POLICY_YAML,
	SRE_DEFAULT_SLO,
	STATUSES,
	sreAudit,
	TIGHTEN_POLICY_YAML,
	verdict,
	WIDEN_POLICY_YAMLS,
} from "./governance";

describe("GV01 OWASP cross-check — front twin", () => {
	it("maps exactly the ten OWASP Agentic risks, in stable order, no dup", () => {
		expect(RISKS.length).toBe(10);
		expect(new Set(RISKS).size).toBe(10);
		const a = coverages().map((c) => c.risk);
		const b = coverages().map((c) => c.risk);
		expect(a).toEqual(b);
		expect(a).toEqual([...RISKS]);
	});

	it("every coverage row is well-formed; residual EXACTLY when not covered (honesty)", () => {
		for (const c of coverages()) {
			expect(STATUSES).toContain(c.status);
			expect(c.coveredBy.length).toBeGreaterThan(0);
			expect(c.title.length).toBeGreaterThan(0);
			if (c.status === "covered") {
				expect(c.residual ?? "").toBe("");
				expect(c.augmentedBy ?? "").toBe("");
			} else {
				expect((c.residual ?? "").length).toBeGreaterThan(0);
				expect((c.augmentedBy ?? "").length).toBeGreaterThan(0);
			}
		}
	});

	it("tally rolls up faithfully (buckets sum to total = 10)", () => {
		const t = count();
		expect(t.total).toBe(10);
		expect(t.covered + t.partial + t.uncovered).toBe(t.total);
		expect(residuals().length).toBe(t.partial + t.uncovered);
	});

	it("the verdict never abandons the wall; Stop is computed, not declared", () => {
		const pvs = pillarVerdicts();
		expect(pvs.length).toBe(5);
		for (const p of pvs) {
			expect(["adopt_augment", "already_covered", "reject"]).toContain(
				p.decision,
			);
			expect(p.rationale.length).toBeGreaterThan(0);
			if (p.decision === "adopt_augment") expect(p.step).toBeTruthy();
		}
		const v = verdict();
		expect(v.stop).toBe(v.toAdopt === 0 && v.residualRisks === 0);
		// the real audit finding: a residual exists → the GV roadmap is justified (no stop).
		expect(v.stop).toBe(false);
		expect(v.residualRisks).toBeGreaterThan(0);
	});

	it("is reproducible — same declared table ⇒ identical report on every read", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 8 }), () => {
				expect(coverages()).toEqual(coverages());
				expect(count()).toEqual(count());
				expect(verdict()).toEqual(verdict());
				expect(pillarVerdicts()).toEqual(pillarVerdicts());
			}),
		);
	});
});

describe("GV02 AGT adoption ADR — front twin", () => {
	it("the ADR projection is total and faithful to the verdict (4 adopt / 1 covered / 0 reject)", () => {
		const s = adrSummary();
		const v = verdict();
		expect(s.number).toBe(ADR_NUMBER);
		expect(s.status).toBe(ADR_STATUS);
		expect(s.adopt).toBe(v.toAdopt);
		expect(s.alreadyCovered).toBe(v.alreadyCovered);
		expect(s.rejected).toBe(v.rejected);
		expect([s.adopt, s.alreadyCovered, s.rejected]).toEqual([4, 1, 0]);
	});

	it("the wall stays the garant on every non-rejected ADR row", () => {
		const rows = adrParity();
		expect(rows.length).toBe(5);
		for (const r of rows) {
			expect(r.wallIsGarant).toBe(r.decision !== "reject");
			if (r.decision === "adopt_augment") expect(r.step).toBeTruthy();
		}
		// no row replaces the wall — every garant flag is true here (0 rejected).
		expect(rows.every((r) => r.wallIsGarant)).toBe(true);
		expect(adrSummary().wallStaysGarant).toBe(true);
	});

	it("is reproducible — same declared table ⇒ identical ADR projection on every read", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 8 }), () => {
				expect(adrParity()).toEqual(adrParity());
				expect(adrSummary()).toEqual(adrSummary());
			}),
		);
	});
});

import {
	appendEntry,
	buildLedger,
	deriveBom,
	GENESIS_ROOT,
	type LedgerRun,
	ledgerAudit,
	ledgerRoot,
	verifyLedger,
} from "./governance";

// GV03 — the tamper-evident (Merkle) ledger twin mirror. The done-criterion: a tamper turns
// verify RED; append-only; deterministic. fast-check drives random ledgers; the structural
// checks pin alter/delete/reorder evidence and the wall-stays-below-the-line invariant.
describe("GV03 — tamper-evident (Merkle) audit ledger twin", () => {
	const drawRun = (i: number): LedgerRun => ({
		id: `run-${i}`,
		agent: `agent-${i}`,
		goal: `goal-${i}`,
		redWorkItem: `rwi-${i}`,
		contextPack: `pack-${i}`,
		impl: `impl-${i}`,
		seed: `seed-${i}`,
		result: ["green", "still_red", "blocked", "abandoned"][i % 4],
	});

	it("is reproducible — same ordered runs ⇒ same root, and a fresh ledger verifies", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 6 }), (n) => {
				const runs = Array.from({ length: n }, (_, i) => drawRun(i));
				const a = buildLedger(runs);
				const b = buildLedger(runs);
				expect(ledgerRoot(a)).toBe(ledgerRoot(b));
				expect(verifyLedger(a).ok).toBe(true);
				if (n === 0) expect(ledgerRoot(a)).toBe(GENESIS_ROOT);
			}),
		);
	});

	it("ALTER — changing a BOM field of any row turns verify red and changes the root", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 6 }), (n) => {
				const runs = Array.from({ length: n }, (_, i) => drawRun(i));
				const ledger = buildLedger(runs);
				const rootBefore = ledgerRoot(ledger);
				for (let i = 0; i < ledger.length; i++) {
					const tampered = ledger.map((e) => ({ ...e, bom: { ...e.bom } }));
					tampered[i].bom.goal = `${tampered[i].bom.goal}X`;
					expect(verifyLedger(tampered).ok).toBe(false);
				}
				const altered = [...runs];
				altered[0] = { ...altered[0], goal: `${altered[0].goal}X` };
				expect(ledgerRoot(buildLedger(altered))).not.toBe(rootBefore);
			}),
		);
	});

	it("DELETE — silently removing a row is tamper-evident (root change or red verify)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 6 }), (n) => {
				const runs = Array.from({ length: n }, (_, i) => drawRun(i));
				const ledger = buildLedger(runs);
				const rootBefore = ledgerRoot(ledger);
				for (let i = 0; i < ledger.length; i++) {
					const spliced = [...ledger.slice(0, i), ...ledger.slice(i + 1)];
					const rootChanged = ledgerRoot(spliced) !== rootBefore;
					const verifyRed = !verifyLedger(spliced).ok;
					expect(rootChanged || verifyRed).toBe(true);
				}
			}),
		);
	});

	it("REORDER — swapping two distinct rows turns verify red", () => {
		const runs = Array.from({ length: 3 }, (_, i) => drawRun(i));
		const ledger = buildLedger(runs);
		const swapped = [ledger[1], ledger[0], ledger[2]];
		expect(verifyLedger(swapped).ok).toBe(false);
	});

	it("APPEND-ONLY — appendEntry never mutates the caller's ledger nor its prefix", () => {
		const runs = Array.from({ length: 3 }, (_, i) => drawRun(i));
		const ledger = buildLedger(runs);
		const snapshot = JSON.stringify(ledger);
		const grown = appendEntry(ledger, drawRun(99));
		expect(JSON.stringify(ledger)).toBe(snapshot); // unchanged
		expect(grown.length).toBe(ledger.length + 1);
		for (let i = 0; i < ledger.length; i++) expect(grown[i]).toEqual(ledger[i]);
		expect(verifyLedger(grown).ok).toBe(true);
	});

	it("deriveBom — projects exactly the run's decision fields", () => {
		const r = drawRun(7);
		const bom = deriveBom(r);
		expect(bom).toEqual({
			run: r.id,
			agent: r.agent,
			goal: r.goal,
			redWorkItem: r.redWorkItem,
			contextPack: r.contextPack,
			impl: r.impl,
			seed: r.seed,
			result: r.result,
		});
	});

	it("ledgerAudit — the panel's report is intact for the demo, red for all three tampers", () => {
		const a = ledgerAudit();
		expect(a.entries.length).toBe(3);
		expect(a.intact.ok).toBe(true);
		expect(a.altered.ok).toBe(false);
		expect(a.altered.tamper).toBe("entry_hash_mismatch");
		expect(a.reordered.ok).toBe(false);
		expect(a.deleted.rootAfter).not.toBe(a.deleted.rootBefore);
		// the report is reproducible (pure, no Date.now/random)
		expect(ledgerAudit()).toEqual(a);
	});
});

describe("GV04 OWASP compliance mirrors — front twin", () => {
	it("exactly one mirror per OWASP risk, in canonical order, each anchored", () => {
		const ms = mirrors();
		expect(ms.length).toBe(10);
		expect(ms.map((m) => m.risk)).toEqual([...RISKS]);
		for (const r of RISKS) {
			const m = mirrorFor(r);
			expect(m).toBeDefined();
			expect(m?.anchor.length).toBeGreaterThan(0);
			expect(m?.title.length).toBeGreaterThan(0);
			expect(m?.forbidden.length).toBeGreaterThan(0);
		}
		expect(new Set(ms.map((m) => m.risk)).size).toBe(10);
	});

	it("tous verts sur l'état courant — every governed scenario is compliant, with evidence", () => {
		const suite = checkCompliance();
		expect(suite.total).toBe(10);
		expect(suite.allCompliant).toBe(true);
		expect(suite.compliant).toBe(10);
		for (const r of suite.results) {
			expect(r.compliant).toBe(true);
			expect(r.evidence.length).toBeGreaterThan(0);
		}
	});

	it("injecter la violation → le miroir passe rouge — every injected scenario is RED (load-bearing)", () => {
		for (const m of mirrors()) {
			expect(m.governed.compliant).toBe(true);
			expect(m.injected.compliant).toBe(false);
		}
		const inj = checkInjected();
		expect(inj.compliant).toBe(0); // ZERO mirrors may wrongly stay compliant under injection
		expect(inj.total).toBe(10);
	});

	it("complianceAudit — reproducible (pure, no Date.now/random)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 8 }), () => {
				const a = complianceAudit();
				const b = complianceAudit();
				expect(a).toEqual(b);
				expect(a.governed.allCompliant).toBe(true);
				expect(a.injected.compliant).toBe(0);
			}),
		);
	});
});

describe("GV05 policy.yaml → GateAction compiler — front twin", () => {
	// the same generated action space the Go rapid property explores, expressed as fast-check.
	const targetArb = fc.constantFrom(
		"",
		"kernel.truth",
		"back/kernel/x.go",
		"back/runtime/governance/x.go",
		"front/web/app/secret/page.tsx",
		"back/migrations/001.sql",
	);
	const hostArb = fc.constantFrom("", "evil.example.com", "api.anthropic.com");
	const execArb = fc.constantFrom("", "/bin/sh", "go");
	const serverArb = fc.constantFrom("", "store", "privileged");
	const toolArb = fc.constantFrom("", "read", "deploy");
	const skillArb = fc.constantFrom("", "tdd", "untrusted-third-party");
	const actionArb = fc.record({
		target: targetArb,
		host: hostArb,
		exec: execArb,
		server: serverArb,
		tool: toolArb,
		skill: skillArb,
	});

	it("the reference policy compiles to the declared reference surface", () => {
		const r = compilePolicy(SAMPLE_POLICY_YAML);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.policy.allowedPaths).toEqual([
				...REFERENCE_SURFACE.allowedPaths,
			]);
			expect(r.policy.allowedNetworkHosts).toEqual([
				...REFERENCE_SURFACE.allowedNetworkHosts,
			]);
			expect(r.policy.maxTokensPerGoal).toBe(
				REFERENCE_SURFACE.maxTokensPerGoal,
			);
		}
	});

	it("ÉQUIVALENCE — the compiled policy gates identically to the reference surface for any action", () => {
		const r = compilePolicy(SAMPLE_POLICY_YAML);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const refImpl = {
			allowedPaths: [...REFERENCE_SURFACE.allowedPaths],
			allowedNetworkHosts: [...REFERENCE_SURFACE.allowedNetworkHosts],
			allowedExec: [...REFERENCE_SURFACE.allowedExec],
			tools: REFERENCE_SURFACE.tools.map((t) => ({ ...t })),
			skills: [...REFERENCE_SURFACE.skills],
			maxTokensPerGoal: REFERENCE_SURFACE.maxTokensPerGoal,
		};
		fc.assert(
			fc.property(actionArb, (act) => {
				const fromPolicy = gateUnderPolicy(r.policy, act);
				const fromRef = gateUnderPolicy(refImpl, act);
				expect(fromPolicy.allowed).toBe(fromRef.allowed);
				expect(fromPolicy.deniedAxis).toBe(fromRef.deniedAxis);
				expect(fromPolicy.code).toBe(fromRef.code);
			}),
		);
	});

	it("TIGHTEN-NEVER-WIDEN — a tighter policy never allows what the reference denied", () => {
		const ref = compilePolicy(SAMPLE_POLICY_YAML);
		const tight = compilePolicy(TIGHTEN_POLICY_YAML);
		expect(ref.ok && tight.ok).toBe(true);
		if (!ref.ok || !tight.ok) return;
		fc.assert(
			fc.property(actionArb, (act) => {
				const refD = gateUnderPolicy(ref.policy, act);
				const tightD = gateUnderPolicy(tight.policy, act);
				if (!refD.allowed) expect(tightD.allowed).toBe(false);
			}),
		);
	});

	it("WIDEN-IS-REJECTED — every widening policy is refused by the compiler", () => {
		for (const [axis, y] of Object.entries(WIDEN_POLICY_YAMLS)) {
			const r = compilePolicy(y);
			expect(r.ok, `${axis} must be rejected`).toBe(false);
		}
	});

	it("policyAudit — all probes never widen, all widen-policies rejected, reproducible", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 8 }), () => {
				const a = policyAudit();
				const b = policyAudit();
				expect(a).toEqual(b);
				expect(a.referenceOk).toBe(true);
				expect(a.tighterOk).toBe(true);
				expect(a.rows.length).toBe(POLICY_PROBE_ACTIONS.length);
				expect(a.allTighten).toBe(true);
				expect(a.allWidenRejected).toBe(true);
			}),
		);
	});
});

describe("GV06 SRE alignment + identity/trust — front twin", () => {
	const RESULTS = ["green", "still_red", "blocked", "abandoned"] as const;
	const resultsArb = fc.array(fc.constantFrom(...RESULTS), { maxLength: 12 });
	const sloArb = fc.double({ min: 0, max: 1, noNaN: true });

	it("evaluateSRE is reproducible — same (results, slo) ⇒ same state", () => {
		fc.assert(
			fc.property(resultsArb, sloArb, (results, slo) => {
				expect(evaluateSRE(results, slo)).toEqual(evaluateSRE(results, slo));
			}),
		);
	});

	it("a failure never improves the budget nor re-closes an open breaker (fail-closed)", () => {
		fc.assert(
			fc.property(resultsArb, sloArb, (results, slo) => {
				const before = evaluateSRE(results, slo);
				const after = evaluateSRE([...results, "blocked"], slo);
				expect(after.remainingBudget).toBeLessThanOrEqual(
					before.remainingBudget,
				);
				if (before.breaker === "open") expect(after.breaker).toBe("open");
			}),
		);
	});

	it("budget stays in [0,total] and breaker opens iff the rate breaches the target", () => {
		fc.assert(
			fc.property(resultsArb, sloArb, (results, slo) => {
				const s = evaluateSRE(results, slo);
				expect(s.remainingBudget).toBeGreaterThanOrEqual(0);
				expect(s.remainingBudget).toBeLessThanOrEqual(s.totalBudget);
				expect(s.breaker === "open").toBe(s.errorRate > s.target);
			}),
		);
	});

	it("trust chain covers every run, binds identity, and is reproducible", () => {
		const chain = buildTrustChain(DEMO_RUNS);
		expect(chain.rows.length).toBe(DEMO_RUNS.length);
		expect(buildTrustChain(DEMO_RUNS).root).toBe(chain.root);
		chain.rows.forEach((row, i) => {
			expect(row.agent).toBe(DEMO_RUNS[i].agent);
			expect(row.impl).toBe(DEMO_RUNS[i].impl ?? "");
		});
	});

	it("sreAudit renders against the declared SLO", () => {
		const a = sreAudit();
		expect(a.sre.target).toBe(SRE_DEFAULT_SLO);
		expect(a.trust.rows.length).toBe(DEMO_RUNS.length);
	});
});
