/**
 * S89 — per-app datastore provisioner REPRODUCIBILITY + GATING mirror (Vitest +
 * fast-check). reflects=s89-provision-datastore-per-app · test_kind=property.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan is a PURE function — same Spec →
 * byte-identical Plan (same content-addressed id). Pins:
 *   - reproducibility (re-planning yields the identical id + ddl);
 *   - default by construction (default target ALWAYS plain-postgres unless a legal
 *     doltgres opt-in under a Go Decision);
 *   - the opt-in GATE (doltgres under a no-go/absent Decision is REFUSED);
 *   - per-project ISOLATION (distinct projects → distinct databases; same project stable);
 *   - the human-gate (historical impact without a declared scope is REFUSED).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Decision } from "./doltgres-spike";
import {
	buildPlan,
	type Entity,
	SAMPLE_ENTITY,
	SAMPLE_GO_DECISION,
	type Spec,
} from "./provision";

const NO_GO_DECISION: Decision = {
	...SAMPLE_GO_DECISION,
	id: "deadbeef00000000000000000000000000000000000000000000000000000000",
	verdict: "no-go",
	optInTargets: ["plain-postgres"],
};

function baseSpec(over: Partial<Spec>): Spec {
	return {
		projectId: "proj-x",
		target: "plain-postgres",
		decision: SAMPLE_GO_DECISION,
		entities: [SAMPLE_ENTITY],
		needsVector: false,
		...over,
	};
}

describe("S89 provision — determinism", () => {
	it("is reproducible: same spec → byte-identical id + ddl", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom("proj-a", "proj-b", "proj-c"),
				fc.boolean(),
				async (pid, vec) => {
					const spec = baseSpec({ projectId: pid, needsVector: vec });
					const a = await buildPlan(spec);
					const b = await buildPlan(spec);
					expect(a.ok && b.ok).toBe(true);
					expect(a.plan?.id).toBe(b.plan?.id);
					expect(a.plan?.ddl).toBe(b.plan?.ddl);
				},
			),
			{ numRuns: 30 },
		);
	});

	it("default is plain-postgres (empty target resolves to it); pgvector iff needsVector", async () => {
		await fc.assert(
			fc.asyncProperty(fc.boolean(), fc.boolean(), async (empty, vec) => {
				const r = await buildPlan(
					baseSpec({ target: empty ? "" : "plain-postgres", needsVector: vec }),
				);
				expect(r.ok).toBe(true);
				expect(r.plan?.target).toBe("plain-postgres");
				expect(r.plan?.supportsAsOf).toBe(false);
				expect(r.plan?.sidecars.length).toBe(vec ? 1 : 0);
			}),
			{ numRuns: 30 },
		);
	});
});

describe("S89 provision — the doltgres opt-in gate", () => {
	it("refuses doltgres under a no-go Decision", async () => {
		const r = await buildPlan(
			baseSpec({ target: "doltgres", decision: NO_GO_DECISION }),
		);
		expect(r.ok).toBe(false);
		expect(r.blockCode).toBe("OUT_OF_SCOPE");
	});

	it("allows doltgres under a Go Decision and supports `as of`; default stays plain-postgres always", async () => {
		const r = await buildPlan(baseSpec({ target: "doltgres" }));
		expect(r.ok).toBe(true);
		expect(r.plan?.target).toBe("doltgres");
		expect(r.plan?.supportsAsOf).toBe(true);
		// The S88 Decision's default is plain-postgres regardless.
		expect(SAMPLE_GO_DECISION.defaultTarget).toBe("plain-postgres");
	});
});

describe("S89 provision — per-project isolation", () => {
	it("distinct projects → distinct databases; same project is stable", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.stringMatching(/^[a-z]{3,8}$/),
				fc.stringMatching(/^[a-z]{3,8}$/),
				async (a, b) => {
					const pa = await buildPlan(baseSpec({ projectId: a }));
					const pb = await buildPlan(baseSpec({ projectId: b }));
					if (a === b) {
						expect(pa.plan?.database).toBe(pb.plan?.database);
					} else {
						expect(pa.plan?.database).not.toBe(pb.plan?.database);
						expect(pa.plan?.namespace).not.toBe(pb.plan?.namespace);
					}
				},
			),
			{ numRuns: 30 },
		);
	});
});

describe("S89 provision — the migration human-gate", () => {
	it("refuses a historical-impact migration without a declared DataTruthScope", async () => {
		const r = await buildPlan(
			baseSpec({
				change: {
					entity: "Order",
					appliesTo: ["existing_records"],
					migrationDeclared: false,
				},
			}),
		);
		expect(r.ok).toBe(false);
		expect(r.blockCode).toBe("HISTORICAL_IMPACT_REQUIRES_MIGRATION");
	});

	it("allows a historical-impact migration WITH a declared DataTruthScope", async () => {
		const r = await buildPlan(
			baseSpec({
				change: {
					entity: "Order",
					appliesTo: ["existing_records"],
					migrationDeclared: true,
				},
			}),
		);
		expect(r.ok).toBe(true);
		expect(r.plan?.migrationRequired).toBe(true);
	});

	it("a new-records-only change needs no migration", async () => {
		const entities: Entity[] = [SAMPLE_ENTITY];
		const r = await buildPlan(
			baseSpec({
				entities,
				change: {
					entity: "Order",
					appliesTo: ["new_records"],
					migrationDeclared: false,
				},
			}),
		);
		expect(r.ok).toBe(true);
		expect(r.plan?.migrationRequired).toBe(false);
	});
});
