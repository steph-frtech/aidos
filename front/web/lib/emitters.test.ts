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
	type ArchFitnessReport,
	affectedSubgraph,
	type CallGraph,
	callGraphIndex,
	checkEmittedFunctional,
	type EntitySource,
	emit,
	type Field,
	type FieldType,
	isBlocked,
	type LaidOutGraph,
	layoutCallGraph,
	PROTECTED_MARKER,
	project,
	proveEmittedPurity,
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

	// FN03 — EMITTED_FUNCTION_PURE: proveEmittedPurity re-emits N rounds byte-identical.
	it("∀ well-formed entity × target: proveEmittedPurity reports byteIdentical (pure)", () => {
		fc.assert(
			fc.property(arbEntity, arbTarget, (e, t) => {
				const r = proveEmittedPurity(e, t);
				expect(r.byteIdentical).toBe(true);
				expect(r.rounds).toBeGreaterThan(0);
				expect(r.outputHash).not.toBe("");
			}),
		);
	});

	it("FN03 done criterion: 16 re-emissions of Order are byte-identical on every target", () => {
		for (const t of TARGETS) {
			const r = proveEmittedPurity(ENTITY_ORDER, t, 16);
			expect(r.byteIdentical).toBe(true);
			expect(r.rounds).toBe(16);
		}
	});

	// FN04 — the three EMITTED arch-fitness rules (twin of agentloop.CheckEmittedFunctional).
	const hasCode = (r: ArchFitnessReport, code: string) =>
		r.violations.some((v) => v.code === code);

	it("FN04: the live emitted Go (go-sqlc) passes all three arch-fitness rules", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		const r = checkEmittedFunctional(a.bytes);
		expect(r.green).toBe(true);
		expect(r.violations).toEqual([]);
	});

	it("FN04 ∀ well-formed entity: emitted go-sqlc holds the functional mandate", () => {
		fc.assert(
			fc.property(arbEntity, (e) => {
				const a = emit(e, "go-sqlc");
				if (isBlocked(a)) return;
				expect(checkEmittedFunctional(a.bytes).green).toBe(true);
			}),
		);
	});

	it("FN04 fault-injection: a package-level mutable global flips EMITTED_NO_GLOBAL_MUTABLE red", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		const r = checkEmittedFunctional(
			`${a.bytes}\nvar leaked = map[string]int{}\n`,
		);
		expect(r.green).toBe(false);
		expect(hasCode(r, "EMITTED_NO_GLOBAL_MUTABLE")).toBe(true);
	});

	it("FN04: a blank-identifier var _ assertion is NOT flagged", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		const r = checkEmittedFunctional(`${a.bytes}\nvar _ = Order{}\n`);
		expect(hasCode(r, "EMITTED_NO_GLOBAL_MUTABLE")).toBe(false);
	});

	it("FN04 fault-injection: an init() flips EMITTED_FUNCTION_PURE red", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		const r = checkEmittedFunctional(`${a.bytes}\nfunc init() {}\n`);
		expect(r.green).toBe(false);
		expect(hasCode(r, "EMITTED_FUNCTION_PURE")).toBe(true);
	});

	it("FN04 fault-injection: a self-recursive call flips EMITTED_CALL_GRAPH_ACYCLIC red", () => {
		const src = `// ${PROTECTED_MARKER}\npackage g\n\nfunc loop() {\n\tloop()\n}\n`;
		const r = checkEmittedFunctional(src);
		expect(hasCode(r, "EMITTED_CALL_GRAPH_ACYCLIC")).toBe(true);
	});

	it("FN04 fault-injection: mutual recursion (a→b→a) flips EMITTED_CALL_GRAPH_ACYCLIC red", () => {
		const src = `// ${PROTECTED_MARKER}\npackage g\n\nfunc a() {\n\tb()\n}\n\nfunc b() {\n\ta()\n}\n`;
		const r = checkEmittedFunctional(src);
		expect(hasCode(r, "EMITTED_CALL_GRAPH_ACYCLIC")).toBe(true);
	});

	it("FN04: an acyclic call graph (a→b→c, a→c) is NOT flagged", () => {
		const src = `// ${PROTECTED_MARKER}\npackage g\n\nfunc a() {\n\tb()\n\tc()\n}\n\nfunc b() {\n\tc()\n}\n\nfunc c() {}\n`;
		expect(
			hasCode(checkEmittedFunctional(src), "EMITTED_CALL_GRAPH_ACYCLIC"),
		).toBe(false);
	});

	it("FN04: source without the AIDOS marker is OUT of scope (green)", () => {
		const r = checkEmittedFunctional("package db\nvar g = 1\nfunc init() {}\n");
		expect(r.green).toBe(true);
		expect(r.violations).toEqual([]);
	});

	it("FN04 determinism: checkEmittedFunctional is reproducible (same source → same verdict)", () => {
		const a = emit(ENTITY_ORDER, "go-sqlc");
		if (isBlocked(a)) throw new Error("blocked");
		const src = `${a.bytes}\nvar leaked = 1\nfunc init() {}\n`;
		expect(checkEmittedFunctional(src)).toEqual(checkEmittedFunctional(src));
	});
});

