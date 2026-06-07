/**
 * lib/project.test.ts — the vitest + fast-check reproducibility mirror of the S53
 * TypeScript twin (lib/project.ts). It re-proves, on the front, the SAME invariants
 * the Go rapid property proves: content-addressing (id == Hash(canonicalBody) and
 * idempotent), slug-unique-per-owner, disjoint project scoping (no cross-read), and
 * scope as a pure function. determinism-first: the twin is pure and total — same
 * input → same output.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canCreate,
	canonicalBody,
	contentAddress,
	isValidSlug,
	type Lifecycle,
	newProject,
	scope,
} from "./project";

const slugArb = fc
	.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
		minLength: 1,
		maxLength: 10,
	})
	.map((cs) => cs.join(""));

const nameArb = fc.string({ minLength: 1, maxLength: 20 });
const ownerArb = fc.constantFrom("owner-1", "owner-2", "owner-3");
const tsArb = fc.constant("2026-06-07T09:00:00Z");

describe("project content-addressing", () => {
	it("id == Hash(canonicalBody) and is reproducible", () => {
		fc.assert(
			fc.property(
				slugArb,
				nameArb,
				ownerArb,
				tsArb,
				(slug, name, owner, ts) => {
					const p = newProject(slug, name, owner, ts);
					expect(p.id).toBe(
						contentAddress({
							slug,
							name,
							ownerRef: owner,
							createdAt: ts,
							lifecycle: "active",
						}),
					);
					// Reproducible: a second identical build hashes to the same id.
					expect(newProject(slug, name, owner, ts).id).toBe(p.id);
				},
			),
		);
	});

	it("canonical body sorts keys with kind=project", () => {
		const b = canonicalBody({
			slug: "alpha",
			name: "Alpha Shop",
			ownerRef: "owner-1",
			createdAt: "2026-06-07T09:00:00Z",
			lifecycle: "active",
		});
		expect(b).toBe(
			'{"created_at":"2026-06-07T09:00:00Z","kind":"project","lifecycle":"active","name":"Alpha Shop","owner_ref":"owner-1","slug":"alpha"}',
		);
		// Pinned id from the Go twin (verified byte-identical).
		expect(
			contentAddress({
				slug: "alpha",
				name: "Alpha Shop",
				ownerRef: "owner-1",
				createdAt: "2026-06-07T09:00:00Z",
				lifecycle: "active",
			}),
		).toBe("7b420a8594fc0de06da5f7f6dc4ede12e837219fc50e9faa25ac0bd1359310ec");
	});

	it("validates slugs", () => {
		expect(isValidSlug("good-slug")).toBe(true);
		expect(isValidSlug("Bad_Slug")).toBe(false);
		expect(isValidSlug("-lead")).toBe(false);
		expect(isValidSlug("trail-")).toBe(false);
		expect(isValidSlug("")).toBe(false);
	});
});

describe("slug unique per owner", () => {
	it("blocks duplicate owner+slug, allows same slug other owner", () => {
		const first = newProject("shop", "Shop", "owner-1", "2026-06-07T09:00:00Z");
		expect(canCreate([first], "owner-1", "shop")).toBe(false);
		expect(canCreate([first], "owner-2", "shop")).toBe(true);
	});
	it("soft-deleted frees its slug; archived holds it", () => {
		const archived = newProject("shop", "Shop", "owner-1", "t", "archived");
		expect(canCreate([archived], "owner-1", "shop")).toBe(false);
		const deleted = newProject("shop", "Shop", "owner-1", "t", "deleted");
		expect(canCreate([deleted], "owner-1", "shop")).toBe(true);
	});
});

describe("scope is pure and disjoint", () => {
	const rowArb = fc.record({
		projectId: fc.constantFrom("A", "B"),
		tag: fc.integer(),
	});
	it("two disjoint graphs never cross-read", () => {
		fc.assert(
			fc.property(fc.array(rowArb, { maxLength: 12 }), (rows) => {
				const ga = scope("A", rows);
				const gb = scope("B", rows);
				expect(ga.every((r) => r.projectId === "A")).toBe(true);
				expect(gb.every((r) => r.projectId === "B")).toBe(true);
				expect(ga.length + gb.length).toBe(rows.length);
			}),
		);
	});
	it("scope is pure", () => {
		fc.assert(
			fc.property(fc.array(rowArb, { maxLength: 10 }), (rows) => {
				expect(scope("A", rows)).toEqual(scope("A", rows));
			}),
		);
	});
});

describe("lifecycle closed set", () => {
	it("only active|archived|deleted", () => {
		const ls: Lifecycle[] = ["active", "archived", "deleted"];
		for (const lc of ls) {
			const p = newProject("s", "n", "owner-1", "t", lc);
			expect(p.lifecycle).toBe(lc);
		}
	});
});
