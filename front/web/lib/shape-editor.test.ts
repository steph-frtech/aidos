/**
 * S68 — the shape-editor REPRODUCIBILITY mirror (TS twin). It pins the EXACT done-criteria, and
 * keeps the TS twin in lock-step with the Go shapeeditor property test:
 *
 *   - DETERMINISTIC SHAPE SELECTION: deriveShape is pure + the closed table (unknown ⇒ null).
 *   - PURE PARSING: same source → same parse for each shape.
 *   - DRAFT-LEVEL CONCURRENCY: disjoint edits MERGE, same-field clash LOCKS (never last-write-wins).
 *   - THE WALL: proposeMirror returns a DRAFT ChangeSet, born red, wroteMirror=false.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	deriveShape,
	mergeEdits,
	natures,
	openDraft,
	parse,
	proposeMirror,
	type TruthNature,
} from "./shape-editor";

const SOURCE: Record<TruthNature, string> = {
	acceptance: "Scenario: s\nGiven a\nWhen b\nThen c",
	invariant: "property: p\nforall: x\nholds: x == x",
	workflow: "fixture: f\nstate: s0\ncommand: cmd\nevent: e1",
};

describe("deriveShape — deterministic, closed table", () => {
	it("maps each nature to its shape", () => {
		expect(deriveShape("acceptance")?.shape).toBe("gherkin");
		expect(deriveShape("invariant")?.shape).toBe("property");
		expect(deriveShape("workflow")?.shape).toBe("fixture");
	});
	it("refuses an unknown nature (no guess)", () => {
		expect(deriveShape("not-a-nature")).toBeNull();
	});
	it("is deterministic", () => {
		fc.assert(
			fc.property(fc.constantFrom(...natures()), (nat) => {
				expect(deriveShape(nat)).toEqual(deriveShape(nat));
			}),
		);
	});
});

describe("parse — a pure function per shape", () => {
	it("parses a valid source for each shape", () => {
		for (const nat of natures()) {
			const der = deriveShape(nat);
			expect(der).not.toBeNull();
			const { spec, error } = parse(der!.shape, SOURCE[nat]);
			expect(error).toBeNull();
			expect(spec?.title).toBeTruthy();
		}
	});
	it("refuses an unparseable source", () => {
		expect(parse("fixture", "garbage").error).not.toBeNull();
	});
	it("is pure (same source → same parse)", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z ]{1,20}$/), (title) => {
				const src = `Scenario: ${title}\nGiven a\nWhen b\nThen c`;
				expect(parse("gherkin", src)).toEqual(parse("gherkin", src));
			}),
		);
	});
});

describe("mergeEdits — draft-level concurrency, never last-write-wins", () => {
	const draft = () =>
		openDraft("proj-1", "Order.discount", "v1", "workflow").draft!;

	it("merges disjoint edits", () => {
		const r = mergeEdits(
			draft(),
			{ author: "alice", baseVersion: 0, title: "T" },
			{
				author: "bob",
				baseVersion: 0,
				source: "fixture: f\nstate: s\ncommand: c\nevent: e",
			},
		);
		expect(r.error).toBeNull();
		expect(r.merged.title).toBe("T");
		expect(r.merged.source).not.toBe("");
		expect(r.merged.version).toBe(1);
	});

	it("LOCKS on a same-field clash (no last-write-wins)", () => {
		const r = mergeEdits(
			draft(),
			{ author: "alice", baseVersion: 0, title: "Alice" },
			{ author: "bob", baseVersion: 0, title: "Bob" },
		);
		expect(r.error).not.toBeNull();
		expect(r.conflicts).toHaveLength(1);
		expect(r.conflicts[0].field).toBe("title");
		// The draft is NOT advanced — neither write won.
		expect(r.merged.version).toBe(0);
		expect(r.merged.title).toBe("");
	});

	it("rejects a stale base", () => {
		const r = mergeEdits(
			{ ...draft(), version: 2 },
			{ author: "a", baseVersion: 0, title: "x" },
			{ author: "b", baseVersion: 0 },
		);
		expect(r.error).not.toBeNull();
	});
});

describe("proposeMirror — red, project-scoped, DRAFT, no write (the wall)", () => {
	it("proposes a born-red DRAFT mirror", () => {
		const d = openDraft("proj-1", "Order.discount", "v1", "workflow").draft!;
		d.source = "fixture: discount\nstate: cart\ncommand: apply\nevent: applied";
		const { result, error } = proposeMirror(d, "phase-0");
		expect(error).toBeNull();
		expect(result?.wroteMirror).toBe(false);
		expect(result?.changeSet.status).toBe("DRAFT");
		expect(result?.red).toBe(true);
		expect(result?.liveness).toBe("dead");
		expect(result?.projectId).toBe("proj-1");
		expect(result?.testKind).toBe("fixture");
	});

	it("refuses an unparseable source", () => {
		const d = openDraft("proj-1", "Order", "v1", "workflow").draft!;
		d.source = "garbage";
		expect(proposeMirror(d, "phase-0").error).not.toBeNull();
	});

	it("is deterministic", () => {
		fc.assert(
			fc.property(fc.constantFrom(...natures()), (nat) => {
				const d = openDraft("proj-1", "Order", "v1", nat).draft!;
				d.source = SOURCE[nat];
				expect(proposeMirror(d, "phase-0")).toEqual(
					proposeMirror(d, "phase-0"),
				);
			}),
		);
	});
});
