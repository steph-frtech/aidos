/**
 * db-projection.test.ts — the fast-check reproducibility mirror pinning the TS twin to
 * the Go db-projection emitter (back/gen/db). The twin's emitted bytes, when hashed
 * (SHA-256 hex, the S02 content address), MUST equal the authoritative Go output hashes;
 * requireMigration MUST agree with the Go guard on every case. test_kind=property,
 * cert_language=fast-check, authority=below (computational).
 */

import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AppliesTo,
	emitMigration,
	GO_CREATE_OUTPUT_HASH,
	GO_CREATE_SOURCE_HASH,
	GO_EXPAND_OUTPUT_HASH,
	GO_NARROW_OUTPUT_HASH,
	GO_NARROW_SOURCE_HASH,
	requireMigration,
	STRATEGIES,
} from "./db-projection";
import {
	DECLARED_SCOPE,
	HISTORICAL_CHANGE,
	NEW_ONLY_CHANGE,
	ORDER_NARROWED,
	ORDER_NEW,
	ORDER_PRIOR,
} from "./db-projection-data";

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

describe("EmitMigration twin is byte-identical to the Go emitter (the cross-language anchor)", () => {
	it("CREATE migration (no prior) hashes to the Go output hash", () => {
		const a = emitMigration(ORDER_NEW, undefined, GO_CREATE_SOURCE_HASH);
		expect(a.shape).toBe("create");
		expect(sha256(a.bytes)).toBe(GO_CREATE_OUTPUT_HASH);
		expect(a.bytes).toContain("CREATE TABLE");
	});

	it("EXPAND migration (additive + coupon) hashes to the Go output hash", () => {
		const a = emitMigration(ORDER_NEW, ORDER_PRIOR, GO_CREATE_SOURCE_HASH);
		expect(a.shape).toBe("expand");
		expect(sha256(a.bytes)).toBe(GO_EXPAND_OUTPUT_HASH);
		expect(a.bytes).toContain('ADD COLUMN IF NOT EXISTS "coupon"');
		expect(a.bytes).not.toContain("DROP COLUMN");
	});

	it("EXPAND→BACKFILL→CONTRACT migration (drop discount) hashes to the Go output hash", () => {
		const a = emitMigration(ORDER_NARROWED, ORDER_PRIOR, GO_NARROW_SOURCE_HASH);
		expect(a.shape).toBe("expand_contract");
		expect(sha256(a.bytes)).toBe(GO_NARROW_OUTPUT_HASH);
		for (const stage of ["EXPAND", "BACKFILL", "CONTRACT"]) {
			expect(a.bytes).toContain(stage);
		}
	});

	it("re-emit is byte-identical (determinism)", () => {
		const a = emitMigration(ORDER_NEW, ORDER_PRIOR, GO_CREATE_SOURCE_HASH);
		const b = emitMigration(ORDER_NEW, ORDER_PRIOR, GO_CREATE_SOURCE_HASH);
		expect(a.bytes).toBe(b.bytes);
	});
});

describe("RequireMigration twin matches the Go §44.3 guard", () => {
	it("a historical-impact change with no scope is BLOCKED", () => {
		const r = requireMigration(HISTORICAL_CHANGE);
		expect(r.required).toBe(true);
		expect(r.block?.code).toBe("HISTORICAL_IMPACT_REQUIRES_MIGRATION");
		expect(r.block?.how_to_fix.length).toBeGreaterThan(0);
	});

	it("a declared DataTruthScope unblocks the historical-impact change", () => {
		const r = requireMigration({ ...HISTORICAL_CHANGE, scope: DECLARED_SCOPE });
		expect(r.required).toBe(true);
		expect(r.block).toBeUndefined();
	});

	it("a new-records-only change needs no historical migration", () => {
		const r = requireMigration(NEW_ONLY_CHANGE);
		expect(r.required).toBe(false);
		expect(r.block).toBeUndefined();
	});

	it("∀ unknown strategy ⇒ Blocked(UNKNOWN_MIGRATION_STRATEGY)", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 3, maxLength: 10 }), (s) => {
				if ((STRATEGIES as readonly string[]).includes(s)) return;
				const r = requireMigration({
					change_type: "override",
					entity: "Order",
					applies_to: ["existing_records"],
					scope: {
						applies_to: ["existing_records"],
						migration: { required: true, strategy: s },
						audit: { preserve_old_truth: true },
					},
				});
				expect(r.block?.code).toBe("UNKNOWN_MIGRATION_STRATEGY");
			}),
		);
	});

	it("∀ applies_to set touching historical ∧ no scope ⇒ Blocked", () => {
		const hist: AppliesTo[] = ["existing_records", "historical_records"];
		fc.assert(
			fc.property(fc.subarray(hist, { minLength: 1 }), (set) => {
				const r = requireMigration({
					change_type: "override",
					entity: "Order",
					applies_to: set,
				});
				expect(r.required).toBe(true);
				expect(r.block?.code).toBe("HISTORICAL_IMPACT_REQUIRES_MIGRATION");
			}),
		);
	});
});
