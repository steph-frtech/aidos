/**
 * Reproducibility mirror for the app-regenerator twin (S78, « Régénérer mon app ») — the TS
 * side of the S78 property mirror (back/runtime/regen/regen_property_test.go), pinned with
 * Vitest + fast-check. The two done-criteria:
 *
 *   - BYTE-STABLE: regenerate(schema,…) twice ⇒ byte-identical artifacts (path, bytes,
 *     outputHash). A pure composition of pure emitters satisfies this; an LLM never could.
 *   - REFUSES A HAND-EDIT: with a faithful ledger, mutating one emitted file's on-disk bytes
 *     ⇒ regenerate REFUSES with GEN_FILE_HAND_EDITED and returns no plan (no silent overwrite).
 *   - NO FALSE POSITIVE: a faithful tree refuses nothing and is all-unchanged.
 *   - STALE BY SOURCE-HASH: a moved-source ledger marks paths stale; an empty ledger ⇒ fresh.
 *
 * The Go output is AUTHORITATIVE; this twin reproduces the same deterministic behaviour.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Artifact,
	emitArtifacts,
	GEN_FILE_HAND_EDITED,
	type LedgerEntry,
	regenerate,
} from "./app-regenerator";
import { DEMO_SCHEMA, isBlocked } from "./relation-emitter";

function faithful(arts: Artifact[]): {
	ledger: LedgerEntry[];
	disk: { path: string; bytes: string }[];
} {
	return {
		ledger: arts.map((a) => ({
			path: a.path,
			sourceHash: a.sourceHash,
			outputHash: a.outputHash,
		})),
		disk: arts.map((a) => ({ path: a.path, bytes: a.bytes })),
	};
}

describe("app-regenerator twin (S78)", () => {
	it("is byte-stable: same project ⇒ byte-identical artifacts", () => {
		const r1 = regenerate(DEMO_SCHEMA, [], []);
		const r2 = regenerate(DEMO_SCHEMA, [], []);
		expect(r1.ok && r2.ok).toBe(true);
		const a1 = r1.plan?.artifacts ?? [];
		const a2 = r2.plan?.artifacts ?? [];
		expect(a1.length).toBe(a2.length);
		for (let i = 0; i < a1.length; i++) {
			expect(a1[i].path).toBe(a2[i].path);
			expect(a1[i].bytes).toBe(a2[i].bytes);
			expect(a1[i].outputHash).toBe(a2[i].outputHash);
		}
	});

	it("first regeneration (empty ledger) is all-fresh", () => {
		const r = regenerate(DEMO_SCHEMA, [], []);
		expect(r.ok).toBe(true);
		expect(r.plan?.fresh.length).toBe(r.plan?.artifacts.length);
		expect(r.plan?.stale.length).toBe(0);
		expect(r.plan?.unchanged.length).toBe(0);
	});

	it("refuses a hand-edited gen/ file (GEN_FILE_HAND_EDITED)", () => {
		const arts = emitArtifacts(DEMO_SCHEMA);
		expect(isBlocked(arts)).toBe(false);
		const { ledger, disk } = faithful(arts as Artifact[]);
		disk[0].bytes += "// hand edit";
		const r = regenerate(DEMO_SCHEMA, ledger, disk);
		expect(r.ok).toBe(false);
		expect(r.block?.code).toBe(GEN_FILE_HAND_EDITED);
		expect(r.block?.how_to_fix.length ?? 0).toBeGreaterThan(0);
		expect(r.plan).toBeUndefined();
	});

	it("a faithful tree refuses nothing and is all-unchanged", () => {
		const arts = emitArtifacts(DEMO_SCHEMA) as Artifact[];
		const { ledger, disk } = faithful(arts);
		const r = regenerate(DEMO_SCHEMA, ledger, disk);
		expect(r.ok).toBe(true);
		expect(r.plan?.unchanged.length).toBe(arts.length);
		expect(r.plan?.stale.length).toBe(0);
	});

	it("classifies stale by source-hash (moved source)", () => {
		const arts = emitArtifacts(DEMO_SCHEMA) as Artifact[];
		const ledger: LedgerEntry[] = arts.map((a) => ({
			path: a.path,
			sourceHash: `moved-${a.sourceHash}`,
			outputHash: a.outputHash,
		}));
		const disk = arts.map((a) => ({ path: a.path, bytes: a.bytes }));
		const r = regenerate(DEMO_SCHEMA, ledger, disk);
		expect(r.ok).toBe(true);
		expect(r.plan?.stale.length).toBe(arts.length);
	});

	it("property: any single-file hand-edit always refuses (fast-check)", () => {
		const arts = emitArtifacts(DEMO_SCHEMA) as Artifact[];
		fc.assert(
			fc.property(
				fc.nat({ max: arts.length - 1 }),
				fc.string({ minLength: 1, maxLength: 8 }),
				(idx, suffix) => {
					const { ledger, disk } = faithful(arts);
					disk[idx].bytes += suffix;
					const r = regenerate(DEMO_SCHEMA, ledger, disk);
					expect(r.ok).toBe(false);
					expect(r.block?.code).toBe(GEN_FILE_HAND_EDITED);
				},
			),
		);
	});
});
