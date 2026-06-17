import { describe, expect, it } from "vitest";
import { openDraft } from "../../lib/shape-editor";
import { demoDerive, demoMerge } from "../../lib/shape-editor-data";
import { deriveDecoder, mergeDecoder } from "./live";

/**
 * /shape-editor live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 batch-4B
 * PURE-server flip).
 *
 * It proves the TS `deriveDecoder` / `mergeDecoder` decode a SAMPLE of the Go shape-editor MCP server
 * outputs — the tools' CONTRACT, NOT a second implementation of the shaper logic (the Go shapeeditor is
 * authoritative; the parser/merge are PURE, never an LLM):
 *   - deriveOutput  = { ok, shape, test_kind, cert_language }      (shapeeditorsrv.deriveOutput)
 *   - mergeOutput   = { ok, error, locked, conflicts[{field, author_a, value_a, author_b, value_b}],
 *                       merged }                                   (shapeeditorsrv.mergeOutput)
 *
 * This test pins only that the wire shapes decode faithfully (the snake_case derivation triple, the
 * snake_case→camelCase conflict mapping, the Go `error` string + `locked` flag → the twin's `error`
 * discriminator) and that a malformed payload deterministically falls back to the demo (decoder → null,
 * readVia uses the twin demoDerive/demoMerge). DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 *
 * THE WALL (§2): the reads are below-the-line — they compute VALUES, write no truth. shape_propose is NOT
 * dispatched (its output carries a json.RawMessage ChangeSet body + is a truth-proposal), so the panel
 * keeps its propose→ChangeSet voie propre via the twin `proposeMirror` — there is no decoder for it here.
 */

describe("shape-editor live — deriveDecoder parity", () => {
	it("decodes a Go-sample deriveOutput (acceptance → gherkin)", () => {
		const goSample = {
			ok: true,
			shape: "gherkin",
			test_kind: "acceptance",
			cert_language: "gherkin",
		};
		expect(deriveDecoder(goSample)).toEqual({
			shape: "gherkin",
			testKind: "acceptance",
			certLanguage: "gherkin",
		});
	});

	it("decodes the invariant + workflow derivations (the closed table)", () => {
		expect(
			deriveDecoder({
				ok: true,
				shape: "property",
				test_kind: "property",
				cert_language: "rapid",
			}),
		).toEqual({
			shape: "property",
			testKind: "property",
			certLanguage: "rapid",
		});
		expect(
			deriveDecoder({
				ok: true,
				shape: "fixture",
				test_kind: "fixture",
				cert_language: "fixture",
			}),
		).toEqual({
			shape: "fixture",
			testKind: "fixture",
			certLanguage: "fixture",
		});
	});

	it("rejects a malformed / refused payload (→ demo fallback)", () => {
		expect(deriveDecoder(null)).toBeNull();
		expect(deriveDecoder({})).toBeNull(); // no ok, no fields
		// a server refusal (ok:false, an unknown nature) → null, never a silent guess.
		expect(deriveDecoder({ ok: false, error: "unknown nature" })).toBeNull();
		// a shape outside the closed set → null.
		expect(
			deriveDecoder({
				ok: true,
				shape: "yaml",
				test_kind: "acceptance",
				cert_language: "gherkin",
			}),
		).toBeNull();
		// a missing required field → null.
		expect(
			deriveDecoder({ ok: true, shape: "gherkin", test_kind: "acceptance" }),
		).toBeNull();
	});

	it("the demo derivation matches the decoded Go shape (twin ≡ the live contract)", () => {
		// The demo fixture is the twin deriveShape() of the closed table; the live read returns the SAME
		// triple — the twin sits behind source:"demo", identical in shape to the Go-authoritative metric.
		const demo = demoDerive("acceptance");
		expect(demo).toEqual({
			shape: "gherkin",
			testKind: "acceptance",
			certLanguage: "gherkin",
		});
		// an unknown nature → null on BOTH sides (the closed table has no row).
		expect(demoDerive("speculation")).toBeNull();
	});
});

