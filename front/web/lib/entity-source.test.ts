/**
 * Reproducibility mirror for the entity-source twin (AIDOS step S35, front plane).
 * fast-check ∀ invariants — the TS twin of back/kernel/entities' rapid property test.
 * cert_language=fast-check, authority=below (computational — means-tests).
 *
 * Invariants: (1) DETERMINISM, (2) CONTENT-ADDRESSED source, (3) PROTECTED header,
 * (4) NO ADD/DROP/RENAME + ORDER preserved, (5) required⇔NOT NULL⇔TS non-optional,
 * (6) exactly one PRIMARY KEY on the identifier, (7) unknown type ⇒ BlockReason,
 * plus the worked-example byte-parity anchor (Order id matches the Go content hash).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Attribute,
	attributeSet,
	type Entity,
	emit,
	entityId,
	isBlocked,
	PROTECTED_MARKER,
	project,
	SCALAR_TYPES,
	type ScalarType,
	TARGETS,
} from "./entity-source";
import { ENTITY_ORDER } from "./entity-source-data";

const arbType = fc.constantFrom<ScalarType>(...SCALAR_TYPES);

const arbEntity = (): fc.Arbitrary<Entity> =>
	fc
		.record({
			name: fc
				.string({ minLength: 1, maxLength: 8 })
				.map((s) => `E${s.replace(/[^A-Za-z0-9]/g, "")}`),
			attrs: fc.uniqueArray(
				fc
					.string({ minLength: 1, maxLength: 8 })
					.map((s) => `a${s.replace(/[^a-z0-9_]/g, "")}`),
				{ minLength: 1, maxLength: 6 },
			),
		})
		.chain(({ name, attrs }) =>
			fc
				.record({
					idIdx: fc.integer({ min: -1, max: attrs.length - 1 }),
					types: fc.array(arbType, {
						minLength: attrs.length,
						maxLength: attrs.length,
					}),
					reqs: fc.array(fc.boolean(), {
						minLength: attrs.length,
						maxLength: attrs.length,
					}),
				})
				.map(({ idIdx, types, reqs }): Entity => {
					const attributes: Attribute[] = attrs.map((an, i) => ({
						name: an,
						type: types[i] ?? "string",
						required: reqs[i] ?? false,
						identifier: i === idIdx,
					}));
					return { name, attributes };
				}),
		);

const lineWith = (src: string, prefix: string): string =>
	src
		.split("\n")
		.find(
			(l) => (l.startsWith("\t") || l.startsWith("    ")) && l.includes(prefix),
		) ?? "";

describe("entity-source twin — reproducibility mirror", () => {
	it("1. is deterministic (byte-identical re-emit)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				for (const t of TARGETS) {
					const a = emit(e, t);
					const b = emit(e, t);
					expect(a).toEqual(b);
				}
			}),
		);
	});

	it("2. is content-addressed (id stable; reorder ⇒ new id)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				expect(entityId(e)).toEqual(entityId(e));
				if (e.attributes.length > 1) {
					const rev: Entity = {
						name: e.name,
						attributes: [...e.attributes].reverse(),
					};
					expect(entityId(rev)).not.toEqual(entityId(e));
				}
			}),
		);
	});

	it("3. every projection carries the protected header + source hash", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const arts = project(e, TARGETS);
				if (isBlocked(arts)) return;
				for (const a of arts) {
					expect(a.bytes).toContain(PROTECTED_MARKER);
					expect(a.bytes).toContain(`source: ${a.source_hash}`);
					expect(a.source_hash).toEqual(entityId(e));
				}
			}),
		);
	});

	it("4. no add/drop/rename + source order preserved", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const arts = project(e, TARGETS);
				if (isBlocked(arts)) return;
				const ddl = arts.find((a) => a.target === "pg-ddl");
				if (!ddl) throw new Error("no ddl");
				const cols = ddl.bytes
					.split("\n")
					.filter((l) => l.startsWith('    "')).length;
				expect(cols).toEqual(e.attributes.length);
				// order preserved in DDL columns
				const set = attributeSet(e);
				let last = 0;
				for (const n of set) {
					const idx = ddl.bytes.indexOf(`"${n}"`, last);
					expect(idx).toBeGreaterThanOrEqual(0);
					last = idx + n.length;
				}
			}),
		);
	});

	it("5. required ⇔ NOT NULL ⇔ TS non-optional", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const arts = project(e, TARGETS);
				if (isBlocked(arts)) return;
				const ts = arts.find((a) => a.target === "ts-types")?.bytes ?? "";
				const ddl = arts.find((a) => a.target === "pg-ddl")?.bytes ?? "";
				for (const a of e.attributes) {
					const optional = lineWith(ts, `\t${a.name}?:`) !== "";
					expect(a.required).toEqual(!optional);
					const notNull = lineWith(ddl, `"${a.name}"`).includes("NOT NULL");
					expect(a.required).toEqual(notNull);
				}
			}),
		);
	});

	it("6. exactly one PRIMARY KEY on the identifier", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const arts = project(e, TARGETS);
				if (isBlocked(arts)) return;
				const ddl = arts.find((a) => a.target === "pg-ddl")?.bytes ?? "";
				const pkCount = (ddl.match(/PRIMARY KEY/g) ?? []).length;
				const id = e.attributes.find((a) => a.identifier);
				if (id) {
					expect(pkCount).toEqual(1);
					expect(lineWith(ddl, `"${id.name}"`)).toContain("PRIMARY KEY");
				} else {
					expect(pkCount).toEqual(0);
				}
			}),
		);
	});

	it("7. an unknown attribute type is blocked, never guessed", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const bad: Entity = {
					name: e.name,
					attributes: [
						...e.attributes,
						{ name: "x_unknown", type: "Nope" as ScalarType, required: true },
					],
				};
				for (const t of TARGETS) {
					const a = emit(bad, t);
					expect(isBlocked(a)).toBe(true);
					if (isBlocked(a)) expect(a.how_to_fix.length).toBeGreaterThan(0);
				}
			}),
		);
	});

	it("anchors on the Order worked example (content hash == the Go emitter's)", () => {
		expect(entityId(ENTITY_ORDER)).toEqual(
			"5f39ec7883593f4566d7d1116013315b565781ac4436338321afdd2d4bc59086",
		);
		const arts = project(ENTITY_ORDER, TARGETS);
		expect(isBlocked(arts)).toBe(false);
		if (!isBlocked(arts)) {
			expect(arts).toHaveLength(3);
			const ddl = arts.find((a) => a.target === "pg-ddl")?.bytes ?? "";
			expect(ddl).toContain('"id" BIGINT PRIMARY KEY NOT NULL');
			expect(ddl).toContain('"discount" NUMERIC,');
		}
	});
});