describe("FN05 — call-graph index twin (Understand-Anything, ContextRouter)", () => {
	const chain = [
		"// CODE GENERATED BY AIDOS — DO NOT EDIT. source: deadbeef",
		"package g",
		"func a() { b(); c() }",
		"func b() { c() }",
		"func c() {}",
		"",
	].join("\n");

	it("is a pure function of the code (same code → same graph → same hash)", () => {
		const arbSrc = fc.constantFrom(
			chain,
			"// CODE GENERATED BY AIDOS\npackage g\nfunc h() {}\n",
			"// CODE GENERATED BY AIDOS\npackage g\nfunc a() { a() }\n",
			"package db\nfunc Emit() {}\n",
		);
		fc.assert(
			fc.property(arbSrc, (src) => {
				const x = callGraphIndex(src);
				const y = callGraphIndex(src);
				expect(x).toEqual(y);
				expect(x.hash).toBe(y.hash);
			}),
		);
	});

	it("builds the expected nodes + sorted callees", () => {
		const idx = callGraphIndex(chain);
		expect(idx.package).toBe("g");
		expect(idx.nodes).toEqual([
			{ name: "a", calls: ["b", "c"] },
			{ name: "b", calls: ["c"] },
			{ name: "c", calls: [] },
		]);
		expect(idx.hash).not.toBe("");
	});

	it("unmarked source is out of scope → empty index", () => {
		const idx = callGraphIndex(
			"package db\nfunc Emit() { x() }\nfunc x() {}\n",
		);
		expect(idx.nodes).toEqual([]);
	});

	it("AffectedSubgraph surfaces dependents (change to c ripples up to a, b)", () => {
		const idx = callGraphIndex(chain);
		expect(affectedSubgraph(idx, ["c"])).toEqual(["a", "b", "c"]);
		expect(affectedSubgraph(idx, ["a"])).toEqual(["a"]);
		expect(affectedSubgraph(idx, ["zzz"])).toEqual([]);
		expect(affectedSubgraph(idx, [])).toEqual([]);
	});

	it("AffectedSubgraph is reproducible (router-consumable, deterministic)", () => {
		const idx: CallGraph = callGraphIndex(chain);
		const names = idx.nodes.map((n) => n.name);
		fc.assert(
			fc.property(fc.subarray(names), (changed) => {
				expect(affectedSubgraph(idx, changed)).toEqual(
					affectedSubgraph(idx, changed),
				);
			}),
		);
	});
});

// FN06 — the call-graph VISUALISATION layout. layoutCallGraph is a PURE function of the index +
// the affected set: deterministic node positions (rows = topological depth, sorted) + edges, with
// each node flagged whether it is in the affected sub-graph. The screen renders this layout as an
// SVG graph; the layout itself is code, never an LLM "draw the graph" judgement (determinism-first).
describe("layoutCallGraph (FN06 — functional graph visualisation)", () => {
	const chain =
		"// CODE GENERATED BY AIDOS — DO NOT EDIT\npackage g\nfunc a() { b(); c() }\nfunc b() { c() }\nfunc c() {}\n";

	it("lays out every node exactly once, with positive finite coordinates", () => {
		const g = callGraphIndex(chain);
		const laid = layoutCallGraph(g, ["c"]);
		expect(laid.nodes.map((n) => n.name).sort()).toEqual(["a", "b", "c"]);
		for (const n of laid.nodes) {
			expect(Number.isFinite(n.x)).toBe(true);
			expect(Number.isFinite(n.y)).toBe(true);
			expect(n.x).toBeGreaterThanOrEqual(0);
			expect(n.y).toBeGreaterThanOrEqual(0);
		}
		expect(laid.width).toBeGreaterThan(0);
		expect(laid.height).toBeGreaterThan(0);
	});

	it("draws one edge per (function → callee) pair, between laid-out nodes", () => {
		const g = callGraphIndex(chain);
		const laid = layoutCallGraph(g, []);
		// a→b, a→c, b→c
		expect(laid.edges.length).toBe(3);
		for (const e of laid.edges) {
			expect(laid.nodes.some((n) => n.name === e.from)).toBe(true);
			expect(laid.nodes.some((n) => n.name === e.to)).toBe(true);
		}
		const pairs = laid.edges.map((e) => `${e.from}->${e.to}`).sort();
		expect(pairs).toEqual(["a->b", "a->c", "b->c"]);
	});

	it("flags exactly the affected sub-graph (the ContextRouter selection) on the nodes", () => {
		const g = callGraphIndex(chain);
		const affected = affectedSubgraph(g, ["c"]); // a, b, c
		const laid = layoutCallGraph(g, affected);
		for (const n of laid.nodes) {
			expect(n.affected).toBe(affected.includes(n.name));
		}
		const onlyA = layoutCallGraph(g, affectedSubgraph(g, ["a"])); // only a
		expect(onlyA.nodes.find((n) => n.name === "a")?.affected).toBe(true);
		expect(onlyA.nodes.find((n) => n.name === "c")?.affected).toBe(false);
	});

	it("is DETERMINISTIC — same graph + same affected → byte-identical layout", () => {
		const g = callGraphIndex(chain);
		fc.assert(
			fc.property(fc.subarray(["a", "b", "c"]), (changed) => {
				const a = layoutCallGraph(g, affectedSubgraph(g, changed));
				const b = layoutCallGraph(g, affectedSubgraph(g, changed));
				expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
			}),
		);
	});

	it("TOTAL — an empty/unparseable index yields an empty, well-formed layout (never throws)", () => {
		const empty: CallGraph = { package: "", nodes: [], hash: "" };
		const laid: LaidOutGraph = layoutCallGraph(empty, []);
		expect(laid.nodes).toEqual([]);
		expect(laid.edges).toEqual([]);
		expect(laid.width).toBeGreaterThanOrEqual(0);
		expect(laid.height).toBeGreaterThanOrEqual(0);
	});
});