describe("shape-editor live — mergeDecoder parity", () => {
	const { draft } = openDraft("proj-a", "Order.discount", "v1", "workflow");
	if (draft === null) throw new Error("fixture draft must open");

	it("decodes a Go-sample mergeOutput (disjoint edits → merged, version bumped)", () => {
		const goSample = {
			ok: true,
			locked: false,
			merged: { ...draft, title: "alice's title", version: 1 },
		};
		const decoded = mergeDecoder(goSample);
		expect(decoded?.error).toBeNull();
		expect(decoded?.conflicts).toEqual([]);
		expect(decoded?.merged.version).toBe(1);
		expect(decoded?.merged.title).toBe("alice's title");
	});

	it("decodes a LOCK (same-field clash) — both candidates surfaced, never last-write-wins", () => {
		const goSample = {
			ok: false,
			locked: true,
			error:
				"shapeeditor: concurrent edits conflict on the same field (lock, not last-write-wins)",
			conflicts: [
				{
					field: "title",
					author_a: "alice",
					value_a: "discount cap",
					author_b: "bob",
					value_b: "discount floor",
				},
			],
			merged: draft,
		};
		const decoded = mergeDecoder(goSample);
		expect(decoded?.error).not.toBeNull();
		expect(decoded?.conflicts).toHaveLength(1);
		expect(decoded?.conflicts[0]).toEqual({
			field: "title",
			authorA: "alice",
			valueA: "discount cap",
			authorB: "bob",
			valueB: "discount floor",
		});
		// the merged draft is NOT advanced on a lock (the version stays the base).
		expect(decoded?.merged.version).toBe(draft.version);
	});

	it("a conflict field outside the closed set (title|source) collapses the whole list to [] (all-or-nothing arr)", () => {
		// The arr() combinator is all-or-nothing: one malformed element → the whole conflicts array
		// decodes to null → `?? []`. The decoder never partially-survives a malformed Go payload — a
		// deterministic, total fallback (§6/§8). A field outside the closed {title|source} is malformed.
		const decoded = mergeDecoder({
			ok: false,
			locked: true,
			error: "lock",
			conflicts: [
				{
					field: "nonsense",
					author_a: "a",
					value_a: "x",
					author_b: "b",
					value_b: "y",
				},
				{
					field: "source",
					author_a: "a",
					value_a: "p",
					author_b: "b",
					value_b: "q",
				},
			],
			merged: draft,
		});
		expect(decoded?.conflicts).toEqual([]);
		// a list of WELL-TYPED conflicts decodes fully (both survive — the contrapositive).
		const ok = mergeDecoder({
			ok: false,
			locked: true,
			error: "lock",
			conflicts: [
				{
					field: "title",
					author_a: "a",
					value_a: "x",
					author_b: "b",
					value_b: "y",
				},
				{
					field: "source",
					author_a: "a",
					value_a: "p",
					author_b: "b",
					value_b: "q",
				},
			],
			merged: draft,
		});
		expect(ok?.conflicts).toHaveLength(2);
		expect(ok?.conflicts.map((c) => c.field)).toEqual(["title", "source"]);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(mergeDecoder(null)).toBeNull();
		expect(mergeDecoder({})).toBeNull(); // no merged
		expect(mergeDecoder({ ok: true })).toBeNull(); // no merged draft
	});

	it("the demo merge matches the decoded Go shape (twin ≡ the live contract)", () => {
		// disjoint same-value edits → MERGE (version bumps); the demo twin reproduces the Go verdict.
		const a = { author: "alice", baseVersion: 0, title: "shared" };
		const b = { author: "bob", baseVersion: 0, title: "shared" };
		const demo = demoMerge(draft, a, b);
		expect(demo.error).toBeNull();
		expect(demo.merged.version).toBe(draft.version + 1);
		// a same-field clash LOCKS on BOTH sides (never last-write-wins).
		const clashB = { author: "bob", baseVersion: 0, title: "different" };
		const locked = demoMerge(draft, a, clashB);
		expect(locked.error).not.toBeNull();
		expect(locked.conflicts).toHaveLength(1);
		expect(locked.conflicts[0].field).toBe("title");
	});
});
