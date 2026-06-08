import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	add,
	type BehaviorRecord,
	browse,
	comment,
	DEMO_RECORD,
	type Library,
	landAttach,
	newLibrary,
	previewAttach,
	publish,
	recordId,
	search,
	softDelete,
	tag,
} from "./behaviors";

// S79 front twin — the USER-FACING behavior LIBRARY mirror. The done-criterion: attaching
// owner-scoping previews scoped policies+fixtures and lands via an APPROVED changeset. These tests
// pin the seven project-scoped gestures + the search-determinism reproducibility invariant.

const ownable: BehaviorRecord = DEMO_RECORD;
const softdel: BehaviorRecord = {
	kind: "soft-deletable",
	owner: "bob",
	version: 1,
	labels: { fr: "Archivable", en: "Soft-deletable" },
};

function libWithBoth(): { lib: Library; ownId: string } {
	const lib = newLibrary("proj-shop");
	const [l1, ownId] = add(lib, ownable);
	const [l2] = add(l1, softdel);
	return { lib: l2, ownId };
}

describe("S79 behavior library — done-criterion", () => {
	it("attaching owner-scoping previews scoped policies+fixtures and lands via an approved changeset", () => {
		const { lib, ownId } = libWithBoth();
		const landed = landAttach(
			lib,
			ownId,
			"Order",
			"phase-0",
			"2026-06-08T12:00:00Z",
		);
		expect(landed.ok).toBe(true);
		// preview shows the scoped owner-scoping policy.
		const policies = landed.preview?.expansion?.policies ?? [];
		expect(policies).toHaveLength(1);
		expect(policies[0].name).toBe("owner-scoping");
		expect(policies[0].scope).toBe("OPERATION");
		// preview shows the scoped fixtures.
		const fixtures = landed.preview?.expansion?.fixtures ?? [];
		expect(fixtures.map((f) => f.name).sort()).toEqual([
			"non-owner-mutation-denied",
			"owner-only-mutation-allowed",
		]);
		// preview wrote nothing (the wall).
		expect(landed.preview?.expansion?.wroteKernel).toBe(false);
		// landed via an APPROVED (APPLIED) changeset.
		expect(landed.applied?.status).toBe("APPLIED");
		expect(landed.applied?.applied_at).toBe("2026-06-08T12:00:00Z");
		expect(landed.applied?.spec_delta.target).toBe("behavior-expansion@Order");
		expect(landed.applied?.mirror_delta).toBeDefined();
	});
});

describe("S79 behavior library — gestures", () => {
	it("browse lists live entries in canonical order", () => {
		const { lib } = libWithBoth();
		const live = browse(lib);
		expect(live).toHaveLength(2);
		expect(live[0].record.kind).toBe("ownable");
		expect(live[1].record.kind).toBe("soft-deletable");
	});

	it("search is deterministic and project-scoped (no false positive)", () => {
		const { lib } = libWithBoth();
		expect(search(lib, "alice")).toHaveLength(1);
		expect(search(lib, "scoping")).toHaveLength(1);
		expect(search(lib, "zzz-nothing")).toHaveLength(0);
		expect(search(lib, "")).toHaveLength(2);
	});

	it("tag re-keys and the tag becomes searchable", () => {
		const { lib, ownId } = libWithBoth();
		const res = tag(lib, ownId, "audited");
		expect(Array.isArray(res)).toBe(true);
		if (!Array.isArray(res)) return;
		const [tagged, newId] = res;
		expect(newId).not.toBe(ownId);
		expect(search(tagged, "audited")).toHaveLength(1);
	});

	it("publish sets the flag", () => {
		const { lib, ownId } = libWithBoth();
		const pub = publish(lib, ownId);
		expect("entries" in pub && pub.entries[ownId].published).toBe(true);
	});

	it("soft-delete hides from browse but keeps it in the trash view", () => {
		const { lib, ownId } = libWithBoth();
		const del = softDelete(lib, ownId);
		if (!("entries" in del)) throw new Error("expected library");
		expect(browse(del, false)).toHaveLength(1);
		expect(browse(del, true)).toHaveLength(2);
	});

	it("comment is append-only", () => {
		const { lib, ownId } = libWithBoth();
		const c = comment(lib, ownId, "carol", "réutilisé", "2026-06-08T09:00:00Z");
		if (!("entries" in c)) throw new Error("expected library");
		expect(c.entries[ownId].comments).toHaveLength(1);
		expect(c.entries[ownId].comments[0].author).toBe("carol");
	});

	it("a gesture on a missing record is a typed error", () => {
		const { lib } = libWithBoth();
		const res = publish(lib, "nope");
		expect("error" in res).toBe(true);
	});

	it("preview attach writes nothing (DRAFT)", () => {
		const { lib, ownId } = libWithBoth();
		const prev = previewAttach(lib, ownId, "Order", "phase-0");
		expect(prev.ok).toBe(true);
		expect(prev.changeset?.status).toBe("DRAFT");
	});
});

describe("S79 search — reproducibility invariant", () => {
	it("same library + query → byte-identical ordered hits", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						kind: fc.constantFrom("ownable", "soft-deletable", "auditable"),
						owner: fc.constantFrom("alice", "bob", "carol"),
						version: fc.integer({ min: 1, max: 3 }),
					}),
					{ maxLength: 5 },
				),
				fc.constantFrom("", "alice", "owner", "scop", "zzz"),
				(recs, q) => {
					let lib = newLibrary("p");
					for (const r of recs) {
						const rec: BehaviorRecord = {
							kind: r.kind as BehaviorRecord["kind"],
							owner: r.owner,
							version: r.version,
							labels: { fr: `lib ${r.owner}`, en: `lib ${r.owner}` },
						};
						lib = add(lib, rec)[0];
					}
					const a = search(lib, q).map((e) => recordId(e.record));
					const b = search(lib, q).map((e) => recordId(e.record));
					expect(a).toEqual(b);
				},
			),
		);
	});
});
