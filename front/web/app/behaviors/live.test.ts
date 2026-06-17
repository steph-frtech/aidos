import { describe, expect, it } from "vitest";
import { demoSearch, gatewaySearchArgs } from "../../lib/behaviors-data";
import { searchDecoder } from "./live";

/**
 * /behaviors live search read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * batch-2 kill-twins flip).
 *
 * It proves the TS `searchDecoder` decodes a SAMPLE of the Go `aidos-behaviors` `behaviors_search`
 * tool output (behaviorssrv.listOutput: `{ ok, project_id?, entries:[entryOutput], count }`, each
 * entryOutput carrying snake_case fields record_id/kind/owner/version/tags?/labels/published/
 * deleted/comments) — the tool's CONTRACT, NOT a second implementation of the library logic (the Go
 * behavior.Library.Search is authoritative). This test pins only that the wire shape decodes
 * faithfully (the entries list, the snake_case record fields, an absent `tags`, the FR label, the
 * published flag) and that a malformed / errored payload deterministically falls back to the demo
 * entries.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("behaviors live — search decoder parity", () => {
	it("decodes a Go-sample listOutput (browse of the seeded library)", () => {
		const goSample = {
			ok: true,
			project_id: "proj-shop",
			count: 2,
			entries: [
				{
					record_id: "abc123",
					kind: "ownable",
					owner: "alice",
					version: 1,
					tags: ["scoping", "security"],
					labels: { fr: "Possédé par un propriétaire", en: "Owner-scoped" },
					published: false,
					deleted: false,
					comments: 0,
				},
				{
					record_id: "def456",
					kind: "auditable",
					owner: "carol",
					version: 2,
					tags: ["trace"],
					labels: { fr: "Audité", en: "Auditable" },
					published: true,
					deleted: false,
					comments: 1,
				},
			],
		};
		const decoded = searchDecoder(goSample);
		expect(decoded).toEqual([
			{
				recordId: "abc123",
				kind: "ownable",
				owner: "alice",
				version: 1,
				tags: ["scoping", "security"],
				labelFr: "Possédé par un propriétaire",
				published: false,
			},
			{
				recordId: "def456",
				kind: "auditable",
				owner: "carol",
				version: 2,
				tags: ["trace"],
				labelFr: "Audité",
				published: true,
			},
		]);
	});

	it("tolerates an entry with an absent `tags` (omitempty → [])", () => {
		const decoded = searchDecoder({
			ok: true,
			count: 1,
			entries: [
				{
					record_id: "ghi789",
					kind: "soft-deletable",
					owner: "bob",
					version: 1,
					labels: { fr: "Archivable", en: "Soft-deletable" },
					published: false,
					deleted: false,
					comments: 0,
				},
			],
		});
		expect(decoded?.[0].tags).toEqual([]);
		expect(decoded?.[0].labelFr).toBe("Archivable");
		expect(decoded?.[0].published).toBe(false);
	});

	it("decodes an empty result (no hits) to []", () => {
		expect(searchDecoder({ ok: true, count: 0, entries: [] })).toEqual([]);
		// an absent entries list also decodes to [] (the payload may omit an empty slice).
		expect(searchDecoder({ ok: true, count: 0 })).toEqual([]);
	});

	it("rejects a malformed / errored payload (→ demo fallback)", () => {
		expect(searchDecoder(null)).toBeNull();
		expect(searchDecoder({})).toBeNull(); // no ok
		// a server-side error (ok:false) → null → demo fallback.
		expect(searchDecoder({ ok: false, error: "boom" })).toBeNull();
		// a malformed entry (missing record_id) → null.
		expect(
			searchDecoder({
				ok: true,
				entries: [{ kind: "ownable", owner: "alice", version: 1, labels: {} }],
			}),
		).toBeNull();
		// a non-number version → null.
		expect(
			searchDecoder({
				ok: true,
				entries: [
					{
						record_id: "x",
						kind: "ownable",
						owner: "alice",
						version: "1",
						labels: { fr: "x" },
					},
				],
			}),
		).toBeNull();
	});

	it("the gateway-arg projection carries the seeded library + the query", () => {
		const args = gatewaySearchArgs("alice");
		expect(args.project_id).toBe("proj-shop");
		expect(args.query).toBe("alice");
		const records = args.records as { kind: string; tags?: string[] }[];
		expect(records).toHaveLength(3);
		// the §24.6 owner-scoping record carries its tags; the tagless record omits `tags`.
		expect(records[0].kind).toBe("ownable");
		expect(records[0].tags).toEqual(["scoping", "security"]);
		expect(records[1].kind).toBe("soft-deletable");
		expect(records[1].tags).toBeUndefined();
	});

	it("the demo entries match the decoded-contract shape (twin ≡ the live shape)", () => {
		// The demo fixture is the twin search()/browse() of the seeded library; its EntryView shape is
		// identical to what the live decoder produces from the Go listOutput — the twin sits behind
		// source:"demo", identical in shape to the Go-authoritative live entries.
		const demo = demoSearch("");
		expect(demo.length).toBeGreaterThan(0);
		for (const e of demo) {
			expect(typeof e.recordId).toBe("string");
			expect(typeof e.kind).toBe("string");
			expect(typeof e.owner).toBe("string");
			expect(typeof e.version).toBe("number");
			expect(Array.isArray(e.tags)).toBe(true);
			expect(typeof e.labelFr).toBe("string");
			expect(typeof e.published).toBe("boolean");
		}
		// "alice" matches the §24.6 owner-scoping record (deterministic substring match, never an LLM).
		const hit = demoSearch("alice");
		expect(hit.some((e) => e.owner === "alice")).toBe(true);
	});
});
