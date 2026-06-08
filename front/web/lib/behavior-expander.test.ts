import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expand } from "./behavior";
import {
	type BehaviorRecord,
	catalogue,
	DEMO_RECORD,
	propose,
	recordId,
	validateRecord,
} from "./behavior-expander";

// S76 front twin — the behavior RECORD + PROPOSE mirror. The done-criteria: same behavior+entity →
// identical, idempotent expansion (proven in lib/behavior.test.ts and compound.test.ts via the ONE
// expander) ; the expansion is a PROPOSED DRAFT changeset, never an applied truth ; one authoritative
// source. These tests pin S76's added surface: record validation, content address, and propose=DRAFT.

const okRecord = (over: Partial<BehaviorRecord> = {}): BehaviorRecord => ({
	kind: "ownable",
	owner: "alice",
	version: 1,
	tags: ["scoping"],
	labels: { fr: "propriété", en: "ownership" },
	...over,
});

describe("catalogue", () => {
	it("is the canonical order", () => {
		expect(catalogue()).toEqual(["ownable", "soft-deletable", "auditable"]);
	});
});

describe("validateRecord — the four §24.6 clauses", () => {
	it("accepts a well-formed record", () => {
		expect(validateRecord(okRecord())).toBeNull();
	});
	it("rejects an unknown kind", () => {
		expect(
			validateRecord(okRecord({ kind: "telepathic" as never })),
		).not.toBeNull();
	});
	it("rejects a missing owner (ownable)", () => {
		expect(validateRecord(okRecord({ owner: "" }))).not.toBeNull();
	});
	it("rejects version < 1 (versioned)", () => {
		expect(validateRecord(okRecord({ version: 0 }))).not.toBeNull();
	});
	it("rejects a missing FR label (localizable)", () => {
		expect(validateRecord(okRecord({ labels: { en: "x" } }))).not.toBeNull();
	});
});

describe("recordId — deterministic content address", () => {
	it("is stable and tag-order-invariant", () => {
		const a = recordId(okRecord({ tags: ["a", "b"] }));
		const b = recordId(okRecord({ tags: ["b", "a", "a"] }));
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("propose — the expansion is a PROPOSED DRAFT changeset, never applied", () => {
	it("opens a DRAFT carrying the ONE expansion", () => {
		const p = propose(DEMO_RECORD, "Order", "phase-0");
		expect(p.ok).toBe(true);
		expect(p.changeset?.status).toBe("DRAFT");
		// THE WALL: a DRAFT view never carries an applied stamp.
		expect(
			(p.changeset as unknown as { applied_at?: unknown })?.applied_at,
		).toBeUndefined();
		expect(p.changeset?.spec_delta).toBeDefined();
		expect(p.changeset?.mirror_delta).toBeDefined();
		// The carried expansion is byte-identical to a direct expand call (single-function law).
		expect(p.expansion?.expansionId).toBe(
			expand({ behavior: "ownable", entity: "Order" }).expansionId,
		);
		expect(p.expansion?.wroteKernel).toBe(false);
	});
	it("refuses an invalid record", () => {
		const p = propose(okRecord({ owner: "" }), "Order", "phase-0");
		expect(p.ok).toBe(false);
		expect(p.error).toBeTruthy();
	});
	it("is deterministic (same record+entity → same DRAFT)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...catalogue()),
				fc.string({ minLength: 1, maxLength: 8 }),
				(kind, entity) => {
					const r = okRecord({ kind });
					const p1 = propose(r, entity || "E", "phase-0");
					const p2 = propose(r, entity || "E", "phase-0");
					expect(p1.changeset?.spec_delta.body).toBe(
						p2.changeset?.spec_delta.body,
					);
					expect(p1.record_id).toBe(p2.record_id);
					expect(p1.changeset?.status).toBe("DRAFT");
				},
			),
		);
	});
});
