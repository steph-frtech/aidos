import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	archive,
	branch,
	CODE_CROSS_PROJECT_MERGE,
	CODE_CROSS_PROJECT_NODE,
	contains,
	contentNamespace,
	duplicate,
	genesis,
	heads,
	headsIncludingMasked,
	mergeGuard,
	namespaceKey,
	restore,
	sameNamespace,
	sameProject,
} from "./projectDag";

/**
 * Reproducibility + isolation twin for S56 (mirrors back/archive/projectdag's property
 * mirror). The TS twin must be byte-identical to the Go authority's predicates:
 * isolation, the frontier, append-only growth, archive/restore reversibility.
 */
describe("projectDag — S56 per-project DAG + namespace + frontier", () => {
	it("content namespace is the byte-identical per-project prefix", () => {
		expect(contentNamespace("abc")).toBe("project/abc/");
		expect(namespaceKey("abc", "head:order")).toBe("project/abc/head:order");
	});

	it("distinct projects have disjoint namespaces", () => {
		fc.assert(
			fc.property(fc.string(), fc.string(), (a, b) => {
				fc.pre(a !== b);
				expect(sameNamespace(b, namespaceKey(a, "k"))).toBe(false);
			}),
		);
	});

	it("sameProject is the exact mergeability predicate", () => {
		fc.assert(
			fc.property(fc.string(), fc.string(), (a, b) => {
				const expected = a === b && a.trim() !== "";
				expect(sameProject(a, b)).toBe(expected);
			}),
		);
	});

	it("mergeGuard refuses CROSS_PROJECT_MERGE iff the two sides differ", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1 }),
				fc.string({ minLength: 1 }),
				(a, b) => {
					const g = mergeGuard(a, b);
					if (sameProject(a, b)) {
						expect(g.allowed).toBe(true);
						expect(g.blockReason).toBeUndefined();
					} else {
						expect(g.allowed).toBe(false);
						expect(g.blockReason?.code).toBe(CODE_CROSS_PROJECT_MERGE);
						expect(g.blockReason?.howToFix.length).toBeGreaterThan(0);
					}
				},
			),
		);
	});

	it("a phase cut in A is invisible from B (isolation)", () => {
		const a = genesis("A", "genA", "alpha");
		const b = genesis("B", "genB", "beta");
		const res = branch(a, "genA", "phaseA1", "feat");
		expect(res.blockReason).toBeUndefined();
		expect(res.event).toBe("Branched");
		// B never contains an A node.
		for (const h of headsIncludingMasked(res.dag)) {
			expect(contains(b, h.id)).toBe(false);
		}
		// B refuses to navigate onto A's phase.
		const stolen = branch(b, "phaseA1", "x", "steal");
		expect(stolen.blockReason?.code).toBe(CODE_CROSS_PROJECT_NODE);
	});

	it("branch is append-only — node count never shrinks", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1 }), { maxLength: 6 }),
				(ids) => {
					let pd = genesis("P", "gen", "p");
					let i = 0;
					const seen = new Set<string>(["gen"]);
					for (const raw of ids) {
						const newId = `n${i}-${raw}`;
						if (seen.has(newId)) continue;
						seen.add(newId);
						const before = pd.nodes.length;
						const res = branch(pd, "gen", newId, "l");
						expect(res.blockReason).toBeUndefined();
						expect(res.dag.nodes.length).toBeGreaterThanOrEqual(before);
						pd = res.dag;
						i++;
					}
				},
			),
		);
	});

	it("archive masks without destroying; restore brings the heads back", () => {
		let pd = genesis("P", "gen", "p");
		pd = branch(pd, "gen", "n1", "work").dag;
		const kept = headsIncludingMasked(pd).length;
		const masked = archive(pd);
		expect(heads(masked)).toHaveLength(0);
		expect(headsIncludingMasked(masked)).toHaveLength(kept);
		expect(masked.masked).toBe(true);
		const back = restore(masked);
		expect(back.masked).toBe(false);
		expect(heads(back)).toHaveLength(heads(pd).length);
	});

	it("duplicate forks an isolated root sharing no node with the source", () => {
		let src = genesis("SRC", "genSRC", "src");
		src = branch(src, "genSRC", "seed", "seeded").dag;
		const fork = duplicate("DST", "genDST", "dst");
		expect(fork.genesisId).not.toBe(src.genesisId);
		expect(contains(fork, "genSRC")).toBe(false);
		expect(contains(fork, "seed")).toBe(false);
		expect(heads(fork)).toHaveLength(1);
		expect(heads(fork)[0].id).toBe("genDST");
	});
});
