/**
 * Reproducibility mirror for the relation-emitter twin (S74) — the TS side of the
 * S74 property mirror (back/kernel/entities/relemit/relemit_property_test.go), pinned with
 * Vitest + fast-check. Same schema ⇒ byte-identical output (determinism); emission is
 * invariant to input order; a N-N emits a join table; every FK references a real declared
 * table; an async node emits an outbox + a worker. The Go output is AUTHORITATIVE — these
 * tests assert the twin reproduces the same relation-aware structure deterministically.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_SCHEMA,
	emitDDL,
	emitTS,
	emitWorker,
	isBlocked,
	type Schema,
} from "./relation-emitter";

describe("relation-emitter twin (S74)", () => {
	it("emits a join table for an N-N relation", () => {
		const ddl = emitDDL(DEMO_SCHEMA);
		expect(isBlocked(ddl)).toBe(false);
		expect(ddl as string).toContain('CREATE TABLE "book_tags"');
		expect(ddl as string).toContain('PRIMARY KEY ("book_id", "tag_id")');
	});

	it("every FK references a real declared table", () => {
		const ddl = emitDDL(DEMO_SCHEMA) as string;
		const declared = new Set<string>();
		for (const line of ddl.split("\n")) {
			const m = line.match(/^CREATE TABLE "([^"]+)"/);
			if (m) declared.add(m[1]);
		}
		for (const line of ddl.split("\n")) {
			const m = line.match(/REFERENCES "([^"]+)"/);
			if (m) expect(declared.has(m[1])).toBe(true);
		}
	});

	it("emits a worker + outbox for an async node, none for a sync schema", () => {
		const ddl = emitDDL(DEMO_SCHEMA) as string;
		expect(ddl).toContain('CREATE TABLE "outbox"');
		const worker = emitWorker(DEMO_SCHEMA);
		expect(isBlocked(worker)).toBe(false);
		expect(worker as string).toContain("dispatchSendReminder");

		const sync: Schema = { ...DEMO_SCHEMA, asyncOps: [] };
		expect(emitDDL(sync) as string).not.toContain('CREATE TABLE "outbox"');
		expect(isBlocked(emitWorker(sync))).toBe(true);
	});

	it("emits typed associations + a navigation SDK", () => {
		const ts = emitTS(DEMO_SCHEMA) as string;
		expect(ts).toContain("export type Book = {");
		expect(ts).toContain("author?: Author;");
		expect(ts).toContain("tags?: Tag[];");
		expect(ts).toContain(
			"export async function loadBookAuthor(owner: Book): Promise<Author | undefined>;",
		);
		expect(ts).toContain(
			"export async function loadBookTags(owner: Book): Promise<Tag[]>;",
		);
	});

	it("is deterministic: same schema ⇒ byte-identical output", () => {
		expect(emitDDL(DEMO_SCHEMA)).toEqual(emitDDL(DEMO_SCHEMA));
		expect(emitTS(DEMO_SCHEMA)).toEqual(emitTS(DEMO_SCHEMA));
		expect(emitWorker(DEMO_SCHEMA)).toEqual(emitWorker(DEMO_SCHEMA));
	});

	it("is invariant to input entity order (property)", () => {
		fc.assert(
			fc.property(
				fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
				(perm) => {
					const shuffled: Schema = {
						...DEMO_SCHEMA,
						entities: perm.map((i) => DEMO_SCHEMA.entities[i]),
					};
					expect(emitDDL(shuffled)).toEqual(emitDDL(DEMO_SCHEMA));
					expect(emitTS(shuffled)).toEqual(emitTS(DEMO_SCHEMA));
				},
			),
		);
	});

	it("refuses an unknown relation target (no guessed FK)", () => {
		const bad: Schema = JSON.parse(JSON.stringify(DEMO_SCHEMA));
		const rel = bad.entities[1]?.relations?.[0];
		if (rel) rel.target = "ghost";
		const out = emitDDL(bad);
		expect(isBlocked(out)).toBe(true);
		if (isBlocked(out)) expect(out.how_to_fix.length).toBeGreaterThan(0);
	});
});
