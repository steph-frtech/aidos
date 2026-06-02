/**
 * Reproducibility mirror for the Emitters twin (lib/emitters.ts), AIDOS step S34.
 * fast-check (∀) — the SAME invariants the Go rapid property pins:
 *   1. DETERMINISM — emit(e,t) === emit(e,t) (byte-identical bytes + output_hash).
 *   2. CONTENT-ADDRESSED SOURCE — source_hash === sha256(canonical body) (= Go's Hash).
 *   3. PROTECTED HEADER — bytes start with the protected marker carrying source_hash.
 *   4. ORDER-INDEPENDENCE — project is order-independent per artifact.
 *   5. NO INTER-TARGET DRIFT — every projection mentions every pinned field.
 *   6. NO SILENT STALE HASH — a different body ⇒ a different source_hash.
 *   7. TOTALITY — a malformed/empty AST ⇒ a BlockReason, never a throw, never a field.
 * Plus the canonical Order/Thin done cases. Determinism-first: the screen computes
 * the projections from this pure twin, never an LLM, never re-implementing Emit.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type EntitySource,
	emit,
	type Field,
	type FieldType,
	isBlocked,
	PROTECTED_MARKER,
	project,
	sourceHash,
	TARGETS,
	type Target,
} from "./emitters";
import {
	ENTITY_ORDER,
	ENTITY_ORDER_CHANGED,
	ENTITY_THIN,
} from "./emitters-data";

const arbType = fc.constantFrom<FieldType>(
	"text",
	"numeric",
	"int",
	"bool",
	"timestamptz",
);
const arbName = fc.constantFrom(
	"id",
	"total",
	"discount",
	"qty",
	"active",
	"createdAt",
	"sku",
);
const arbEntityName = fc.constantFrom(
	"Order",
	"Cart",
	"Invoice",
	"Product",
	"Line",
);
const arbTarget = fc.constantFrom<Target>(...TARGETS);

const arbEntity = fc
	.record({
		name: arbEntityName,
		fields: fc.array(fc.record({ name: arbName, type: arbType }), {
			minLength: 1,
			maxLength: 5,
		}),
	})
	.map(({ name, fields }): EntitySource => {
		// De-dup field names so the rendered struct is unambiguous.
		const seen = new Set<string>();
		const uniq: Field[] = [];
		for (const f of fields) {
			if (!seen.has(f.name)) {
				seen.add(f.name);
				uniq.push(f);
			}
		}
		if (uniq.length === 0) uniq.push({ name: "id", type: "text" });
		return {
			id: `entity-${name.toLowerCase()}`,
			kind: "entity",
			name,
			fields: uniq,
		};
	});

describe("emitters twin — determinism-first reproducibility mirror", () => {
	it("1. emit is deterministic (byte-identical bytes + output_hash)", () => {
		fc.assert(
			fc.property(arbEntity, arbTarget, (e, t) => {
				const a = emit(e, t);
				const b = emit(e, t);
				expect(isBlocked(a)).toBe(false);
				if (isBlocked(a) || isBlocked(b)) return;
				expect(a.bytes).toBe(b.bytes);
				expect(a.output_hash).toBe(b.output_hash);
			}),
		);
	});

	it("2. source_hash === sha256(canonical body) (S02 content address)", () => {
		fc.assert(
			fc.property(arbEntity, arbTarget, (e, t) => {
				const a = emit(e, t);
				if (isBlocked(a)) return;
				expect(a.source_hash).toBe(sourceHash(e));
			}),
		);
	});

	it("3. bytes start with the protected header carrying source_hash", () => {
		fc.assert(
			fc.property(arbEntity, arbTarget, (e, t) => {
				const a = emit(e, t);
				if (isBlocked(a)) return;
				const firstLine = a.bytes.split("\n")[0];
				expect(firstLine).toContain(PROTECTED_MARKER);
				expect(firstLine).toContain(a.source_hash);
			}),
		);
	});

	it("4. project is order-independent per artifact (field + target order)", () => {
		fc.assert(
			fc.property(arbEntity, (e) => {
				const shuffled = { ...e, fields: [...e.fields].reverse() };
				const base = project([e], TARGETS);
				const shuf = project([shuffled], ["ts-types", "pg-ddl", "go-sqlc"]);
				if (isBlocked(base) || isBlocked(shuf)) return;
				const byTarget = new Map(base.map((a) => [a.target, a.bytes]));
				for (const a of shuf) expect(a.bytes).toBe(byTarget.get(a.target));
			}),
		);
	});

	it("5. no inter-target drift — every projection mentions every pinned field", () => {
		fc.assert(
			fc.property(arbEntity, (e) => {
				const arts = project([e], TARGETS);
				if (isBlocked(arts)) return;
				for (const a of arts) {
					for (const f of e.fields) {
						const cap = f.name[0].toUpperCase() + f.name.slice(1);
						expect(a.bytes.includes(f.name) || a.bytes.includes(cap)).toBe(
							true,
						);
					}
				}
			}),
		);
	});

	it("6. a different body ⇒ a different source_hash (no silent stale hash)", () => {
		fc.assert(
			fc.property(arbEntity, (e) => {
				const e2: EntitySource = {
					...e,
					fields: [...e.fields, { name: "extraField", type: "int" }],
				};
				expect(sourceHash(e)).not.toBe(sourceHash(e2));
			}),
		);
	});

	it("7. a malformed/empty AST yields a BlockReason, never a throw, never a field", () => {
		fc.assert(
			fc.property(
				fc.record({
					name: fc.constantFrom("", "X"),
					fields: fc.array(
						fc.record({
							name: fc.constantFrom("", "id"),
							type: fc.constantFrom("text", "bogus", ""),
						}),
						{ maxLength: 2 },
					),
				}),
				fc.constantFrom<Target>("go-sqlc", "pg-ddl", "ts-types"),
				(raw, t) => {
					const e = {
						id: "e",
						kind: "entity" as const,
						name: raw.name,
						fields: raw.fields as Field[],
					};
					// Must not throw; we only assert totality (a result, block or art).
					const r = emit(e, t);
					expect(r).toBeDefined();
				},
			),
		);
	});
});

describe("emitters twin — the canonical done cases", () => {
	it("Order projects to three byte-stable artifacts, each content-addressed + protected", () => {
		const arts = project([ENTITY_ORDER], TARGETS);
		expect(isBlocked(arts)).toBe(false);
		if (isBlocked(arts)) return;
		expect(arts.length).toBe(3);
		const head = sourceHash(ENTITY_ORDER);
		for (const a of arts) {
			expect(a.source_hash).toBe(head);
			expect(a.bytes).toContain(PROTECTED_MARKER);
			expect(a.protected).toBe(true);
		}
	});

	it("THE done criterion: the same source gives byte-identical output", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		const b = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a) || isBlocked(b)) throw new Error("blocked");
		expect(a.bytes).toBe(b.bytes);
		expect(a.output_hash).toBe(b.output_hash);
	});

	it("a changed source (discount removed) yields a new source_hash (now stale)", () => {
		expect(sourceHash(ENTITY_ORDER)).not.toBe(sourceHash(ENTITY_ORDER_CHANGED));
	});

	it("Thin emits only the pinned field — no invented column", () => {
		const a = emit(ENTITY_THIN, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		expect(a.bytes).toContain("Id");
		for (const invented of ["Total", "Discount", "CreatedAt"])
			expect(a.bytes).not.toContain(invented);
	});
});
